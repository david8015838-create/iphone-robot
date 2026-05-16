/**
 * Lightweight heuristics — is this utterance addressed to the agent?
 * Runs entirely client-side so we don't spend tokens classifying noise.
 */

// Wake words / direct address
const ADDRESS_WORDS = [
  'yo bro', 'hey bro', 'yo', 'bro',
  '嗨機器人', '嘿機器人', '哈囉機器人',
  '機器人', '助手',
]

// Command indicators (suggests user is giving instructions)
const COMMAND_HINTS = [
  '幫我', '幫個忙', '能不能', '可以嗎', '可以幫',
  '播', '打開', '搜尋', '查一下', '提醒我', '傳訊息',
  'play', 'open', 'search', 'remind me', 'send',
]

// Question indicators
const QUESTION_HINTS = ['嗎', '呢', '?', '？', 'what', 'how', 'why', 'when', 'where']

export interface IntentResult {
  addressed: boolean
  confidence: 'high' | 'medium' | 'low'
  text: string         // possibly stripped of wake word
  reason: string
}

export function detectIntent(
  text: string,
  opts: {
    botSpokeRecently: boolean   // within last 30s
    inActiveSession: boolean    // user already in conversation
  } = { botSpokeRecently: false, inActiveSession: false },
): IntentResult {
  const t = text.trim().toLowerCase()
  if (!t) return { addressed: false, confidence: 'low', text, reason: 'empty' }

  // Filter out very short utterances (likely noise)
  if (t.length < 2) return { addressed: false, confidence: 'low', text, reason: 'too short' }

  // 1) Direct address — high confidence
  for (const w of ADDRESS_WORDS) {
    if (t.includes(w)) {
      return {
        addressed: true,
        confidence: 'high',
        text: stripAddress(text),
        reason: `direct address: ${w}`,
      }
    }
  }

  // 2) Already in conversation + bot spoke recently → assume follow-up
  if (opts.inActiveSession && opts.botSpokeRecently) {
    return {
      addressed: true,
      confidence: 'high',
      text,
      reason: 'continuing active conversation',
    }
  }

  // 3) Command-style + Q/A indicators → probably to agent
  const hasCommand = COMMAND_HINTS.some((c) => t.includes(c))
  const hasQuestion = QUESTION_HINTS.some((q) => t.includes(q))
  if (hasCommand || (hasQuestion && t.length > 5)) {
    return {
      addressed: true,
      confidence: 'medium',
      text,
      reason: hasCommand ? 'command tone' : 'question tone',
    }
  }

  // 4) Long single-person speech with no obvious context — could be talking to self
  // Default: not addressed
  return {
    addressed: false,
    confidence: 'low',
    text,
    reason: 'no clear signal',
  }
}

function stripAddress(text: string): string {
  let t = text.trim()
  for (const w of ADDRESS_WORDS) {
    const re = new RegExp(`\\b${w}\\b[,，!！。\\s]*`, 'gi')
    t = t.replace(re, '').trim()
  }
  return t
}
