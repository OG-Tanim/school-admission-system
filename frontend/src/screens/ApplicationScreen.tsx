import { useCallback } from 'react'
import { ApplicationView } from '../components/ApplicationView'
import { useStudentId } from '../hooks/useStudentId'
import { navigate } from '../router'

export interface ApplicationScreenProps {
  holdId: string
  classNameFromRoute?: string
}

export default function ApplicationScreen({ holdId, classNameFromRoute }: ApplicationScreenProps) {
  const { studentId, isValid } = useStudentId()

  const onBack = useCallback(() => navigate('/student/applications'), [])

  return (
    <ApplicationView
      holdId={holdId}
      className={classNameFromRoute}
      studentId={studentId}
      identityValid={isValid}
      onBack={onBack}
    />
  )
}
