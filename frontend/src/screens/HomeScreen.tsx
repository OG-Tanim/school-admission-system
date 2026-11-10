import { BackendUrlField } from '../components/BackendUrlField'
import { navigate } from '../router'

export default function HomeScreen() {
  return (
    <section className="view" aria-label="Choose your role">
      <h2>Choose your role</h2>
      <p className="hint">Admins manage classes. Students apply for seats and pay the fee.</p>

      <div className="role-cards">
        <button type="button" className="role-card" onClick={() => navigate('/admin')}>
          <span className="role-card-title">School admin</span>
          <span className="role-card-desc">Create classes and watch seat counts.</span>
        </button>
        <button type="button" className="role-card" onClick={() => navigate('/student')}>
          <span className="role-card-title">Student / guardian</span>
          <span className="role-card-desc">Browse classes, apply, and pay.</span>
        </button>
      </div>

      <BackendUrlField />
    </section>
  )
}
