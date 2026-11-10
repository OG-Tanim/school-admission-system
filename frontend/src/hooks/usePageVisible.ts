import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

function getSnapshot(): boolean {
  return !document.hidden
}

function getServerSnapshot(): boolean {
  return true
}

// True while the page is visible. Pausing polling while the tab is hidden saves
// battery and network without changing what the user sees when they come back.
export function usePageVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
