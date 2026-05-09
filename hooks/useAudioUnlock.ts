'use client'

import { useEffect, useRef } from 'react'

/**
 * iOS Safari blocks speechSynthesis.speak() from async contexts unless
 * it has been triggered at least once from a direct user gesture.
 * This hook fires a silent utterance on the first tap to "unlock" TTS.
 */
export function useAudioUnlock() {
  const unlocked = useRef(false)

  useEffect(() => {
    const unlock = () => {
      if (unlocked.current) return
      unlocked.current = true

      // Unlock speechSynthesis with a silent, zero-duration utterance
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance('​') // zero-width space
        u.volume = 0
        u.rate = 10  // fastest rate = shortest duration
        window.speechSynthesis.speak(u)
      }

      // Also resume/create AudioContext to unblock any Web Audio
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext
        if (AC) {
          const ctx: AudioContext = new AC()
          ctx.resume().catch(() => {})
        }
      } catch { /* ignore */ }
    }

    // Listen for any first user interaction
    document.addEventListener('touchstart', unlock, { once: true, passive: true })
    document.addEventListener('click',      unlock, { once: true, passive: true })

    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click',      unlock)
    }
  }, [])
}
