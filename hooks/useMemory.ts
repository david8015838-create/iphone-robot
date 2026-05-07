'use client'

import { useCallback } from 'react'
import {
  saveConversation,
  saveMemory,
  setUserProfile,
  savePersonalityTrait,
  decayTraits,
} from '@/lib/memory/store'
import { buildReflectionPrompt } from '@/lib/memory/retriever'
import type { EmotionState } from '@/types'

export function useMemory() {
  const storeConversation = useCallback(
    async (userMsg: string, botMsg: string, emotion: EmotionState) => {
      const tags = extractTags(userMsg + ' ' + botMsg)
      await saveConversation({
        userMsg,
        botMsg,
        emotion,
        tags,
        timestamp: Date.now(),
      })
    },
    []
  )

  const extractAndSaveMemories = useCallback(async (userMsg: string, botMsg: string) => {
    const nameMatch = userMsg.match(/我(叫|是|的名字是)\s*([^\s，。！？]{1,8})/)
    if (nameMatch) {
      await setUserProfile('name', nameMatch[2])
    }

    const combined = userMsg + ' ' + botMsg
    const keywords = [
      { pattern: /喜歡([^，。！？\s]{2,10})/, category: 'preferences' as const },
      { pattern: /不喜歡([^，。！？\s]{2,10})/, category: 'preferences' as const },
      { pattern: /工作是([^，。！？\s]{2,10})/, category: 'user_profile' as const },
      { pattern: /住在([^，。！？\s]{2,10})/, category: 'life' as const },
    ]

    for (const { pattern, category } of keywords) {
      const match = combined.match(pattern)
      if (match) {
        await saveMemory({
          category,
          key: match[0],
          value: match[1],
          importance: 3,
          lastAccessed: Date.now(),
          createdAt: Date.now(),
        })
      }
    }
  }, [])

  const runPersonalityReflection = useCallback(
    async (userMsg: string, botMsg: string, apiKey: string) => {
      try {
        const prompt = await buildReflectionPrompt(userMsg, botMsg)
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: prompt,
            apiKey,
            history: [],
            systemPrompt: '你是一個在自我反思的AI，只輸出JSON，不要說其他話。',
            stream: false,
          }),
        })
        if (!res.ok) return
        const data = await res.json()
        const text = data.text ?? ''
        const jsonMatch = text.match(/\{[^}]+\}/)
        if (!jsonMatch) return
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.traitType && parsed.description) {
          await savePersonalityTrait({
            traitType: parsed.traitType,
            description: parsed.description,
            formedAt: Date.now(),
            strength: 3,
            deprecated: false,
          })
        }
      } catch {
        // Reflection is best-effort, silently skip errors
      }
    },
    []
  )

  const runDecay = useCallback(async () => {
    await decayTraits()
  }, [])

  return { storeConversation, extractAndSaveMemories, runPersonalityReflection, runDecay }
}

function extractTags(text: string): string[] {
  const tags: string[] = []
  if (/音樂|歌曲|播放/.test(text)) tags.push('music')
  if (/工作|程式|技術|code/.test(text)) tags.push('tech')
  if (/累|難過|開心|情緒/.test(text)) tags.push('emotion')
  if (/食物|吃|餐/.test(text)) tags.push('food')
  if (/天氣|新聞|最新/.test(text)) tags.push('info')
  return tags
}
