import { act } from 'react'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { findCall, installFetchMock } from './test/apiMock'
import type { MockResult } from './test/apiMock'
import { renderApp } from './test/renderApp'

const STUDENT_ID = '12345678901234567'
const CLASS_ID = 'class-1'
const HOLD_ID = 'hold-1'

const CLASS_SUMMARY = {
  id: CLASS_ID,
  name: 'Class 6',
  totalSeats: 10,
  heldSeats: 1,
  confirmedSeats: 2,
  availableSeats: 7,
}

const HELD_HOLD = { holdId: HOLD_ID, classId: CLASS_ID, status: 'HELD', expiresAt: '' }

function inMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function routesApi(routes: Record<string, MockResult>) {
  return installFetchMock((call) => {
    const key = `${call.method} ${call.path}`
    const result = routes[key]
    if (!result) {
      throw new Error(`Unexpected request: ${key}`)
    }
    return result
  })
}

async function openApplication(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'My Applications' }))
  await user.click(await screen.findByRole('button', { name: /Class 6/ }))
  expect(await screen.findByRole('heading', { name: 'Application' })).toBeInTheDocument()
}

describe('Class list', () => {
  it('shows the seat counts and disables Apply without a student id', async () => {
    routesApi({ 'GET /classes': { status: 200, body: [CLASS_SUMMARY] } })
    renderApp()

    const row = await screen.findByRole('row', { name: /Class 6/ })
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)

    expect(cells.slice(0, 5)).toEqual(['Class 6', '10', '1', '2', '7'])
    expect(within(row).getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(
      screen.getByText(/Enter your 17-digit birth-registration number above to apply/),
    ).toBeInTheDocument()
  })

  it('disables Apply when no seats are available', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    routesApi({
      'GET /classes': { status: 200, body: [{ ...CLASS_SUMMARY, availableSeats: 0 }] },
      'GET /me/holds': { status: 200, body: [] },
    })
    renderApp()

    const row = await screen.findByRole('row', { name: /Class 6/ })
    expect(within(row).getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('opens the application with the new hold when Apply is clicked', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const created = {
      holdId: HOLD_ID,
      classId: CLASS_ID,
      studentId: STUDENT_ID,
      status: 'HELD',
      expiresAt: inMinutes(10),
    }
    const { calls } = routesApi({
      'GET /classes': { status: 200, body: [CLASS_SUMMARY] },
      'GET /me/holds': { status: 200, body: [] },
      [`POST /classes/${CLASS_ID}/holds`]: { status: 201, body: created },
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: created },
    })
    const user = userEvent.setup()
    renderApp()

    const table = await screen.findByRole('table')
    await user.click(within(table).getByRole('button', { name: 'Apply' }))

    expect(await screen.findByRole('heading', { name: 'Application' })).toBeInTheDocument()
    expect(await screen.findByText('HELD')).toBeInTheDocument()

    const post = findCall(calls, 'POST', `/classes/${CLASS_ID}/holds`)
    expect(post?.headers['X-Student-Id']).toBe(STUDENT_ID)
    expect(post?.body).toBeUndefined()
  })
})

describe('Application', () => {
  it('shows EXPIRED and disables Pay when the hold has already expired', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const expiredAt = new Date(Date.now() - 60_000).toISOString()
    const expiredHold = { ...HELD_HOLD, expiresAt: expiredAt }
    routesApi({
      'GET /classes': { status: 200, body: [CLASS_SUMMARY] },
      'GET /me/holds': {
        status: 200,
        body: [{ ...expiredHold, className: 'Class 6' }],
      },
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: expiredHold },
    })
    const user = userEvent.setup()
    renderApp()

    await openApplication(user)

    expect(await screen.findByText('EXPIRED')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Admission Fee' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('confirms the admission', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const activeHold = { ...HELD_HOLD, expiresAt: inMinutes(10) }
    const { calls } = routesApi({
      'GET /classes': { status: 200, body: [CLASS_SUMMARY] },
      'GET /me/holds': { status: 200, body: [{ ...activeHold, className: 'Class 6' }] },
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: activeHold },
      [`POST /holds/${HOLD_ID}/confirm`]: {
        status: 200,
        body: { holdId: HOLD_ID, status: 'CONFIRMED' },
      },
    })
    const user = userEvent.setup()
    renderApp()

    await openApplication(user)
    await user.click(screen.getByRole('button', { name: 'Pay Admission Fee' }))

    expect(await screen.findByText('CONFIRMED')).toBeInTheDocument()
    expect(screen.getByText('Admission confirmed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Admission Fee' })).toBeDisabled()
    expect(findCall(calls, 'POST', `/holds/${HOLD_ID}/confirm`)?.headers['X-Student-Id']).toBe(
      STUDENT_ID,
    )
  })

  it('cancels the application', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const activeHold = { ...HELD_HOLD, expiresAt: inMinutes(10) }
    const { calls } = routesApi({
      'GET /classes': { status: 200, body: [CLASS_SUMMARY] },
      'GET /me/holds': { status: 200, body: [{ ...activeHold, className: 'Class 6' }] },
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: activeHold },
      [`DELETE /holds/${HOLD_ID}`]: { status: 204 },
    })
    const user = userEvent.setup()
    renderApp()

    await openApplication(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('CANCELLED')).toBeInTheDocument()
    expect(screen.getByText('Application cancelled.')).toBeInTheDocument()
    expect(findCall(calls, 'DELETE', `/holds/${HOLD_ID}`)?.headers['X-Student-Id']).toBe(
      STUDENT_ID,
    )
  })
})

describe('Identity and errors', () => {
  it('loads the stored identity holds with the X-Student-Id header', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const activeHold = { ...HELD_HOLD, expiresAt: inMinutes(10) }
    const { calls } = routesApi({
      'GET /classes': { status: 200, body: [CLASS_SUMMARY] },
      'GET /me/holds': { status: 200, body: [{ ...activeHold, className: 'Class 6' }] },
    })
    const user = userEvent.setup()
    renderApp()

    await user.click(screen.getByRole('tab', { name: 'My Applications' }))

    expect(await screen.findByRole('button', { name: /Class 6/ })).toBeInTheDocument()
    expect(findCall(calls, 'GET', '/me/holds')?.headers['X-Student-Id']).toBe(STUDENT_ID)
  })

  it('shows a readable banner on every screen when the server is unreachable', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    installFetchMock(() => {
      throw new TypeError('Failed to fetch')
    })
    const user = userEvent.setup()
    renderApp()

    const unreachable = 'The server is not reachable. Check the backend URL and try again.'

    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable)

    await user.click(screen.getByRole('tab', { name: 'Create Class' }))
    await user.type(screen.getByLabelText('Class name'), 'Class 9')
    await user.type(screen.getByLabelText('Total seats'), '40')
    await user.click(screen.getByRole('button', { name: 'Create class' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable)

    await user.click(screen.getByRole('tab', { name: 'My Applications' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(unreachable)

    expect(
      screen.getByRole('heading', { name: 'School Admission System' }),
    ).toBeInTheDocument()
  })

  it('recovers when the server comes back', async () => {
    let online = false
    installFetchMock(() => {
      if (!online) {
        throw new TypeError('Failed to fetch')
      }
      return { status: 200, body: [CLASS_SUMMARY] }
    })

    vi.useFakeTimers()
    try {
      renderApp()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(screen.getByRole('alert')).toHaveTextContent(/not reachable/)

      online = true
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText('Class 6')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
