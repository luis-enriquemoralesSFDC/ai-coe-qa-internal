import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

interface FpyRow {
  sprint: string
  total: number
  passed: number
  fpy_percent: number
}

interface Props {
  data: FpyRow[]
}

export default function FpyChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Sin datos — asigna sprints a tus historias para ver el FPY
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="sprint" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(v) => [`${v}%`, 'FPY']}
          contentStyle={{ fontSize: 12 }}
          labelFormatter={(l) => `Sprint: ${l}`}
        />
        <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'Meta 80%', position: 'right', fontSize: 11, fill: '#16a34a' }} />
        <Line
          type="monotone"
          dataKey="fpy_percent"
          stroke="#2563eb"
          strokeWidth={2}
          dot={{ r: 4, fill: '#2563eb' }}
          activeDot={{ r: 6 }}
          name="FPY"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
