import { useState } from 'react'
import './App.css'
import {
  getApiUrl,
  getDefaultApiUrl,
  isValidApiUrl,
  resetApiUrl,
  setApiUrl,
} from './api/config'

function App() {
  const [draftUrl, setDraftUrl] = useState(getApiUrl)
  const [apiUrl, setActiveUrl] = useState(getApiUrl)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const defaultUrl = getDefaultApiUrl()
  const usingDefault = apiUrl === defaultUrl

  function handleSave(event) {
    event.preventDefault()
    if (!isValidApiUrl(draftUrl)) {
      setNotice('')
      setError('Enter a full http:// or https:// URL, for example http://localhost:8080.')
      return
    }

    const saved = setApiUrl(draftUrl)
    setDraftUrl(saved)
    setActiveUrl(saved)
    setError('')
    setNotice(`Requests now go to ${saved}.`)
  }

  function handleReset() {
    const saved = resetApiUrl()
    setDraftUrl(saved)
    setActiveUrl(saved)
    setError('')
    setNotice(`Reset to the server-provided backend URL (${saved}).`)
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
          <button type="submit">Use</button>
        </div>
        <p className="api-config-hint">
          Server default: <code>{defaultUrl}</code>{' '}
          {usingDefault ? '(in use)' : '(overridden in this browser)'}
          {!usingDefault && (
            <>
              {' · '}
              <button type="button" className="link-button" onClick={handleReset}>
                Reset to default
              </button>
            </>
          )}
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
