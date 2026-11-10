import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelHold, createClass } from './client'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('api client error mapping', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('surfaces the backend error message on 409', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: 'No seats available in this class.' }, 409),
    )

    await expect(createClass({ name: 'X', totalSeats: 1 })).rejects.toMatchObject({
      message: 'No seats available in this class.',
      status: 409,
    })
  })

  it('reports a network failure in plain language', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))

    await expect(createClass({ name: 'X', totalSeats: 1 })).rejects.toMatchObject({
      message: expect.stringContaining('not reachable'),
      status: null,
    })
  })

  it('treats 204 from cancel as success', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(cancelHold('h_1', '20152691234567890')).resolves.toBeUndefined()
  })
})
