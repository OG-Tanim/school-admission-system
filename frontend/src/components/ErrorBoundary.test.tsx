import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('shows a fallback instead of a blank page and offers a retry', async () => {
    const user = userEvent.setup()
    const onReset = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary onReset={onReset}>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText('This screen could not be displayed. Please try again.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onReset).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
