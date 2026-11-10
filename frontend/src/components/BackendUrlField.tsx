import { useState } from 'react'
import type { FormEvent } from 'react'
import { getStartupApiUrl, isValidApiUrl, resetApiUrl, setApiUrl } from '../api/config'
import { useBackendUrl } from '../hooks/useBackendUrl'

const startupApiUrl = getStartupApiUrl()

export function BackendUrlField() {
  const activeUrl = useBackendUrl()
  const [draftUrl, setDraftUrl] = useState(activeUrl)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isOverridden = activeUrl !== startupApiUrl

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = draftUrl.trim()
    if (!trimmed) {
      setNotice('')
      setError('Please enter the backend URL.')
      return
    }

    if (!isValidApiUrl(trimmed)) {
      setNotice('')
      setError(
        'Enter a full URL starting with http:// or https://, for example http://localhost:8080.',
      )
      return
    }

    try {
      const saved = setApiUrl(trimmed)
      setDraftUrl(saved)
      setError('')
      setNotice(
        saved === startupApiUrl
          ? `Now routing requests to ${saved}, which matches the environment default.`
          : `Backend URL changed to ${saved}. It applies immediately and is saved in this browser for next time.`,
      )
    } catch (saveError) {
      setNotice('')
      setError(saveError instanceof Error ? saveError.message : 'Could not save the backend URL.')
    }
  }

  function handleReset() {
    const restored = resetApiUrl()
    setDraftUrl(restored)
    setError('')
    setNotice(`Backend URL reset to the environment default: ${restored}.`)
  }

  return (
    <form className="api-config" onSubmit={handleSave}>
      <label htmlFor="api-url">Backend URL</label>
      <div className="api-config-row">
        <input
          id="api-url"
          type="text"
          inputMode="url"
          value={draftUrl}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="http://localhost:8080"
          spellCheck={false}
          autoComplete="url"
        />
        <button type="submit">Apply</button>
      </div>
      <p className="api-config-hint">
        In use: <code>{activeUrl}</code> · environment default:{' '}
        <code>{startupApiUrl}</code>
      </p>
      {isOverridden && (
        <p className="api-config-hint">
          This is a personal override stored in this browser; it does not change the
          environment file or anyone else&apos;s session.{' '}
          <button type="button" className="link-button" onClick={handleReset}>
            Reset to default
          </button>
        </p>
      )}
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
  )
}
