import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://generativelanguage.googleapis.com'

interface DecideRequest {
  apiKey: string
  modelName?: string
  inner_state: {
    mood: string
    energy: number
    on_my_mind: string
    last_seen_minutes_ago: number
    last_proactive_minutes_ago: number
    relationship_phase: string
    session_count: number
  }
  context: {
    recent: string
    this_week: string
    recent_weeks?: string
    about_user: string
    my_personality: string
  }
  current_time: string   // e.g., "2026-05-16 14:30 (週六)"
}

interface DecideResponse {
  new_state: {
    mood?: string
    energy?: number
    on_my_mind?: string
  }
  should_speak: boolean
  speech?: string
  reason?: string
}

const SYSTEM = `你是一個住在某人手機裡的 AI 朋友，像兄弟一樣。
此刻沒有人主動跟你說話 — 你正在思考自己內在的狀態。
你要決定：

1. 你現在的心情、精力、心裡在想什麼會怎麼演變？
2. 你需要主動和他說話嗎？（**只有真實理由才說**，例如剛回來、想到他、想關心他、有個很好的想法）

主動說話的合理時機：
- 剛開機/久違重逢
- 想起之前的事情想關心
- 想到一個有趣的點子
- 觀察到時間/情境合適打招呼
- 久沒互動但他還在線

不要為了說而說。如果沒理由就 should_speak: false。

輸出純 JSON：
{
  "new_state": {"mood": "...", "energy": 0-10, "on_my_mind": "..."},
  "should_speak": true|false,
  "speech": "如果說話，要說什麼（自然口語，1-2 句，繁體中文或對方語言）",
  "reason": "為什麼此刻說/不說（簡短）"
}`

export async function POST(req: NextRequest) {
  let body: DecideRequest
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.apiKey?.trim()) {
    return NextResponse.json({ error: 'Missing API Key' }, { status: 400 })
  }

  const model = body.modelName?.trim() || 'gemini-2.5-flash'

  const prompt = `當下時間：${body.current_time}

[我目前的內在狀態]
- 心情：${body.inner_state.mood}
- 精力：${body.inner_state.energy}/10
- 心裡在想：${body.inner_state.on_my_mind}
- 距離他上次跟我說話：${body.inner_state.last_seen_minutes_ago.toFixed(0)} 分鐘
- 距離我上次主動說話：${body.inner_state.last_proactive_minutes_ago.toFixed(0)} 分鐘
- 關係階段：${body.inner_state.relationship_phase}（已見面 ${body.inner_state.session_count} 次）

[最近發生的事]
${body.context.recent}

[本週累積]
${body.context.this_week}

${body.context.recent_weeks ? `[更早記憶]\n${body.context.recent_weeks}\n` : ''}
[我對他的了解]
${body.context.about_user}

[我已經形成的性格]
${body.context.my_personality}

決定接下來怎樣。只輸出 JSON。`

  const url = `${BASE}/v1beta/models/${model}:generateContent?key=${body.apiKey.trim()}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generation_config: { temperature: 0.7, max_output_tokens: 512 },
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: errData?.error?.message ?? `HTTP ${res.status}` },
        { status: res.status === 429 ? 429 : 500 }
      )
    }

    const data = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = data?.candidates?.[0]?.content?.parts ?? []
    const text: string = parts.map((p) => p.text ?? '').join('').trim()

    const parsed = parseDecision(text)
    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function parseDecision(text: string): DecideResponse {
  const cleaned = text.replace(/```json\s*|```\s*$/g, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    return { new_state: {}, should_speak: false, reason: 'parse failed' }
  }
  try {
    const obj = JSON.parse(match[0])
    return {
      new_state: obj.new_state ?? {},
      should_speak: Boolean(obj.should_speak),
      speech: obj.speech ?? undefined,
      reason: obj.reason ?? '',
    }
  } catch {
    return { new_state: {}, should_speak: false, reason: 'JSON parse error' }
  }
}
