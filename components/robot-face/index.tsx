'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { EmotionState } from '@/types'
import { EXPRESSIONS } from './expressions'
import Eye from './Eye'
import Mouth from './Mouth'

interface RobotFaceProps {
  emotion: EmotionState
  mouthOpenness?: number
}

// Full-screen face — viewBox matches iPhone XR landscape ratio (828:414 ≈ 2:1)
// Face elements float on the dark screen; no border circle
const FACE_W = 300
const FACE_H = 140

const LEFT_EYE  = { cx: 80,  cy: 56 }
const RIGHT_EYE = { cx: 220, cy: 56 }
const OUTER_R   = 40  // outer white circle radius
const PUPIL_R   = 19  // pupil radius

export default function RobotFace({ emotion, mouthOpenness = 0 }: RobotFaceProps) {
  const expr = EXPRESSIONS[emotion]
  const isThinking = emotion === 'thinking'
  const isSleeping = emotion === 'sleeping'
  const isHappy    = emotion === 'happy'

  return (
    <div className="relative w-full h-full flex items-center justify-center no-select">
      <motion.svg
        viewBox={`0 0 ${FACE_W} ${FACE_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{ pointerEvents: 'none', maxWidth: '100%', maxHeight: '100%' }}
        animate={{ scale: emotion === 'surprised' ? 1.03 : 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        {/* ── Eyes ── */}
        <Eye
          cx={LEFT_EYE.cx}
          cy={LEFT_EYE.cy}
          outerR={OUTER_R}
          pupilR={PUPIL_R}
          config={expr.left}
        />
        <Eye
          cx={RIGHT_EYE.cx}
          cy={RIGHT_EYE.cy}
          outerR={OUTER_R}
          pupilR={PUPIL_R}
          config={expr.right}
        />

        {/* ── Mouth ── */}
        <Mouth config={expr.mouth} openness={mouthOpenness} />

        {/* ── Happy blush ── */}
        <AnimatePresence>
          {isHappy && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ellipse cx={38}  cy={76} rx={18} ry={9} fill="rgba(244,114,182,0.35)" />
              <ellipse cx={262} cy={76} rx={18} ry={9} fill="rgba(244,114,182,0.35)" />
            </motion.g>
          )}
        </AnimatePresence>

        {/* ── Thinking orbit ── */}
        <AnimatePresence>
          {isThinking && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {[LEFT_EYE, RIGHT_EYE].map((eye) => (
                <motion.circle
                  key={eye.cx}
                  cx={eye.cx}
                  cy={eye.cy}
                  r={OUTER_R + 10}
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth={1.5}
                  strokeDasharray="6 5"
                  strokeOpacity={0.6}
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: 'linear' }}
                  style={{ transformOrigin: `${eye.cx}px ${eye.cy}px` }}
                />
              ))}
            </motion.g>
          )}
        </AnimatePresence>
      </motion.svg>

      {/* ── Sleeping ZZZ (outside SVG so they can float freely) ── */}
      <AnimatePresence>
        {isSleeping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute top-4 right-[15%] text-white/40 font-bold flex flex-col items-start gap-0.5"
            style={{ fontSize: 18 }}
          >
            <span className="zzz">z</span>
            <span className="zzz">z</span>
            <span className="zzz">z</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Thinking dots below mouth ── */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-[10%] flex gap-2"
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="thinking-dot w-2.5 h-2.5 rounded-full bg-[#7c3aed]"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
