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
const UNREACHABLE = 'The server is not reachable. Check the backend URL and try again.'

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

function applicationRoute(className = 'Class 6'): string {
  return `/application/${HOLD_ID}?class=${encodeURIComponent(className)}`
}

describe('Role chooser', () => {
  it('starts on the role chooser with both roles and the backend URL', async () => {
    renderApp('/')

    expect(await screen.findByRole('button', { name: /School admin/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Student \/ guardian/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Backend URL')).toBeInTheDocument()
  })

  it('opens the student screen when the student role is chosen', async () => {
    routesApi({ 'GET /classes': { status: 200, body: [] } })
    const user = userEvent.setup()
    renderApp('/')

    await user.click(await screen.findByRole('button', { name: /Student \/ guardian/ }))

    expect(await screen.findByLabelText(/birth-registration number/i)).toBeInTheDocument()
    expect(await screen.findByText('No classes have been created yet.')).toBeInTheDocument()
  })
})

describe('Admin', () => {
  it('shows the classes already created without an Apply button', async () => {
    routesApi({ 'GET /classes': { status: 200, body: [CLASS_SUMMARY] } })
    renderApp('/admin')

    const row = await screen.findByRole('row', { name: /Class 6/ })
    const cells = within(row)
      .getAllByRole('cell')
      .map((cell) => cell.textContent)

    expect(cells).toEqual(['Class 6', '10', '1', '2', '7'])
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('creates a class and refreshes the list below the form', async () => {
    let created = false
    const { calls } = installFetchMock((call) => {
      if (call.method === 'POST' && call.path === '/classes') {
        created = true
        return { status: 201, body: { id: 'class-9', name: 'Class 9', totalSeats: 40 } }
      }
      if (call.method === 'GET' && call.path === '/classes') {
        return {
          status: 200,
          body: created
            ? [
                CLASS_SUMMARY,
                { id: 'class-9', name: 'Class 9', totalSeats: 40, heldSeats: 0, confirmedSeats: 0, availableSeats: 40 },
              ]
            : [CLASS_SUMMARY],
        }
      }
      throw new Error(`Unexpected request: ${call.method} ${call.path}`)
    })

    const user = userEvent.setup()
    renderApp('/admin')

    await user.type(await screen.findByLabelText('Class name'), 'Class 9')
    await user.type(screen.getByLabelText('Total seats'), '40')
    await user.click(screen.getByRole('button', { name: 'Create class' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Class created: Class 9')
    expect(findCall(calls, 'POST', '/classes')?.body).toEqual({ name: 'Class 9', totalSeats: 40 })
    expect(await screen.findByRole('row', { name: /Class 9/ })).toBeInTheDocument()
  })
})

describe('Student', () => {
  it('shows the seat counts and disables Apply without a birth-registration number', async () => {
    routesApi({ 'GET /classes': { status: 200, body: [CLASS_SUMMARY] } })
    renderApp('/student')

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

  it('applies for a seat and opens the application', async () => {
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
      [`POST /classes/${CLASS_ID}/holds`]: { status: 201, body: created },
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: created },
    })

    const user = userEvent.setup()
    renderApp('/student')

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
    routesApi({
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: { ...HELD_HOLD, expiresAt: expiredAt } },
    })

    renderApp(applicationRoute())

    expect(await screen.findByText('EXPIRED')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay Admission Fee' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('confirms the admission', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const activeHold = { ...HELD_HOLD, expiresAt: inMinutes(10) }
    const { calls } = routesApi({
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: activeHold },
      [`POST /holds/${HOLD_ID}/confirm`]: {
        status: 200,
        body: { holdId: HOLD_ID, status: 'CONFIRMED' },
      },
    })

    const user = userEvent.setup()
    renderApp(applicationRoute())
    await user.click(await screen.findByRole('button', { name: 'Pay Admission Fee' }))

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
      [`GET /holds/${HOLD_ID}`]: { status: 200, body: activeHold },
      [`DELETE /holds/${HOLD_ID}`]: { status: 204 },
    })

    const user = userEvent.setup()
    renderApp(applicationRoute())
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))

    expect(await screen.findByText('CANCELLED')).toBeInTheDocument()
    expect(screen.getByText('Application cancelled.')).toBeInTheDocument()
    expect(findCall(calls, 'DELETE', `/holds/${HOLD_ID}`)?.headers['X-Student-Id']).toBe(
      STUDENT_ID,
    )
  })
})

describe('My applications', () => {
  it('lists the stored identity applications with the X-Student-Id header', async () => {
    localStorage.setItem('studentId', STUDENT_ID)
    const activeHold = { ...HELD_HOLD, className: 'Class 6', expiresAt: inMinutes(10) }
    const { calls } = routesApi({
      'GET /me/holds': { status: 200, body: [activeHold] },
    })

    renderApp('/student/applications')

    expect(await screen.findByRole('button', { name: /Class 6/ })).toBeInTheDocument()
    expect(findCall(calls, 'GET', '/me/holds')?.headers['X-Student-Id']).toBe(STUDENT_ID)
  })
})

describe('Errors', () => {
  it('shows a readable banner when the server is unreachable', async () => {
    installFetchMock(() => {
      throw new TypeError('Failed to fetch')
    })
    const user = userEvent.setup()
    renderApp('/student')

    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE)

    await user.click(screen.getByRole('button', { name: 'Home / change role' }))
    await user.click(await screen.findByRole('button', { name: /School admin/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(UNREACHABLE)

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
      renderApp('/student')
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
