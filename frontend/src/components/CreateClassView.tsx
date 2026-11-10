import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, createClass } from '../api/client'
import { ErrorBanner } from './ErrorBanner'

export interface CreateClassViewProps {
  onCreated: () => void
}

export function CreateClassView({ onCreated }: CreateClassViewProps) {
  const [name, setName] = useState('')
  const [totalSeats, setTotalSeats] = useState('')
  const [nameError, setNameError] = useState('')
  const [seatsError, setSeatsError] = useState('')
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameError('')
    setSeatsError('')
    setFormError('')
    setNotice('')

    const trimmedName = name.trim()
    const trimmedSeats = totalSeats.trim()
    let invalid = false

    if (!trimmedName) {
      setNameError('Enter the class name.')
      invalid = true
    } else if (trimmedName.length > 200) {
      setNameError('Class name must be 200 characters or fewer.')
      invalid = true
    }

    if (!/^\d+$/.test(trimmedSeats) || Number(trimmedSeats) < 1) {
      setSeatsError('Enter a whole number of seats greater than 0.')
      invalid = true
    }

    if (invalid) {
      return
    }

    setPending(true)
    try {
      const created = await createClass({
        name: trimmedName,
        totalSeats: Number(trimmedSeats),
      })
      setName('')
      setTotalSeats('')
      setNotice(`Class created: ${created.name}`)
      onCreated()
    } catch (createError) {
      if (createError instanceof ApiError && createError.status === 409) {
        setNameError(createError.message)
      } else {
        setFormError(
          createError instanceof Error ? createError.message : 'Could not create the class.',
        )
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="create-class"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      <h2>Create Class</h2>
      <div className="field">
        <label htmlFor="class-name">Class name</label>
        <input
          id="class-name"
          type="text"
          value={name}
          maxLength={200}
          autoComplete="off"
          placeholder="Class 6 - Morning Shift"
          onChange={(event) => setName(event.target.value)}
        />
        {nameError && (
          <p className="field-error" role="alert">
            {nameError}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="class-seats">Total seats</label>
        <input
          id="class-seats"
          type="number"
          min={1}
          step={1}
          value={totalSeats}
          placeholder="120"
          onChange={(event) => setTotalSeats(event.target.value)}
        />
        {seatsError && (
          <p className="field-error" role="alert">
            {seatsError}
          </p>
        )}
      </div>
      {formError && <ErrorBanner message={formError} />}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create class'}
      </button>
    </form>
  )
}
