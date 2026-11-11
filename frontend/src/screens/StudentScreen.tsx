import { ClassListView } from '../components/ClassListView'
import { StudentIdBar } from '../components/StudentIdBar'
import { useClasses } from '../hooks/useClasses'
import { usePageVisible } from '../hooks/usePageVisible'
import { useStudentId } from '../hooks/useStudentId'
import { navigate } from '../router'

export default function StudentScreen() {
  const { studentId, setStudentId, isValid, error } = useStudentId()
  const pageVisible = usePageVisible()
  const classesState = useClasses({ enabled: pageVisible })

  return (
    <section className="student-screen" aria-label="Student">
      <StudentIdBar studentId={studentId} isValid={isValid} error={error} onChange={setStudentId} />

      <div className="classes-panel">
        <div className="view-header">
          <h2>Classes</h2>
          <button
            type="button"
            className="nav-link"
            onClick={() => navigate('/student/applications')}
          >
            My applications
          </button>
        </div>

        <ClassListView
          classes={classesState.classes}
          loading={classesState.loading}
          error={classesState.error}
          studentId={studentId}
          canApply={isValid}
          onHoldCreated={(holdId, className) =>
            navigate(
              `/application/${encodeURIComponent(holdId)}?class=${encodeURIComponent(className)}`,
            )
          }
        />
      </div>
    </section>
  )
}
