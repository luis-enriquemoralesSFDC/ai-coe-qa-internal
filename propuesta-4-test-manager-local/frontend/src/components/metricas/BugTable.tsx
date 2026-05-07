import clsx from 'clsx'
import { Link2, AlertCircle } from 'lucide-react'

interface Bug {
  id: number
  bug_id?: string
  title: string
  severity: string
  status: string
  environment: string
  sprint_name?: string
  story_id?: number
  linked_case_id?: string
  reporter?: string
  assignee?: string
}

interface Props {
  bugs: Bug[]
  onLinkBug?: (bug: Bug) => void
}

const SEV_CLS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-green-100 text-green-700',
}

const SEV_LABEL: Record<string, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo',
}

const STATUS_CLS: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  resolved:    'bg-green-100 text-green-700',
  rejected:    'bg-gray-100 text-gray-500',
  wont_fix:    'bg-gray-100 text-gray-500',
  in_progress: 'bg-purple-100 text-purple-700',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Abierto', resolved: 'Resuelto', rejected: 'Rechazado',
  wont_fix: 'No aplica', in_progress: 'En progreso',
}

const ENV_CLS: Record<string, string> = {
  qa:   'bg-indigo-100 text-indigo-700',
  uat:  'bg-cyan-100 text-cyan-700',
  sit:  'bg-teal-100 text-teal-700',
  prod: 'bg-red-100 text-red-700',
}

export default function BugTable({ bugs, onLinkBug }: Props) {
  if (bugs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No hay bugs — sube un reporte para verlos aquí</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left">
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">ID</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">Título</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">Severidad</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">Estado</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">Ambiente</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">Sprint</th>
            <th className="py-2 pr-3 font-semibold text-gray-500 text-xs uppercase">HU vinculada</th>
            {onLinkBug && <th className="py-2 font-semibold text-gray-500 text-xs uppercase"></th>}
          </tr>
        </thead>
        <tbody>
          {bugs.map(bug => (
            <tr key={bug.id} className={clsx(
              'border-b border-gray-100 hover:bg-gray-50 transition-colors',
              !bug.story_id && 'bg-yellow-50/40'
            )}>
              <td className="py-2.5 pr-3 font-mono text-xs text-gray-500">{bug.bug_id || `#${bug.id}`}</td>
              <td className="py-2.5 pr-3 max-w-xs">
                <span className="line-clamp-2 text-gray-800">{bug.title}</span>
                {!bug.story_id && (
                  <span className="text-xs text-yellow-600">Sin HU vinculada</span>
                )}
              </td>
              <td className="py-2.5 pr-3">
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', SEV_CLS[bug.severity] || 'bg-gray-100 text-gray-500')}>
                  {SEV_LABEL[bug.severity] || bug.severity}
                </span>
              </td>
              <td className="py-2.5 pr-3">
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLS[bug.status] || 'bg-gray-100 text-gray-500')}>
                  {STATUS_LABEL[bug.status] || bug.status}
                </span>
              </td>
              <td className="py-2.5 pr-3">
                <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', ENV_CLS[bug.environment] || 'bg-gray-100 text-gray-500')}>
                  {bug.environment?.toUpperCase()}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-xs text-gray-500">{bug.sprint_name || '—'}</td>
              <td className="py-2.5 pr-3 text-xs text-gray-500">
                {bug.story_id
                  ? <span className="text-blue-600 font-medium">HU #{bug.story_id}</span>
                  : <span className="text-gray-400">—</span>
                }
              </td>
              {onLinkBug && (
                <td className="py-2.5">
                  <button
                    onClick={() => onLinkBug(bug)}
                    title="Vincular a historia"
                    className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                  >
                    <Link2 className="w-4 h-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
