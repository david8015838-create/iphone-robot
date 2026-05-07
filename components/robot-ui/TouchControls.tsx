'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'

interface TouchControlsProps {
  isListening: boolean
  isSpeaking: boolean
  onMicPress: () => void
  onMicRelease: () => void
  onTextSend: (text: string) => void
  onHistoryToggle: () => void
}

export default function TouchControls({
  isListening,
  isSpeaking,
  onMicPress,
  onMicRelease,
  onTextSend,
  onHistoryToggle,
}: TouchControlsProps) {
  const [showInput, setShowInput] = useState(false)
  const [inputText, setInputText] = useState('')

  const handleSend = () => {
    const text = inputText.trim()
    if (!text) return
    onTextSend(text)
    setInputText('')
    setShowInput(false)
  }

  return (
    <div className="safe-bottom pb-4 px-6 flex flex-col gap-3">
      {/* Text input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ opacity: 0, y: 10, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 10, height: 0 }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="輸入訊息..."
              className="flex-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text)] outline-none focus:border-[var(--accent)] transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40 active:scale-95 transition-transform"
            >
              發送
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main controls row */}
      <div className="flex items-center justify-between">
        {/* History button */}
        <button
          onClick={onHistoryToggle}
          className="w-11 h-11 rounded-full bg-[var(--surface)] flex items-center justify-center text-lg active:scale-90 transition-transform"
        >
          💬
        </button>

        {/* Mic button — tap to toggle, hold not required */}
        <motion.button
          onClick={isListening ? onMicRelease : onMicPress}
          onTouchStart={(e) => { e.preventDefault(); isListening ? onMicRelease() : onMicPress() }}
          animate={{
            scale: isListening ? 1.15 : 1,
            backgroundColor: isListening ? '#ef4444' : isSpeaking ? '#7c3aed' : '#1e1e1e',
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-lg"
          style={{ border: '2px solid var(--border)', touchAction: 'manipulation' }}
        >
          {isListening ? '🔴' : isSpeaking ? '🔊' : '🎤'}
        </motion.button>

        {/* Keyboard toggle */}
        <button
          onClick={() => setShowInput((v) => !v)}
          className={`w-11 h-11 rounded-full flex items-center justify-center text-lg active:scale-90 transition-all ${showInput ? 'bg-[var(--accent)]' : 'bg-[var(--surface)]'}`}
        >
          ⌨️
        </button>
      </div>
    </div>
  )
}
