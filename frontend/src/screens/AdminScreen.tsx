import { ClassTable } from '../components/ClassTable'
import { CreateClassView } from '../components/CreateClassView'
import { ErrorBanner } from '../components/ErrorBanner'
import { useClasses } from '../hooks/useClasses'
import { usePageVisible } from '../hooks/usePageVisible'

export default function AdminScreen() {
  const pageVisible = usePageVisible()
  const classesState = useClasses({ enabled: pageVisible })

  let classList
  if (classesState.classes.length > 0) {
    classList = <ClassTable classes={classesState.classes} />
  } else if (classesState.loading) {
    classList = <p className="hint">Loading classes…</p>
  } else {
    classList = <p>No classes have been created yet.</p>
  }

  return (
    <section className="view" aria-label="School admin">
      <CreateClassView
        onCreated={() => {
          void classesState.refresh()
        }}
      />

      <div className="class-list-block">
        <h2>Classes already created</h2>
        {classesState.error && <ErrorBanner message={classesState.error} />}
        {classList}
      </div>
    </section>
  )
}
