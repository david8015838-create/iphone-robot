import { NextRequest, NextResponse } from 'next/server'

interface SearchResult {
  title: string
  snippet: string
  url: string
}

/**
 * Web search via DuckDuckGo HTML endpoint (free, no API key).
 * Scrapes the lite HTML page for organic results.
 */
async function searchDuckDuckGo(query: string, region = 'tw-zh'): Promise<SearchResult[]> {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=${region}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html',
    },
    body: `q=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(8_000),
  })

  if (!res.ok) return []
  const html = await res.text()

  const results: SearchResult[] = []
  // Match result blocks
  const blockRe = /<div class="result results_links[^"]*"[\s\S]*?<\/div>\s*<\/div>/g
  let blockMatch: RegExpExecArray | null

  while ((blockMatch = blockRe.exec(html)) !== null && results.length < 5) {
    const block = blockMatch[0]

    const titleMatch = block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/)
    const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)

    if (titleMatch) {
      const rawUrl = titleMatch[1]
      // DuckDuckGo wraps URLs — unwrap
      const realUrl = rawUrl.startsWith('//duckduckgo.com/l/?uddg=')
        ? decodeURIComponent(rawUrl.match(/uddg=([^&]+)/)?.[1] ?? rawUrl)
        : rawUrl
      results.push({
        title: stripTags(titleMatch[2]),
        snippet: snippetMatch ? stripTags(snippetMatch[1]) : '',
        url: realUrl,
      })
    }
  }

  return results
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, ' ').trim()
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query?.trim()) {
    return NextResponse.json({ error: 'Missing q' }, { status: 400 })
  }

  try {
    const results = await searchDuckDuckGo(query.trim())
    return NextResponse.json({ query, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg, results: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  // Allow POST for internal calls (e.g., from /api/chat tool execution)
  let body: { query: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  try {
    const results = await searchDuckDuckGo(body.query.trim())
    return NextResponse.json({ query: body.query, results })
  } catch {
    return NextResponse.json({ results: [] })
  }
}
