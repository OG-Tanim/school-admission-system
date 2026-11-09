const STORAGE_KEY = 'school-admission.api-url'
const FALLBACK_API_URL = 'http://localhost:8080'

export function normalizeApiUrl(value) {
  return (value ?? '').trim().replace(/\/+$/, '')
}

// The default comes from the container's API_URL environment variable, which
// nginx writes into /config.js when the container starts — no rebuild needed.
export function getDefaultApiUrl() {
  return normalizeApiUrl(window.__APP_CONFIG__?.apiUrl) || FALLBACK_API_URL
}

export function isValidApiUrl(value) {
  const url = normalizeApiUrl(value)
  if (!url) return false
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// Read on every request so a URL changed in the UI applies immediately.
export function getApiUrl() {
  try {
    return normalizeApiUrl(localStorage.getItem(STORAGE_KEY)) || getDefaultApiUrl()
  } catch {
    return getDefaultApiUrl()
  }
}

// Passing the default (or nothing) clears the override so the UI follows the
// server-provided value again.
export function setApiUrl(value) {
  const url = normalizeApiUrl(value)
  try {
    if (url && url !== getDefaultApiUrl()) {
      localStorage.setItem(STORAGE_KEY, url)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // localStorage can be unavailable; the chosen URL still applies to this page.
  }
  return url || getDefaultApiUrl()
}

export function resetApiUrl() {
  return setApiUrl('')
}
