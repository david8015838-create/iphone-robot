'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type STTCallback = (transcript: string) => void

// 1-frame silent MP3 — used to unlock <audio> on iOS during user gesture
const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAEgAAACQAAAAuAAAAOAAAAEIAAABMAAAAVgAAAGAAAABqAAAAdAAAAH4AAACIAAAAkgAAAJwAAACmAAAAsAAAALoAAADEAAAAzgAAANgAAADiAAAA7AAAAPYAAAD'

export function useSpeech() {
  const [isListening,   setIsListening]   = useState(false)
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const callbackRef    = useRef<STTCallback | null>(null)
  const audioRef       = useRef<HTMLAudioElement | null>(null)
  const mouthTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)

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
  const speak = useCallback((text: string, onEnd?: () => void) => {
    const audio = audioRef.current
    if (!audio || !text.trim()) { onEnd?.(); return }

    // Stop any previous playback
    audio.pause()
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)

    const cleanup = () => {
      setIsSpeaking(false)
      setMouthOpenness(0)
      if (mouthTimerRef.current) {
        clearInterval(mouthTimerRef.current)
        mouthTimerRef.current = null
      }
    }

    audio.onplay = () => {
      setIsSpeaking(true)
      mouthTimerRef.current = setInterval(() => {
        setMouthOpenness(Math.random() * 0.7 + 0.3)
      }, 90)
    }

    audio.onended = () => { cleanup(); onEnd?.() }
    audio.onerror = () => { cleanup(); onEnd?.() }

    // Set audio source to our TTS proxy — then play
    audio.src = `/api/tts?text=${encodeURIComponent(text)}&lang=zh-TW`
    audio.load()
    audio.play().catch((err) => {
      console.warn('audio.play() failed:', err)
      cleanup()
      onEnd?.()
    })
  }, [])

  const stopSpeaking = useCallback(() => {
    audioRef.current?.pause()
    setIsSpeaking(false)
    setMouthOpenness(0)
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
  }, [])

  return {
    isListening, isSpeaking, mouthOpenness,
    startListening, stopListening, speak, stopSpeaking,
  }
}
