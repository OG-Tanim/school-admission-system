import { render } from '@testing-library/react'
import App from '../App'

// Renders the whole app at a hash route so tests exercise the real router,
// screens, hooks, and polling.
export function renderApp(route = '/') {
  window.location.hash = route
  return render(<App />)
}
