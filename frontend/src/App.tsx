import './App.css'
import { BackendUrlField } from './components/BackendUrlField'
import { StudentIdBar } from './components/StudentIdBar'
import { useStudentId } from './hooks/useStudentId'
import { useBackendUrl } from './hooks/useBackendUrl'

function App() {
  const { studentId, setStudentId, isValid, error } = useStudentId()
  const activeUrl = useBackendUrl()

  return (
    <main className="app">
      <h1>School Admission System</h1>
      <p className="tagline">Monorepo scaffolding is ready.</p>

      <StudentIdBar
        studentId={studentId}
        isValid={isValid}
        error={error}
        onChange={setStudentId}
      />

      <BackendUrlField />

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
            <code>{activeUrl}</code>
          </dd>
        </div>
      </dl>

      <p className="next">Admission screens and API endpoints come next.</p>
    </main>
  )
}

export default App
