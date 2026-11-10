import { useCallback, useEffect, useRef, useState } from 'react'
import { listClasses } from '../api/client'
import type { ClassSummary } from '../api/types'

const POLL_MS = 5000

export interface UseClasses {
  classes: ClassSummary[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

export interface UseClassesOptions {
  /** When false, no request is made and no polling runs. */
  enabled?: boolean
}

// Polls GET /classes every few seconds so seat counts stay current without a
// page reload. The last good data is kept while a refresh is in flight, and a
// failed poll only sets `error` (the table stays on screen).
//
// Only the newest request may write state, so a slow response cannot overwrite
// fresher data. The interval also skips a tick while a request is already in
// flight instead of piling up duplicate requests.
export function useClasses(options: UseClassesOptions = {}): UseClasses {
  const enabled = options.enabled ?? true
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')

  // Identifies the newest request; older responses are dropped.
  const latestRequest = useRef(0)
  // True while a request is in flight, so the timer can skip a duplicate tick.
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (!enabled) {
      return
    }

    const requestId = ++latestRequest.current
    inFlight.current = true

    try {
      const next = await listClasses()
      if (requestId !== latestRequest.current) {
        return
      }
      setClasses(next)
      setError('')
    } catch (loadError) {
      if (requestId !== latestRequest.current) {
        return
      }
      setError(loadError instanceof Error ? loadError.message : 'Could not load classes.')
    } finally {
      if (requestId === latestRequest.current) {
        inFlight.current = false
        setHasLoaded(true)
      }
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      return
    }

    // The request resolves before any state is set, so this is not a
    // synchronous render cascade; the polling loop is the external system.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    const timer = setInterval(() => {
      if (!inFlight.current) {
        void load()
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, load])

  return {
    classes,
    loading: enabled && !hasLoaded,
    error,
    refresh: load,
  }
}
