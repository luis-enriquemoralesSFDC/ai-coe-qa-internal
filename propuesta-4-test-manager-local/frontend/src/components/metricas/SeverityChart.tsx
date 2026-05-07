import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

interface SeverityRow {
  sprint: string
  severity: string
  count: number
}

interface Props {
  data: SeverityRow[]
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#16a34a',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítico',
  high:     'Alto',
  medium:   'Medio',
  low:      'Bajo',
}

export default function SeverityChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sin datos — importa un reporte de bugs para ver esta gráfica
      </div>
    )
  }

  // Pivotear: [{sprint, critical:n, high:n, medium:n, low:n}]
  const sprintMap: Record<string, Record<string, number>> = {}
  for (const row of data) {
    if (!sprintMap[row.sprint]) sprintMap[row.sprint] = {}
    sprintMap[row.sprint][row.severity] = (sprintMap[row.sprint][row.severity] || 0) + row.count
  }
  const chartData = Object.entries(sprintMap).map(([sprint, counts]) => ({ sprint, ...counts }))
  const severities = [...new Set(data.map(r => r.severity))]

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value, name) => [value, SEVERITY_LABELS[name as string] || name]}
          contentStyle={{ fontSize: 12 }}
        />
        <Legend formatter={(v) => SEVERITY_LABELS[v] || v} />
        {severities.map(sev => (
          <Bar key={sev} dataKey={sev} stackId="a" fill={SEVERITY_COLORS[sev] || '#94a3b8'} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
