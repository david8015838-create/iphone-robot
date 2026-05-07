'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import RobotFace from '@/components/robot-face'
import KeyManager from '@/components/settings/KeyManager'
import { useRobot } from '@/hooks/useRobot'
import { useCamera } from '@/hooks/useCamera'

export default function RobotUI() {
  const {
    emotion,
    messages,
    keys,
    isThinking,
    isListening,
    isSpeaking,
    mouthOpenness,
    pendingAction,
    showHistory,
    setShowHistory,
    sendMessage,
    addKey,
    removeKey,
    resetKey,
    handleMicPress,
    handleMicRelease,
    confirmAction,
    cancelAction,
  } = useRobot()

  const { videoRef, isCameraOn, toggleCamera, captureFrame } = useCamera()

  const [isMenuOpen,    setIsMenuOpen]    = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [inputText,     setInputText]     = useState('')

  const emotionForSpeech = isSpeaking ? 'speaking' : isListening ? 'listening' : emotion
  const lastMsg          = messages[messages.length - 1]
  const readyCount       = keys.filter((k) => k.status === 'ready').length
  const noKeys           = keys.length === 0

  const handleFaceTap = useCallback(() => {
    setIsMenuOpen((v) => !v)
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    setShowTextInput(false)
    setIsMenuOpen(false)
    const frame = isCameraOn ? (captureFrame() ?? undefined) : undefined
    await sendMessage(text, frame)
  }, [inputText, isCameraOn, captureFrame, sendMessage])

  const handleMicTap = useCallback(() => {
    setIsMenuOpen(false)
    isListening ? handleMicRelease() : handleMicPress()
  }, [isListening, handleMicPress, handleMicRelease])

  return (
    <div
      className="relative w-full bg-[#0a0a0a] overflow-hidden"
      style={{ height: '100dvh' }}
    >
      {/* ══════════════════════════════════════
          FULL-SCREEN FACE (tap to open menu)
      ══════════════════════════════════════ */}
      <div
        className="w-full h-full"
        onClick={handleFaceTap}
        style={{ cursor: 'pointer', touchAction: 'manipulation' }}
      >
        <RobotFace
          emotion={emotionForSpeech}
          mouthOpenness={mouthOpenness}
        />
      </div>

      {/* ══════════════════════════
          STATUS INDICATORS
      ══════════════════════════ */}

      {/* Key status — top-left */}
      <div className="absolute top-3 left-4 z-10 flex items-center gap-2 pointer-events-none">
        <span
          className={`w-2.5 h-2.5 rounded-full pulse-dot ${
            noKeys || readyCount === 0 ? 'bg-red-500' : 'bg-green-500'
          }`}
        />
        {noKeys && (
          <span className="text-xs text-red-400 font-medium">需要 API Key</span>
        )}
      </div>

      {/* Listening — top-right */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-3 right-4 z-10 flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/40 px-3 py-1 pointer-events-none"
          >
            <motion.div
              animate={{ scale: [1, 1.4, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="w-2 h-2 rounded-full bg-red-400"
            />
            <span className="text-xs text-red-300">聆聽中</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera preview — top-right (below listening) */}
      <AnimatePresence>
        {isCameraOn && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-10 right-4 z-10 rounded-xl overflow-hidden"
            style={{ width: 80, height: 106, border: '1.5px solid rgba(255,255,255,0.1)' }}
          >
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 pulse-dot" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last message bubble — bottom of screen (above menu) */}
      <AnimatePresence>
        {(lastMsg || isThinking) && !isMenuOpen && (
          <motion.div
            key={lastMsg?.id ?? 'thinking'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute bottom-6 left-0 right-0 px-6 pointer-events-none z-10"
          >
            <div className="max-w-md mx-auto rounded-2xl bg-black/60 backdrop-blur border border-white/10 px-4 py-3">
              {isThinking ? (
                <div className="flex gap-2 justify-center">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="thinking-dot w-2 h-2 rounded-full bg-white/40"
                      style={{ animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-white/85 leading-5">{lastMsg!.content}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════
          POP-UP MENU (tap face to toggle)
      ══════════════════════════════════ */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20"
              onClick={() => setIsMenuOpen(false)}
            />

            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 z-30 rounded-t-3xl bg-[#121212] border-t border-white/8"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-white/15" />
              </div>

              {/* Inline text input */}
              <AnimatePresence>
                {showTextInput && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden px-4 pt-2"
                  >
                    <div className="flex gap-2 pb-3">
                      <input
                        autoFocus
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="說點什麼..."
                        className="flex-1 rounded-xl bg-[#1e1e1e] border border-white/10 px-4 py-3 text-sm text-white outline-none focus:border-[#7c3aed]"
                      />
                      <button
                        onClick={handleSend}
                        disabled={!inputText.trim()}
                        className="rounded-xl bg-[#7c3aed] px-5 text-sm font-semibold text-white disabled:opacity-35"
                        style={{ touchAction: 'manipulation' }}
                      >
                        送出
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action grid */}
              <div className="grid grid-cols-5 gap-2 px-4 py-3">
                {/* 🎤 Mic */}
                <MenuBtn
                  icon={isListening ? '🔴' : '🎤'}
                  label={isListening ? '停止' : '說話'}
                  active={isListening}
                  activeColor="red"
                  onClick={handleMicTap}
                />
                {/* ⌨️ Text */}
                <MenuBtn
                  icon="⌨️"
                  label="文字"
                  active={showTextInput}
                  activeColor="purple"
                  onClick={() => setShowTextInput((v) => !v)}
                />
                {/* 📷 Camera */}
                <MenuBtn
                  icon="📷"
                  label={isCameraOn ? '關鏡頭' : '看看'}
                  active={isCameraOn}
                  activeColor="blue"
                  onClick={toggleCamera}
                />
                {/* 💬 History */}
                <MenuBtn
                  icon="💬"
                  label="記錄"
                  onClick={() => { setShowHistory(true); setIsMenuOpen(false) }}
                />
                {/* ⚙️ API Keys */}
                <MenuBtn
                  icon={noKeys ? '🔑' : '⚙️'}
                  label={noKeys ? '設定Key' : '設定'}
                  active={noKeys}
                  activeColor="red"
                  onClick={() => { setIsSettingsOpen(true); setIsMenuOpen(false) }}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          HISTORY DRAWER
      ══════════════════════ */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute inset-0 z-40 flex flex-col bg-[#0a0a0a]"
          >
            <div
              className="flex items-center justify-between px-5 pb-3 border-b border-white/8"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
            >
              <h2 className="text-base font-semibold text-white">對話記錄</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="w-10 h-10 flex items-center justify-center text-white/50 text-xl rounded-full bg-white/5"
                style={{ touchAction: 'manipulation' }}
              >✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
              {messages.length === 0
                ? <p className="text-center text-sm text-white/30 mt-10">還沒有對話記錄</p>
                : messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-2xl px-4 py-3 text-sm max-w-[85%] ${
                      msg.role === 'user'
                        ? 'self-end bg-[#7c3aed] text-white'
                        : 'self-start bg-[#1e1e1e] text-white/85'
                    }`}
                  >{msg.content}</div>
                ))
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          ACTION CONFIRM
      ══════════════════════ */}
      <AnimatePresence>
        {pendingAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="w-full rounded-t-3xl bg-[#141414] px-6"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
            >
              <div className="flex justify-center pt-3 pb-4">
                <div className="w-9 h-1 rounded-full bg-white/15" />
              </div>
              <p className="text-base font-semibold text-white mb-1.5">確認操作</p>
              <p className="text-sm text-white/50 mb-6">{pendingAction.label}</p>
              <div className="flex gap-3">
                <button
                  onClick={cancelAction}
                  className="flex-1 rounded-xl bg-[#1e1e1e] py-3.5 text-sm font-medium text-white/50"
                  style={{ touchAction: 'manipulation' }}
                >取消</button>
                <button
                  onClick={confirmAction}
                  className="flex-1 rounded-xl bg-[#7c3aed] py-3.5 text-sm font-medium text-white"
                  style={{ touchAction: 'manipulation' }}
                >確認執行</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════
          KEY MANAGER
      ══════════════════════ */}
      <AnimatePresence>
        {isSettingsOpen && (
          <KeyManager
            keys={keys}
            onAdd={addKey}
            onRemove={removeKey}
            onReset={resetKey}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Small helper component ──────────────────────
function MenuBtn({
  icon, label, active = false, activeColor = 'purple', onClick,
}: {
  icon: string
  label: string
  active?: boolean
  activeColor?: 'purple' | 'red' | 'blue'
  onClick: () => void
}) {
  const colors = {
    purple: 'bg-[#7c3aed]/20 border-[#7c3aed]/50',
    red:    'bg-red-500/20 border-red-500/50',
    blue:   'bg-blue-500/20 border-blue-500/50',
  }
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors border ${
        active ? colors[activeColor] : 'bg-[#1e1e1e] border-white/5'
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      <span className="text-xl leading-none">{icon}</span>
      <span className="text-[10px] text-white/45 leading-none">{label}</span>
    </button>
  )
}
