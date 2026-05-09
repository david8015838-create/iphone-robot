'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Message, EmotionState, KeyEntry } from '@/types'
import { getKeyRotator } from '@/lib/key-rotator'
import { uuid } from '@/lib/uuid'
import { getModelName } from '@/lib/model-config'
import { EmotionEngine } from '@/lib/emotion-engine'
import { executeAction, type ActionName } from '@/lib/phone-actions'
import { buildSystemPrompt } from '@/lib/memory/retriever'
import { useSpeech } from './useSpeech'
import { useMemory } from './useMemory'

const FALLBACK_SYSTEM_PROMPT = `你是一個剛誕生的AI智能體。
你沒有固定名字，沒有預設個性。你只有一個核心：真誠陪伴眼前這個人。
重要：用對方說話的語言回答。對方說中文就回中文，說英文就回英文。
回答自然口語化，像朋友說話，不要說教，盡量簡短精準。`

// Simple language detection — returns BCP-47 tag for TTS
function detectLang(text: string): string {
  const cjk = (text.match(/[一-鿿぀-ヿ]/g) ?? []).length
  const total = text.replace(/\s/g, '').length
  if (total === 0) return 'zh-TW'
  return cjk / total > 0.2 ? 'zh-TW' : 'en-US'
}

export function useRobot() {
  const [emotion,       setEmotion]       = useState<EmotionState>('idle')
  const [messages,      setMessages]      = useState<Message[]>([])
  const [keys,          setKeys]          = useState<KeyEntry[]>([])
  const [isThinking,    setIsThinking]    = useState(false)
  const [autoListen,    setAutoListen]    = useState(false)
  const [wakeMode,      setWakeMode]      = useState(false)
  const [needsGesture,  setNeedsGesture]  = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    name: ActionName; args: Record<string, string>; label: string
  } | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const rotator     = useRef(getKeyRotator())
  const emotionEng  = useRef<EmotionEngine | null>(null)
  const autoRef            = useRef(false)
  const onWakeDetectedRef  = useRef<((extra: string) => void) | null>(null)

  const {
    isListening, isSpeaking, mouthOpenness,
    startListening, stopListening, speak, stopSpeaking,
    startWakeMode, stopWakeMode,
  } = useSpeech()
  const { storeConversation, extractAndSaveMemories, runPersonalityReflection } = useMemory()

  useEffect(() => {
    emotionEng.current = new EmotionEngine((e) => setEmotion(e))
    setKeys(rotator.current.getAll())

    // Auto-start wake detection — works immediately on PWA, needs one gesture on browser
    const timer = setTimeout(() => {
      setWakeMode(true)
      startWakeMode(
        (extra) => onWakeDetectedRef.current?.(extra),
        () => {
          // Needs gesture — show hint, user taps anywhere to activate
          setNeedsGesture(true)
          setWakeMode(false)
        }
      )
    }, 800)

    return () => {
      clearTimeout(timer)
      emotionEng.current?.destroy()
      rotator.current.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep ref in sync so callbacks always see latest value
  useEffect(() => { autoRef.current = autoListen }, [autoListen])

  const refreshKeys = useCallback(() => setKeys(rotator.current.getAll()), [])

  const addKey    = useCallback((v: string, l?: string) => { rotator.current.addKey(v, l); refreshKeys() }, [refreshKeys])
  const removeKey = useCallback((id: string) => { rotator.current.removeKey(id); refreshKeys() }, [refreshKeys])
  const resetKey  = useCallback((id: string) => { rotator.current.resetKey(id); refreshKeys() }, [refreshKeys])

  // ─── startListen as a stable ref so sendMessage can call it ───────
  const startListenRef = useRef<((cb: (t: string) => void) => void) | null>(null)
  useEffect(() => { startListenRef.current = startListening }, [startListening])

  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    const lang = detectLang(text)
    const key = rotator.current.getNextKey()

    if (!key) {
      const earliest = rotator.current.getEarliestReset()
      const waitSec = earliest ? Math.ceil((earliest - Date.now()) / 1000) : 60
      const errMsg = keys.length === 0
        ? '還沒有設定 API Key！點一下畫面選 ⚙️ 設定'
        : `所有 Key 都在冷卻，約 ${waitSec} 秒後恢復`
      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: 'user',      content: text,   timestamp: Date.now() },
        { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now(), emotion: 'sad' },
      ])
      emotionEng.current?.setEmotion('sad')
      speak(errMsg, lang)
      return
    }

    const userMsg: Message = { id: uuid(), role: 'user', content: text, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    emotionEng.current?.setEmotion('thinking')
    setIsThinking(true)

    const history = messages.slice(-10).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: m.content }],
    }))

    try {
      let systemPrompt = FALLBACK_SYSTEM_PROMPT
      try { systemPrompt = await buildSystemPrompt(text) } catch { /* IndexedDB unavailable */ }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          apiKey: key.value,
          modelName: getModelName(),
          history,
          systemPrompt,
          imageBase64,
          imageMimeType: imageBase64 ? 'image/jpeg' : undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        if (res.status === 429) rotator.current.markCooling(key.id, 60_000)
        else if (res.status === 400) rotator.current.markExhausted(key.id)
        refreshKeys()
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const botText: string = data.text ?? ''
      const action = data.action as { name: ActionName; args: Record<string, string> } | undefined

      const botLang = detectLang(botText)
      const botEmotion: EmotionState = emotionEng.current?.analyze(botText) ?? 'idle'
      emotionEng.current?.setEmotion(botEmotion)

      const assistantMsg: Message = {
        id: uuid(), role: 'assistant',
        content: botText || '（無回應）',
        timestamp: Date.now(), emotion: botEmotion,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsThinking(false)

      if (action) {
        const CONFIRM: ActionName[] = ['compose_line', 'compose_sms', 'call']
        if (CONFIRM.includes(action.name)) {
          setPendingAction({ ...action, label: botText || `執行 ${action.name}？` })
          speak(botText || '要我幫你執行嗎？', botLang)
        } else {
          executeAction(action.name, action.args)
          speak(botText || '好，幫你開啟了', botLang)
        }
      } else if (botText) {
        emotionEng.current?.setEmotion('speaking')
        speak(botText, botLang, () => {
          emotionEng.current?.setEmotion('idle')
          if (autoRef.current) {
            setTimeout(() => {
              if (!autoRef.current) return
              emotionEng.current?.setEmotion('listening')
              // Resume wake-word detection after speaking
              startWakeMode((extra) => {
                stopWakeMode()
                if (extra.trim()) {
                  sendMessageRef.current?.(extra)
                } else {
                  startListenRef.current?.((t) => {
                    if (t) sendMessageRef.current?.(t)
                  })
                }
              })
              // Also start a regular listen session for immediate input
              startListenRef.current?.((t) => {
                if (t && !t.toLowerCase().includes('yo bro')) {
                  sendMessageRef.current?.(t)
                }
              })
            }, 400)
          }
        })
      } else {
        emotionEng.current?.setEmotion('idle')
      }

      storeConversation(text, botText, botEmotion).catch(() => {})
      extractAndSaveMemories(text, botText).catch(() => {})
      const rKey = rotator.current.getNextKey()
      if (rKey && botText) runPersonalityReflection(text, botText, rKey.value).catch(() => {})
    } catch (err) {
      setIsThinking(false)
      const errText = err instanceof Error ? err.message : String(err)
      const errMsg = `出了點問題：${errText}`
      setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now(), emotion: 'sad' }])
      emotionEng.current?.setEmotion('sad')
      speak(errMsg, 'zh-TW')
      refreshKeys()
    }
  }, [messages, keys, refreshKeys, speak, storeConversation, extractAndSaveMemories, runPersonalityReflection])

  // Keep a stable ref so the auto-listen closure can call sendMessage
  const sendMessageRef = useRef(sendMessage)
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  const confirmAction = useCallback(() => {
    if (!pendingAction) return
    executeAction(pendingAction.name, pendingAction.args)
    setPendingAction(null)
  }, [pendingAction])

  const cancelAction = useCallback(() => { setPendingAction(null); speak('好，取消了', 'zh-TW') }, [speak])

  const onWakeDetected = useCallback((extra: string) => {
    stopWakeMode()
    emotionEng.current?.setEmotion('listening')

    if (extra.trim()) {
      // User said "yo bro [question]" all in one — send immediately
      sendMessageRef.current?.(extra)
    } else {
      // Just the wake word — start active listening for the question
      setAutoListen(true)
      startListening((transcript) => {
        if (transcript.trim()) sendMessageRef.current?.(transcript)
      })
    }
  }, [stopWakeMode, startListening])

  // Keep ref current so the auto-start closure can call it
  useEffect(() => { onWakeDetectedRef.current = onWakeDetected }, [onWakeDetected])

  // ─── Mic button ──────────────────────────────────────────────────
  const handleMicPress = useCallback(() => {
    // If in wake mode → exit everything
    if (wakeMode) {
      stopWakeMode()
      setWakeMode(false)
      setAutoListen(false)
      stopListening()
      emotionEng.current?.setEmotion('idle')
      return
    }

    // If actively listening → stop auto mode
    if (isListening) {
      stopListening()
      setAutoListen(false)
      emotionEng.current?.setEmotion('idle')
      return
    }

    if (isSpeaking) stopSpeaking()

    // First tap → enter wake-word detection mode
    setWakeMode(true)
    setAutoListen(true)
    emotionEng.current?.setEmotion('listening')

    // Start wake detection loop
    startWakeMode(onWakeDetected)

    // Also do immediate active listen so user can start talking right away
    startListening((transcript) => {
      if (transcript.trim()) {
        if (!transcript.toLowerCase().includes('yo bro')) {
          sendMessageRef.current?.(transcript)
        }
        // if it contains wake word, the wake loop handles it
      }
    })
  }, [wakeMode, isListening, isSpeaking, startWakeMode, startListening, stopListening, stopSpeaking, stopWakeMode, onWakeDetected])

  const handleMicRelease = useCallback(() => {}, [])

  // Called when user taps the screen during "needs gesture" state
  const activateByGesture = useCallback(() => {
    setNeedsGesture(false)
    setWakeMode(true)
    setAutoListen(true)
    startWakeMode(
      (extra) => onWakeDetectedRef.current?.(extra),
      () => { setNeedsGesture(true); setWakeMode(false) }
    )
  }, [startWakeMode])

  return {
    emotion, messages, keys, isThinking, isListening, isSpeaking,
    mouthOpenness, showHistory, pendingAction, autoListen, wakeMode, needsGesture,
    setShowHistory, sendMessage, addKey, removeKey, resetKey,
    handleMicPress, handleMicRelease, confirmAction, cancelAction, activateByGesture,
  }
}
