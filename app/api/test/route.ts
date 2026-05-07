import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash']

export async function GET(req: NextRequest) {
  const apiKey = req.nextUrl.searchParams.get('key')
  if (!apiKey) return NextResponse.json({ error: '缺少 key 參數' }, { status: 400 })

  const client = new GoogleGenAI({ apiKey })
  const results: Record<string, string> = {}

  for (const model of MODELS) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: '回覆OK' }] }],
      })
      results[model] = `✅ 可用（${res.text?.slice(0, 20) ?? ''}）`
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results[model] = msg.includes('403') ? '❌ 無權限' :
                       msg.includes('429') ? '⚠️ 配額限制' :
                       msg.includes('404') ? '❌ 找不到' :
                       `❌ ${msg.slice(0, 60)}`
    }
  }

  return NextResponse.json(results)
}
