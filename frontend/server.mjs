import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

const PORT = Number(process.env.PORT ?? 80)
const STATIC_ROOT = resolve(process.env.STATIC_ROOT ?? '/app/dist')
const CONFIG_FILE = process.env.CONFIG_FILE ?? '/config/api-url.env'
const FALLBACK_API_URL = 'http://localhost:8080'

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function normalizeApiUrl(value) {
  return String(value ?? '')
    .trim()
    .replace(/\/+$/, '')
}

function isValidApiUrl(value) {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function apiUrlFromEnvFile(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('API_URL=')) continue
    return normalizeApiUrl(trimmed.slice('API_URL='.length).replace(/^["']|["']$/g, ''))
  }
  return ''
}

// Startup value: the environment file is the source of truth for every start.
// A user may override it in their own browser, but the browser never writes
// this file back.
async function loadStartupApiUrl() {
  try {
    const fromFile = apiUrlFromEnvFile(await readFile(CONFIG_FILE, 'utf8'))
    if (isValidApiUrl(fromFile)) return fromFile
  } catch {
    // The file is missing on first run; fall back to the container environment.
  }

  const fromEnv = normalizeApiUrl(process.env.API_URL)
  return isValidApiUrl(fromEnv) ? fromEnv : FALLBACK_API_URL
}

function send(res, status, body, contentType, cacheControl, headOnly = false) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(headOnly ? undefined : body)
}

function sendJson(res, status, payload) {
  send(res, status, `${JSON.stringify(payload)}\n`, 'application/json; charset=utf-8', 'no-store')
}

function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function cacheControlFor(relativePath) {
  return relativePath.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-store'
}

async function serveStatic(req, res, url) {
  const headOnly = req.method === 'HEAD'

  let relative
  try {
    relative = decodeURIComponent(url.pathname)
  } catch {
    return send(res, 400, 'Bad request\n', 'text/plain; charset=utf-8', 'no-store', headOnly)
  }

  relative = relative.replace(/^\/+/, '') || 'index.html'
  const filePath = resolve(STATIC_ROOT, relative)

  if (!filePath.startsWith(`${STATIC_ROOT}${sep}`)) {
    return send(res, 403, 'Forbidden\n', 'text/plain; charset=utf-8', 'no-store', headOnly)
  }

  try {
    const body = await readFile(filePath)
    return send(res, 200, body, contentTypeFor(filePath), cacheControlFor(relative), headOnly)
  } catch {
    // Not a file: single-page app routes fall back to index.html.
  }

  if ((req.headers.accept ?? '').includes('text/html')) {
    try {
      const index = await readFile(resolve(STATIC_ROOT, 'index.html'))
      return send(res, 200, index, 'text/html; charset=utf-8', 'no-store', headOnly)
    } catch {
      // Fall through to 404.
    }
  }

  return send(res, 404, 'Not found\n', 'text/plain; charset=utf-8', 'no-store', headOnly)
}

const startupApiUrl = await loadStartupApiUrl()

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (url.pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' })
    }

    if (url.pathname === '/config.js') {
      // Default only. Every user may override this in their own browser.
      const body = `window.__APP_CONFIG__ = ${JSON.stringify({ apiUrl: startupApiUrl })};\n`
      return send(
        res,
        200,
        body,
        'text/javascript; charset=utf-8',
        'no-store',
        req.method === 'HEAD',
      )
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'Method not allowed.' })
    }

    return serveStatic(req, res, url)
  } catch (error) {
    console.error(error)
    return sendJson(res, 500, { error: 'Something went wrong.' })
  }
})

server.listen(PORT, () => {
  console.log(`Frontend on :${PORT} — API default ${startupApiUrl} (config: ${CONFIG_FILE})`)
})
