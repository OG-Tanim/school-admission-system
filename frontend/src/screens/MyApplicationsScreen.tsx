import { MyApplicationsView } from '../components/MyApplicationsView'
import { useMyHolds } from '../hooks/useMyHolds'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStudentId } from '../hooks/useStudentId'
import { navigate } from '../router'

export default function MyApplicationsScreen() {
  const { studentId, isValid } = useStudentId()
  const pageVisible = usePageVisible()
  const holdsState = useMyHolds(studentId, { enabled: pageVisible })

  return (
    <section className="view" aria-label="My applications">
      <div className="view-header">
        <h2>My applications</h2>
        <button type="button" className="link-button" onClick={() => navigate('/student')}>
          Back to classes
        </button>
      </div>

      <MyApplicationsView
        holds={holdsState.holds}
        loading={holdsState.loading}
        error={holdsState.error}
        canApply={isValid}
        onOpenHold={(holdId, className) =>
          navigate(
            `/application/${encodeURIComponent(holdId)}?class=${encodeURIComponent(className)}`,
          )
        }
        onGoToClasses={() => navigate('/student')}
      />
    </section>
  )
}
