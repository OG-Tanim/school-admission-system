// Pure, environment-agnostic helpers for reading and validating the backend
// URL. Shared by the browser config, the Vite dev server, and the production
// Node server so all three agree on one implementation.

export const FALLBACK_API_URL = 'http://localhost:8080'

export function normalizeApiUrl(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

export function isValidApiUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

// Extracts API_URL from the contents of the environment file (the same format
// docker compose reads). Returns '' when the key is absent.
export function apiUrlFromEnvFile(contents: string): string {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('API_URL=')) continue
    return normalizeApiUrl(trimmed.slice('API_URL='.length).replace(/^["']|["']$/g, ''))
  }
  return ''
}
