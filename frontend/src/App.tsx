import { lazy, Suspense, useState } from 'react'
import type { ReactNode } from 'react'
import './App.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { navigate, useHashRoute } from './router'
import type { Route } from './router'
import HomeScreen from './screens/HomeScreen'

// Role screens are code-split: a student never downloads the admin form, and
// the landing screen stays in the initial bundle.
const AdminScreen = lazy(() => import('./screens/AdminScreen'))
const StudentScreen = lazy(() => import('./screens/StudentScreen'))
const ApplicationScreen = lazy(() => import('./screens/ApplicationScreen'))
const MyApplicationsScreen = lazy(() => import('./screens/MyApplicationsScreen'))

function roleLabelFor(path: string): string {
  if (path === '/admin') {
    return 'School admin'
  }
  if (path.startsWith('/student') || path.startsWith('/application')) {
    return 'Student'
  }
  return ''
}

function screenFor(route: Route): ReactNode {
  if (route.path === '/') {
    return <HomeScreen />
  }
  if (route.path === '/admin') {
    return <AdminScreen />
  }
  if (route.path === '/student') {
    return <StudentScreen />
  }
  if (route.path === '/student/applications') {
    return <MyApplicationsScreen />
  }
  if (route.segments[0] === 'application' && route.segments[1]) {
    return (
      <ApplicationScreen
        holdId={route.segments[1]}
        classNameFromRoute={route.query.get('class') ?? undefined}
      />
    )
  }

  return (
    <section className="view" aria-label="Page not found">
      <h2>Page not found</h2>
      <button type="button" className="primary-button" onClick={() => navigate('/')}>
        Go home
      </button>
    </section>
  )
}

function App() {
  const route = useHashRoute()
  const [viewKey, setViewKey] = useState(0)
  const role = roleLabelFor(route.path)

  return (
    <main className="app">
      <header>
        <h1>School Admission System</h1>
        {role && <span className="role-badge">{role}</span>}
        {route.path !== '/' && (
          <button type="button" className="nav-link" onClick={() => navigate('/')}>
            Home / change role
          </button>
        )}
      </header>

      <ErrorBoundary
        key={`${route.path}:${viewKey}`}
        onReset={() => setViewKey((value) => value + 1)}
      >
        <Suspense fallback={<p className="hint">Loading…</p>}>{screenFor(route)}</Suspense>
      </ErrorBoundary>
    </main>
  )
}

export default App
