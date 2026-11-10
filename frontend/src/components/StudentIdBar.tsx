import type { ChangeEvent } from 'react'

export interface StudentIdBarProps {
  studentId: string
  isValid: boolean
  error: string
  onChange: (value: string) => void
}

export function StudentIdBar({ studentId, isValid, error, onChange }: StudentIdBarProps) {
  return (
    <div className="student-id">
      <label htmlFor="student-id">Student birth-registration number (17 digits)</label>
      <input
        id="student-id"
        type="text"
        inputMode="numeric"
        value={studentId}
        maxLength={17}
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. 20152691234567890"
        aria-invalid={studentId !== '' && !isValid}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
      <p className="student-id-hint">
        Used as your identity for applying and for viewing your applications.
      </p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
