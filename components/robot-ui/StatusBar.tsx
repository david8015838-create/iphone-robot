'use client'

import { motion } from 'framer-motion'
import type { KeyEntry, EmotionState } from '@/types'

interface StatusBarProps {
  keys: KeyEntry[]
  emotion: EmotionState
  isListening: boolean
  isCameraOn: boolean
  onSettingsClick: () => void
  onCameraToggle: () => void
}

const EMOTION_LABELS: Record<EmotionState, string> = {
  idle: '待機',
  listening: '聆聽中',
  thinking: '思考中',
  speaking: '說話中',
  happy: '開心',
  surprised: '驚訝',
  sad: '難過',
  sleeping: '休眠中',
}

export default function StatusBar({
  keys,
  emotion,
  isListening,
  isCameraOn,
  onSettingsClick,
  onCameraToggle,
}: StatusBarProps) {
  const readyCount = keys.filter((k) => k.status === 'ready').length
  const totalCount = keys.length

  const keyColor =
    readyCount === 0 ? 'bg-red-500' : readyCount === totalCount ? 'bg-green-500' : 'bg-yellow-500'

  return (
    <div className="safe-top flex items-center justify-between px-4 pt-2 pb-2">
      {/* Left: Key status */}
      <button
        onClick={onSettingsClick}
        className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1.5 active:scale-95 transition-transform"
      >
        <span className={`w-2 h-2 rounded-full pulse-dot ${keyColor}`} />
        <span className="text-xs text-[var(--text-dim)]">
          {totalCount === 0 ? '無 API Key' : `${readyCount}/${totalCount} Keys`}
        </span>
      </button>

      {/* Center: Emotion label */}
      <motion.div
        key={emotion}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xs text-[var(--text-dim)] font-medium"
      >
        {EMOTION_LABELS[emotion]}
      </motion.div>

      {/* Right: Camera + mic indicators */}
      <div className="flex items-center gap-3">
        {isListening && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="w-2 h-2 rounded-full bg-red-500"
          />
        )}
        <button
          onClick={onCameraToggle}
          className={`text-lg active:scale-90 transition-transform ${isCameraOn ? 'opacity-100' : 'opacity-30'}`}
          title={isCameraOn ? '關閉鏡頭' : '開啟鏡頭'}
        >
          📷
        </button>
      </div>
    </div>
  )
}
