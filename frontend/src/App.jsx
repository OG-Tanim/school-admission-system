import './App.css'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

function App() {
  return (
    <main className="app">
      <h1>School Admission System</h1>
      <p className="tagline">Monorepo scaffolding is ready.</p>

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
