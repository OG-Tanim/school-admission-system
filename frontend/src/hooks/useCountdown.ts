import { useEffect, useState } from 'react'

export interface Countdown {
  remainingMs: number
  expired: boolean
  label: string
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`
}

// Ticks once per second against an ISO timestamp. `expired` flips as soon as the
// clock passes `expiresAt`, so the UI can show EXPIRED without a page reload.
export function useCountdown(expiresAt: string | null): Countdown {
  const target = expiresAt === null ? null : Date.parse(expiresAt)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (expiresAt === null || target === null || Number.isNaN(target)) {
      return
    }

    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt, target])

  if (target === null || Number.isNaN(target)) {
    return { remainingMs: 0, expired: false, label: '--:--' }
  }

  const remainingMs = Math.max(0, target - now)
  return {
    remainingMs,
    expired: remainingMs <= 0,
    label: formatRemaining(remainingMs),
  }
}
