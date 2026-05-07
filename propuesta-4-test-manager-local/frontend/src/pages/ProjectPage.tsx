import { useState, useRef, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Download, Upload, Brain, ChevronRight,
  FileText, CheckCircle2, X, Loader2, FolderOpen, FileUp,
  MoreHorizontal, Zap, Home, BarChart3, Sliders, Sparkles, Edit3,
  ChevronDown, Bot, ListChecks, Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  projectsApi, storiesApi, exportApi, testPlansApi,
  emptyWizardData, type TestPlanListItem,
} from '../api'
import clsx from 'clsx'
import TestPlanStatusBadge from '../components/TestPlanStatusBadge'
import ProjectChatDrawer from '../components/ProjectChatDrawer'

function showApiError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail
  if (err?.response?.status === 429 && typeof detail === 'object') {
    const spent = detail.spent_usd?.toFixed?.(4) ?? detail.spent_usd
    const budget = detail.budget_usd?.toFixed?.(2) ?? detail.budget_usd
    toast.error(`Cuota mensual excedida: $${spent} de $${budget}. ${detail.hint || ''}`)
    return
  }
  toast.error(typeof detail === 'string' ? detail : fallback)
}

interface Story {
  id: number
  title: string
  description?: string
  acceptance_criteria?: string
  external_id?: string
  source: string
  invest_score?: number
  test_cases_count: number
}

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual', jira: 'Jira', azure: 'Azure DevOps', csv: 'CSV', documento: 'Documento',
}

function InvestPill({ score }: { score?: number }) {
  if (score == null) return <span className="slds-badge slds-badge-neutral">Sin analizar</span>
  if (score >= 7) return <span className="slds-badge slds-badge-success">INVEST {score.toFixed(1)}</span>
  if (score >= 4) return <span className="slds-badge slds-badge-warning">INVEST {score.toFixed(1)}</span>
  return <span className="slds-badge slds-badge-error">INVEST {score.toFixed(1)}</span>
}

