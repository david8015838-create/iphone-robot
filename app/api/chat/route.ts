import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://generativelanguage.googleapis.com'

// Phone-action function declarations (executed client-side)
const PHONE_FUNCTIONS = [
  {
    name: 'play_youtube',
    description: '在 YouTube 搜尋並播放音樂或影片',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜尋詞' } },
      required: ['query'],
    },
  },
  {
    name: 'compose_line',
    description: '開啟 LINE 帶入訊息（用戶按發送）',
    parameters: {
      type: 'object',
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
  },
  {
    name: 'navigate',
    description: '用地圖導航到某地點',
    parameters: {
      type: 'object',
      properties: { destination: { type: 'string' } },
      required: ['destination'],
    },
  },
  {
    name: 'call',
    description: '撥打電話',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string' } },
      required: ['phone'],
    },
  },
]

const PHONE_ACTIONS = new Set(['play_youtube', 'compose_line', 'navigate', 'call', 'compose_sms', 'run_shortcut'])

interface Part {
  text?: string
  inline_data?: { mime_type: string; data: string }
  function_call?: { name: string; args: Record<string, unknown> }
  functionCall?: { name: string; args: Record<string, unknown> }
}

interface Content {
  role: 'user' | 'model' | 'function'
  parts: Part[]
}

/**
 * Decide which tool set to send to Gemini.
 *
 * Gemini 2.5 supports `google_search` grounding (free 500/day).
 * BUT combining `google_search` with custom `function_declarations` is
 * not supported in a single request — they conflict.
 *
 * Strategy: detect if user message likely needs current info → enable
 * google_search; otherwise enable function_declarations for phone actions.
 */
function needsCurrentInfo(message: string): boolean {
  const m = message.toLowerCase()
  const triggers = [
    '新聞', '最新', '現在', '今天', '今日', '剛剛', '剛才',
    '股價', '天氣', '溫度', '氣溫', '颱風', '地震', '時事',
    '誰', '什麼時候', '何時', '幾點', '比賽', '結果',
    '價格', '匯率', '油價',
    'news', 'latest', 'today', 'current', 'weather',
    'stock', 'price', 'who is', 'what is', 'when',
    'happened', 'right now',
  ]
  return triggers.some((t) => m.includes(t))
}

export async function POST(req: NextRequest) {
  let body: {
    message: string
    apiKey: string
    modelName?: string
    history: Content[]
    systemPrompt?: string
    imageBase64?: string
    imageMimeType?: string
  }

  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'JSON 解析失敗' }, { status: 400 })
  }

  const { message, apiKey, modelName, history = [], systemPrompt, imageBase64, imageMimeType } = body
  if (!apiKey?.trim()) return NextResponse.json({ error: '缺少 API Key' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: '訊息不能是空的' }, { status: 400 })

  const model = modelName?.trim() || 'gemini-2.5-flash'
  const key = apiKey.trim()
  const useSearch = needsCurrentInfo(message)

  // Build user parts
  const userParts: Part[] = [{ text: message }]
  if (imageBase64 && imageMimeType) {
    userParts.push({ inline_data: { mime_type: imageMimeType, data: imageBase64 } })
  }

  const contents: Content[] = [...history, { role: 'user', parts: userParts }]

  // Choose tools: search OR functions (mutually exclusive in Gemini)
  const tools = useSearch
    ? [{ google_search: {} }]
    : [{ function_declarations: PHONE_FUNCTIONS }]

  const reqBody: Record<string, unknown> = {
    contents,
    tools,
    generation_config: { temperature: 0.9, max_output_tokens: 2048 },
  }
  if (systemPrompt) {
    reqBody.system_instruction = { parts: [{ text: systemPrompt }] }
  }

  let res: Response
  try {
    res = await fetch(`${BASE}/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(35_000),
    })
  } catch (err) {
    return NextResponse.json({ error: `網路錯誤：${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json().catch(() => ({}))

  if (!res.ok) {
    const errMsg = data?.error?.message ?? `HTTP ${res.status}`
    if (res.status === 400 && errMsg.toLowerCase().includes('api key')) {
      return NextResponse.json({ error: 'API Key 無效' }, { status: 400 })
    }
    if (res.status === 403) return NextResponse.json({ error: `無權限：${errMsg}` }, { status: 403 })
    if (res.status === 429) return NextResponse.json({ error: '請求過於頻繁' }, { status: 429 })
    return NextResponse.json({ error: errMsg }, { status: res.status })
  }

  const candidate = data?.candidates?.[0]
  const parts: Part[] = candidate?.content?.parts ?? []

  // Check for phone-action function call (only when functions are enabled)
  if (!useSearch) {
    const fnCall = parts.find((p) => p.function_call || p.functionCall)
    const callObj = fnCall?.function_call || fnCall?.functionCall
    if (callObj && PHONE_ACTIONS.has(callObj.name)) {
      const accompanyingText = parts.map((p) => p.text ?? '').join('').trim()
      const args = Object.fromEntries(
        Object.entries(callObj.args ?? {}).map(([k, v]) => [k, String(v)])
      )
      return NextResponse.json({
        text: accompanyingText,
        action: { name: callObj.name, args },
        model,
      })
    }
  }

  // Extract grounded text (with search if useSearch was true)
  const text = parts.map((p) => p.text ?? '').join('').trim()

  // Grounding metadata (citations) for debugging
  const grounding = candidate?.grounding_metadata ?? candidate?.groundingMetadata
  const sources: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chunks: any[] = grounding?.grounding_chunks ?? grounding?.groundingChunks ?? []
  for (const c of chunks) {
    const uri = c?.web?.uri ?? c?.web?.url
    if (uri) sources.push(String(uri))
  }

  return NextResponse.json({
    text,
    model,
    searched: useSearch,
    sources: sources.slice(0, 5),
  })
}
