import { useState } from 'react'
import { createHold } from '../api/client'
import type { ClassSummary } from '../api/types'
import { ClassTable } from './ClassTable'
import { ErrorBanner } from './ErrorBanner'

export interface ClassListViewProps {
  classes: ClassSummary[]
  loading: boolean
  error: string
  studentId: string
  canApply: boolean
  onHoldCreated: (holdId: string, className: string) => void
  onGoToCreate?: () => void
}

export function ClassListView({
  classes,
  loading,
  error,
  studentId,
  canApply,
  onHoldCreated,
  onGoToCreate,
}: ClassListViewProps) {
  const [pendingClassId, setPendingClassId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ classId: string; message: string } | null>(null)

  async function handleApply(admissionClass: ClassSummary) {
    setPendingClassId(admissionClass.id)
    setRowError(null)

    try {
      const hold = await createHold(admissionClass.id, studentId)
      onHoldCreated(hold.holdId, admissionClass.name)
    } catch (applyError) {
      setRowError({
        classId: admissionClass.id,
        message: applyError instanceof Error ? applyError.message : 'Could not apply.',
      })
    } finally {
      setPendingClassId(null)
    }
  }

  if (classes.length === 0) {
    if (loading) {
      return <p className="hint">Loading classes…</p>
    }

    if (error) {
      return <ErrorBanner message={error} />
    }

    return (
      <div>
        <p>No classes have been created yet.</p>
        {onGoToCreate && (
          <button type="button" className="primary-button" onClick={onGoToCreate}>
            Create a class
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      {!canApply && (
        <p className="hint">
          Enter your 17-digit birth-registration number above to apply.
        </p>
      )}
      <ClassTable
        classes={classes}
        renderAction={(admissionClass) => {
          const busy = pendingClassId === admissionClass.id
          const disabled = !canApply || admissionClass.availableSeats <= 0 || busy

          return (
            <>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  void handleApply(admissionClass)
                }}
              >
                {busy ? 'Applying…' : 'Apply'}
              </button>
              {rowError?.classId === admissionClass.id && (
                <p className="field-error" role="alert">
                  {rowError.message}
                </p>
              )}
            </>
          )
        }}
      />
    </div>
  )
}
