'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type STTCallback = (transcript: string) => void

const WAKE_WORDS = ['yo bro', 'yo,bro', 'hey bro', 'yo bro!', '嗨機器人', '嘿機器人', '哈囉']

function hasWakeWord(text: string): boolean {
  const t = text.toLowerCase().trim()
  return WAKE_WORDS.some((w) => t.includes(w))
}

function stripWakeWord(text: string): string {
  let t = text.toLowerCase().trim()
  for (const w of WAKE_WORDS) t = t.replace(w, '').trim()
  // restore original casing for non-wake parts
  return t || ''
}

// 1-frame silent MP3 — used to unlock <audio> on iOS during user gesture
const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAEgAAACQAAAAuAAAAOAAAAEIAAABMAAAAVgAAAGAAAABqAAAAdAAAAH4AAACIAAAAkgAAAJwAAACmAAAAsAAAALoAAADEAAAAzgAAANgAAADiAAAA7AAAAPYAAAD'

export function useSpeech() {
  const [isListening,   setIsListening]   = useState(false)
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef  = useRef<any>(null)
  const wakeRecRef      = useRef<any>(null)  // eslint-disable-line @typescript-eslint/no-explicit-any
  const wakeModeRef     = useRef(false)
  const callbackRef     = useRef<STTCallback | null>(null)
  const audioRef        = useRef<HTMLAudioElement | null>(null)
  const mouthTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  // Create <audio> element and unlock it on first user gesture
  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume  = 1
    audioRef.current = audio

    const unlock = () => {
      audio.src = SILENT_MP3
      audio.play().catch(() => {})
    }

    document.addEventListener('touchstart', unlock, { once: true, passive: true })
    document.addEventListener('click',      unlock, { once: true, passive: true })

    return () => {
      audio.pause()
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click',      unlock)
    }
  }, [])

  // ─── STT ─────────────────────────────────────────────────────────
  const startListening = useCallback((onResult: STTCallback) => {
    if (typeof window === 'undefined') return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) return

    callbackRef.current = onResult

    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new API()
    rec.lang              = 'zh-TW'
    rec.interimResults    = false
    rec.maxAlternatives   = 1
    rec.continuous        = false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t: string = e.results[0]?.[0]?.transcript ?? ''
      if (t.trim() && callbackRef.current) callbackRef.current(t.trim())
    }
    rec.onend   = () => setIsListening(false)
    rec.onerror = (e: { error: string }) => {
      if (e.error !== 'no-speech') console.warn('STT error:', e.error)
      setIsListening(false)
    }

    recognitionRef.current = rec
    try {
      rec.start()
      setIsListening(true)
    } catch (err) {
      console.warn('recognition.start() failed:', err)
    }
  }, [])

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    setIsListening(false)
  }, [])

  // ─── TTS via <audio> + /api/tts proxy ────────────────────────────
  const speak = useCallback((text: string, lang = 'zh-TW', onEnd?: () => void) => {
    const audio = audioRef.current
    if (!audio || !text.trim()) { onEnd?.(); return }

    audio.pause()
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)

    const cleanup = () => {
      setIsSpeaking(false)
      setMouthOpenness(0)
      if (mouthTimerRef.current) { clearInterval(mouthTimerRef.current); mouthTimerRef.current = null }
    }

    audio.onplay  = () => {
      setIsSpeaking(true)
      mouthTimerRef.current = setInterval(() => setMouthOpenness(Math.random() * 0.7 + 0.3), 90)
    }
    audio.onended = () => { cleanup(); onEnd?.() }
    audio.onerror = () => { cleanup(); onEnd?.() }

    audio.src = `/api/tts?text=${encodeURIComponent(text)}&lang=${lang}`
    audio.load()
    audio.play().catch((err) => { console.warn('audio.play() failed:', err); cleanup(); onEnd?.() })
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    setIsSpeaking(false)
    setMouthOpenness(0)
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
  }, [])

  // ─── Wake-word detection loop ────────────────────────────────────
  const startWakeMode = useCallback((onWake: (extra: string) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) return

    wakeModeRef.current = true

    const loop = () => {
      if (!wakeModeRef.current) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = new API()
      rec.lang = 'zh-TW'          // zh-TW recognises "yo bro" well enough
      rec.continuous = false
      rec.interimResults = false
      rec.maxAlternatives = 3     // more alternatives → better wake word hit rate

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        // Check all alternatives for wake word
        for (let i = 0; i < e.results.length; i++) {
          for (let j = 0; j < e.results[i].length; j++) {
            const text: string = e.results[i][j].transcript ?? ''
            if (hasWakeWord(text)) {
              const extra = stripWakeWord(text)
              onWake(extra)
              return
            }
          }
        }
      }

      rec.onend = () => {
        if (wakeModeRef.current) setTimeout(loop, 250)
      }

      rec.onerror = (e: { error: string }) => {
        // 'no-speech' and 'aborted' are expected — keep looping
        if (wakeModeRef.current && e.error !== 'not-allowed') {
          setTimeout(loop, 500)
        }
      }

      wakeRecRef.current = rec
      try { rec.start() } catch { /* ignore */ }
    }

    loop()
  }, [])

  const stopWakeMode = useCallback(() => {
    wakeModeRef.current = false
    try { wakeRecRef.current?.stop() } catch { /* ignore */ }
    wakeRecRef.current = null
  }, [])

  return {
    isListening, isSpeaking, mouthOpenness,
    startListening, stopListening, speak, stopSpeaking,
    startWakeMode, stopWakeMode,
  }
}
