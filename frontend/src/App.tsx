import { useState } from 'react'
import './App.css'
import { BackendUrlField } from './components/BackendUrlField'
import { StudentIdBar } from './components/StudentIdBar'
import { useStudentId } from './hooks/useStudentId'

type Tab = 'classes' | 'create-class' | 'my-applications'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'classes', label: 'Classes' },
  { id: 'create-class', label: 'Create Class' },
  { id: 'my-applications', label: 'My Applications' },
]

function App() {
  const { studentId, setStudentId, isValid, error } = useStudentId()
  const [tab, setTab] = useState<Tab>('classes')
  const [activeHoldId, setActiveHoldId] = useState<string | null>(null)

  return (
    <main className="app">
      <header>
        <h1>School Admission System</h1>
        <StudentIdBar
          studentId={studentId}
          isValid={isValid}
          error={error}
          onChange={setStudentId}
        />
        <BackendUrlField />
      </header>

      {activeHoldId !== null ? (
        <section className="view" aria-label="Application">
          <p>Application details will appear here.</p>
          <button
            type="button"
            className="link-button"
            onClick={() => setActiveHoldId(null)}
          >
            Back
          </button>
        </section>
      ) : (
        <>
          <nav role="tablist" aria-label="Sections" className="tabs">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                className={tab === item.id ? 'tab tab-active' : 'tab'}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="view"
          >
            {tab === 'classes' && <p>Class list and Apply will appear here.</p>}
            {tab === 'create-class' && <p>Create-class form will appear here.</p>}
            {tab === 'my-applications' &&
              (isValid ? (
                <p>Your applications will appear here.</p>
              ) : (
                <p>
                  Enter your 17-digit birth-registration number to apply and to see
                  your applications.
                </p>
              ))}
          </section>
        </>
      )}
    </main>
  )
}

export default App
