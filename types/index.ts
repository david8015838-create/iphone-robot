export type EmotionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'happy'
  | 'surprised'
  | 'sad'
  | 'sleeping'

export interface KeyEntry {
  id: string
  value: string
  label: string
  status: 'ready' | 'cooling' | 'exhausted'
  resetAt: number | null
  errorCount: number
  lastUsed: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  emotion?: EmotionState
}

export interface MemoryEntry {
  id?: number
  category: 'user_profile' | 'technical' | 'life' | 'emotions' | 'preferences'
  key: string
  value: string
  importance: number
  lastAccessed: number
  createdAt: number
}

export interface ConversationEntry {
  id?: number
  userMsg: string
  botMsg: string
  emotion: EmotionState
  tags: string[]
  timestamp: number
}

export interface PersonalityTrait {
  id?: number
  traitType: 'preference' | 'habit' | 'emotion_pattern' | 'speech_style' | 'value'
  description: string
  formedAt: number
  strength: number
  deprecated: boolean
}

export interface UserProfile {
  key: string
  value: string
  updatedAt: number
}

export interface PhoneAction {
  name: string
  args: Record<string, string>
}

export interface ChatRequest {
  message: string
  apiKey: string
  history: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  systemPrompt: string
  imageBase64?: string
  imageMimeType?: string
  enableTools?: boolean
}

export interface ChatResponse {
  text?: string
  action?: PhoneAction
  emotion?: EmotionState
  error?: string
  cooldown?: number
}

export interface RobotState {
  emotion: EmotionState
  isSpeaking: boolean
  isListening: boolean
  isCameraOn: boolean
  isSettingsOpen: boolean
  messages: Message[]
  currentSpeech: string
  mouthOpenness: number
}