// Botón con dropdown que ofrece 2 modos para arrancar un Test Plan:
// - Formulario clásico (10 pasos).
// - Chat conversacional (crea un draft vacío y abre el QA Coach).
function NewTestPlanButton({
  projectId,
  variant = 'default',
  label = 'Nuevo Test Plan',
}: {
  projectId: number
  variant?: 'default' | 'compact'
  label?: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  function handleStartForm() {
    setOpen(false)
    navigate(`/projects/${projectId}/test-plans/new`)
  }

  async function handleStartChat() {
    if (creating) return
    setCreating(true)
    try {
      const plan = await testPlansApi.create(projectId, emptyWizardData())
      queryClient.invalidateQueries({ queryKey: ['test-plans', projectId] })
      setOpen(false)
      navigate(`/projects/${projectId}/test-plans/${plan.id}/coach`)
    } catch (err) {
      showApiError(err, 'No se pudo iniciar el chat')
    } finally {
      setCreating(false)
    }
  }

  const isCompact = variant === 'compact'

  return (
    <div ref={containerRef} className={clsx('relative', isCompact ? 'inline-flex' : 'inline-block')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={creating}
        aria-haspopup="menu"
        aria-expanded={open}
        className={clsx(
          'slds-btn-brand text-xs flex items-center gap-1.5',
          isCompact && 'inline-flex',
        )}
      >
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {label}
        <ChevronDown className={clsx('w-3 h-3 -mr-0.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-72 bg-white border border-slds-neutral-4 rounded-slds shadow-lg z-30 overflow-hidden"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleStartForm}
            className="w-full text-left px-3 py-2.5 hover:bg-slds-neutral-1 flex items-start gap-2.5 transition-colors"
          >
            <ListChecks className="w-4 h-4 text-slds-brand mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slds-neutral-10">Empezar con formulario</div>
              <div className="text-xs text-slds-neutral-7 mt-0.5 leading-snug">
                10 pasos guiados. Vos controlás cada campo a mano.
              </div>
            </div>
          </button>
          <div className="border-t border-slds-neutral-3" />
          <button
            type="button"
            role="menuitem"
            onClick={handleStartChat}
            disabled={creating}
            className="w-full text-left px-3 py-2.5 hover:bg-slds-neutral-1 flex items-start gap-2.5 transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            <Bot className="w-4 h-4 text-slds-brand mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slds-neutral-10 flex items-center gap-1.5">
                Empezar con chat
                <span className="slds-badge slds-badge-brand text-[10px] px-1.5 py-0">Nuevo</span>
              </div>
              <div className="text-xs text-slds-neutral-7 mt-0.5 leading-snug">
                El QA Coach te guía conversando, llena los datos por vos.
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const id = Number(projectId)
  const queryClient = useQueryClient()

  const [showForm, setShowForm]           = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [showFileImport, setShowFileImport] = useState(false)
  const [title, setTitle]                 = useState('')
  const [description, setDescription]     = useState('')
  const [acceptance, setAcceptance]       = useState('')
  const [externalId, setExternalId]       = useState('')
  const [analyzingId, setAnalyzingId]     = useState<number | null>(null)
  const [generatingId, setGeneratingId]   = useState<number | null>(null)
  const [deletingId, setDeletingId]       = useState<number | null>(null)
  const [generatingBatch, setGeneratingBatch] = useState(false)
  const [importText, setImportText]       = useState('')
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([])
  const [uploadResults, setUploadResults] = useState<{ name: string; ok: boolean; error?: string }[]>([])
  const [maxCases, setMaxCases]           = useState<string>('')  // string vacío = IA decide
  const fileInputRef = useRef<HTMLInputElement>(null)

  function parsedMaxCases(): number | null {
    if (!maxCases.trim()) return null
    const n = parseInt(maxCases, 10)
    if (isNaN(n) || n < 1 || n > 30) return null
    return n
  }

  const { data: project } = useQuery({ queryKey: ['project', id], queryFn: () => projectsApi.get(id) })
  const { data: stories = [], isLoading } = useQuery<Story[]>({
    queryKey: ['stories', id],
    queryFn: () => storiesApi.list(id),
  })
  const { data: plans = [], isLoading: plansLoading } = useQuery<TestPlanListItem[]>({
    queryKey: ['test-plans', id],
    queryFn: () => testPlansApi.list(id),
  })

  const createMutation = useMutation({
    mutationFn: (data: object) => storiesApi.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      toast.success('Historia agregada')
      setShowForm(false)
      setTitle(''); setDescription(''); setAcceptance(''); setExternalId('')
    },
  })

  async function handleAnalyze(storyId: number) {
    setAnalyzingId(storyId)
    try {
      await storiesApi.analyzeInvest(id, storyId)
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      toast.success('Análisis INVEST completado')
    } catch (err) {
      showApiError(err, 'Error al analizar')
    } finally { setAnalyzingId(null) }
  }

  async function handleGenerate(storyId: number) {
    setGeneratingId(storyId)
    try {
      await storiesApi.generateTestCases(id, storyId, parsedMaxCases())
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      const n = parsedMaxCases()
      toast.success(n ? `${n} casos generados` : 'Casos generados')
    } catch (err) {
      showApiError(err, 'Error al generar')
    } finally { setGeneratingId(null) }
  }

  async function handleDelete(storyId: number, storyTitle: string) {
    const ok = window.confirm(
      `¿Borrar la HU "${storyTitle}"? Esta acción no se puede deshacer (se eliminan también sus casos de prueba).`
    )
    if (!ok) return
    setDeletingId(storyId)
    try {
      await storiesApi.delete(id, storyId)
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      toast.success('HU borrada')
    } catch (err) {
      showApiError(err, 'Error al borrar')
    } finally { setDeletingId(null) }
  }

  async function handleGenerateAll() {
    const withoutCases = stories.filter(s => s.test_cases_count === 0)
    if (!withoutCases.length) { toast('Todas las historias ya tienen casos', { icon: 'ℹ️' }); return }
    setGeneratingBatch(true)
    try {
      const result = await storiesApi.generateBatch(id, withoutCases.map(s => s.id), parsedMaxCases())
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      toast.success(`${result.total_cases_created} casos generados para ${result.processed} historias`)
    } catch (err) {
      showApiError(err, 'Error al generar en lote')
    } finally { setGeneratingBatch(false) }
  }

  async function handleExcel() {
    try {
      const blob = await exportApi.excel(id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `casos_prueba_${project?.name || 'proyecto'}.xlsx`; a.click()
      URL.revokeObjectURL(url); toast.success('Archivo descargado')
    } catch { toast.error('Error al exportar') }
  }

  async function handleImport() {
    try {
      const lines = importText.trim().split('\n').filter(Boolean)
      const items = lines.map(line => {
        const p = line.split('|').map(x => x.trim())
        return { external_id: p[0] || '', title: p[1] || p[0] || '', description: p[2] || '', acceptance_criteria: p[3] || '' }
      })
      await storiesApi.bulkImport(id, items, 'csv')
      queryClient.invalidateQueries({ queryKey: ['stories', id] })
      toast.success(`${items.length} historias importadas`)
      setShowImport(false); setImportText('')
    } catch { toast.error('Error al importar') }
  }

  async function handleFileUpload(files: FileList) {
    const arr = Array.from(files)
    setUploadResults([])
    setUploadingFiles(arr.map(f => f.name))
    const results: { name: string; ok: boolean; error?: string }[] = []
    for (const file of arr) {
      try {
        await storiesApi.importFile(id, file)
        results.push({ name: file.name, ok: true })
      } catch (err: any) {
        results.push({ name: file.name, ok: false, error: err.response?.data?.detail || 'Error' })
      }
    }
    setUploadingFiles([])
    setUploadResults(results)
    queryClient.invalidateQueries({ queryKey: ['stories', id] })
    const ok = results.filter(r => r.ok).length
    if (ok > 0) toast.success(`${ok} historia${ok > 1 ? 's' : ''} importada${ok > 1 ? 's' : ''}`)
  }

  const stats = [
    { label: 'Historias', value: stories.length, icon: FileText, color: 'text-slds-brand', bg: 'bg-blue-50' },
    { label: 'Con casos', value: stories.filter(s => s.test_cases_count > 0).length, icon: CheckCircle2, color: 'text-slds-success', bg: 'bg-green-50' },
    { label: 'Analizadas', value: stories.filter(s => s.invest_score != null).length, icon: Brain, color: 'text-purple-600', bg: 'bg-purple-50' },
    { label: 'Casos totales', value: stories.reduce((a, s) => a + s.test_cases_count, 0), icon: CheckCircle2, color: 'text-slds-warning', bg: 'bg-orange-50' },
  ]

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand">
          <Home className="w-3 h-3" /> Inicio
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">{project?.name}</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10">{project?.name}</h1>
          {project?.description && (
            <p className="text-sm text-slds-neutral-7 mt-0.5">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          {/* Input de configuración: máximo de casos por HU al generar con IA */}
          <div
            className="flex items-center gap-1.5 bg-white border border-slds-neutral-4 rounded-slds px-2 py-1"
            title="Cantidad de casos de prueba que la IA generará por cada HU. Vacío = la IA decide (3-5 típicos)."
          >
            <Sliders className="w-3.5 h-3.5 text-slds-neutral-7" />
            <label htmlFor="max-cases" className="text-xs text-slds-neutral-7 select-none">
              Máx casos/HU
            </label>
            <input
              id="max-cases"
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={maxCases}
              onChange={(e) => setMaxCases(e.target.value)}
              placeholder="auto"
              className="w-14 text-xs text-center border border-slds-neutral-4 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-slds-brand"
            />
          </div>

          <button onClick={() => setShowFileImport(true)} className="slds-btn-neutral text-xs">
            <FolderOpen className="w-3.5 h-3.5" /> Desde archivos
          </button>
          <button onClick={() => setShowImport(true)} className="slds-btn-neutral text-xs">
            <Upload className="w-3.5 h-3.5" /> Importar texto
          </button>
          <button onClick={handleGenerateAll} disabled={generatingBatch || !stories.length} className="slds-btn-neutral text-xs">
            {generatingBatch ? <span className="slds-spinner" /> : <Zap className="w-3.5 h-3.5" />}
            Generar todos
          </button>
          <button onClick={handleExcel} className="slds-btn-neutral text-xs">
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
          <Link to={`/projects/${id}/metricas`} className="slds-btn-neutral text-xs flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5" /> Métricas
          </Link>
          <NewTestPlanButton projectId={id} />
          <button onClick={() => setShowForm(true)} className="slds-btn-brand text-xs">
            <Plus className="w-3.5 h-3.5" /> Nueva HU
          </button>
        </div>
      </div>

      {/* Stats tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {stats.map(s => (
          <div key={s.label} className="slds-tile">
            <div className={clsx('slds-tile__icon', s.bg)}>
              <s.icon className={clsx('w-5 h-5', s.color)} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slds-neutral-10 leading-none">{s.value}</p>
              <p className="text-xs text-slds-neutral-7 mt-0.5">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stories table */}
      <div className="slds-section">
        <div className="slds-card__header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slds-brand" />
            <h2 className="font-semibold text-slds-neutral-10">Historias de usuario</h2>
            <span className="slds-badge slds-badge-brand">{stories.length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        ) : stories.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-12 h-12 text-slds-neutral-5 mx-auto mb-3" />
            <p className="text-slds-neutral-7 font-semibold">No hay historias de usuario</p>
            <p className="text-slds-neutral-6 text-xs mt-1 mb-4">Agrega historias manualmente o impórtalas</p>
            <button onClick={() => setShowForm(true)} className="slds-btn-brand text-xs">
              <Plus className="w-3.5 h-3.5" /> Agregar primera HU
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Historia de usuario</th>
                  <th>Fuente</th>
                  <th>INVEST</th>
                  <th>Casos</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {stories.map(story => (
                  <tr key={story.id}>
                    <td className="text-xs font-mono text-slds-neutral-6 whitespace-nowrap">
                      {story.external_id || `HU-${story.id}`}
                    </td>
                    <td className="max-w-xs">
                      <Link
                        to={`/projects/${id}/stories/${story.id}`}
                        className="text-slds-brand hover:underline font-medium text-sm line-clamp-1"
                      >
                        {story.title}
                      </Link>
                    </td>
                    <td>
                      <span className="slds-badge slds-badge-neutral text-xs">
                        {SOURCE_LABELS[story.source] || story.source}
                      </span>
                    </td>
                    <td><InvestPill score={story.invest_score} /></td>
                    <td>
                      {story.test_cases_count > 0
                        ? <span className="slds-badge slds-badge-success">{story.test_cases_count} casos</span>
                        : <span className="text-slds-neutral-5 text-xs">—</span>}
                    </td>
                    <td>
                      <div className="flex gap-1 justify-end flex-nowrap">
                        <button
                          onClick={() => handleAnalyze(story.id)}
                          disabled={analyzingId === story.id}
                          className="slds-btn-neutral text-xs py-0.5 px-2"
                          title="Analizar INVEST"
                        >
                          {analyzingId === story.id
                            ? <span className="slds-spinner" />
                            : <Brain className="w-3.5 h-3.5" />}
                          INVEST
                        </button>
                        <button
                          onClick={() => handleGenerate(story.id)}
                          disabled={generatingId === story.id}
                          className="slds-btn-brand text-xs py-0.5 px-2"
                          title="Generar casos con IA"
                        >
                          {generatingId === story.id
                            ? <span className="slds-spinner border-white/30 border-t-white" />
                            : <Zap className="w-3.5 h-3.5" />}
                          Generar
                        </button>
                        <Link
                          to={`/projects/${id}/stories/${story.id}`}
                          className="slds-btn-neutral text-xs py-0.5 px-2"
                        >
                          Ver
                        </Link>
                        <button
                          onClick={() => handleDelete(story.id, story.title)}
                          disabled={deletingId === story.id}
                          className="slds-btn-destructive text-xs py-0.5 px-2"
                          title="Borrar historia"
                        >
                          {deletingId === story.id
                            ? <span className="slds-spinner border-white/30 border-t-white" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Test Plans table */}
      <div className="slds-section mt-5">
        <div className="slds-card__header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-slds-brand" />
            <h2 className="font-semibold text-slds-neutral-10">Test Plans</h2>
            <span className="slds-badge slds-badge-brand">{plans.length}</span>
          </div>
          <NewTestPlanButton projectId={id} />
        </div>

        {plansLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>
        ) : plans.length === 0 ? (
          <div className="py-12 text-center">
            <Sparkles className="w-10 h-10 text-slds-neutral-5 mx-auto mb-3" />
            <p className="text-slds-neutral-7 font-semibold text-sm">Aún no hay test plans</p>
            <p className="text-slds-neutral-6 text-xs mt-1 mb-4">
              Elegí cómo querés trabajarlo: formulario clásico o chat conversacional.
            </p>
            <NewTestPlanButton projectId={id} label="Crear primer Test Plan" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Versión</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th className="text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-sm">
                      <Link
                        to={`/projects/${id}/test-plans/${p.id}`}
                        className="text-slds-brand hover:underline"
                      >
                        {p.client_name || 'Sin cliente'}
                      </Link>
                    </td>
                    <td className="text-xs text-slds-neutral-7">v{p.doc_version}</td>
                    <td><TestPlanStatusBadge status={p.status} /></td>
                    <td className="text-xs text-slds-neutral-7 whitespace-nowrap">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap">
                      <div className="flex gap-1 justify-end flex-nowrap">
                        <Link
                          to={`/projects/${id}/test-plans/${p.id}/edit`}
                          className="slds-btn-neutral text-xs py-0.5 px-2"
                          title="Editar en el asistente"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Editar
                        </Link>
                        <Link
                          to={`/projects/${id}/test-plans/${p.id}`}
                          className="slds-btn-neutral text-xs py-0.5 px-2"
                        >
                          Ver
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Nueva HU ────────────────────────────────────────────────── */}
      {showForm && (
        <div className="slds-modal-backdrop">
          <div className="slds-modal">
            <div className="slds-modal__header">
              <h3 className="font-semibold text-slds-neutral-10">Nueva historia de usuario</h3>
              <button onClick={() => setShowForm(false)} className="slds-btn-icon"><X className="w-4 h-4" /></button>
            </div>
            <div className="slds-modal__body space-y-4">
              <div>
                <label className="slds-label">ID externo (Jira / Azure)</label>
                <input className="slds-input" value={externalId} onChange={e => setExternalId(e.target.value)} placeholder="HU-123" />
              </div>
              <div>
                <label className="slds-label">Título *</label>
                <input className="slds-input" value={title} onChange={e => setTitle(e.target.value)} required placeholder="Como [usuario] quiero [acción] para [beneficio]" />
              </div>
              <div>
                <label className="slds-label">Descripción</label>
                <textarea className="slds-textarea" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="slds-label">Criterios de aceptación</label>
                <textarea className="slds-textarea" rows={4} value={acceptance} onChange={e => setAcceptance(e.target.value)} placeholder="- Dado que...&#10;- El sistema debe..." />
              </div>
            </div>
            <div className="slds-modal__footer">
              <button onClick={() => setShowForm(false)} className="slds-btn-neutral">Cancelar</button>
              <button
                className="slds-btn-brand"
                disabled={createMutation.isPending || !title.trim()}
                onClick={() => createMutation.mutate({ title, description, acceptance_criteria: acceptance, external_id: externalId })}
              >
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Importar texto ──────────────────────────────────────────── */}
      {showImport && (
        <div className="slds-modal-backdrop">
          <div className="slds-modal">
            <div className="slds-modal__header">
              <h3 className="font-semibold text-slds-neutral-10">Importar historias desde texto</h3>
              <button onClick={() => setShowImport(false)} className="slds-btn-icon"><X className="w-4 h-4" /></button>
            </div>
            <div className="slds-modal__body">
              <p className="text-xs text-slds-neutral-7 mb-3">
                Una historia por línea: <code className="bg-slds-neutral-2 px-1 rounded">ID | Título | Descripción | Criterios</code>
              </p>
              <textarea className="slds-textarea" rows={8} value={importText} onChange={e => setImportText(e.target.value)}
                placeholder="HU-001 | Como usuario quiero iniciar sesión | El usuario puede ingresar... | - El sistema valida..." />
            </div>
            <div className="slds-modal__footer">
              <button onClick={() => setShowImport(false)} className="slds-btn-neutral">Cancelar</button>
              <button onClick={handleImport} className="slds-btn-brand" disabled={!importText.trim()}>
                <Upload className="w-3.5 h-3.5" /> Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Importar archivos ───────────────────────────────────────── */}
      {showFileImport && (
        <div className="slds-modal-backdrop">
          <div className="slds-modal">
            <div className="slds-modal__header">
              <h3 className="font-semibold text-slds-neutral-10">Importar desde documentos</h3>
              <button onClick={() => { setShowFileImport(false); setUploadResults([]); setUploadingFiles([]) }} className="slds-btn-icon">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="slds-modal__body">
              <p className="text-xs text-slds-neutral-7 mb-3">
                Cada archivo se convierte en <strong>una sola historia</strong>. La IA extrae título, descripción y criterios automáticamente.
              </p>
              <div className="flex gap-1.5 mb-4">
                {['.pdf', '.docx', '.txt', '.md'].map(ext => (
                  <span key={ext} className="slds-badge slds-badge-brand">{ext}</span>
                ))}
              </div>
              <div
                className="border-2 border-dashed border-slds-neutral-4 rounded-slds p-8 text-center
                           hover:border-slds-brand hover:bg-slds-brand-light transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files) }}
              >
                <FileUp className="w-10 h-10 text-slds-neutral-5 mx-auto mb-2" />
                <p className="text-sm text-slds-neutral-7">Arrastra archivos aquí o haz clic para seleccionar</p>
                <p className="text-xs text-slds-neutral-6 mt-1">Máx. 10 MB por archivo</p>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md" className="hidden"
                  onChange={e => { if (e.target.files) handleFileUpload(e.target.files) }} />
              </div>
              {uploadingFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-slds-neutral-7">Procesando con IA...</p>
                  {uploadingFiles.map(name => (
                    <div key={name} className="flex items-center gap-2 text-xs text-slds-neutral-7">
                      <span className="slds-spinner flex-shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                  ))}
                </div>
              )}
              {uploadResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {uploadResults.map(r => (
                    <div key={r.name} className={clsx(
                      'flex items-start gap-2 text-xs rounded-slds p-2',
                      r.ok ? 'bg-slds-success-bg text-slds-success' : 'bg-slds-error-bg text-slds-error',
                    )}>
                      <span>{r.ok ? '✓' : '✗'}</span>
                      <div>
                        <span className="font-medium">{r.name}</span>
                        {!r.ok && <span className="block opacity-80">{r.error}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {uploadResults.length > 0 && (
              <div className="slds-modal__footer">
                <button onClick={() => { setShowFileImport(false); setUploadResults([]) }} className="slds-btn-brand">
                  Listo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {Number.isFinite(id) && id > 0 && (
        <ProjectChatDrawer projectId={id} />
      )}
    </div>
  )
}
