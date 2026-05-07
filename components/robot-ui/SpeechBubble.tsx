'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { Message } from '@/types'

interface SpeechBubbleProps {
  messages: Message[]
  isThinking: boolean
}

export default function SpeechBubble({ messages, isThinking }: SpeechBubbleProps) {
  const lastMsg = messages[messages.length - 1]

  return (
    <div className="w-full px-6 max-w-sm mx-auto">
      <AnimatePresence mode="wait">
        {isThinking ? (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex justify-center gap-2 py-4"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="thinking-dot w-2 h-2 rounded-full bg-[var(--text-dim)]"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </motion.div>
        ) : lastMsg ? (
          <motion.div
            key={lastMsg.id}
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="rounded-2xl p-4 text-sm leading-relaxed"
            style={{
              background: lastMsg.role === 'assistant' ? 'var(--surface)' : 'var(--surface2)',
              color: 'var(--text)',
              borderBottom: lastMsg.role === 'assistant' ? '1px solid var(--border)' : undefined,
            }}
          >
            <p className="text-[15px] leading-6">{lastMsg.content}</p>
            <p className="mt-1.5 text-[11px] text-[var(--text-dim)]">
              {lastMsg.role === 'user' ? '你' : 'AI'} ·{' '}
              {new Date(lastMsg.timestamp).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center text-sm text-[var(--text-dim)] py-4"
          >
            點擊麥克風或輸入文字開始
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
