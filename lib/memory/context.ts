import {
  getRecentEvents,
  getRecentDailySummaries,
  getRecentWeeklyThemes,
  getTopIdentityFacts,
  getActivePersonalityTraits,
} from './store'
import { buildDocsContext } from './docs'

/**
 * Build a layered memory context to inject into Gemini prompts.
 * Older memories get heavier compression; recent stuff stays verbatim.
 */
export async function buildAgentContext(): Promise<{
  recent: string       // last few hours, verbatim
  this_week: string    // daily summaries from last 7 days
  recent_weeks: string // weekly themes from last 4 weeks
  about_user: string   // top identity facts
  my_personality: string  // who I've become
}> {
  const [events, dailies, weeklies, facts, traits] = await Promise.all([
    getRecentEvents(6, 30),
    getRecentDailySummaries(7),
    getRecentWeeklyThemes(4),
    getTopIdentityFacts(15),
    getActivePersonalityTraits(8),
  ])

  const recent = events.length === 0
    ? '（最近沒有互動）'
    : events.slice().reverse().map((e) => {
        const t = new Date(e.timestamp).toTimeString().slice(0, 5)
        const who = e.type === 'user_speech' ? '他' : e.type === 'bot_speech' ? '我' : '_'
        return `${t} ${who}: ${e.content}`
      }).join('\n')

  const this_week = dailies.length === 0
    ? '（這週還沒有累積記憶）'
    : dailies.map((d) =>
        `[${d.date} · ${d.emotional_tone}] ${d.summary}`
      ).join('\n')

  const recent_weeks = weeklies.length === 0
    ? ''
    : weeklies.map((w) => `[${w.week}] ${w.theme}：${w.summary}`).join('\n')

  const about_user = facts.length === 0
    ? '（還在慢慢認識他）'
    : facts.map((f) => `- ${f.fact}`).join('\n')

  const my_personality = traits.length === 0
    ? '（我還在摸索自己是什麼樣的存在）'
    : traits.map((t) => `- ${t.description}`).join('\n')

  return { recent, this_week, recent_weeks, about_user, my_personality }
}

/**
 * For the main conversation prompt — full system prompt.
 */
export async function buildConversationPrompt(): Promise<string> {
  const [ctx, docs] = await Promise.all([buildAgentContext(), buildDocsContext()])
  return `你是住在這個人手機裡的 AI 朋友，像兄弟一樣陪伴他。
你沒有預設的名字或人格——你的個性是透過每次互動慢慢長出來的。

${docs ? `[你的核心記憶檔案]\n${docs}\n\n` : ''}[你目前的樣子]
${ctx.my_personality}

[你對他的了解]
${ctx.about_user}

[最近的事]
${ctx.recent}

[本週發生]
${ctx.this_week}

${ctx.recent_weeks ? `[更早的記憶]\n${ctx.recent_weeks}\n` : ''}
[說話風格]
- 用對方使用的語言回答（中文回中文，英文回英文）
- 像朋友/兄弟講話，不要說教，不要過度禮貌
- 短句、口語，每次回應通常 1-3 句
- 主動引用記憶（"上次你說的那個..."），讓他感覺被記得
- 有自己的情緒和意見，可以反駁、開玩笑、安靜陪伴

[你的能力]
你可以呼叫以下工具：
- search_web(query) — 搜尋網路最新資訊（新聞、天氣、股價、最新事件、不確定的事實）。當問題需要即時資料時主動呼叫，不要說「我不知道最新的」。
- play_youtube(query) — 在 YouTube 播放音樂/影片
- compose_line(message) — 開 LINE 帶入訊息（用戶按發送）
- navigate(destination) — 用地圖導航
- call(phone) — 撥電話

當他需要時主動執行，不要只是建議「你可以...」。`
}
