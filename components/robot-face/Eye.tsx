'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import type { EyeConfig } from './expressions'

interface EyeProps {
  cx: number
  cy: number
  outerR: number
  pupilR: number
  config: EyeConfig
}

const BLINK_DURATION = 0.1

export default function Eye({ cx, cy, outerR, pupilR, config }: EyeProps) {
  const [isBlinking, setIsBlinking] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleBlink = (interval: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const jitter = (Math.random() - 0.5) * 800
    timerRef.current = setTimeout(() => {
      setIsBlinking(true)
      setTimeout(() => {
        setIsBlinking(false)
        scheduleBlink(interval)
      }, BLINK_DURATION * 2 * 1000)
    }, interval + jitter)
  }

  useEffect(() => {
    scheduleBlink(config.blinkInterval)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.blinkInterval])

  const eyeScaleY = isBlinking ? 0.04 : config.scaleY
  const pupilCx = cx + config.offsetX
  const pupilCy = cy + config.offsetY

  return (
    <g>
      {/* Outer eye white */}
      <motion.ellipse
        cx={cx}
        cy={cy}
        rx={outerR * config.scaleX}
        ry={outerR}
        fill="white"
        animate={{ scaleY: eyeScaleY }}
        transition={{ duration: isBlinking ? BLINK_DURATION : 0.3, ease: 'easeInOut' }}
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {/* Pupil */}
      <motion.circle
        cx={pupilCx}
        cy={pupilCy}
        r={pupilR * config.pupilScale}
        fill="#1a1a2e"
        initial={{ opacity: 1 }}
        animate={{ opacity: isBlinking ? 0 : 1, cx: pupilCx, cy: pupilCy }}
        transition={{ duration: 0.2 }}
      />
      {/* Shine */}
      <motion.circle
        cx={pupilCx + pupilR * 0.35}
        cy={pupilCy - pupilR * 0.35}
        r={pupilR * 0.25}
        fill="white"
        initial={{ opacity: 0.9 }}
        animate={{ opacity: isBlinking ? 0 : 0.9 }}
        transition={{ duration: 0.08 }}
      />
    </g>
  )
}
