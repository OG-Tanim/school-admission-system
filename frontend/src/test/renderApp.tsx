import { render } from '@testing-library/react'
import App from '../App'

// Renders the whole app so tests exercise the real tabs, hooks, and polling.
export function renderApp() {
  return render(<App />)
}
