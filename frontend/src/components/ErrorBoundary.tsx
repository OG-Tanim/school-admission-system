import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

export interface ErrorBoundaryProps {
  children: ReactNode
  onReset: () => void
}

interface ErrorBoundaryState {
  error: Error | null
}

// Last line of defence: a rendering crash must never leave a blank page.
// `onReset` re-mounts the wrapped view so the user can recover without reloading.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled render error', error, info.componentStack)
  }

  render() {
    if (this.state.error !== null) {
      return (
        <section className="view" aria-label="Something went wrong">
          <h2>Something went wrong</h2>
          <p role="alert">This screen could not be displayed. Please try again.</p>
          <button type="button" onClick={this.props.onReset}>
            Try again
          </button>
        </section>
      )
    }

    return this.props.children
  }
}
