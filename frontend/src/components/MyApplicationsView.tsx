import type { MyHold } from '../api/types'
import { useCountdown } from '../hooks/useCountdown'
import { ErrorBanner } from './ErrorBanner'

export interface MyApplicationsViewProps {
  holds: MyHold[]
  loading: boolean
  error: string
  canApply: boolean
  onOpenHold: (holdId: string, className: string) => void
  onGoToClasses: () => void
}

function HoldRow({ hold, onOpen }: { hold: MyHold; onOpen: () => void }) {
  const countdown = useCountdown(hold.status === 'HELD' ? hold.expiresAt : null)
  const status = hold.status === 'HELD' && countdown.expired ? 'EXPIRED' : hold.status

  return (
    <li>
      <button type="button" className="hold-row" onClick={onOpen}>
        <span className="hold-class">{hold.className}</span>
        <span className={`status status-${status.toLowerCase()}`}>{status}</span>
        {status === 'HELD' && (
          <span className="hold-countdown">{countdown.label} left</span>
        )}
      </button>
    </li>
  )
}

export function MyApplicationsView({
  holds,
  loading,
  error,
  canApply,
  onOpenHold,
  onGoToClasses,
}: MyApplicationsViewProps) {
  if (!canApply) {
    return (
      <p className="hint">
        Enter your 17-digit birth-registration number to apply and to see your
        applications.
      </p>
    )
  }

  if (loading && holds.length === 0) {
    return <p className="hint">Loading your applications…</p>
  }

  if (holds.length === 0) {
    if (error) {
      return <ErrorBanner message={error} />
    }

    return (
      <div>
        <p>You have no applications yet.</p>
        <button type="button" className="primary-button" onClick={onGoToClasses}>
          Browse classes
        </button>
      </div>
    )
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      <ul className="hold-list">
        {holds.map((hold) => (
          <HoldRow
            key={hold.holdId}
            hold={hold}
            onOpen={() => onOpenHold(hold.holdId, hold.className)}
          />
        ))}
      </ul>
    </div>
  )
}
