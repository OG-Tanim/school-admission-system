import { useSyncExternalStore } from 'react'
import { getApiUrl, subscribe } from '../api/config'

// Re-renders the caller whenever the backend URL changes, so a URL applied in
// the UI takes effect immediately without a page reload.
export function useBackendUrl(): string {
  return useSyncExternalStore(subscribe, getApiUrl, getApiUrl)
}
