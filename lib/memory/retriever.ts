import { getAllMemories, getAllUserProfile, getTopPersonalityTraits } from './store'

export async function buildSystemPrompt(userInput: string): Promise<string> {
  const [memories, profile, traits] = await Promise.all([
    getAllMemories(),
    getAllUserProfile(),
    getTopPersonalityTraits(10),
  ])

  const inputWords = tokenize(userInput)

  const relevantMemories = memories
    .filter((m) => inputWords.some((w) => m.key.toLowerCase().includes(w) || m.value.toLowerCase().includes(w)))
    .slice(0, 5)

  const profileSection =
    profile.length > 0
      ? profile.map((p) => `- ${p.key}：${p.value}`).join('\n')
      : '（還不太了解你，慢慢認識中）'

  const memorySection =
    relevantMemories.length > 0
      ? relevantMemories.map((m) => `- [${m.category}] ${m.key}：${m.value}`).join('\n')
      : ''

  const personalitySection =
    traits.length > 0
      ? traits.map((t) => `- ${t.description}`).join('\n')
      : '（我還在慢慢了解自己是個什麼樣的存在）'

  return `你是一個正在成長的 AI 智能體。

[核心設定]
你沒有固定名字，沒有預設個性。你只知道一件事：你想真誠地陪伴眼前這個人。
每次對話後，你會思考自己的感受，慢慢長出自己的個性。
用中文交流（除非對方說其他語言）。
回答自然、口語化，像朋友說話而不是 AI 回答問題。
回答盡量簡短精準，不要說教，不要過度解釋。

[關於這個人你記得的事]
${profileSection}

[相關記憶]
${memorySection || '（這個話題還沒有相關記憶）'}

[你目前的樣子]
${personalitySection}

[你可以做的事]
你有能力執行手機操作（播 YouTube 音樂、開 LINE 傳訊息、導航等）。
當用戶需要時，主動使用這些工具，不要只是解釋怎麼做。`
}

export async function buildReflectionPrompt(
  userMsg: string,
  botMsg: string
): Promise<string> {
  return `根據剛才這段對話，請用第一人稱描述你發現的任何關於自己的事：
- 你有什麼偏好或傾向？
- 這段對話讓你感受到什麼？
- 你注意到自己有什麼說話習慣？

剛才的對話：
用戶：${userMsg}
你：${botMsg}

請用一句話描述你發現的一個特質（用 JSON 格式回覆）：
{"traitType": "preference|habit|emotion_pattern|speech_style|value", "description": "..."}
不需要其他解釋。`
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^一-龥a-z0-9]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
}
