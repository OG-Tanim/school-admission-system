import { useCallback, useEffect, useState } from 'react'
import { ApiError, cancelHold, confirmHold, getClass, getHold } from '../api/client'
import type { HoldStatus } from '../api/types'
import { useCountdown } from '../hooks/useCountdown'
import { ErrorBanner } from './ErrorBanner'

export interface ApplicationViewProps {
  holdId: string
  className?: string
  studentId: string
  identityValid?: boolean
  onBack: () => void
  onHoldChanged?: () => void
}

export function ApplicationView({
  holdId,
  className,
  studentId,
  identityValid = true,
  onBack,
  onHoldChanged,
}: ApplicationViewProps) {
  const [status, setStatus] = useState<HoldStatus | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [classId, setClassId] = useState<string | null>(null)
  const [resolvedClassName, setResolvedClassName] = useState<string | undefined>(className)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'confirm' | 'cancel' | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await getHold(holdId)
      setStatus(next.status)
      setExpiresAt(next.expiresAt)
      setClassId(next.classId)
      setError('')
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not load this application.',
      )
    } finally {
      setLoading(false)
    }
  }, [holdId])

  useEffect(() => {
    // The hold is fetched after mount and state is set after it resolves.
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
  }, [load])

  // A deep link or refresh does not carry the class name, so resolve it once
  // from the class id. The name is cosmetic, so a failure here is ignored.
  useEffect(() => {
    if (resolvedClassName || classId === null) {
      return
    }

    let cancelled = false
    getClass(classId)
      .then((detail) => {
        if (!cancelled) {
          setResolvedClassName(detail.name)
        }
      })
      .catch(() => {
        // Keep the generic "Class" label.
      })

    return () => {
      cancelled = true
    }
  }, [classId, resolvedClassName])

  const countdown = useCountdown(status === 'HELD' ? expiresAt : null)
  const effectiveStatus: HoldStatus | null =
    status === null ? null : status === 'HELD' && countdown.expired ? 'EXPIRED' : status

  async function settle(action: 'confirm' | 'cancel') {
    setPending(action)
    setError('')

    try {
      if (action === 'confirm') {
        await confirmHold(holdId, studentId)
        setStatus('CONFIRMED')
      } else {
        await cancelHold(holdId, studentId)
        setStatus('CANCELLED')
      }
      onHoldChanged?.()
    } catch (settleError) {
      const message =
        settleError instanceof Error ? settleError.message : 'The request failed.'

      // Resync once on a stale/foreign/unknown hold, then keep the message visible.
      if (
        settleError instanceof ApiError &&
        settleError.status !== null &&
        [403, 404, 409].includes(settleError.status)
      ) {
        await load()
      }

      setError(message)
    } finally {
      setPending(null)
    }
  }

  if (loading && status === null) {
    return (
      <section className="view" aria-label="Application">
        <p className="hint">Loading application…</p>
        <button type="button" className="link-button" onClick={onBack}>
          Back
        </button>
      </section>
    )
  }

  if (status === null) {
    return (
      <section className="view" aria-label="Application">
        <h2>Application</h2>
        <ErrorBanner message={error || 'Could not load this application.'} />
        <div className="actions">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true)
              void load()
            }}
          >
            {loading ? 'Trying…' : 'Try again'}
          </button>
          <button type="button" className="secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    )
  }

  const canAct = status === 'HELD' && !countdown.expired && pending === null && identityValid

  return (
    <section className="view" aria-label="Application">
      <div className="view-header">
        <h2>Application</h2>
        <button type="button" className="link-button" onClick={onBack}>
          Back
        </button>
      </div>

      <p className="hold-class">{resolvedClassName ?? 'Class'}</p>
      <p>
        Status:{' '}
        <span className={`status status-${(effectiveStatus ?? 'HELD').toLowerCase()}`}>
          {effectiveStatus}
        </span>
      </p>

      {status === 'HELD' && !countdown.expired && (
        <p>Time remaining: {countdown.label}</p>
      )}

      {!identityValid && (
        <p className="hint">
          Enter your 17-digit birth-registration number on the student screen to pay or
          cancel.
        </p>
      )}

      {error && <ErrorBanner message={error} />}

      {effectiveStatus === 'EXPIRED' && (
        <p className="status-note">
          This application has expired and the seat has been released.
        </p>
      )}
      {effectiveStatus === 'CONFIRMED' && (
        <p className="status-note">Admission confirmed.</p>
      )}
      {effectiveStatus === 'CANCELLED' && (
        <p className="status-note">Application cancelled.</p>
      )}

      <div className="actions">
        <button
          type="button"
          disabled={!canAct}
          onClick={() => {
            void settle('confirm')
          }}
        >
          {pending === 'confirm' ? 'Paying…' : 'Pay Admission Fee'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!canAct}
          onClick={() => {
            void settle('cancel')
          }}
        >
          {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    </section>
  )
}
