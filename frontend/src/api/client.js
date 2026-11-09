import { getApiUrl } from './config'

// Every backend call goes through here so it reads the URL that is active when
// the request is made. A URL changed from the UI therefore applies to the very
// next request without a reload.
export function backendUrl(path = '') {
  return `${getApiUrl()}/${String(path).replace(/^\/+/, '')}`
}

const STATUS_MESSAGES = {
  400: 'The request was rejected because the input was invalid.',
  404: 'The requested item could not be found.',
  409: 'That action could not be completed right now. Please try again.',
  500: 'The server ran into a problem. Please try again.',
}

function friendlyStatus(status) {
  return STATUS_MESSAGES[status] ?? `The backend returned an unexpected response (HTTP ${status}).`
}

// fetch() rejects only on network-level failures (backend down, DNS, CORS), so
// turn those into a message the user can actually act on instead of a raw
// "Failed to fetch" or an error that only appears in the console.
export async function request(path, options) {
  let response

  try {
    response = await fetch(backendUrl(path), options)
  } catch {
    throw new Error(
      `Cannot reach the backend at ${getApiUrl()}. Check that it is running and the URL is correct.`,
    )
  }

  const text = await response.text().catch(() => '')
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    throw new Error(data?.error ?? friendlyStatus(response.status))
  }

  return data
}

// Low-level escape hatch for callers that need the raw Response object.
export function apiFetch(path, options) {
  return fetch(backendUrl(path), options)
}
