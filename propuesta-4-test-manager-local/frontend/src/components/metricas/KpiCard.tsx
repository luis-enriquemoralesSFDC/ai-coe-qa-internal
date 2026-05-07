import clsx from 'clsx'
import { LucideIcon } from 'lucide-react'

interface KpiCardProps {
  label: string
  value: number | string
  subtitle?: string
  icon: LucideIcon
  color: 'blue' | 'red' | 'green' | 'yellow' | 'orange' | 'purple' | 'neutral'
  trend?: 'up' | 'down' | 'neutral'
}

const COLOR_MAP = {
  blue:    { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',   value: 'text-blue-700' },
  red:     { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',     value: 'text-red-700' },
  green:   { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600', value: 'text-green-700' },
  yellow:  { bg: 'bg-yellow-50', icon: 'bg-yellow-100 text-yellow-600', value: 'text-yellow-700' },
  orange:  { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', value: 'text-orange-700' },
  purple:  { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', value: 'text-purple-700' },
  neutral: { bg: 'bg-gray-50',   icon: 'bg-gray-100 text-gray-600',   value: 'text-gray-700' },
}

export default function KpiCard({ label, value, subtitle, icon: Icon, color, trend }: KpiCardProps) {
  const c = COLOR_MAP[color]
  return (
    <div className={clsx('rounded-lg border border-gray-200 p-4 flex items-start gap-3', c.bg)}>
      <div className={clsx('rounded-lg p-2.5 flex-shrink-0', c.icon)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide truncate">{label}</p>
        <p className={clsx('text-2xl font-bold mt-0.5', c.value)}>{value}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
