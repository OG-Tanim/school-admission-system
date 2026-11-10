// Wire types for the school admission API. Field names mirror the API contract
// exactly; the UI must not depend on fields the backend does not guarantee.

export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED'

export interface ClassSummary {
  id: string
  name: string
  totalSeats: number
  heldSeats: number
  confirmedSeats: number
  availableSeats: number
}

export interface ClassCreated {
  id: string
  name: string
  totalSeats: number
}

export interface HoldCreated {
  holdId: string
  classId: string
  studentId: string
  status: HoldStatus
  expiresAt: string // ISO-8601 UTC
}

export interface HoldStatusResponse {
  holdId: string
  classId: string
  status: HoldStatus
  expiresAt: string
}

export interface HoldConfirmedResponse {
  holdId: string
  status: HoldStatus
}

export interface MyHold {
  holdId: string
  classId: string
  className: string
  status: HoldStatus
  expiresAt: string
}
