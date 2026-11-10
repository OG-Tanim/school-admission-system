import { useCallback, useEffect, useRef, useState } from 'react'
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

export interface UseMyHoldsOptions {
  /** When false, no request is made and no polling runs. */
  enabled?: boolean
}

interface StudentHolds {
  /** The student the cached rows belong to. */
  studentId: string
  holds: MyHold[]
  error: string
}

// Polls GET /me/holds for the current student. No polling happens while the
// student id is missing or invalid; changing the id re-fetches immediately.
//
// Rows are tagged with the student they belong to, so a newly entered id never
// shows the previous student's applications while its own request is in flight.
// Only the newest request may write state, and the interval skips a tick while a
// request is already in flight.
export function useMyHolds(
  studentId: string,
  options: UseMyHoldsOptions = {},
): UseMyHolds {
  const enabled = options.enabled ?? true
  const active = enabled && isValidStudentId(studentId)

  const [data, setData] = useState<StudentHolds>({ studentId: '', holds: [], error: '' })
  // Identifies the newest request; older responses are dropped.
  const latestRequest = useRef(0)
  // True while a request is in flight, so the timer can skip a duplicate tick.
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (!active) {
      return
    }

    const requestId = ++latestRequest.current
    inFlight.current = true

    try {
      const next = await listMyHolds(studentId)
      if (requestId !== latestRequest.current) {
        return
      }
      setData({ studentId, holds: next, error: '' })
    } catch (loadError) {
      if (requestId !== latestRequest.current) {
        return
      }
      setData((current) => ({
        // Tag the failed attempt with this student so the UI stops loading and
        // shows the error instead of the previous student's rows.
        studentId,
        holds: current.studentId === studentId ? current.holds : [],
        error:
          loadError instanceof Error ? loadError.message : 'Could not load your applications.',
      }))
    } finally {
      if (requestId === latestRequest.current) {
        inFlight.current = false
      }
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
      if (!inFlight.current) {
        void load()
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [active, load])

  const forCurrentStudent = data.studentId === studentId

  return {
    holds: active && forCurrentStudent ? data.holds : [],
    loading: active && !forCurrentStudent,
    error: active && forCurrentStudent ? data.error : '',
    refresh: load,
  }
}
