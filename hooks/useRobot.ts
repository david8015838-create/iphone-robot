'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyEntry } from '@/types'
import { getKeyRotator } from '@/lib/key-rotator'
import { uuid } from '@/lib/uuid'
import { getModelName } from '@/lib/model-config'
import { executeAction, type ActionName } from '@/lib/phone-actions'
import { useSpeech } from './useSpeech'

import {
  getInnerState, updateInnerState, markUserInteraction,
  incrementSession, moodToFaceEmotion,
} from '@/lib/agent/inner-state'
import type { InnerState } from '@/lib/agent/types'
import { AgentLoop } from '@/lib/agent/loop'
import { ContinuousListener } from '@/lib/speech/continuous'
import { buildConversationPrompt } from '@/lib/memory/context'
import { logEvent } from '@/lib/memory/store'
import { ensureSeedDocs } from '@/lib/memory/docs'
import { runConsolidation, shouldRunConsolidation } from '@/lib/memory/consolidate'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

function detectLang(text: string): string {
  const cjk = (text.match(/[一-鿿぀-ヿ]/g) ?? []).length
  const total = text.replace(/\s/g, '').length
  if (total === 0) return 'zh-TW'
  return cjk / total > 0.2 ? 'zh-TW' : 'en-US'
}

export function useRobot() {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [keys,          setKeys]          = useState<KeyEntry[]>([])
  const [isThinking,    setIsThinking]    = useState(false)
  const [needsGesture,  setNeedsGesture]  = useState(false)
  const [innerState,    setInnerState]    = useState<InnerState>(() => getInnerState())
  const [pendingAction, setPendingAction] = useState<{ name: ActionName; args: Record<string, string>; label: string } | null>(null)
  const [showHistory,   setShowHistory]   = useState(false)
  const [ambientCount,  setAmbientCount]  = useState(0)

  const rotator     = useRef(getKeyRotator())
  const agentLoop   = useRef<AgentLoop | null>(null)
  const listener    = useRef<ContinuousListener | null>(null)
  const busyRef     = useRef({ current: false })   // shared with AgentLoop
  const lastBotAt   = useRef(0)
  const activeUntil = useRef(0)                    // active conversation ends after this

  const { isSpeaking, mouthOpenness, speak, stopSpeaking } = useSpeech()

  // ─── Mount: bootstrap session + consolidation + agent loop ──────
  useEffect(() => {
    setKeys(rotator.current.getAll())
    incrementSession()
    setInnerState(getInnerState())

    // Seed core memory docs (idempotent)
    ensureSeedDocs().catch(() => {})

    // Run memory consolidation in background if it's been a while
    if (shouldRunConsolidation()) {
      setTimeout(() => {
        runConsolidation().catch(() => {})
      }, 5_000)
    }

    // Start agent loop (proactive thinking)
    agentLoop.current = new AgentLoop()
    agentLoop.current.start({
      onSpeak: (text) => {
        // Proactive speech
        if (!text.trim()) return
        const lang = detectLang(text)
        const msg: Message = { id: uuid(), role: 'assistant', content: text, timestamp: Date.now() }
        setMessages((prev) => [...prev, msg])
        lastBotAt.current = Date.now()
        speak(text, lang)
        logEvent({ timestamp: Date.now(), type: 'bot_speech', content: text }).catch(() => {})
      },
      onStateChange: () => setInnerState(getInnerState()),
      busyRef: busyRef.current,
    })

    // Start continuous listener — pauses during thinking + speaking
    // to avoid competing for iOS audio session
    listener.current = new ContinuousListener()
    listener.current.start({
      onSpeech: (text) => handleSpeechRef.current(text),
      onAmbient: (t) => {
        setAmbientCount((c) => c + 1)
        logEvent({ timestamp: Date.now(), type: 'ambient', content: t }).catch(() => {})
      },
      onNeedsGesture: () => setNeedsGesture(true),
      // Pause listener while thinking OR speaking — iOS won't let mic + speaker share session
      isBotSpeaking: () => isSpeakingRef.current || busyRef.current.current,
      isBotRecent: () => Date.now() - lastBotAt.current < 30_000,
      isActive: () => Date.now() < activeUntil.current,
    })

    return () => {
      agentLoop.current?.stop()
      listener.current?.stop()
      rotator.current.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Mirror isSpeaking in a ref for the listener
  const isSpeakingRef = useRef(false)
  useEffect(() => { isSpeakingRef.current = isSpeaking }, [isSpeaking])

  // ─── Key management ──────────────────────────────────────────────
  const refreshKeys = useCallback(() => setKeys(rotator.current.getAll()), [])
  const addKey      = useCallback((v: string, l?: string) => { rotator.current.addKey(v, l); refreshKeys() }, [refreshKeys])
  const removeKey   = useCallback((id: string) => { rotator.current.removeKey(id); refreshKeys() }, [refreshKeys])
  const resetKey    = useCallback((id: string) => { rotator.current.resetKey(id); refreshKeys() }, [refreshKeys])

  // ─── Conversation flow ───────────────────────────────────────────
  const sendMessage = useCallback(async (text: string, imageBase64?: string) => {
    const lang = detectLang(text)
    const key = rotator.current.getNextKey()
    busyRef.current.current = true
    activeUntil.current = Date.now() + 60_000

    if (!key) {
      const earliest = rotator.current.getEarliestReset()
      const waitSec = earliest ? Math.ceil((earliest - Date.now()) / 1000) : 60
      const errMsg = keys.length === 0
        ? '還沒有設定 API Key 噢'
        : `Key 都在冷卻，等 ${waitSec} 秒`
      setMessages((prev) => [
        ...prev,
        { id: uuid(), role: 'user',      content: text,   timestamp: Date.now() },
        { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now() },
      ])
      speak(errMsg, lang)
      busyRef.current.current = false
      return
    }

    const userMsg: Message = { id: uuid(), role: 'user', content: text, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    markUserInteraction()
    setIsThinking(true)
    logEvent({ timestamp: Date.now(), type: 'user_speech', content: text }).catch(() => {})

    // Build history of recent exchanges
    const history = messages.slice(-10).map((m) => ({
      role: (m.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      parts: [{ text: m.content }],
    }))

    try {
      const systemPrompt = await buildConversationPrompt()

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

      const assistantMsg: Message = {
        id: uuid(), role: 'assistant',
        content: botText || '(無回應)',
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setIsThinking(false)
      lastBotAt.current = Date.now()
      activeUntil.current = Date.now() + 90_000

      logEvent({ timestamp: Date.now(), type: 'bot_speech', content: botText }).catch(() => {})

      if (action) {
        const CONFIRM: ActionName[] = ['compose_line', 'compose_sms', 'call']
        if (CONFIRM.includes(action.name)) {
          setPendingAction({ ...action, label: botText || `執行 ${action.name}？` })
          speak(botText || '要我幫你執行嗎？', botLang)
        } else {
          executeAction(action.name, action.args)
          speak(botText || '好，幫你開了', botLang)
        }
      } else if (botText) {
        speak(botText, botLang)
      }
    } catch (err) {
      setIsThinking(false)
      const errText = err instanceof Error ? err.message : String(err)
      const errMsg = `出了點問題：${errText}`
      setMessages((prev) => [...prev, { id: uuid(), role: 'assistant', content: errMsg, timestamp: Date.now() }])
      speak(errMsg, 'zh-TW')
      refreshKeys()
    } finally {
      busyRef.current.current = false
    }
  }, [messages, keys, refreshKeys, speak])

  // Stable ref so listener can call latest sendMessage
  const sendMessageRef = useRef(sendMessage)
  useEffect(() => { sendMessageRef.current = sendMessage }, [sendMessage])

  const handleSpeechRef = useRef((text: string) => {
    sendMessageRef.current(text)
  })

  // ─── Activation gesture (one-time) ───────────────────────────────
  const activateByGesture = useCallback(() => {
    setNeedsGesture(false)
    listener.current?.start({
      onSpeech: (text) => handleSpeechRef.current(text),
      onAmbient: (t) => {
        setAmbientCount((c) => c + 1)
        logEvent({ timestamp: Date.now(), type: 'ambient', content: t }).catch(() => {})
      },
      onNeedsGesture: () => setNeedsGesture(true),
      isBotSpeaking: () => isSpeakingRef.current || busyRef.current.current,
      isBotRecent: () => Date.now() - lastBotAt.current < 30_000,
      isActive: () => Date.now() < activeUntil.current,
    })
  }, [])

  // ─── Action confirm ──────────────────────────────────────────────
  const confirmAction = useCallback(() => {
    if (!pendingAction) return
    executeAction(pendingAction.name, pendingAction.args)
    setPendingAction(null)
  }, [pendingAction])

  const cancelAction = useCallback(() => {
    setPendingAction(null)
    speak('好，取消', 'zh-TW')
  }, [speak])

  // ─── Derived face emotion from inner state ──────────────────────
  const faceEmotion = isSpeaking
    ? 'speaking'
    : isThinking
    ? 'thinking'
    : moodToFaceEmotion(innerState.mood)

  return {
    // state
    emotion: faceEmotion as 'idle' | 'happy' | 'sad' | 'thinking' | 'speaking' | 'sleeping' | 'surprised' | 'listening',
    messages, keys, isThinking, isSpeaking,
    mouthOpenness, needsGesture, innerState, ambientCount,
    pendingAction, showHistory,
    // setters
    setShowHistory,
    // actions
    sendMessage, addKey, removeKey, resetKey,
    activateByGesture, confirmAction, cancelAction,
    stopSpeaking,
  }
}
