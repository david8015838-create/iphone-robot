'use client'

import { useCallback, useRef, useState } from 'react'

type STTCallback = (transcript: string) => void

export function useSpeech() {
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [mouthOpenness, setMouthOpenness] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const mouthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startListening = useCallback((onResult: STTCallback) => {
    if (typeof window === 'undefined') return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SpeechRecognitionAPI) return

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'zh-TW'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      onResult(transcript)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (typeof window === 'undefined') return
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'zh-TW'
      utterance.rate = 1.0
      utterance.pitch = 1.1
      utterance.volume = 1.0

      const voices = window.speechSynthesis.getVoices()
      const zhVoice = voices.find((v) => v.lang.startsWith('zh'))
      if (zhVoice) utterance.voice = zhVoice

      utterance.onstart = () => {
        setIsSpeaking(true)
        // Simulate mouth openness with random oscillation
        mouthTimerRef.current = setInterval(() => {
          setMouthOpenness(Math.random() * 0.8 + 0.2)
        }, 80)
      }

      utterance.onend = () => {
        setIsSpeaking(false)
        setMouthOpenness(0)
        if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
        onEnd?.()
      }

      utterance.onerror = () => {
        setIsSpeaking(false)
        setMouthOpenness(0)
        if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
      }

      utteranceRef.current = utterance
      window.speechSynthesis.speak(utterance)
    },
    []
  )

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setMouthOpenness(0)
    if (mouthTimerRef.current) clearInterval(mouthTimerRef.current)
  }, [])

  return {
    isListening,
    isSpeaking,
    mouthOpenness,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}
