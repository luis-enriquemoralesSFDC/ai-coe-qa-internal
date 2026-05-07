import { CheckCircle2, Edit3 } from 'lucide-react'
import type { TestPlanListItem } from '../api'

interface Props {
  status: TestPlanListItem['status']
}

export default function TestPlanStatusBadge({ status }: Props) {
  if (status === 'generated') {
    return (
      <span className="slds-badge slds-badge-success inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> Generado
      </span>
    )
  }
  return (
    <span className="slds-badge slds-badge-warning inline-flex items-center gap-1">
      <Edit3 className="w-3 h-3" /> Borrador
    </span>
  )
}
