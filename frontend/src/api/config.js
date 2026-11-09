const FALLBACK_API_URL = 'http://localhost:8080'

export function normalizeApiUrl(value) {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export function isValidApiUrl(value) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// The page loads the URL the frontend server read from the environment when it
// started. Changing it takes a frontend restart, so this value stays fixed for
// the lifetime of the page.
export function getApiUrl() {
  return normalizeApiUrl(window.__APP_CONFIG__?.apiUrl) || FALLBACK_API_URL
}

// Persists the choice into the environment file. The server keeps using its
// startup value until it is restarted.
export async function saveApiUrl(value) {
  const apiUrl = normalizeApiUrl(value)
  if (!isValidApiUrl(apiUrl)) {
    throw new Error('Enter a full http:// or https:// URL, for example http://localhost:8080.')
  }

  const response = await fetch('/api-url', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiUrl }),
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload.error ?? `The URL could not be saved (HTTP ${response.status}).`)
  }

  return payload.apiUrl ?? apiUrl
}
