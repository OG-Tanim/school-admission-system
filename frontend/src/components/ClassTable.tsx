import type { ReactNode } from 'react'
import type { ClassSummary } from '../api/types'

export interface ClassTableProps {
  classes: ClassSummary[]
  // Optional trailing action cell. When omitted the table is read-only, which
  // is what the school-admin screen needs.
  renderAction?: (admissionClass: ClassSummary) => ReactNode
}

// The single source of truth for the seat-status table, shared by the admin
// (read-only) and student (Apply) screens so the two can never disagree.
export function ClassTable({ classes, renderAction }: ClassTableProps) {
  return (
    <table className="class-table">
      <thead>
        <tr>
          <th scope="col">Class</th>
          <th scope="col">Total</th>
          <th scope="col">Held</th>
          <th scope="col">Confirmed</th>
          <th scope="col">Available</th>
          {renderAction && (
            <th scope="col">
              <span className="visually-hidden">Actions</span>
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {classes.map((admissionClass) => (
          <tr key={admissionClass.id}>
            <td>{admissionClass.name}</td>
            <td>{admissionClass.totalSeats}</td>
            <td>{admissionClass.heldSeats}</td>
            <td>{admissionClass.confirmedSeats}</td>
            <td>{admissionClass.availableSeats}</td>
            {renderAction && <td>{renderAction(admissionClass)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
