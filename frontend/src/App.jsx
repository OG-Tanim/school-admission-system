import { useState } from 'react'
import './App.css'
import { getApiUrl, isValidApiUrl, saveApiUrl } from './api/config'

function App() {
  const apiUrl = getApiUrl()
  const [draftUrl, setDraftUrl] = useState(apiUrl)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSave(event) {
    event.preventDefault()

    if (!isValidApiUrl(draftUrl)) {
      setNotice('')
      setError('Enter a full http:// or https:// URL, for example http://localhost:8080.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')

    try {
      const saved = await saveApiUrl(draftUrl)
      setDraftUrl(saved)
      setNotice(
        `Saved ${saved} to the environment file. Restart the frontend container to connect to it.`,
      )
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app">
      <h1>School Admission System</h1>
      <p className="tagline">Monorepo scaffolding is ready.</p>

      <form className="api-config" onSubmit={handleSave}>
        <label htmlFor="api-url">Backend URL</label>
        <div className="api-config-row">
          <input
            id="api-url"
            type="text"
            inputMode="url"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            spellCheck={false}
            autoComplete="url"
          />
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <p className="api-config-hint">
          In use: <code>{apiUrl}</code> · saved to <code>.env</code>, applied after the
          frontend restarts.
        </p>
        {error && (
          <p className="api-config-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="api-config-notice" role="status">
            {notice}
          </p>
        )}
      </form>

      <dl className="details">
        <div>
          <dt>Frontend</dt>
          <dd>React + Vite</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>.NET + EF Core</dd>
        </div>
        <div>
          <dt>API URL</dt>
          <dd>
            <code>{apiUrl}</code>
          </dd>
        </div>
      </dl>

      <p className="next">Admission screens and API endpoints come next.</p>
    </main>
  )
}

export default App
