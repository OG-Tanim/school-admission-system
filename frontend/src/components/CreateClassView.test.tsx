import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CreateClassView } from './CreateClassView'
import { findCall, installFetchMock } from '../test/apiMock'

describe('CreateClassView', () => {
  it('creates the class and shows a success notice', async () => {
    const user = userEvent.setup()
    const { calls } = installFetchMock((call) => {
      if (call.method === 'POST' && call.path === '/classes') {
        return { status: 201, body: { id: 'class-9', name: 'Class 9', totalSeats: 40 } }
      }
      throw new Error(`Unexpected request: ${call.method} ${call.path}`)
    })
    const onCreated = vi.fn()

    render(<CreateClassView onCreated={onCreated} />)
    await user.type(screen.getByLabelText('Class name'), 'Class 9')
    await user.type(screen.getByLabelText('Total seats'), '40')
    await user.click(screen.getByRole('button', { name: 'Create class' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Class created: Class 9')
    expect(findCall(calls, 'POST', '/classes')?.body).toEqual({
      name: 'Class 9',
      totalSeats: 40,
    })
    expect(onCreated).toHaveBeenCalled()
  })

  it('shows the backend message when the class name already exists', async () => {
    const user = userEvent.setup()
    installFetchMock(() => ({
      status: 409,
      body: { error: 'A class with this name already exists.' },
    }))

    render(<CreateClassView onCreated={vi.fn()} />)
    await user.type(screen.getByLabelText('Class name'), 'Class 9')
    await user.type(screen.getByLabelText('Total seats'), '40')
    await user.click(screen.getByRole('button', { name: 'Create class' }))

    expect(
      await screen.findByText('A class with this name already exists.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
