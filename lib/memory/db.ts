import Dexie, { type EntityTable } from 'dexie'

// ═══════════════════════════════════════════════════════════════
//  Multi-layer memory architecture
//  ────────────────────────────────────────────────────────────
//  Layer 1: raw_events       — last 24-48h, full detail
//  Layer 2: daily_summaries  — 2-30 days old, compressed per day
//  Layer 3: weekly_themes    — 30+ days old, weekly distillation
//  Layer 4: identity_facts   — forever, what defines our relationship
//  Side:    personality_traits — agent's evolved character
// ═══════════════════════════════════════════════════════════════

export interface RawEvent {
  id?: number
  timestamp: number
  type: 'user_speech' | 'bot_speech' | 'ambient' | 'system' | 'observation'
  content: string
  emotion?: string        // assigned mood at the time
  importance?: number     // 0-10, scored at consolidation time
  consolidated?: boolean  // marked true after included in daily summary
}

export interface DailySummary {
  id?: number
  date: string            // YYYY-MM-DD
  summary: string         // 2-4 sentence narrative
  key_facts: string[]     // facts learned about user
  emotional_tone: string  // calm / stressful / playful / etc.
  user_state: string      // brief: how user seemed
  bot_state: string       // brief: how I felt
  consolidated?: boolean  // marked true after included in weekly theme
  created_at: number
}

export interface WeeklyTheme {
  id?: number
  week: string            // YYYY-Www  (e.g., "2026-W19")
  theme: string           // one-line essence of the week
  summary: string         // 3-5 sentences
  key_moments: string[]   // ≤5 specific moments worth remembering
  created_at: number
}

export interface IdentityFact {
  id?: number
  category: 'about_user' | 'shared_moment' | 'relationship' | 'in_joke' | 'preference'
  fact: string
  formed_at: number
  last_referenced: number
  strength: number        // 1-10, grows when reinforced
  source: 'consolidation' | 'explicit' | 'inferred'
}

export interface PersonalityTraitV2 {
  id?: number
  trait_type: 'preference' | 'habit' | 'emotion_pattern' | 'speech_style' | 'value'
  description: string
  formed_at: number
  last_reinforced: number
  strength: number        // 1-10
  deprecated: boolean
}

// State log: snapshots of inner state over time (for self-reflection)
export interface StateLog {
  id?: number
  timestamp: number
  mood: string
  energy: number
  on_my_mind: string
}

// ─── Human-readable markdown memory docs ────────────────────────
// These are the "soul files" — the agent reads & writes them,
// the user can browse them in the app.
export interface MemoryDoc {
  path: string                       // e.g., "identity.md"
  title: string                      // display name
  category: 'core' | 'about_you' | 'between_us' | 'journal' | 'weekly'
  content: string                    // markdown
  pinned?: boolean                   // pin to top of file list
  updated_at: number
  created_at: number
}

class RobotDB extends Dexie {
  raw_events!:         EntityTable<RawEvent, 'id'>
  daily_summaries!:    EntityTable<DailySummary, 'id'>
  weekly_themes!:      EntityTable<WeeklyTheme, 'id'>
  identity_facts!:     EntityTable<IdentityFact, 'id'>
  personality_traits!: EntityTable<PersonalityTraitV2, 'id'>
  state_log!:          EntityTable<StateLog, 'id'>
  memory_docs!:        EntityTable<MemoryDoc, 'path'>

  constructor() {
    super('robot-agent-db')
    this.version(1).stores({
      raw_events:         '++id, timestamp, type, consolidated',
      daily_summaries:    '++id, date, consolidated, created_at',
      weekly_themes:      '++id, week, created_at',
      identity_facts:     '++id, category, strength, last_referenced',
      personality_traits: '++id, trait_type, strength, deprecated',
      state_log:          '++id, timestamp',
    })
    this.version(2).stores({
      raw_events:         '++id, timestamp, type, consolidated',
      daily_summaries:    '++id, date, consolidated, created_at',
      weekly_themes:      '++id, week, created_at',
      identity_facts:     '++id, category, strength, last_referenced',
      personality_traits: '++id, trait_type, strength, deprecated',
      state_log:          '++id, timestamp',
      memory_docs:        'path, category, updated_at',
    })
  }
}

let dbInstance: RobotDB | null = null

export function getDB(): RobotDB {
  if (!dbInstance) dbInstance = new RobotDB()
  return dbInstance
}
