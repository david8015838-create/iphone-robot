import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const text = req.nextUrl.searchParams.get('text') ?? ''
  const lang = req.nextUrl.searchParams.get('lang') ?? 'zh-TW'

  if (!text.trim()) {
    return new NextResponse(null, { status: 400 })
  }

  // Chunk into ≤200-char pieces (Google TTS limit per request)
  const chunk = text.slice(0, 200)

  const url =
    `https://translate.google.com/translate_tts` +
    `?ie=UTF-8&tl=${lang}&client=tw-ob` +
    `&q=${encodeURIComponent(chunk)}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: 'https://translate.google.com/',
      },
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      return new NextResponse(null, { status: res.status })
    }

    const audio = await res.arrayBuffer()

    return new NextResponse(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new NextResponse(null, { status: 502 })
  }
}
