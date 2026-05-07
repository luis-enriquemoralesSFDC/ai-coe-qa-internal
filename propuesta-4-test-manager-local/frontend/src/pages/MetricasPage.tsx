import { useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bug, ChevronRight, Home, Upload, Trash2, RefreshCw,
  BarChart3, CheckCircle2, XCircle, ShieldAlert, Activity,
  TrendingUp, AlertTriangle, Filter, Loader2, Link2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { projectsApi, kpisApi, storiesApi } from '../api'
import KpiCard from '../components/metricas/KpiCard'
import SeverityChart from '../components/metricas/SeverityChart'
import FpyChart from '../components/metricas/FpyChart'
import BugTable from '../components/metricas/BugTable'

type Tab = 'dashboard' | 'bugs' | 'efectividad'

const SOURCE_OPTIONS = [
  { value: 'csv', label: 'Genérico (CSV)' },
  { value: 'jira', label: 'Jira' },
  { value: 'azure', label: 'Azure DevOps' },
]

interface LinkModal {
  bugId: number
  bugTitle: string
}

export default function MetricasPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [sprintFilter, setSprintFilter] = useState('')
  const [envFilter, setEnvFilter] = useState('')
  const [sevFilter, setSevFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [uploadSprint, setUploadSprint] = useState('')
  const [uploadSource, setUploadSource] = useState('csv')
  const [linkModal, setLinkModal] = useState<LinkModal | null>(null)
  const [linkStoryId, setLinkStoryId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: project } = useQuery({ queryKey: ['project', pid], queryFn: () => projectsApi.get(pid) })

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['kpi-summary', pid],
    queryFn: () => kpisApi.summary(pid),
  })

  const { data: severityData = [] } = useQuery({
    queryKey: ['kpi-severity', pid],
    queryFn: () => kpisApi.severityBySprint(pid),
  })

  const { data: fpyData = [] } = useQuery({
    queryKey: ['kpi-fpy', pid],
    queryFn: () => kpisApi.fpy(pid),
  })

  const { data: effectivenessData = [] } = useQuery({
    queryKey: ['kpi-effectiveness', pid],
    queryFn: () => kpisApi.effectiveness(pid),
  })

  const { data: sprintsData } = useQuery({
    queryKey: ['kpi-sprints', pid],
    queryFn: () => kpisApi.sprints(pid),
  })

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ['kpi-reports', pid],
    queryFn: () => kpisApi.listReports(pid),
  })

  const { data: bugs = [], isLoading: bugsLoading } = useQuery({
    queryKey: ['kpi-bugs', pid, sprintFilter, envFilter, sevFilter, statusFilter],
    queryFn: () => kpisApi.listBugs(pid, {
      sprint: sprintFilter || undefined,
      environment: envFilter || undefined,
      severity: sevFilter || undefined,
      status: statusFilter || undefined,
    }),
  })

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', pid],
    queryFn: () => storiesApi.list(pid),
    enabled: activeTab === 'bugs',
  })

  const sprints: string[] = sprintsData?.sprints || []

  // ── Mutations ─────────────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: (file: File) => kpisApi.uploadReport(pid, file, uploadSprint || undefined, uploadSource),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kpi-'] })
      queryClient.invalidateQueries({ queryKey: ['kpi-summary', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-reports', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-bugs', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-severity', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-sprints', pid] })
      toast.success(`Reporte importado: ${data.bugs_count} bugs cargados`)
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || 'Error al importar'),
  })

  const deleteReportMutation = useMutation({
    mutationFn: (reportId: number) => kpisApi.deleteReport(pid, reportId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-summary', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-reports', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-bugs', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-severity', pid] })
      toast.success('Reporte eliminado')
    },
  })

  const linkMutation = useMutation({
    mutationFn: ({ bugId, storyId }: { bugId: number; storyId: number }) =>
      kpisApi.linkBug(pid, bugId, { story_id: storyId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpi-bugs', pid] })
      queryClient.invalidateQueries({ queryKey: ['kpi-summary', pid] })
      setLinkModal(null)
      setLinkStoryId('')
      toast.success('Bug vinculado a la historia')
    },
    onError: () => toast.error('Error al vincular'),
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file)
    e.target.value = ''
  }

  function handleLinkSubmit() {
    if (!linkModal || !linkStoryId) return
    const storyId = parseInt(linkStoryId)
    if (isNaN(storyId)) return
    linkMutation.mutate({ bugId: linkModal.bugId, storyId })
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const unlinkedCount = bugs.filter((b: any) => !b.story_id).length

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Link to="/" className="hover:text-blue-600 flex items-center gap-1"><Home className="w-3.5 h-3.5" />Inicio</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to="/projects" className="hover:text-blue-600">Proyectos</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${pid}`} className="hover:text-blue-600">{project?.name || '...'}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-800 font-medium">Métricas de Calidad</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Métricas de Calidad</h1>
            <p className="text-sm text-gray-500">{project?.name}</p>
          </div>
        </div>

        {/* Upload CSV */}
        <div className="flex items-center gap-2">
          <select
            value={uploadSource}
            onChange={e => setUploadSource(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            type="text"
            placeholder="Sprint (opcional)"
            value={uploadSprint}
            onChange={e => setUploadSprint(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Subir Reporte
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-6 border-b border-gray-200">
        {([
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'bugs', label: `Bugs ${bugs.length > 0 ? `(${bugs.length})` : ''}`, icon: Bug },
          { id: 'efectividad', label: 'Efectividad por HU', icon: Activity },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={clsx(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── TAB: Dashboard ────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : summary ? (
            <>
              {/* KPI Cards Row 1: Bugs */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Bugs</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Total Bugs" value={summary.total_bugs} icon={Bug} color="red" subtitle="Todos los reportes" />
                  <KpiCard label="Abiertos" value={summary.open_bugs} icon={AlertTriangle} color="orange" />
                  <KpiCard label="Resueltos" value={summary.resolved_bugs} icon={CheckCircle2} color="green" />
                  <KpiCard label="Rechazados" value={summary.rejected_bugs} icon={XCircle} color="neutral" subtitle="Won't fix / Inválidos" />
                </div>
              </div>

              {/* KPI Cards Row 2: Severidad */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Severidad</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="Críticos" value={summary.critical_bugs} icon={ShieldAlert} color="red" />
                  <KpiCard label="Altos" value={summary.high_bugs} icon={AlertTriangle} color="orange" />
                  <KpiCard label="Medios" value={summary.medium_bugs} icon={Activity} color="yellow" />
                  <KpiCard label="Bajos" value={summary.low_bugs} icon={Activity} color="green" />
                </div>
              </div>

              {/* KPI Cards Row 3: Ambientes */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Por Ambiente</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="QA" value={summary.bugs_qa} icon={Bug} color="blue" />
                  <KpiCard label="SIT" value={summary.bugs_sit} icon={Bug} color="purple" />
                  <KpiCard label="UAT" value={summary.bugs_uat} icon={Bug} color="yellow" />
                  <KpiCard label="PROD" value={summary.bugs_prod} icon={Bug} color="red" subtitle="¡Atención!" />
                </div>
              </div>

              {/* KPI Cards Row 4: Calidad */}
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Calidad</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <KpiCard label="First Pass Yield" value={`${summary.fpy_percent}%`} icon={TrendingUp} color={summary.fpy_percent >= 80 ? 'green' : 'orange'} subtitle="Casos aprobados 1er intento" />
                  <KpiCard label="TC Effectiveness" value={`${summary.tc_effectiveness}%`} icon={Activity} color="blue" subtitle="Bugs vinculados / total casos" />
                  <KpiCard label="Casos Aprobados" value={summary.pass_test_cases} icon={CheckCircle2} color="green" subtitle={`de ${summary.total_test_cases} totales`} />
                  <KpiCard label="Casos Fallidos" value={summary.fail_test_cases} icon={XCircle} color="red" />
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-4">Bug Severity por Sprint</h3>
                  <SeverityChart data={severityData} />
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-1">First Pass Yield por Sprint</h3>
                  <p className="text-xs text-gray-400 mb-4">Meta recomendada: 80%</p>
                  <FpyChart data={fpyData} />
                </div>
              </div>

              {/* Reportes subidos */}
              {reports.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-800 mb-3">Reportes importados</h3>
                  <div className="space-y-2">
                    {reports.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{r.filename}</p>
                          <p className="text-xs text-gray-500">
                            {r.source?.toUpperCase()} · {r.bugs_count} bugs
                            {r.sprint_name && ` · Sprint: ${r.sprint_name}`}
                            {' · '}{new Date(r.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteReportMutation.mutate(r.id)}
                          disabled={deleteReportMutation.isPending}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-gray-400">
              <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-gray-600">Sin métricas aún</p>
              <p className="text-sm mt-1">Sube un reporte de bugs para comenzar a ver tus KPIs</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Bugs ─────────────────────────────────────────────────────────── */}
      {activeTab === 'bugs' && (
        <div className="space-y-4">
          {/* Aviso de bugs sin vincular */}
          {unlinkedCount > 0 && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span><strong>{unlinkedCount} bug{unlinkedCount > 1 ? 's' : ''}</strong> sin historia vinculada. Usa el botón <Link2 className="inline w-3.5 h-3.5" /> para asignarlos manualmente.</span>
            </div>
          )}

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-4 h-4 text-gray-400" />
            <select value={sprintFilter} onChange={e => setSprintFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los sprints</option>
              {sprints.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={envFilter} onChange={e => setEnvFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los ambientes</option>
              {['qa', 'uat', 'sit', 'prod'].map(e => <option key={e} value={e}>{e.toUpperCase()}</option>)}
            </select>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Toda severidad</option>
              {['critical', 'high', 'medium', 'low'].map(s => (
                <option key={s} value={s}>{{ critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo' }[s]}</option>
              ))}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los estados</option>
              {['open', 'resolved', 'rejected', 'in_progress'].map(s => (
                <option key={s} value={s}>{{ open: 'Abierto', resolved: 'Resuelto', rejected: 'Rechazado', in_progress: 'En progreso' }[s]}</option>
              ))}
            </select>
            {(sprintFilter || envFilter || sevFilter || statusFilter) && (
              <button onClick={() => { setSprintFilter(''); setEnvFilter(''); setSevFilter(''); setStatusFilter('') }}
                className="text-xs text-gray-500 hover:text-red-500 flex items-center gap-1">
                <RefreshCw className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-5">
            {bugsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
              <BugTable bugs={bugs} onLinkBug={(bug) => setLinkModal({ bugId: bug.id, bugTitle: bug.title })} />
            )}
          </div>
        </div>
      )}

      {/* ── TAB: Efectividad ──────────────────────────────────────────────────── */}
      {activeTab === 'efectividad' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-left font-semibold text-xs text-gray-500 uppercase">Historia</th>
                <th className="py-3 px-4 text-left font-semibold text-xs text-gray-500 uppercase">Sprint</th>
                <th className="py-3 px-4 text-center font-semibold text-xs text-gray-500 uppercase">Criterios AC</th>
                <th className="py-3 px-4 text-center font-semibold text-xs text-gray-500 uppercase">Casos TC</th>
                <th className="py-3 px-4 text-center font-semibold text-xs text-gray-500 uppercase">Bugs</th>
                <th className="py-3 px-4 text-center font-semibold text-xs text-gray-500 uppercase">Efectividad</th>
              </tr>
            </thead>
            <tbody>
              {effectivenessData.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-gray-400">Sin datos disponibles</td></tr>
              ) : effectivenessData.map((row: any) => (
                <tr key={row.story_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <Link to={`/projects/${pid}/stories/${row.story_id}`}
                      className="text-blue-600 hover:underline line-clamp-1 max-w-xs">{row.story_title}</Link>
                  </td>
                  <td className="py-3 px-4 text-gray-500 text-xs">{row.sprint || '—'}</td>
                  <td className="py-3 px-4 text-center font-mono">{row.acceptance_criteria_count}</td>
                  <td className="py-3 px-4 text-center font-mono">{row.total_cases}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={clsx('font-semibold', row.bugs_found > 0 ? 'text-red-600' : 'text-green-600')}>
                      {row.bugs_found}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium',
                      row.effectiveness === 0 ? 'bg-green-100 text-green-700' :
                      row.effectiveness < 20 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {row.effectiveness}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Vincular bug a historia ───────────────────────────────────── */}
      {linkModal && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setLinkModal(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h3 className="font-bold text-gray-900 mb-1">Vincular bug a historia</h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">{linkModal.bugTitle}</p>
              <label className="block text-sm font-medium text-gray-700 mb-1">Historia de usuario</label>
              <select
                value={linkStoryId}
                onChange={e => setLinkStoryId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              >
                <option value="">Seleccionar historia...</option>
                {(stories as any[]).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.external_id ? `[${s.external_id}] ` : ''}{s.title}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setLinkModal(null)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button
                  onClick={handleLinkSubmit}
                  disabled={!linkStoryId || linkMutation.isPending}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {linkMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Vincular
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
