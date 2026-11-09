import { readFile, writeFile } from 'node:fs/promises'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const ENV_FILE = new URL('../.env', import.meta.url)
const FALLBACK_API_URL = 'http://localhost:8080'
const MAX_BODY_BYTES = 4096

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

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(`${JSON.stringify(payload)}\n`)
}

// Mirrors the production container: /config.js comes from the environment
// file, and /api-url writes a new backend URL back into it.
function runtimeConfigPlugin() {
  return {
    name: 'school-admission:runtime-config',
    configureServer(server) {
      server.middlewares.use('/config.js', async (req, res) => {
        let apiUrl = FALLBACK_API_URL

        try {
          const fromFile = apiUrlFromEnvFile(await readFile(ENV_FILE, 'utf8'))
          if (isValidApiUrl(fromFile)) apiUrl = fromFile
        } catch {
          // No .env yet; keep the fallback.
        }

        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(`window.__APP_CONFIG__ = ${JSON.stringify({ apiUrl })};\n`)
      })

      server.middlewares.use('/api-url', async (req, res) => {
        if (req.method !== 'PUT') {
          return sendJson(res, 405, { error: 'Use PUT to save the backend URL.' })
        }

        let payload
        try {
          payload = await readJson(req)
        } catch (error) {
          return sendJson(res, 400, { error: error.message })
        }

        const apiUrl = normalizeApiUrl(payload?.apiUrl)
        if (!isValidApiUrl(apiUrl)) {
          return sendJson(res, 400, { error: 'Enter a valid http:// or https:// URL.' })
        }

        let contents = ''
        try {
          contents = await readFile(ENV_FILE, 'utf8')
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

        await writeFile(ENV_FILE, `${lines.join('\n')}\n`, 'utf8')

        return sendJson(res, 200, { apiUrl, restartRequired: true })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), runtimeConfigPlugin()],
})
