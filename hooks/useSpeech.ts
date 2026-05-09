'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type STTCallback = (transcript: string) => void

const WAKE_WORDS = ['yo bro', 'hey bro', 'yo,bro', 'yo bro!', 'bro', 'yo']

export function matchesWakeWord(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z ]/g, '').trim()
  return WAKE_WORDS.some((w) => t === w || t.startsWith(w + ' ') || t.endsWith(' ' + w))
}

export function stripWakeWord(text: string): string {
  let t = text.toLowerCase().trim()
  for (const w of WAKE_WORDS) {
    t = t.replace(new RegExp(`\\b${w}\\b`, 'gi'), '').trim()
  }
  return t.trim()
}

const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAEgAAACQAAAAuAAAAOAAAAEIAAABMAAAAVgAAAGAAAABqAAAAdAAAAH4AAACIAAAAkgAAAJwAAACmAAAAsAAAALoAAADEAAAAzgAAANgAAADiAAAA7AAAAPYAAAD'

export function useSpeech() {
  const [isListening,   setIsListening]   = useState(false)
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)
  const [isWakeActive,  setIsWakeActive]  = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wakeRecRef     = useRef<any>(null)
  const wakeModeRef    = useRef(false)
  const wakeLoopBusy   = useRef(false)   // prevent double-restart
  const callbackRef    = useRef<STTCallback | null>(null)
  const audioRef       = useRef<HTMLAudioElement | null>(null)
  const mouthTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const audio = new Audio()
    audio.preload = 'auto'
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

  // ─── STT (active conversation) ────────────────────────────────────
  const startListening = useCallback((onResult: STTCallback) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) return
    callbackRef.current = onResult
    try { recognitionRef.current?.stop() } catch { /* ignore */ }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new API()
    rec.lang = 'zh-TW'
    rec.continuous = false
    rec.interimResults = false
    rec.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t: string = e.results[0]?.[0]?.transcript ?? ''
      if (t.trim()) callbackRef.current?.(t.trim())
    }
    rec.onend   = () => setIsListening(false)
    rec.onerror = (e: { error: string }) => {
      if (e.error !== 'no-speech') console.warn('STT:', e.error)
      setIsListening(false)
    }
    recognitionRef.current = rec
    try { rec.start(); setIsListening(true) } catch { /* ignore */ }
  }, [])

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    setIsListening(false)
  }, [])

  // ─── Wake-word detection loop ─────────────────────────────────────
  // Uses en-US so "yo bro" is recognized properly
  const startWakeMode = useCallback((
    onWake: (extra: string) => void,
    onNeedsGesture?: () => void
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const API = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!API) { onNeedsGesture?.(); return }

    wakeModeRef.current = true
    setIsWakeActive(true)

    const loop = () => {
      if (!wakeModeRef.current || wakeLoopBusy.current) return
      wakeLoopBusy.current = true

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec: any = new API()
      rec.lang = 'en-US'          // ← English for "yo bro"
      rec.continuous = false
      rec.interimResults = false
      rec.maxAlternatives = 5     // more alternatives = better hit rate

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        for (let i = 0; i < e.results.length; i++) {
          for (let j = 0; j < e.results[i].length; j++) {
            const text: string = e.results[i][j].transcript ?? ''
            if (matchesWakeWord(text)) {
              const extra = stripWakeWord(text)
              onWake(extra)
              return
            }
          }
        }
      }

      rec.onend = () => {
        wakeLoopBusy.current = false
        if (wakeModeRef.current) setTimeout(loop, 150)
      }

      rec.onerror = (e: { error: string }) => {
        wakeLoopBusy.current = false
        if (!wakeModeRef.current) return
        if (e.error === 'not-allowed') {
          setIsWakeActive(false)
          onNeedsGesture?.()
        } else {
          // no-speech / network / aborted → keep going
          setTimeout(loop, 400)
        }
      }

      wakeRecRef.current = rec
      try {
        rec.start()
      } catch {
        wakeLoopBusy.current = false
        setIsWakeActive(false)
        onNeedsGesture?.()
      }
    }

    loop()
  }, [])

  const stopWakeMode = useCallback(() => {
    wakeModeRef.current = false
    wakeLoopBusy.current = false
    setIsWakeActive(false)
    try { wakeRecRef.current?.stop() } catch { /* ignore */ }
    wakeRecRef.current = null
  }, [])

  // ─── TTS via <audio> + /api/tts ───────────────────────────────────
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
    audio.play().catch(() => { cleanup(); onEnd?.() })
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    setIsSpeaking(false)
    setMouthOpenness(0)
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
  }, [])

  return {
    isListening, isSpeaking, mouthOpenness, isWakeActive,
    startListening, stopListening, speak, stopSpeaking,
    startWakeMode, stopWakeMode,
  }
}
