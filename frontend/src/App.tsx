import { useState } from 'react'
import './App.css'
import { ApplicationView } from './components/ApplicationView'
import { BackendUrlField } from './components/BackendUrlField'
import { ClassListView } from './components/ClassListView'
import { CreateClassView } from './components/CreateClassView'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MyApplicationsView } from './components/MyApplicationsView'
import { StudentIdBar } from './components/StudentIdBar'
import { useClasses } from './hooks/useClasses'
import { useMyHolds } from './hooks/useMyHolds'
import { useStudentId } from './hooks/useStudentId'

type Tab = 'classes' | 'create-class' | 'my-applications'

const TABS: ReadonlyArray<{ id: Tab; label: string }> = [
  { id: 'classes', label: 'Classes' },
  { id: 'create-class', label: 'Create Class' },
  { id: 'my-applications', label: 'My Applications' },
]

function App() {
  const { studentId, setStudentId, isValid, error: studentIdError } = useStudentId()
  const [tab, setTab] = useState<Tab>('classes')
  const [active, setActive] = useState<{ holdId: string; className?: string } | null>(null)
  const [viewKey, setViewKey] = useState(0)

  const classesState = useClasses()
  const holdsState = useMyHolds(studentId)

  function openHold(holdId: string, className: string) {
    setActive({ holdId, className })
  }

  function handleHoldCreated(holdId: string, className: string) {
    openHold(holdId, className)
    void classesState.refresh()
    void holdsState.refresh()
  }

  return (
    <main className="app">
      <header>
        <h1>School Admission System</h1>
        <StudentIdBar
          studentId={studentId}
          isValid={isValid}
          error={studentIdError}
          onChange={setStudentId}
        />
        <BackendUrlField />
      </header>

      <ErrorBoundary key={viewKey} onReset={() => setViewKey((value) => value + 1)}>
        {active ? (
          <ApplicationView
            holdId={active.holdId}
            className={active.className}
            studentId={studentId}
            onBack={() => setActive(null)}
            onHoldChanged={() => {
              void classesState.refresh()
              void holdsState.refresh()
            }}
          />
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
              {tab === 'classes' && (
                <ClassListView
                  classes={classesState.classes}
                  loading={classesState.loading}
                  error={classesState.error}
                  studentId={studentId}
                  canApply={isValid}
                  onHoldCreated={handleHoldCreated}
                  onGoToCreate={() => setTab('create-class')}
                />
              )}
              {tab === 'create-class' && (
                <CreateClassView
                  onCreated={() => {
                    void classesState.refresh()
                  }}
                />
              )}
              {tab === 'my-applications' && (
                <MyApplicationsView
                  holds={holdsState.holds}
                  loading={holdsState.loading}
                  error={holdsState.error}
                  canApply={isValid}
                  onOpenHold={openHold}
                  onGoToClasses={() => setTab('classes')}
                />
              )}
            </section>
          </>
        )}
      </ErrorBoundary>
    </main>
  )
}

export default App
