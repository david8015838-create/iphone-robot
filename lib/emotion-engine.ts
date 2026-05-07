import type { EmotionState } from '@/types'

const HAPPY_KEYWORDS = [
  '哈哈', '嘻嘻', '好棒', '太好了', '開心', '高興', '讚', '棒', '厲害', '喜歡',
  '愛', '感謝', '謝謝', '很好', '不錯', '加油', 'haha', 'lol', 'great', 'awesome',
  'nice', 'good', 'love', 'perfect', '好玩', '有趣', '哇'
]

const SAD_KEYWORDS = [
  '難過', '傷心', '可惜', '抱歉', '對不起', '不好', '失敗', '錯了', '沮喪',
  '哭', '淚', '慘', '糟', '壞', 'sorry', 'sad', 'bad', 'failed', 'wrong', '痛'
]

const SURPRISED_KEYWORDS = [
  '哇', '真的嗎', '不會吧', '天啊', '居然', '竟然', '什麼！', '怎麼可能',
  'wow', 'really', 'seriously', 'omg', 'no way', '驚', '震驚', '！！'
]

const IDLE_TIMEOUT_MS = 30_000

export class EmotionEngine {
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private onEmotionChange: (emotion: EmotionState) => void

  constructor(onChange: (emotion: EmotionState) => void) {
    this.onEmotionChange = onChange
    this.resetIdleTimer()
  }

  analyze(text: string): EmotionState {
    const lower = text.toLowerCase()

    for (const word of SURPRISED_KEYWORDS) {
      if (lower.includes(word.toLowerCase())) return 'surprised'
    }
    for (const word of HAPPY_KEYWORDS) {
      if (lower.includes(word.toLowerCase())) return 'happy'
    }
    for (const word of SAD_KEYWORDS) {
      if (lower.includes(word.toLowerCase())) return 'sad'
    }

    return 'idle'
  }

  setEmotion(emotion: EmotionState) {
    this.onEmotionChange(emotion)
    if (emotion !== 'sleeping') this.resetIdleTimer()
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      this.onEmotionChange('sleeping')
    }, IDLE_TIMEOUT_MS)
  }

  destroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
  }
}
