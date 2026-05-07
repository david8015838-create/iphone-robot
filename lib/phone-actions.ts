export type ActionName =
  | 'play_youtube'
  | 'compose_line'
  | 'navigate'
  | 'call'
  | 'compose_sms'
  | 'search_web'
  | 'run_shortcut'
  | 'open_app'

export interface ActionDef {
  name: ActionName
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
}

export const PHONE_ACTION_DEFS: ActionDef[] = [
  {
    name: 'play_youtube',
    description: '在 YouTube 搜尋並播放音樂或影片',
    parameters: {
      query: { type: 'string', description: '搜尋關鍵字', required: true },
    },
  },
  {
    name: 'compose_line',
    description: '開啟 LINE 準備傳送訊息（用戶需點擊發送）',
    parameters: {
      message: { type: 'string', description: '訊息內容', required: true },
    },
  },
  {
    name: 'navigate',
    description: '用 Apple Maps 導航到某個地點',
    parameters: {
      destination: { type: 'string', description: '目的地名稱或地址', required: true },
    },
  },
  {
    name: 'call',
    description: '撥打電話',
    parameters: {
      phone: { type: 'string', description: '電話號碼', required: true },
    },
  },
  {
    name: 'compose_sms',
    description: '準備傳送 SMS 簡訊',
    parameters: {
      phone: { type: 'string', description: '電話號碼', required: true },
      body: { type: 'string', description: '訊息內容', required: true },
    },
  },
  {
    name: 'search_web',
    description: '用 Google 搜尋最新資訊',
    parameters: {
      query: { type: 'string', description: '搜尋關鍵字', required: true },
    },
  },
  {
    name: 'run_shortcut',
    description: '執行 iPhone 捷徑 App 裡的自動化任務',
    parameters: {
      shortcut_name: { type: 'string', description: '捷徑名稱', required: true },
      input: { type: 'string', description: '傳入捷徑的參數（可選）' },
    },
  },
  {
    name: 'open_app',
    description: '用 URL scheme 開啟指定 App',
    parameters: {
      scheme: { type: 'string', description: 'App URL scheme', required: true },
    },
  },
]

export function buildActionUrl(name: ActionName, args: Record<string, string>): string {
  switch (name) {
    case 'play_youtube':
      return `https://www.youtube.com/results?search_query=${encodeURIComponent(args.query ?? '')}`
    case 'compose_line':
      return `line://msg/text/${encodeURIComponent(args.message ?? '')}`
    case 'navigate':
      return `maps://?q=${encodeURIComponent(args.destination ?? '')}`
    case 'call':
      return `tel:${args.phone ?? ''}`
    case 'compose_sms':
      return `sms:${args.phone ?? ''}&body=${encodeURIComponent(args.body ?? '')}`
    case 'search_web':
      return `https://www.google.com/search?q=${encodeURIComponent(args.query ?? '')}`
    case 'run_shortcut':
      return `shortcuts://run-shortcut?name=${encodeURIComponent(args.shortcut_name ?? '')}&input=${encodeURIComponent(args.input ?? '')}`
    case 'open_app':
      return args.scheme ?? ''
    default:
      return ''
  }
}

export function executeAction(name: ActionName, args: Record<string, string>): void {
  const url = buildActionUrl(name, args)
  if (url) window.location.href = url
}

export function getGeminiToolDeclarations() {
  return PHONE_ACTION_DEFS.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(def.parameters).map(([k, v]) => [
          k,
          { type: v.type, description: v.description },
        ])
      ),
      required: Object.entries(def.parameters)
        .filter(([, v]) => v.required)
        .map(([k]) => k),
    },
  }))
}
