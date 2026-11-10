import { getApiUrl } from './config'
import type {
  ClassCreated,
  ClassSummary,
  HoldConfirmedResponse,
  HoldCreated,
  HoldStatusResponse,
  MyHold,
} from './types'

const NETWORK_ERROR = 'The server is not reachable. Check the backend URL and try again.'
const SERVER_ERROR = 'Something went wrong on the server. Please try again.'

// Error shape the UI can rely on: a plain-language message plus the HTTP status
// (or null when the failure was at the transport level).
export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

function statusFallback(status: number): string {
  // Any 5xx (including gateway errors) is the server's problem, not the input's.
  if (status >= 500) {
    return SERVER_ERROR
  }

  switch (status) {
    case 400:
      return 'The request was not valid. Please check the input and try again.'
    case 403:
      return 'This application does not belong to you.'
    case 404:
      return 'The requested item was not found.'
    case 409:
      return 'The request could not be completed because the class is no longer available.'
    default:
      return 'The request failed. Please try again.'
  }
}

function backendErrorMessage(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === 'string' && error.trim()) {
      return error
    }
  }
  return null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  studentId?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}

  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  if (options.studentId !== undefined) {
    headers['X-Student-Id'] = options.studentId
  }

  let response: Response
  try {
    response = await fetch(`${getApiUrl()}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body,
    })
  } catch {
    throw new ApiError(NETWORK_ERROR, null)
  }

  // Cancel returns 204 with no body to parse.
  if (response.status === 204) {
    return undefined as unknown as T
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    if (response.ok) {
      throw new ApiError(SERVER_ERROR, response.status)
    }
    throw new ApiError(statusFallback(response.status), response.status)
  }

  if (!response.ok) {
    throw new ApiError(
      backendErrorMessage(payload) ?? statusFallback(response.status),
      response.status,
    )
  }

  return payload as T
}

export function createClass(input: { name: string; totalSeats: number }): Promise<ClassCreated> {
  return request<ClassCreated>('/classes', { method: 'POST', body: input })
}

export function listClasses(): Promise<ClassSummary[]> {
  return request<ClassSummary[]>('/classes')
}

export function getClass(classId: string): Promise<ClassSummary> {
  return request<ClassSummary>(`/classes/${encodeURIComponent(classId)}`)
}

export function createHold(classId: string, studentId: string): Promise<HoldCreated> {
  return request<HoldCreated>(`/classes/${encodeURIComponent(classId)}/holds`, {
    method: 'POST',
    studentId,
  })
}

export function getHold(holdId: string): Promise<HoldStatusResponse> {
  return request<HoldStatusResponse>(`/holds/${encodeURIComponent(holdId)}`)
}

export function confirmHold(
  holdId: string,
  studentId: string,
): Promise<HoldConfirmedResponse> {
  return request<HoldConfirmedResponse>(`/holds/${encodeURIComponent(holdId)}/confirm`, {
    method: 'POST',
    studentId,
  })
}

export function cancelHold(holdId: string, studentId: string): Promise<void> {
  return request<void>(`/holds/${encodeURIComponent(holdId)}`, {
    method: 'DELETE',
    studentId,
  })
}

export function listMyHolds(studentId: string): Promise<MyHold[]> {
  return request<MyHold[]>('/me/holds', { studentId })
}
