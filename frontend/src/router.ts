import { useSyncExternalStore } from 'react'

export interface Route {
  /** Hash path normalized to start with `/` (query string excluded). */
  path: string
  /** Non-empty path segments, e.g. `['application', 'h_123']`. */
  segments: string[]
  /** Parsed `?key=value` portion of the hash. */
  query: URLSearchParams
}

const ROOT = '/'

function normalizePath(raw: string): string {
  if (raw === '') {
    return ROOT
  }

  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1)
  }

  return withLeadingSlash
}

function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const queryStart = raw.indexOf('?')
  const pathPart = queryStart === -1 ? raw : raw.slice(0, queryStart)
  const queryPart = queryStart === -1 ? '' : raw.slice(queryStart + 1)
  const path = normalizePath(pathPart)

  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(queryPart),
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getSnapshot(): string {
  return window.location.hash
}

function getServerSnapshot(): string {
  return '#/'
}

// Navigate to a hash path. Accepts `/admin` or `#/admin`, with an optional
// `?query` suffix; the browser keeps the route in history so Back works.
export function navigate(to: string): void {
  const path = to.startsWith('#') ? to.slice(1) : to
  window.location.hash = `#${path.startsWith('/') ? path : `/${path}`}`
}

// Re-renders the caller whenever the hash changes, so every screen is a real
// addressable route with browser Back/Forward support.
export function useHashRoute(): Route {
  return parseHash(useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot))
}
