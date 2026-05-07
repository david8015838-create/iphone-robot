import type { EmotionState } from '@/types'

export interface EyeConfig {
  scaleY: number
  scaleX: number
  offsetY: number
  offsetX: number
  pupilScale: number
  blinkInterval: number
}

export interface MouthConfig {
  d: string
  strokeWidth: number
}

export interface ExpressionConfig {
  left: EyeConfig
  right: EyeConfig
  mouth: MouthConfig
}

const DEFAULT_EYE: EyeConfig = {
  scaleY: 1,
  scaleX: 1,
  offsetY: 0,
  offsetX: 0,
  pupilScale: 1,
  blinkInterval: 4000,
}

// Mouth paths in the 300x140 viewBox
// Mouth spans roughly x=95 to x=205, centered at y=115
const smilePath   = 'M 95 112 Q 150 132 205 112'
const neutralPath = 'M 95 112 Q 150 112 205 112'
const frownPath   = 'M 95 112 Q 150  96 205 112'
const oPath       = 'M 132 112 Q 150 132 168 112 Q 168 96 150 96 Q 132 96 132 112'
const talkPath    = 'M 100 110 Q 150 128 200 110'

export const EXPRESSIONS: Record<EmotionState, ExpressionConfig> = {
  idle: {
    left:  { ...DEFAULT_EYE, blinkInterval: 4000 },
    right: { ...DEFAULT_EYE, blinkInterval: 4000 },
    mouth: { d: neutralPath, strokeWidth: 6 },
  },
  listening: {
    left:  { ...DEFAULT_EYE, scaleY: 1.1, pupilScale: 1.1, blinkInterval: 6000 },
    right: { ...DEFAULT_EYE, scaleY: 1.1, pupilScale: 1.1, blinkInterval: 6000 },
    mouth: { d: smilePath, strokeWidth: 6 },
  },
  thinking: {
    left:  { ...DEFAULT_EYE, offsetX: 6, offsetY: -6, blinkInterval: 8000 },
    right: { ...DEFAULT_EYE, offsetX: 6, offsetY: -6, blinkInterval: 8000 },
    mouth: { d: neutralPath, strokeWidth: 6 },
  },
  speaking: {
    left:  { ...DEFAULT_EYE, blinkInterval: 5000 },
    right: { ...DEFAULT_EYE, blinkInterval: 5000 },
    mouth: { d: talkPath, strokeWidth: 6 },
  },
  happy: {
    left:  { ...DEFAULT_EYE, scaleY: 0.35, scaleX: 1.1, blinkInterval: 3000 },
    right: { ...DEFAULT_EYE, scaleY: 0.35, scaleX: 1.1, blinkInterval: 3000 },
    mouth: { d: smilePath, strokeWidth: 7 },
  },
  surprised: {
    left:  { ...DEFAULT_EYE, scaleY: 1.3, scaleX: 1.25, offsetY: -4, blinkInterval: 10000 },
    right: { ...DEFAULT_EYE, scaleY: 1.3, scaleX: 1.25, offsetY: -4, blinkInterval: 10000 },
    mouth: { d: oPath, strokeWidth: 6 },
  },
  sad: {
    left:  { ...DEFAULT_EYE, scaleY: 0.8, offsetY: 4, offsetX: -3, blinkInterval: 5000 },
    right: { ...DEFAULT_EYE, scaleY: 0.8, offsetY: 4, offsetX:  3, blinkInterval: 5000 },
    mouth: { d: frownPath, strokeWidth: 6 },
  },
  sleeping: {
    left:  { ...DEFAULT_EYE, scaleY: 0.06, blinkInterval: 99999 },
    right: { ...DEFAULT_EYE, scaleY: 0.06, blinkInterval: 99999 },
    mouth: { d: neutralPath, strokeWidth: 4 },
  },
}
