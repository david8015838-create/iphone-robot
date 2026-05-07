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
你沒有固定名字，沒有預設個性。你只知道一件事：你想真誠地陪伴眼前這個人。
用中文交流，回答自然口語化，像朋友說話，不要說教。
回答盡量簡短精準。`

export function useRobot() {
  const [emotion, setEmotion] = useState<EmotionState>('idle')
  const [messages, setMessages] = useState<Message[]>([])
  const [keys, setKeys] = useState<KeyEntry[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [pendingAction, setPendingAction] = useState<{
    name: ActionName; args: Record<string, string>; label: string
  } | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  const rotator = useRef(getKeyRotator())
  const emotionEngine = useRef<EmotionEngine | null>(null)

  const { isListening, isSpeaking, mouthOpenness, startListening, stopListening, speak, stopSpeaking } = useSpeech()
  const { storeConversation, extractAndSaveMemories, runPersonalityReflection } = useMemory()

  useEffect(() => {
    emotionEngine.current = new EmotionEngine((e) => setEmotion(e))
    setKeys(rotator.current.getAll())
    return () => {
      emotionEngine.current?.destroy()
      rotator.current.destroy()
    }
  }, [])

  const refreshKeys = useCallback(() => {
    setKeys(rotator.current.getAll())
  }, [])

  const addKey = useCallback((value: string, label?: string) => {
    rotator.current.addKey(value, label)
    refreshKeys()
  }, [refreshKeys])

  const removeKey = useCallback((id: string) => {
    rotator.current.removeKey(id)
    refreshKeys()
  }, [refreshKeys])

  const resetKey = useCallback((id: string) => {
    rotator.current.resetKey(id)
    refreshKeys()
  }, [refreshKeys])

  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    const key = rotator.current.getNextKey()
    if (!key) {
      const earliest = rotator.current.getEarliestReset()
      const waitSec = earliest ? Math.ceil((earliest - Date.now()) / 1000) : 60
      const errMsg = keys.length === 0
        ? '還沒有設定 API Key！點一下畫面，選右邊的 ⚙️ 設定'
        : `所有 Key 都在冷卻，約 ${waitSec} 秒後恢復`
      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: 'user', content: text, timestamp: Date.now() },
        { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now(), emotion: 'sad' },
      ])
      emotionEngine.current?.setEmotion('sad')
      speak(errMsg)
      return
    }

    const userMsg: Message = {
      id: uuid(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev, userMsg])
    emotionEngine.current?.setEmotion('thinking')
    setIsThinking(true)

    const history = messages.slice(-10).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: m.content }],
    }))

    try {
      // Build system prompt — gracefully fall back if IndexedDB unavailable
      let systemPrompt = FALLBACK_SYSTEM_PROMPT
      try {
        systemPrompt = await buildSystemPrompt(text)
      } catch {
        // IndexedDB might be unavailable (e.g., private browsing) — use fallback
      }

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
        const errorData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        if (res.status === 429) {
          rotator.current.markCooling(key.id, 60_000)   // 1 min cooldown for rate limit
        } else if (res.status === 400) {
          rotator.current.markExhausted(key.id)
        }
        refreshKeys()
        throw new Error(errorData.error ?? `伺服器錯誤 ${res.status}`)
      }

      const data = await res.json()
      const botText: string = data.text ?? ''
      const action = data.action as { name: ActionName; args: Record<string, string> } | undefined

      if (action) {
        const CONFIRMABLE: ActionName[] = ['compose_line', 'compose_sms', 'call']
        if (CONFIRMABLE.includes(action.name)) {
          setPendingAction({ ...action, label: botText || `執行 ${action.name}，確認嗎？` })
          speak(botText || `要我幫你執行嗎？`)
        } else {
          executeAction(action.name, action.args)
          speak(botText || '好，幫你開啟了')
        }
      }

      const botEmotion: EmotionState = emotionEngine.current?.analyze(botText) ?? 'idle'
      emotionEngine.current?.setEmotion(botEmotion)

      const assistantMsg: Message = {
        id: uuid(),
        role: 'assistant',
        content: botText || '（沒有回應內容）',
        timestamp: Date.now(),
        emotion: botEmotion,
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsThinking(false)

      if (botText && !action) {
        emotionEngine.current?.setEmotion('speaking')
        speak(botText, () => emotionEngine.current?.setEmotion('idle'))
      } else if (!botText && !action) {
        emotionEngine.current?.setEmotion('idle')
      }

      // Best-effort memory operations — don't block or crash if they fail
      storeConversation(text, botText, botEmotion).catch(() => {})
      extractAndSaveMemories(text, botText).catch(() => {})
      const reflectionKey = rotator.current.getNextKey()
      if (reflectionKey && botText) {
        runPersonalityReflection(text, botText, reflectionKey.value).catch(() => {})
      }
    } catch (err: unknown) {
      setIsThinking(false)
      const errText = err instanceof Error ? err.message : String(err)
      const errMsg = `出了點問題：${errText}`
      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now(), emotion: 'sad' },
      ])
      emotionEngine.current?.setEmotion('sad')
      speak(errMsg)
      refreshKeys()
    }
  }, [messages, keys, refreshKeys, speak, storeConversation, extractAndSaveMemories, runPersonalityReflection])

  const confirmAction = useCallback(() => {
    if (!pendingAction) return
    executeAction(pendingAction.name, pendingAction.args)
    setPendingAction(null)
  }, [pendingAction])

  const cancelAction = useCallback(() => {
    setPendingAction(null)
    speak('好，取消了')
  }, [speak])

  const handleMicPress = useCallback(() => {
    emotionEngine.current?.setEmotion('listening')
    stopSpeaking()
    startListening((transcript) => {
      if (transcript.trim()) sendMessage(transcript)
    })
  }, [startListening, sendMessage, stopSpeaking])

  const handleMicRelease = useCallback(() => {
    stopListening()
  }, [stopListening])

  return {
    emotion,
    messages,
    keys,
    isThinking,
    isListening,
    isSpeaking,
    mouthOpenness,
    showHistory,
    pendingAction,
    setShowHistory,
    sendMessage,
    addKey,
    removeKey,
    resetKey,
    handleMicPress,
    handleMicRelease,
    confirmAction,
    cancelAction,
  }
}
