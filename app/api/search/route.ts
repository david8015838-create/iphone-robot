import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'robot-ai/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json()

    const results: Array<{ title: string; snippet: string; url: string }> = []

    if (data.AbstractText) {
      results.push({ title: data.Heading ?? query, snippet: data.AbstractText, url: data.AbstractURL ?? '' })
    }

    for (const item of (data.RelatedTopics ?? []).slice(0, 3)) {
      if (item.Text && item.FirstURL) {
        results.push({ title: item.Text.split(' - ')[0], snippet: item.Text, url: item.FirstURL })
      }
    }

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
