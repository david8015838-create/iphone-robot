'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useRef } from 'react'

interface CameraOverlayProps {
  isOn: boolean
  videoRef: React.RefObject<HTMLVideoElement | null>
}

export default function CameraOverlay({ isOn, videoRef }: CameraOverlayProps) {
  return (
    <AnimatePresence>
      {isOn && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute bottom-36 right-4 rounded-2xl overflow-hidden"
          style={{
            width: 100,
            height: 133,
            border: '2px solid var(--border)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 pulse-dot" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
