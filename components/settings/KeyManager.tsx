'use client'

import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import type { KeyEntry } from '@/types'
import { getModelName, setModelName } from '@/lib/model-config'

interface KeyManagerProps {
  keys: KeyEntry[]
  onAdd: (value: string, label?: string) => void
  onRemove: (id: string) => void
  onReset: (id: string) => void
  onClose: () => void
}

const STATUS_COLOR: Record<KeyEntry['status'], string> = {
  ready: '#22c55e',
  cooling: '#f59e0b',
  exhausted: '#ef4444',
}
const STATUS_LABEL: Record<KeyEntry['status'], string> = {
  ready: '可用',
  cooling: '冷卻中',
  exhausted: '已耗盡',
}

export default function KeyManager({ keys, onAdd, onRemove, onReset, onClose }: KeyManagerProps) {
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [modelInput, setModelInput] = useState('')

  useEffect(() => {
    setModelInput(getModelName())
  }, [])

  const handleModelSave = () => {
    if (modelInput.trim()) setModelName(modelInput.trim())
  }

  const handleAdd = () => {
    const trimmed = newKey.trim()
    if (!trimmed) return
    onAdd(trimmed, newLabel.trim() || undefined)
    setNewKey('')
    setNewLabel('')
  }

  return (
    // Outer: fills screen, backdrop click closes
    <div
      className="fixed inset-0 z-50"
      style={{ display: 'flex', alignItems: 'flex-end' }}
    >
      {/* Backdrop — pointer-events auto so taps on it close the sheet */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* Sheet — sits on top of backdrop via z-index */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          borderRadius: '24px 24px 0 0',
          background: '#161616',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          maxHeight: '85dvh',
          overflowY: 'auto',
          paddingBottom: 'env(safe-area-inset-bottom, 20px)',
        }}
        // Stop any tap on the sheet from bubbling to the backdrop
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 8 }}>
          <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.15)' }} />
        </div>

        <div style={{ padding: '0 20px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, color: '#fff', margin: 0 }}>API Key 管理</h2>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: 999,
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.5)',
                fontSize: 16,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >✕</button>
          </div>

          {/* ── New key form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="標籤（可選，如 Key 1）"
              style={inputStyle}
            />

            <div style={{ position: 'relative' }}>
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Gemini API Key（AIza...）"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...inputStyle, fontFamily: 'monospace', paddingRight: 48 }}
              />
              <button
                onClick={() => setShowKey((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 15,
                  cursor: 'pointer',
                  touchAction: 'manipulation',
                  padding: '4px 6px',
                }}
              >{showKey ? '🙈' : '👁'}</button>
            </div>

            <button
              onClick={handleAdd}
              disabled={!newKey.trim()}
              style={{
                ...btnStyle,
                background: newKey.trim() ? '#7c3aed' : 'rgba(124,58,237,0.3)',
                color: newKey.trim() ? '#fff' : 'rgba(255,255,255,0.35)',
              }}
            >
              新增 Key
            </button>
          </div>

          {/* ── Key list ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {keys.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '12px 0' }}>
                還沒有 API Key，請在上方新增
              </p>
            ) : (
              keys.map((key) => {
                const remaining = key.resetAt ? Math.max(0, Math.ceil((key.resetAt - Date.now()) / 1000)) : null
                return (
                  <div
                    key={key.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 14,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 9999,
                        flexShrink: 0,
                        background: STATUS_COLOR[key.status],
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: '#fff', fontSize: 14, fontWeight: 500, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {key.label}
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '2px 0 0' }}>
                        {STATUS_LABEL[key.status]}
                        {remaining ? ` · ${remaining}s` : ''}
                        {key.errorCount > 0 ? ` · 錯誤 ${key.errorCount}次` : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {key.status !== 'ready' && (
                        <button
                          onClick={() => onReset(key.id)}
                          style={{ ...smallBtn, color: '#a78bfa' }}
                        >重置</button>
                      )}
                      <button
                        onClick={() => onRemove(key.id)}
                        style={{ ...smallBtn, color: '#f87171' }}
                      >刪除</button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* ── Model name ── */}
          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 10, fontWeight: 500 }}>
              模型名稱
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                placeholder="gemini-2.5-flash-preview-05-20"
                style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              />
              <button
                onClick={handleModelSave}
                style={{ ...btnStyle, width: 'auto', padding: '0 14px', background: '#374151', color: '#d1d5db', fontSize: 13 }}
              >
                儲存
              </button>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
              在 aistudio.google.com 「Get API code」可以看到確切的模型 ID
            </p>
          </div>

          <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, marginTop: 16, lineHeight: 1.6 }}>
            Key 儲存在本機，不會上傳任何伺服器。建議輸入多組確保 24/7 不間斷。
          </p>
        </div>
      </motion.div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '13px 14px',
  fontSize: 14,
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
  WebkitAppearance: 'none',
}

const btnStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 12,
  padding: '14px',
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
  touchAction: 'manipulation',
}

const smallBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: 13,
  cursor: 'pointer',
  touchAction: 'manipulation',
  padding: '4px 6px',
}
