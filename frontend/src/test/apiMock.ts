import { vi } from 'vitest'

// Every request the UI makes goes through one `fetch` call site, so stubbing the
// global gives the tests the same contract the real backend serves.

export interface MockCall {
  method: string
  path: string
  url: string
  headers: Record<string, string>
  body: unknown
}

export interface MockResult {
  status: number
  body?: unknown
}

export type MockHandler = (call: MockCall) => MockResult

export function installFetchMock(handler: MockHandler) {
  const calls: MockCall[] = []

  const fetchMock = vi.fn(async (input: string, init: RequestInit = {}) => {
    const url = String(input)
    const call: MockCall = {
      method: init.method ?? 'GET',
      path: new URL(url).pathname,
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    }
    calls.push(call)

    const result = handler(call)

    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      json: async () => result.body,
    }
  })

  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

export function findCall(
  calls: MockCall[],
  method: string,
  path: string,
): MockCall | undefined {
  return calls.find((call) => call.method === method && call.path === path)
}
