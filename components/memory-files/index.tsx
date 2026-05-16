'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAllDocs, getDoc, writeDoc, deleteDoc } from '@/lib/memory/docs'
import type { MemoryDoc } from '@/lib/memory/db'

interface Props {
  onClose: () => void
}

const CATEGORY_LABEL: Record<MemoryDoc['category'], string> = {
  core:       '核心',
  about_you:  '關於你',
  between_us: '我們之間',
  journal:    '日誌',
  weekly:     '每週',
}

const CATEGORY_ICON: Record<MemoryDoc['category'], string> = {
  core:       '🧠',
  about_you:  '👤',
  between_us: '🤝',
  journal:    '📔',
  weekly:     '📅',
}

export default function MemoryFiles({ onClose }: Props) {
  const [docs,       setDocs]       = useState<MemoryDoc[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [activeDoc,  setActiveDoc]  = useState<MemoryDoc | null>(null)
  const [editing,    setEditing]    = useState(false)
  const [draft,      setDraft]      = useState('')
  const [loading,    setLoading]    = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const list = await getAllDocs()
    setDocs(list)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    if (!activePath) { setActiveDoc(null); return }
    getDoc(activePath).then((d) => {
      setActiveDoc(d ?? null)
      setDraft(d?.content ?? '')
      setEditing(false)
    })
  }, [activePath])

  const handleSave = async () => {
    if (!activeDoc) return
    await writeDoc(activeDoc.path, draft, activeDoc.title, activeDoc.category)
    setActiveDoc({ ...activeDoc, content: draft, updated_at: Date.now() })
    setEditing(false)
    refresh()
  }

  const handleDelete = async () => {
    if (!activeDoc) return
    if (!confirm(`刪除 ${activeDoc.path}？`)) return
    await deleteDoc(activeDoc.path)
    setActivePath(null)
    refresh()
  }

  // Group docs by category
  const grouped: Record<string, MemoryDoc[]> = {}
  for (const d of docs) {
    if (!grouped[d.category]) grouped[d.category] = []
    grouped[d.category].push(d)
  }

  return (
    <motion.div
      initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      className="absolute inset-0 z-50 flex flex-col bg-[#0a0a0a]"
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pb-3 border-b border-white/8"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)' }}
      >
        <div className="flex items-center gap-3">
          {activeDoc && (
            <button
              onClick={() => setActivePath(null)}
              className="text-white/60 text-xl w-8 h-8 flex items-center justify-center"
              style={{ touchAction: 'manipulation' }}
            >‹</button>
          )}
          <h2 className="text-base font-semibold text-white">
            {activeDoc ? activeDoc.title : '我的記憶'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center text-white/50 text-lg rounded-full bg-white/5"
          style={{ touchAction: 'manipulation' }}
        >✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {!activeDoc ? (
            <motion.div
              key="list"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-4 py-4"
            >
              {loading ? (
                <p className="text-center text-white/30 text-sm mt-10">載入中...</p>
              ) : docs.length === 0 ? (
                <p className="text-center text-white/30 text-sm mt-10">還沒有任何記憶檔</p>
              ) : (
                <div className="flex flex-col gap-5">
                  {(['core', 'about_you', 'between_us', 'journal', 'weekly'] as const).map((cat) => {
                    const list = grouped[cat]
                    if (!list || list.length === 0) return null
                    return (
                      <div key={cat}>
                        <h3 className="text-xs text-white/30 uppercase tracking-wider mb-2 px-1">
                          {CATEGORY_ICON[cat]} {CATEGORY_LABEL[cat]}
                        </h3>
                        <div className="flex flex-col gap-1.5">
                          {list.map((d) => (
                            <button
                              key={d.path}
                              onClick={() => setActivePath(d.path)}
                              className="flex items-center justify-between px-4 py-3 rounded-xl bg-[#141414] border border-white/5 text-left active:bg-[#1e1e1e]"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">{d.title}</p>
                                <p className="text-[11px] text-white/30 truncate">{d.path}</p>
                              </div>
                              <span className="text-white/30 text-lg">›</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          ) : editing ? (
            <motion.div
              key="edit"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col h-full"
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="flex-1 bg-[#0a0a0a] text-white/90 text-sm p-5 outline-none resize-none font-mono leading-6"
                style={{ minHeight: '60vh' }}
              />
              <div className="flex gap-2 p-4 border-t border-white/8">
                <button
                  onClick={() => { setDraft(activeDoc.content); setEditing(false) }}
                  className="flex-1 rounded-xl bg-[#1e1e1e] py-3 text-sm text-white/50"
                  style={{ touchAction: 'manipulation' }}
                >取消</button>
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-xl bg-[#7c3aed] py-3 text-sm font-medium text-white"
                  style={{ touchAction: 'manipulation' }}
                >儲存</button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="view"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="px-5 py-5"
            >
              <pre className="text-[13px] text-white/85 leading-6 whitespace-pre-wrap font-sans">
                {activeDoc.content}
              </pre>
              <p className="mt-6 text-xs text-white/25">
                最後更新：{new Date(activeDoc.updated_at).toLocaleString('zh-TW')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom actions when viewing a doc */}
      {activeDoc && !editing && (
        <div
          className="flex gap-2 p-4 border-t border-white/8"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <button
            onClick={handleDelete}
            className="rounded-xl bg-[#1e1e1e] px-4 py-3 text-sm text-red-400/70"
            style={{ touchAction: 'manipulation' }}
          >刪除</button>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 rounded-xl bg-[#7c3aed] py-3 text-sm font-medium text-white"
            style={{ touchAction: 'manipulation' }}
          >編輯</button>
        </div>
      )}
    </motion.div>
  )
}
