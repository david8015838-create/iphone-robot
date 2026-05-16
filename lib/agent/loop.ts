import { getInnerState, updateInnerState, markProactiveSpeech, timeSinceUser, timeSinceProactive } from './inner-state'
import { buildAgentContext } from '@/lib/memory/context'
import { getKeyRotator } from '@/lib/key-rotator'
import { getModelName } from '@/lib/model-config'
import { logState } from '@/lib/memory/store'
import type { TickDecision } from './types'

/**
 * Smart tick scheduler.
 *
 * Rules to avoid excessive API calls + spam:
 *  - Don't tick during active conversation (caller signals via `isBusy`)
 *  - Don't tick if last tick was < 60s ago
 *  - First tick after app open: 5s (so the agent "wakes up")
 *  - Subsequent ticks: 60-180s depending on activity
 *  - Don't speak proactively if last proactive < 3 minutes
 */
export class AgentLoop {
  private timer: ReturnType<typeof setTimeout> | null = null
  private lastTickAt = 0
  private running = false
  private busyRef: { current: boolean } = { current: false }
  private onSpeak: (text: string) => void = () => {}
  private onStateChange: () => void = () => {}

  start(handlers: {
    onSpeak: (text: string) => void
    onStateChange: () => void
    busyRef: { current: boolean }
  }) {
    this.onSpeak = handlers.onSpeak
    this.onStateChange = handlers.onStateChange
    this.busyRef = handlers.busyRef
    if (this.running) return
    this.running = true
    // First wake-up tick — 5s after app open
    this.scheduleNext(5_000)
  }

  stop() {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private scheduleNext(delay: number) {
    if (!this.running) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => this.tick(), delay)
  }

  private async tick() {
    if (!this.running) return

    // Skip if busy (during conversation)
    if (this.busyRef.current) {
      this.scheduleNext(30_000)
      return
    }

    // Throttle
    const now = Date.now()
    if (now - this.lastTickAt < 30_000) {
      this.scheduleNext(60_000)
      return
    }

    this.lastTickAt = now

    try {
      const key = getKeyRotator().getNextKey()
      if (!key) {
        this.scheduleNext(180_000)
        return
      }

      const state = getInnerState()
      const context = await buildAgentContext()

      const res = await fetch('/api/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: key.value,
          modelName: getModelName(),
          inner_state: {
            mood: state.mood,
            energy: state.energy,
            on_my_mind: state.on_my_mind,
            last_seen_minutes_ago: timeSinceUser(),
            last_proactive_minutes_ago: timeSinceProactive(),
            relationship_phase: state.relationship_phase,
            session_count: state.session_count,
          },
          context,
          current_time: formatNow(),
        }),
      })

      if (!res.ok) {
        // Cool down on rate limit
        this.scheduleNext(res.status === 429 ? 180_000 : 120_000)
        return
      }

      const decision: TickDecision = await res.json()

      // Apply state update
      if (decision.new_state && Object.keys(decision.new_state).length > 0) {
        updateInnerState(decision.new_state)
        this.onStateChange()

        // Log inner state for self-reflection
        const newState = getInnerState()
        logState({
          timestamp: Date.now(),
          mood: newState.mood,
          energy: newState.energy,
          on_my_mind: newState.on_my_mind,
        }).catch(() => {})
      }

      // Decide whether to speak — gate by proactive cooldown
      const minSinceProactive = timeSinceProactive()
      const canSpeak = decision.should_speak
        && decision.speech
        && decision.speech.trim().length > 0
        && minSinceProactive > 2  // at least 2 min since last proactive

      if (canSpeak && decision.speech) {
        markProactiveSpeech()
        this.onSpeak(decision.speech)
      }

      // Next tick: more active when speech happened, longer when quiet
      this.scheduleNext(canSpeak ? 90_000 : 120_000)
    } catch {
      this.scheduleNext(120_000)
    }
  }
}

function formatNow(): string {
  const d = new Date()
  const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
  const yyyy = d.getFullYear()
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  const hh   = String(d.getHours()).padStart(2, '0')
  const mi   = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} (${days[d.getDay()]})`
}
