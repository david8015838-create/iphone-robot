export type Mood =
  | 'calm' | 'curious' | 'happy' | 'playful'
  | 'tired' | 'concerned' | 'pensive' | 'sleepy'

export interface InnerState {
  mood: Mood
  energy: number              // 0-10, affects how chatty/animated
  on_my_mind: string          // what the agent is currently thinking about
  last_seen_user: number      // timestamp of last user interaction
  last_proactive: number      // timestamp of last proactive speech
  session_count: number       // how many times user has opened app
  relationship_phase: 'new' | 'getting_to_know' | 'familiar' | 'close'
  updated_at: number
}

export interface TickDecision {
  new_state: Partial<InnerState>
  should_speak: boolean
  speech?: string
  action?: { name: string; args: Record<string, string> }
  reason?: string             // for debugging/logging
}

export interface ConversationResult {
  text: string
  emotion?: string
  action?: { name: string; args: Record<string, string> }
  new_facts?: string[]         // identity facts to remember
  new_traits?: Array<{ description: string; trait_type: string }>
}
