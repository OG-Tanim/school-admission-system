import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { FALLBACK_API_URL, apiUrlFromEnvFile, isValidApiUrl } from './lib/apiUrl.ts'

const ENV_FILE = fileURLToPath(new URL('../config/api-url.env', import.meta.url))

// Read once when the dev server starts. The environment file is the default;
// per-user overrides live in the browser and are never written back here.
function startupApiUrl(): string {
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
function runtimeConfigPlugin(): Plugin {
  const bootApiUrl = startupApiUrl()

  return {
    name: 'school-admission:runtime-config',
    configureServer(server) {
      server.middlewares.use('/config.js', (_req, res) => {
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
