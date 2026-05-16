'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const SILENT_MP3 =
  'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAABAAABIADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAEgAAACQAAAAuAAAAOAAAAEIAAABMAAAAVgAAAGAAAABqAAAAdAAAAH4AAACIAAAAkgAAAJwAAACmAAAAsAAAALoAAADEAAAAzgAAANgAAADiAAAA7AAAAPYAAAD'

/**
 * Pure TTS hook — speech recognition is handled by ContinuousListener.
 * Plays audio via <audio> element (unlocked on first gesture) +
 * Google Translate TTS proxy at /api/tts.
 */
export function useSpeech() {
  const [isSpeaking,    setIsSpeaking]    = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)

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

    audio.onplay = () => {
      setIsSpeaking(true)
      mouthTimerRef.current = setInterval(
        () => setMouthOpenness(Math.random() * 0.7 + 0.3), 90
      )
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

  return { isSpeaking, mouthOpenness, speak, stopSpeaking }
}
