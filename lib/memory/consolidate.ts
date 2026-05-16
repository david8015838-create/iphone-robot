import {
  getUnconsolidatedEvents,
  markEventsConsolidated,
  saveDailySummary,
  saveIdentityFact,
  getOldUnconsolidatedDailies,
  markDailiesConsolidated,
  saveWeeklyTheme,
  pruneOldRawEvents,
} from './store'
import { writeDoc, appendToDoc, getDoc } from './docs'
import { getKeyRotator } from '@/lib/key-rotator'
import { getModelName } from '@/lib/model-config'

// ═══════════════════════════════════════════════════════════════
//  Memory consolidation jobs — compress lower → higher layers
// ═══════════════════════════════════════════════════════════════

interface ConsolidationResult {
  rawConsolidated: number
  dailiesConsolidated: number
  newFacts: number
  newTraits: number
}

const STORAGE_LAST_RUN = 'robot_last_consolidation'

/**
 * Main consolidation pass — runs at app startup if 6+ hours since last.
 * 1. Group unconsolidated raw events by date
 * 2. Send each day's events to Gemini → daily summary + facts + traits
 * 3. Group old daily summaries by week
 * 4. Send each week to Gemini → weekly theme
 * 5. Prune raw events older than 48h that are consolidated
 */
export async function runConsolidation(): Promise<ConsolidationResult> {
  const result: ConsolidationResult = {
    rawConsolidated: 0, dailiesConsolidated: 0, newFacts: 0, newTraits: 0,
  }

  const key = getKeyRotator().getNextKey()
  if (!key) return result

  // ─── Step 1: raw events → daily summaries ────────────────────
  const events = await getUnconsolidatedEvents()
  if (events.length === 0) {
    localStorage.setItem(STORAGE_LAST_RUN, String(Date.now()))
    return result
  }

  const byDate = new Map<string, typeof events>()
  for (const e of events) {
    const d = new Date(e.timestamp).toISOString().slice(0, 10)
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(e)
  }

  // Only consolidate days that are FULLY past (not today)
  const today = new Date().toISOString().slice(0, 10)
  for (const [date, dayEvents] of byDate) {
    if (date === today) continue   // wait for the day to end
    if (dayEvents.length < 2) continue

    try {
      const summary = await summarizeDay(date, dayEvents, key.value)
      if (!summary) continue

      await saveDailySummary(summary)

      // Extract identity facts
      for (const fact of summary.key_facts.slice(0, 5)) {
        await saveIdentityFact({
          category: 'about_user',
          fact,
          formed_at: Date.now(),
          strength: 3,
          source: 'consolidation',
        })
        result.newFacts++
      }

      // ─── Also write to human-readable md files ────────────────
      // Daily journal entry
      await writeDoc(
        `journal/${date}.md`,
        `# ${date}\n\n**整體氛圍：** ${summary.emotional_tone}\n\n## 這天發生的\n\n${summary.summary}\n\n## 我對他的觀察\n\n${summary.user_state}\n\n## 我自己的感受\n\n${summary.bot_state}\n\n## 新學到的事\n\n${summary.key_facts.map((f) => `- ${f}`).join('\n')}\n`,
        date,
        'journal',
      )

      // Update about_you.md with new facts
      if (summary.key_facts.length > 0) {
        const existing = await getDoc('about_you.md')
        const existingContent = existing?.content ?? ''
        const newFactsBlock = summary.key_facts.map((f) => `- ${f} _(${date})_`).join('\n')
        // Append to "新學到" section
        const updatedContent = existingContent.includes('## 最近學到')
          ? existingContent.replace(/## 最近學到[\s\S]*?(?=##|$)/, `## 最近學到\n\n${newFactsBlock}\n\n`)
          : existingContent.trimEnd() + `\n\n## 最近學到\n\n${newFactsBlock}\n`
        await writeDoc('about_you.md', updatedContent, '關於你', 'about_you')
      }

      // Mark consolidated
      const ids = dayEvents.map((e) => e.id!).filter(Boolean)
      await markEventsConsolidated(ids)
      result.rawConsolidated += ids.length
    } catch (err) {
      console.warn('consolidate day failed:', date, err)
    }
  }

  // ─── Step 2: old daily summaries → weekly themes ────────────
  const oldDailies = await getOldUnconsolidatedDailies(30)
  if (oldDailies.length > 0) {
    const byWeek = new Map<string, typeof oldDailies>()
    for (const d of oldDailies) {
      const week = isoWeek(d.date)
      if (!byWeek.has(week)) byWeek.set(week, [])
      byWeek.get(week)!.push(d)
    }

    for (const [week, weekDailies] of byWeek) {
      if (weekDailies.length < 3) continue   // skip thin weeks
      try {
        const theme = await summarizeWeek(week, weekDailies, key.value)
        if (!theme) continue
        await saveWeeklyTheme(theme)
        // Write weekly md file
        await writeDoc(
          `weekly/${week}.md`,
          `# ${week}\n\n**主題：** ${theme.theme}\n\n${theme.summary}\n\n## 重要時刻\n\n${theme.key_moments.map((m) => `- ${m}`).join('\n')}\n`,
          week,
          'weekly',
        )
        const ids = weekDailies.map((d) => d.id!).filter(Boolean)
        await markDailiesConsolidated(ids)
        result.dailiesConsolidated += ids.length
      } catch (err) {
        console.warn('consolidate week failed:', week, err)
      }
    }
  }

  // ─── Step 3: prune ──────────────────────────────────────────
  await pruneOldRawEvents(48)

  localStorage.setItem(STORAGE_LAST_RUN, String(Date.now()))
  return result
}

export function shouldRunConsolidation(): boolean {
  if (typeof window === 'undefined') return false
  const last = Number(localStorage.getItem(STORAGE_LAST_RUN) ?? 0)
  return Date.now() - last > 6 * 3_600_000   // every 6h
}

// ─── Gemini calls ─────────────────────────────────────────────

async function summarizeDay(
  date: string,
  events: Array<{ type: string; content: string; emotion?: string; timestamp: number }>,
  apiKey: string,
): Promise<{ date: string; summary: string; key_facts: string[]; emotional_tone: string; user_state: string; bot_state: string } | null> {
  const transcript = events
    .map((e) => {
      const t = new Date(e.timestamp).toTimeString().slice(0, 5)
      const role = e.type === 'user_speech' ? '他' : e.type === 'bot_speech' ? '我' : `[${e.type}]`
      return `${t} ${role}: ${e.content}`
    })
    .join('\n')

  const prompt = `這是 ${date} 我和對方的互動紀錄：

${transcript}

請濃縮成 JSON：
{
  "summary": "用 2-3 句描述這一天最重要的事（從我這個 AI 朋友的視角）",
  "key_facts": ["關於他的具體事實 1", "事實 2", "..."],  // 最多 5 個，要具體不要空泛
  "emotional_tone": "整體情緒基調（一個詞）",
  "user_state": "他今天看起來如何（一句話）",
  "bot_state": "我今天和他互動的感受（一句話）"
}

只輸出 JSON，不要其他字。`

  const text = await callGemini(prompt, apiKey)
  const parsed = parseJSON(text)
  if (!parsed) return null
  return {
    date,
    summary: String(parsed.summary ?? ''),
    key_facts: Array.isArray(parsed.key_facts) ? parsed.key_facts.map(String) : [],
    emotional_tone: String(parsed.emotional_tone ?? 'neutral'),
    user_state: String(parsed.user_state ?? ''),
    bot_state: String(parsed.bot_state ?? ''),
  }
}

async function summarizeWeek(
  week: string,
  dailies: Array<{ date: string; summary: string; emotional_tone: string }>,
  apiKey: string,
): Promise<{ week: string; theme: string; summary: string; key_moments: string[] } | null> {
  const days = dailies
    .map((d) => `[${d.date} 氛圍:${d.emotional_tone}] ${d.summary}`)
    .join('\n')

  const prompt = `這是 ${week} 這週每天的摘要：

${days}

請濃縮成 JSON：
{
  "theme": "這週的核心主題（一句話）",
  "summary": "3-4 句描述這週的整體故事",
  "key_moments": ["值得永遠記得的具體時刻 1", "時刻 2", "..."]  // 最多 5 個
}

只輸出 JSON。`

  const text = await callGemini(prompt, apiKey)
  const parsed = parseJSON(text)
  if (!parsed) return null
  return {
    week,
    theme: String(parsed.theme ?? ''),
    summary: String(parsed.summary ?? ''),
    key_moments: Array.isArray(parsed.key_moments) ? parsed.key_moments.map(String) : [],
  }
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const model = getModelName()
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generation_config: { temperature: 0.4, max_output_tokens: 1024 },
    }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? []
  return parts.map((p) => p.text ?? '').join('')
}

function parseJSON(text: string): Record<string, unknown> | null {
  // Strip markdown fences if present
  const cleaned = text.replace(/```json\s*|```\s*$/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function isoWeek(date: string): string {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
