import { CheckCircle2, Edit3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TestPlanListItem } from '../api'

interface Props {
  status: TestPlanListItem['status']
}

export default function TestPlanStatusBadge({ status }: Props) {
  const { t } = useTranslation()
  if (status === 'generated') {
    return (
      <span className="slds-badge slds-badge-success inline-flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3" /> {t('test_plan_status.generated')}
      </span>
    )
  }
  return (
    <span className="slds-badge slds-badge-warning inline-flex items-center gap-1">
      <Edit3 className="w-3 h-3" /> {t('test_plan_status.draft')}
    </span>
  )
}
