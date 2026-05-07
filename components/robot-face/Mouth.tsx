'use client'

import { motion } from 'framer-motion'
import type { MouthConfig } from './expressions'

interface MouthProps {
  config: MouthConfig
  openness?: number
}

export default function Mouth({ config, openness = 0 }: MouthProps) {
  return (
    <motion.path
      d={config.d}
      stroke="white"
      strokeWidth={config.strokeWidth}
      strokeLinecap="round"
      fill="none"
      animate={{
        d: config.d,
        scaleY: 1 + openness * 0.25,
      }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ transformOrigin: '150px 112px' }}
    />
  )
}
