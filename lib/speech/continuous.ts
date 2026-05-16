import { detectIntent, type IntentResult } from './intent'

interface ContinuousListenerOptions {
  onSpeech:      (text: string, intent: IntentResult) => void
  onAmbient:     (text: string) => void
  onNeedsGesture: () => void
  isBotSpeaking: () => boolean
  isBotRecent:   () => boolean
  isActive:      () => boolean
}

/**
 * Continuous speech listener with bilingual support.
 *
 * iOS Safari's SpeechRecognition can only set one language per session,
 * but each session is short (~3-5s). We alternate between zh-TW and en-US
 * to catch both. After a successful detection, we lock to that language
 * for a few sessions for follow-up speech.
 */
export class ContinuousListener {
  private static LANGS = ['zh-TW', 'en-US']
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rec: any = null
  private opts: ContinuousListenerOptions | null = null
  private running = false
  private busy = false
  private langIdx = 0
  private lockedLang: string | null = null
  private lockedUntil = 0     // timestamp until which we stay on locked lang

  start(opts: ContinuousListenerOptions) {
    this.opts = opts
    if (this.running) return
    this.running = true
    this.loop()
  }

  stop() {
    this.running = false
    try { this.rec?.stop() } catch { /* ignore */ }
    this.rec = null
  }

  private nextLang(): string {
    // Honor lock if still active
    if (this.lockedLang && Date.now() < this.lockedUntil) {
      return this.lockedLang
    }
    this.lockedLang = null
    // Alternate
    const lang = ContinuousListener.LANGS[this.langIdx]
    this.langIdx = (this.langIdx + 1) % ContinuousListener.LANGS.length
    return lang
  }

  // After a successful detection in lang X, stay on X for 10s for follow-ups
  private lock(lang: string) {
    this.lockedLang = lang
    this.lockedUntil = Date.now() + 10_000
  }

  private loop = () => {
    if (!this.running || !this.opts || this.busy) return

    if (this.opts.isBotSpeaking()) {
      setTimeout(this.loop, 500)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) { this.opts.onNeedsGesture(); return }

    this.busy = true
    const sessionLang = this.nextLang()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new API()
    rec.lang = sessionLang
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const results = e.results
      if (!results || results.length === 0) return

      let bestText = ''
      let bestIntent: IntentResult | null = null
      let bestScore = 0
      const confMap = { high: 3, medium: 2, low: 1 } as const

      for (let i = 0; i < results.length; i++) {
        for (let j = 0; j < results[i].length; j++) {
          const text: string = results[i][j].transcript ?? ''
          if (!text.trim()) continue
          const intent = detectIntent(text, {
            botSpokeRecently: this.opts?.isBotRecent() ?? false,
            inActiveSession:  this.opts?.isActive()    ?? false,
          })
          const score = confMap[intent.confidence]
          if (intent.addressed && score > bestScore) {
            bestText = text
            bestIntent = intent
            bestScore = score
          }
          if (!bestText) bestText = text
        }
      }

      if (bestIntent && bestIntent.addressed) {
        this.lock(sessionLang)   // stay on this lang for follow-ups
        this.opts?.onSpeech(bestText, bestIntent)
      } else if (bestText) {
        this.opts?.onAmbient(bestText)
      }
    }

    rec.onend = () => {
      this.busy = false
      if (this.running) setTimeout(this.loop, 120)
    }

    rec.onerror = (e: { error: string }) => {
      this.busy = false
      if (!this.running) return
      if (e.error === 'not-allowed') {
        this.running = false
        this.opts?.onNeedsGesture()
      } else {
        setTimeout(this.loop, 350)
      }
    }

    this.rec = rec
    try {
      rec.start()
    } catch {
      this.busy = false
      this.running = false
      this.opts?.onNeedsGesture()
    }
  }
}
