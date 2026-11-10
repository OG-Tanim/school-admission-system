import { useCallback, useEffect, useState } from 'react'
import { listClasses } from '../api/client'
import type { ClassSummary } from '../api/types'

const POLL_MS = 5000

export interface UseClasses {
  classes: ClassSummary[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

// Polls GET /classes every few seconds so seat counts stay current without a
// page reload. The last good data is kept while a refresh is in flight, and a
// failed poll only sets `error` (the table stays on screen).
export function useClasses(): UseClasses {
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await listClasses()
      setClasses(next)
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load classes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // The request resolves before any state is set, so this is not a
    // synchronous render cascade; the polling loop is the external system.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    const timer = setInterval(() => {
      void load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  return { classes, loading, error, refresh: load }
}
