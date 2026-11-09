import { createServer } from 'node:http'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'

const PORT = Number(process.env.PORT ?? 80)
const STATIC_ROOT = resolve(process.env.STATIC_ROOT ?? '/app/dist')
const CONFIG_FILE = process.env.CONFIG_FILE ?? '/config/api-url.env'
const FALLBACK_API_URL = 'http://localhost:8080'
const MAX_BODY_BYTES = 4096

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

// The environment file is the source of truth, so editing it and restarting
// the container is enough to point the UI at another backend.
async function loadApiUrl() {
  try {
    const fromFile = apiUrlFromEnvFile(await readFile(CONFIG_FILE, 'utf8'))
    if (isValidApiUrl(fromFile)) return fromFile
  } catch {
    // The file is missing on first run; fall back to the container environment.
  }

  const fromEnv = normalizeApiUrl(process.env.API_URL)
  return isValidApiUrl(fromEnv) ? fromEnv : FALLBACK_API_URL
}

async function saveApiUrl(apiUrl) {
  let contents = ''
  try {
    contents = await readFile(CONFIG_FILE, 'utf8')
  } catch {
    // Create the file below.
  }

  const lines = contents.length ? contents.replace(/\s+$/, '').split(/\r?\n/) : []
  const entry = `API_URL=${apiUrl}`
  const index = lines.findIndex((line) => line.trim().startsWith('API_URL='))

  if (index >= 0) {
    lines[index] = entry
  } else {
    lines.push(entry)
  }

  await mkdir(dirname(CONFIG_FILE), { recursive: true })
  await writeFile(CONFIG_FILE, `${lines.join('\n')}\n`, 'utf8')
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

function readJson(req) {
  return new Promise((resolvePromise, reject) => {
    let size = 0
    const chunks = []

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('Request body must be valid JSON.'))
      }
    })

    req.on('error', reject)
  })
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

const startupApiUrl = await loadApiUrl()

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (url.pathname === '/healthz') {
      return sendJson(res, 200, { status: 'ok' })
    }

    if (url.pathname === '/config.js') {
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

    if (url.pathname === '/api-url') {
      if (req.method !== 'PUT') {
        return sendJson(res, 405, { error: 'Use PUT to save the backend URL.' })
      }

      let payload
      try {
        payload = await readJson(req)
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }

      const requested = normalizeApiUrl(payload?.apiUrl)
      if (!isValidApiUrl(requested)) {
        return sendJson(res, 400, { error: 'Enter a valid http:// or https:// URL.' })
      }

      try {
        await saveApiUrl(requested)
      } catch (error) {
        console.error('Could not write the environment file:', error)
        return sendJson(res, 500, {
          error: 'The backend URL could not be saved to the environment file.',
        })
      }

      return sendJson(res, 200, { apiUrl: requested, restartRequired: true })
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
  console.log(`Frontend on :${PORT} — API ${startupApiUrl} (config: ${CONFIG_FILE})`)
})
