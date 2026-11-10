import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'

// The runtime config the production server injects via /config.js.
window.__APP_CONFIG__ = { apiUrl: 'http://api.test' }

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
})
