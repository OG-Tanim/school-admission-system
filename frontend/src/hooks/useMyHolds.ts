import { useCallback, useEffect, useState } from 'react'
import { listMyHolds } from '../api/client'
import type { MyHold } from '../api/types'
import { isValidStudentId } from './useStudentId'

const POLL_MS = 5000

export interface UseMyHolds {
  holds: MyHold[]
  loading: boolean
  error: string
  refresh: () => Promise<void>
}

// Polls GET /me/holds for the current student. No polling happens while the
// student id is missing or invalid; changing the id re-fetches immediately.
export function useMyHolds(studentId: string): UseMyHolds {
  const [holds, setHolds] = useState<MyHold[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const active = isValidStudentId(studentId)

  const load = useCallback(async () => {
    if (!active) {
      return
    }

    try {
      const next = await listMyHolds(studentId)
      setHolds(next)
      setError('')
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load your applications.',
      )
    } finally {
      setLoading(false)
    }
  }, [active, studentId])

  useEffect(() => {
    if (!active) {
      return
    }

    // The request resolves before any state is set, so this is not a
    // synchronous render cascade; the polling loop is the external system.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    const timer = setInterval(() => {
      void load()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [active, load])

  return {
    holds: active ? holds : [],
    loading: active ? loading : false,
    error: active ? error : '',
    refresh: load,
  }
}
