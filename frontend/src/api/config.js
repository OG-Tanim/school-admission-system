import { FALLBACK_API_URL, isValidApiUrl, normalizeApiUrl } from '../../lib/apiUrl.js'

export { isValidApiUrl }

const STORAGE_KEY = 'backendUrl'

// The value the frontend server read from the environment file at startup. It
// is the default every user starts from; the UI never writes it back.
const startupApiUrl = normalizeApiUrl(window.__APP_CONFIG__?.apiUrl) || FALLBACK_API_URL

function readStoredOverride() {
  try {
    const stored = normalizeApiUrl(localStorage.getItem(STORAGE_KEY))
    return stored && isValidApiUrl(stored) ? stored : null
  } catch {
    // localStorage can be unavailable (private mode, disabled storage).
    return null
  }
}

// The URL every request uses right now. Any override lives in this browser
// only, so one user changing it never affects another user or the container.
let activeApiUrl = readStoredOverride() ?? startupApiUrl
const listeners = new Set()

export function getStartupApiUrl() {
  return startupApiUrl
}

export function getApiUrl() {
  return activeApiUrl
}

function notify() {
  for (const listener of listeners) {
    listener()
  }
}

export function setApiUrl(value) {
  const apiUrl = normalizeApiUrl(value)
  if (!isValidApiUrl(apiUrl)) {
    throw new Error(
      'Enter a full URL starting with http:// or https://, for example http://localhost:8080.',
    )
  }

  activeApiUrl = apiUrl
  try {
    localStorage.setItem(STORAGE_KEY, apiUrl)
  } catch {
    // Persisting is best-effort; the change still applies to this page.
  }

  notify()
  return apiUrl
}

export function resetApiUrl() {
  activeApiUrl = startupApiUrl
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore storage failures; the reset still applies to this page.
  }

  notify()
  return startupApiUrl
}

// Lets React re-read the URL whenever it changes, without a page reload.
export function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
