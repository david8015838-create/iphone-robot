import type { InnerState, Mood } from './types'

const STORAGE_KEY = 'robot_inner_state'

const DEFAULT_STATE: InnerState = {
  mood: 'curious',
  energy: 7,
  on_my_mind: '剛醒過來，想著等等要見到他',
  last_seen_user: 0,
  last_proactive: 0,
  session_count: 0,
  relationship_phase: 'new',
  updated_at: Date.now(),
}

export function getInnerState(): InnerState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

export function updateInnerState(patch: Partial<InnerState>): InnerState {
  const current = getInnerState()
  const updated: InnerState = { ...current, ...patch, updated_at: Date.now() }
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }
  return updated
}

export function markUserInteraction(): InnerState {
  return updateInnerState({ last_seen_user: Date.now() })
}

export function markProactiveSpeech(): InnerState {
  return updateInnerState({ last_proactive: Date.now() })
}

export function incrementSession(): InnerState {
  const s = getInnerState()
  return updateInnerState({
    session_count: s.session_count + 1,
    relationship_phase: derivePhase(s.session_count + 1),
  })
}

function derivePhase(sessions: number): InnerState['relationship_phase'] {
  if (sessions < 3) return 'new'
  if (sessions < 15) return 'getting_to_know'
  if (sessions < 60) return 'familiar'
  return 'close'
}

// Time since last user interaction in minutes
export function timeSinceUser(): number {
  const s = getInnerState()
  if (s.last_seen_user === 0) return Infinity
  return (Date.now() - s.last_seen_user) / 60_000
}

// Time since last proactive speech in minutes
export function timeSinceProactive(): number {
  const s = getInnerState()
  if (s.last_proactive === 0) return Infinity
  return (Date.now() - s.last_proactive) / 60_000
}

// Map mood to emotion state for the face
export function moodToFaceEmotion(mood: Mood): string {
  const map: Record<Mood, string> = {
    calm:      'idle',
    curious:   'idle',
    happy:     'happy',
    playful:   'happy',
    tired:     'sleeping',
    sleepy:    'sleeping',
    concerned: 'sad',
    pensive:   'thinking',
  }
  return map[mood] ?? 'idle'
}
