import { detectIntent, type IntentResult } from './intent'

interface ContinuousListenerOptions {
  onSpeech:      (text: string, intent: IntentResult) => void
  onAmbient:     (text: string) => void  // logged but not processed
  onNeedsGesture: () => void
  isBotSpeaking: () => boolean    // pause while bot is talking
  isBotRecent:   () => boolean
  isActive:      () => boolean    // user in active conversation
}

/**
 * Continuous speech listener that runs forever (after first gesture).
 *
 * iOS-friendly: each recognition session is short (continuous=false),
 * we restart via onend. Uses zh-TW since most conversation is Chinese;
 * the intent detector handles English wake words phonetically.
 */
export class ContinuousListener {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rec: any = null
  private opts: ContinuousListenerOptions | null = null
  private running = false
  private busy = false

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

  private loop = () => {
    if (!this.running || !this.opts || this.busy) return

    // Don't compete with TTS playback
    if (this.opts.isBotSpeaking()) {
      setTimeout(this.loop, 500)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) { this.opts.onNeedsGesture(); return }

    this.busy = true

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new API()
    rec.lang = 'zh-TW'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 3

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const results = e.results
      if (!results || results.length === 0) return

      // Check all alternatives for highest-confidence intent
      let bestText = ''
      let bestIntent: IntentResult | null = null
      let bestConfidence = 0
      const confMap = { high: 3, medium: 2, low: 1 } as const

      for (let i = 0; i < results.length; i++) {
        for (let j = 0; j < results[i].length; j++) {
          const text: string = results[i][j].transcript ?? ''
          if (!text.trim()) continue
          const intent = detectIntent(text, {
            botSpokeRecently: this.opts?.isBotRecent() ?? false,
            inActiveSession:  this.opts?.isActive()    ?? false,
          })
          const c = confMap[intent.confidence]
          if (intent.addressed && c > bestConfidence) {
            bestText = text
            bestIntent = intent
            bestConfidence = c
          }
          if (!bestText) bestText = text   // fallback
        }
      }

      if (bestIntent && bestIntent.addressed) {
        this.opts?.onSpeech(bestText, bestIntent)
      } else if (bestText) {
        this.opts?.onAmbient(bestText)
      }
    }

    rec.onend = () => {
      this.busy = false
      if (this.running) setTimeout(this.loop, 150)
    }

    rec.onerror = (e: { error: string }) => {
      this.busy = false
      if (!this.running) return
      if (e.error === 'not-allowed') {
        this.running = false
        this.opts?.onNeedsGesture()
      } else {
        setTimeout(this.loop, 400)
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
