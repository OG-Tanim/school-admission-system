import { useCallback, useState } from 'react'

// Where the student's birth-registration number is remembered between visits.
const KEY = 'studentId'

// The backend accepts exactly 17 ASCII digits (X-Student-Id).
export function isValidStudentId(value: string): boolean {
  return /^\d{17}$/.test(value)
}

function readStoredStudentId(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    // localStorage can be unavailable (private mode, disabled storage).
    return ''
  }
}

export interface UseStudentId {
  studentId: string
  setStudentId: (value: string) => void
  isValid: boolean
  error: string
}

export function useStudentId(): UseStudentId {
  const [studentId, setStudentIdState] = useState(readStoredStudentId)

  const setStudentId = useCallback((value: string) => {
    const trimmed = value.trim()
    setStudentIdState(trimmed)

    try {
      if (trimmed === '') {
        localStorage.removeItem(KEY)
      } else if (isValidStudentId(trimmed)) {
        localStorage.setItem(KEY, trimmed)
      }
    } catch {
      // Persisting is best-effort; the value still applies to this page.
    }
  }, [])

  const isValid = isValidStudentId(studentId)
  const error =
    studentId !== '' && !isValid
      ? 'Enter the 17-digit birth-registration number (digits only).'
      : ''

  return { studentId, setStudentId, isValid, error }
}
