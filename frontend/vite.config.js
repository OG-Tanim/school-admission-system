import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const ENV_FILE = fileURLToPath(new URL('../config/api-url.env', import.meta.url))
const FALLBACK_API_URL = 'http://localhost:8080'

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

// Read once when the dev server starts. The environment file is the default;
// per-user overrides live in the browser and are never written back here.
function startupApiUrl() {
  try {
    const fromFile = apiUrlFromEnvFile(readFileSync(ENV_FILE, 'utf8'))
    if (isValidApiUrl(fromFile)) return fromFile
  } catch {
    // No environment file yet; use the fallback below.
  }

  return FALLBACK_API_URL
}

// Mirrors the production container: /config.js serves the default URL read from
// the environment file at startup. A user's override is applied in the browser
// and never touches this server.
function runtimeConfigPlugin() {
  const bootApiUrl = startupApiUrl()

  return {
    name: 'school-admission:runtime-config',
    configureServer(server) {
      server.middlewares.use('/config.js', (req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(`window.__APP_CONFIG__ = ${JSON.stringify({ apiUrl: bootApiUrl })};\n`)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), runtimeConfigPlugin()],
})
