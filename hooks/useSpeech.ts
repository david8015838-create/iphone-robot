'use client'

import { useCallback, useRef, useState } from 'react'

type STTCallback = (transcript: string) => void

export function useSpeech() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking,  setIsSpeaking]  = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const mouthTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const callbackRef    = useRef<STTCallback | null>(null)

  const startListening = useCallback((onResult: STTCallback) => {
    if (typeof window === 'undefined') return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      console.warn('SpeechRecognition not supported')
      return
    }

    // Store callback in ref so we don't recreate recognition on re-renders
    callbackRef.current = onResult

    // Stop any existing session first
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionAPI()
    recognition.lang = 'zh-TW'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.continuous = false  // iOS requires false

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript: string = event.results[0]?.[0]?.transcript ?? ''
      if (transcript.trim() && callbackRef.current) {
        callbackRef.current(transcript.trim())
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = (e: { error: string }) => {
      // 'no-speech' is normal — user just didn't speak
      if (e.error !== 'no-speech') {
        console.warn('SpeechRecognition error:', e.error)
      }
      setIsListening(false)
    }

    recognitionRef.current = recognition

    // ─── Critical for iOS: call start() synchronously, right here ───
    try {
      recognition.start()
      setIsListening(true)
    } catch (err) {
      console.warn('recognition.start() failed:', err)
      setIsListening(false)
    }
  }, [])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
    }
    setIsListening(false)
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === 'undefined') return
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'zh-TW'
    utterance.rate = 1.0
    utterance.pitch = 1.1
    utterance.volume = 1.0

    // Prefer a Chinese voice if available
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find((v) => v.lang.startsWith('zh'))
    if (zhVoice) utterance.voice = zhVoice

    utterance.onstart = () => {
      setIsSpeaking(true)
      mouthTimerRef.current = setInterval(() => {
        setMouthOpenness(Math.random() * 0.8 + 0.2)
      }, 80)
    }

    const cleanup = () => {
      setIsSpeaking(false)
      setMouthOpenness(0)
      if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
    }

    utterance.onend  = () => { cleanup(); onEnd?.() }
    utterance.onerror = () => { cleanup() }

    // iOS requires speechSynthesis to be triggered inside a user gesture.
    // We call speak() after API response, which may be async — but iOS 16+
    // generally allows it as long as the page has been interacted with once.
    window.speechSynthesis.speak(utterance)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setMouthOpenness(0)
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
  }, [])

  return { isListening, isSpeaking, mouthOpenness, startListening, stopListening, speak, stopSpeaking }
}
