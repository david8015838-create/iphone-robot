import { NextRequest, NextResponse } from 'next/server'

const BASE = 'https://generativelanguage.googleapis.com'

export async function POST(req: NextRequest) {
  let body: {
    message: string
    apiKey: string
    modelName?: string
    history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
    systemPrompt?: string
    imageBase64?: string
    imageMimeType?: string
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON 解析失敗' }, { status: 400 })
  }

  const { message, apiKey, modelName, history = [], systemPrompt, imageBase64, imageMimeType } = body

  if (!apiKey?.trim()) return NextResponse.json({ error: '缺少 API Key' }, { status: 400 })
  if (!message?.trim()) return NextResponse.json({ error: '訊息不能是空的' }, { status: 400 })

  const model = modelName?.trim() || 'gemini-2.5-flash'
  const key = apiKey.trim()

  // Build contents
  const userParts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: message },
  ]
  if (imageBase64 && imageMimeType) {
    userParts.push({ inline_data: { mime_type: imageMimeType, data: imageBase64 } })
  }

  const contents = [...history, { role: 'user', parts: userParts }]

  // Minimal request body — only contents required
  const reqBody: Record<string, unknown> = { contents }

  // Add system instruction only if provided (correct v1beta format)
  if (systemPrompt) {
    reqBody.system_instruction = { parts: [{ text: systemPrompt }] }
  }

  // Try v1beta then v1alpha
  const urls = [
    `${BASE}/v1beta/models/${model}:generateContent?key=${key}`,
    `${BASE}/v1alpha/models/${model}:generateContent?key=${key}`,
  ]

  for (const url of urls) {
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: AbortSignal.timeout(30_000),
      })
    } catch (networkErr) {
      continue
    }

    // Parse response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json().catch(() => ({}))

    if (res.ok) {
      const text: string =
        data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
      return NextResponse.json({ text, model })
    }

    const errMsg: string = data?.error?.message ?? `HTTP ${res.status}`
    const status: string = data?.error?.status ?? ''

    // Key invalid — stop immediately
    if (res.status === 400 && (errMsg.includes('API key') || status === 'INVALID_ARGUMENT' && errMsg.includes('key'))) {
      return NextResponse.json({ error: 'API Key 無效，請重新確認' }, { status: 400 })
    }

    // 403 — try next URL
    if (res.status === 403) continue

    // 404 model not found — stop
    if (res.status === 404) {
      return NextResponse.json({ error: `找不到模型「${model}」，請確認名稱正確` }, { status: 404 })
    }

    // Rate limit
    if (res.status === 429) {
      return NextResponse.json({ error: '請求過於頻繁，稍等 1 分鐘再試' }, { status: 429 })
    }

    // system_instruction not supported — retry without it
    if (res.status === 400 && errMsg.includes('system_instruction')) {
      delete reqBody.system_instruction
      continue
    }

    // Other error — try next URL
    continue
  }

  return NextResponse.json(
    {
      error: `無法存取 ${model}（403）。\n\n請確認：你在 app 裡輸入的 API Key 是否來自 AI Studio 的 "phonebot1" 這個 project？\n\n去這裡取正確的 Key：aistudio.google.com/apikey`,
    },
    { status: 403 }
  )
}
