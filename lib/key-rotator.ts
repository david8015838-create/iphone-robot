import type { KeyEntry } from '@/types'
import { uuid } from './uuid'

const STORAGE_KEY = 'robot_api_keys'
const RESTORE_INTERVAL_MS = 30_000

export class KeyRotator {
  private pool: KeyEntry[] = []
  private currentIndex = 0
  private restoreTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.load()
    this.startRestoreLoop()
  }

  private load() {
    if (typeof window === 'undefined') return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      this.pool = raw ? JSON.parse(raw) : []
    } catch {
      this.pool = []
    }
  }

  private save() {
    if (typeof window === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.pool))
  }

  private startRestoreLoop() {
    if (typeof window === 'undefined') return
    this.restoreTimer = setInterval(() => {
      this.restoreCooledKeys()
    }, RESTORE_INTERVAL_MS)
  }

  destroy() {
    if (this.restoreTimer) clearInterval(this.restoreTimer)
  }

  restoreCooledKeys() {
    const now = Date.now()
    let changed = false
    this.pool = this.pool.map((key) => {
      if (key.status === 'cooling' && key.resetAt !== null && now >= key.resetAt) {
        changed = true
        return { ...key, status: 'ready', resetAt: null }
      }
      return key
    })
    if (changed) this.save()
  }

  getNextKey(): KeyEntry | null {
    this.restoreCooledKeys()
    const ready = this.pool.filter((k) => k.status === 'ready')
    if (ready.length === 0) return null

    const key = ready[this.currentIndex % ready.length]
    this.currentIndex = (this.currentIndex + 1) % ready.length
    return key
  }

  markCooling(id: string, cooldownMs = 60_000) {
    this.pool = this.pool.map((k) =>
      k.id === id
        ? { ...k, status: 'cooling', resetAt: Date.now() + cooldownMs, errorCount: k.errorCount + 1 }
        : k
    )
    this.save()
  }

  markExhausted(id: string) {
    this.pool = this.pool.map((k) =>
      k.id === id ? { ...k, status: 'exhausted', errorCount: k.errorCount + 1 } : k
    )
    this.save()
  }

  addKey(value: string, label?: string): KeyEntry {
    const entry: KeyEntry = {
      id: uuid(),
      value: value.trim(),
      label: label ?? `Key ${this.pool.length + 1}`,
      status: 'ready',
      resetAt: null,
      errorCount: 0,
      lastUsed: 0,
    }
    this.pool = [...this.pool, entry]
    this.save()
    return entry
  }

  removeKey(id: string) {
    this.pool = this.pool.filter((k) => k.id !== id)
    this.save()
  }

  resetKey(id: string) {
    this.pool = this.pool.map((k) =>
      k.id === id ? { ...k, status: 'ready', resetAt: null, errorCount: 0 } : k
    )
    this.save()
  }

  getAll(): KeyEntry[] {
    return [...this.pool]
  }

  hasReadyKey(): boolean {
    return this.pool.some((k) => k.status === 'ready')
  }

  getEarliestReset(): number | null {
    const cooling = this.pool.filter((k) => k.status === 'cooling' && k.resetAt !== null)
    if (cooling.length === 0) return null
    return Math.min(...cooling.map((k) => k.resetAt!))
  }
}

let rotatorInstance: KeyRotator | null = null

export function getKeyRotator(): KeyRotator {
  if (!rotatorInstance) rotatorInstance = new KeyRotator()
  return rotatorInstance
}
