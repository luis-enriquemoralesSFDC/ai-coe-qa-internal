import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, Brain, Plus, Trash2, X, Loader2,
  CheckCircle, XCircle, Clock, MinusCircle, Home, Download, Sparkles,
  AlertTriangle, FileSearch, ListChecks, Tag,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { storiesApi, testCasesApi, type StoryReviewResponse, type StoryReviewStep, type StoryReviewMode } from '../api'
import InvestBadge from '../components/InvestBadge'
import ProjectChatDrawer from '../components/ProjectChatDrawer'

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: 'Pendiente', cls: 'slds-badge-brand',   icon: Clock },
  pass:    { label: 'Aprobado',  cls: 'slds-badge-success', icon: CheckCircle },
  fail:    { label: 'Fallido',   cls: 'slds-badge-error',   icon: XCircle },
  blocked: { label: 'Bloqueado', cls: 'slds-badge-warning', icon: MinusCircle },
  na:      { label: 'N/A',       cls: 'slds-badge-neutral', icon: MinusCircle },
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: 'text-slds-error font-bold',
  high:     'text-slds-warning font-semibold',
  medium:   'text-slds-neutral-8',
  low:      'text-slds-success',
}

const INVEST_LABELS = [
  { key: 'independent', label: 'Independent', letter: 'I' },
  { key: 'negotiable',  label: 'Negotiable',  letter: 'N' },
  { key: 'valuable',    label: 'Valuable',    letter: 'V' },
  { key: 'estimable',   label: 'Estimable',   letter: 'E' },
  { key: 'small',       label: 'Small',       letter: 'S' },
  { key: 'testable',    label: 'Testable',    letter: 'T' },
]

interface TestCase {
  id: number; case_id?: string; title: string; precondition?: string
  steps?: Array<{ order: number; action: string; expected?: string }>
  expected_result?: string; actual_result?: string
  status: string; priority: string; test_type?: string; notes?: string
}

export default function StoryPage() {
  const { projectId, storyId } = useParams<{ projectId: string; storyId: string }>()
  const pid = Number(projectId)
  const sid = Number(storyId)
  const queryClient = useQueryClient()

  const [showAddCase, setShowAddCase] = useState(false)
  const [editingCase, setEditingCase] = useState<TestCase | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showExportMenu, setShowExportMenu] = useState(false)
  // Story Review Agent: state del modal y del último resultado.
  // `agentReviewResult` se queda en memoria mientras el modal está abierto;
  // se reinicia al cerrar para que la próxima ejecución arranque limpia.
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [agentReviewing, setAgentReviewing] = useState(false)
  const [agentReviewResult, setAgentReviewResult] = useState<StoryReviewResponse | null>(null)

  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ['story', pid, sid],
    queryFn: () => storiesApi.get(pid, sid),
  })
  const { data: testCases = [], isLoading: casesLoading } = useQuery<TestCase[]>({
    queryKey: ['test-cases', sid],
    queryFn: () => testCasesApi.list(sid),
  })

  useEffect(() => {
    setSelectedIds(new Set())
  }, [testCases])

  const updateCaseMutation = useMutation({
    mutationFn: ({ tcId, data }: { tcId: number; data: object }) => testCasesApi.update(sid, tcId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases', sid] })
      queryClient.invalidateQueries({ queryKey: ['stories', pid] })
      toast.success('Caso actualizado')
      setEditingCase(null)
    },
  })

  const deleteCaseMutation = useMutation({
    mutationFn: (tcId: number) => testCasesApi.delete(sid, tcId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases', sid] })
      queryClient.invalidateQueries({ queryKey: ['stories', pid] })
    },
  })

  const createCaseMutation = useMutation({
    mutationFn: (data: object) => testCasesApi.create(sid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-cases', sid] })
      queryClient.invalidateQueries({ queryKey: ['stories', pid] })
      toast.success('Caso creado')
      setShowAddCase(false)
    },
  })

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      await storiesApi.analyzeInvest(pid, sid)
      queryClient.invalidateQueries({ queryKey: ['story', pid, sid] })
      toast.success('Análisis INVEST completado')
    } catch { toast.error('Error al analizar') } finally { setAnalyzing(false) }
  }

  // Story Review Agent: llamada al endpoint nuevo /agent/review.
  // El backend orquesta INVEST + detección de archetypes + generate con contexto.
  // Aquí solo manejamos UI: abrimos el modal en estado "running", esperamos
  // la respuesta sincrónica y al terminar mostramos la timeline + invalidamos
  // las queries para refrescar la HU y los casos.
  //
  // mode (default 'skip'):
  //  - 'skip'   → si la HU ya tiene casos, NO genera (default seguro).
  //  - 'append' → genera y suma encima (legacy; expuesto solo si en futuro UI lo pide).
  //  - 'replace'→ borra previos y regenera. Requiere window.confirm ANTES de mandar
  //               (acción destructiva: pierde edits manuales del QA).
  async function handleAgentReview(mode: StoryReviewMode = 'skip') {
    if (mode === 'replace') {
      const ok = window.confirm(
        'Vas a REEMPLAZAR los casos de prueba existentes de esta HU. ' +
        'Esto borra todos los casos actuales (incluidas tus ediciones manuales) ' +
        'antes de generar los nuevos. ¿Continuar?'
      )
      if (!ok) return
    }
    setShowAgentModal(true)
    setAgentReviewing(true)
    setAgentReviewResult(null)
    try {
      const result = await storiesApi.agentReview(pid, sid, { mode })
      setAgentReviewResult(result)
      queryClient.invalidateQueries({ queryKey: ['story', pid, sid] })
      queryClient.invalidateQueries({ queryKey: ['test-cases', sid] })
      queryClient.invalidateQueries({ queryKey: ['stories', pid] })

      // Mensaje al QA según el outcome del step de generación
      const genStep = result.steps.find((s) => s.kind === 'generate_test_cases')
      if (genStep?.status === 'skipped' && genStep.reason === 'already_has_cases') {
        toast(`Ya hay ${genStep.existing_cases_count ?? '?'} casos en esta HU. Usa "Reemplazar" si quieres regenerar.`, { icon: 'ℹ️' })
      } else {
        toast.success(
          `Agente terminó: ${result.test_cases_created} caso${result.test_cases_created === 1 ? '' : 's'} generado${result.test_cases_created === 1 ? '' : 's'}`,
        )
      }
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 429) {
        toast.error('Cuota mensual de IA excedida')
      } else if (status === 422 || status === 400) {
        toast.error(err?.response?.data?.detail ?? 'Datos inválidos para el agente')
      } else {
        toast.error('El agente no pudo completar la revisión')
      }
      // Cerramos el modal solo si ni siquiera se generó un partial result.
      // Esto deja al QA con la timeline visible si hubo algún step OK + uno con error.
      if (!agentReviewResult) setShowAgentModal(false)
    } finally {
      setAgentReviewing(false)
    }
  }

  function csvCell(v: string | number | undefined | null): string {
    return '"' + String(v ?? '').replace(/"/g, '""') + '"'
  }

  function handleExport(format: 'generic' | 'zephyr' | 'azure') {
    const selected = testCases.filter(tc => selectedIds.has(tc.id))

    if (selected.length === 0) {
      toast.error('Selecciona al menos un caso de prueba para exportar')
      return
    }

    let rows: string[][] = []

    if (format === 'generic') {
      rows.push(['ID', 'Título', 'Tipo', 'Prioridad', 'Precondiciones', 'Pasos', 'Resultado Esperado', 'Resultado Actual', 'Estado'])
      for (const tc of selected) {
        const stepsText = tc.steps?.length
          ? tc.steps.map(s => `${s.order}. ${s.action}${s.expected ? ' → ' + s.expected : ''}`).join('\n')
          : ''
        rows.push([
          tc.case_id ?? '',
          tc.title,
          tc.test_type ?? '',
          tc.priority,
          tc.precondition ?? '',
          stepsText,
          tc.expected_result ?? '',
          tc.actual_result ?? '',
          tc.status,
        ])
      }
    } else if (format === 'zephyr') {
      rows.push(['Issue Type', 'Summary', 'Step', 'Test Data', 'Expected Result', 'Priority'])
      for (const tc of selected) {
        if (tc.steps?.length) {
          for (const step of tc.steps)
            rows.push(['Test', tc.title, step.action, '', step.expected ?? tc.expected_result ?? '', tc.priority])
        } else {
          rows.push(['Test', tc.title, '', '', tc.expected_result ?? '', tc.priority])
        }
      }
    } else {
      rows.push(['ID', 'Work Item Type', 'Title', 'Test Step', 'Step Expected', 'State'])
      for (const tc of selected) {
        if (tc.steps?.length) {
          for (const step of tc.steps)
            rows.push([tc.case_id ?? '', 'Test Case', tc.title, step.action, step.expected ?? '', 'Design'])
        } else {
          rows.push([tc.case_id ?? '', 'Test Case', tc.title, '', '', 'Design'])
        }
      }
    }

    // BOM UTF-8 para que Excel en Windows abra tildes y ñ correctamente
    const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const storyName = story?.title
      ? story.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)
      : 'historia'
    a.href = url
    a.download = `casos-${format}-${storyName}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    // Revocar después de un tick para asegurar que la descarga inició
    setTimeout(() => URL.revokeObjectURL(url), 100)
    setShowExportMenu(false)
    toast.success(`${selected.length} caso${selected.length > 1 ? 's' : ''} exportado${selected.length > 1 ? 's' : ''}`)
  }

  const invest = story?.invest_analysis
  const passCount    = testCases.filter(t => t.status === 'pass').length
  const failCount    = testCases.filter(t => t.status === 'fail').length
  const pendingCount = testCases.filter(t => t.status === 'pending').length
  const allSelected  = testCases.length > 0 && selectedIds.size === testCases.length
  const someSelected = selectedIds.size > 0 && !allSelected

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand"><Home className="w-3 h-3" /> Inicio</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${pid}`} className="hover:text-slds-brand">Proyecto</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium line-clamp-1 max-w-xs">{story?.title}</span>
      </nav>

      {storyLoading ? (
        <div className="slds-section p-10 text-center">
          <span className="slds-spinner mx-auto" style={{ width: 32, height: 32, borderWidth: 3 }} />
        </div>
      ) : (
        <>
          {/* ── Story detail card ────────────────────────────────────────── */}
          <div className="slds-section mb-5">
            <div className="slds-card__header">
              <div className="flex items-center gap-2 flex-wrap">
                {story?.external_id && (
                  <span className="slds-badge slds-badge-neutral font-mono">{story.external_id}</span>
                )}
                <span className="slds-badge slds-badge-brand capitalize">{story?.source}</span>
                {story?.invest_score != null && (
                  <span className={clsx(
                    'slds-badge',
                    story.invest_score >= 7 ? 'slds-badge-success' :
                    story.invest_score >= 4 ? 'slds-badge-warning' : 'slds-badge-error',
                  )}>
                    INVEST {story.invest_score.toFixed(1)}/10
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleAnalyze} disabled={analyzing} className="slds-btn-neutral text-xs">
                  {analyzing ? <span className="slds-spinner" /> : <Brain className="w-3.5 h-3.5" />}
                  {invest ? 'Re-analizar' : 'Analizar INVEST'}
                </button>
                <button
                  onClick={() => handleAgentReview()}
                  disabled={agentReviewing}
                  className="slds-btn-brand text-xs"
                  title="Ejecuta INVEST + detección de archetypes + generación de casos con contexto enriquecido"
                >
                  {agentReviewing ? <span className="slds-spinner" /> : <Sparkles className="w-3.5 h-3.5" />}
                  Revisar con QA Agent
                </button>
              </div>
            </div>

            <div className="slds-card__body">
              <h1 className="text-lg font-bold text-slds-neutral-10 mb-4">{story?.title}</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {story?.description && (
                  <div>
                    <p className="slds-label mb-1">Descripción</p>
                    <p className="text-sm text-slds-neutral-9 whitespace-pre-line">{story.description}</p>
                  </div>
                )}
                {story?.acceptance_criteria && (
                  <div>
                    <p className="slds-label mb-1">Criterios de aceptación</p>
                    <p className="text-sm text-slds-neutral-9 whitespace-pre-line">{story.acceptance_criteria}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── INVEST analysis ──────────────────────────────────────────── */}
          {invest && (
            <div className="slds-section mb-5">
              <div className="slds-card__header">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-600" />
                  <h2 className="font-semibold text-slds-neutral-10">Análisis INVEST</h2>
                </div>
                <span className={clsx(
                  'text-base font-bold px-3 py-0.5 rounded-slds',
                  invest.overall_score >= 7 ? 'bg-slds-success-bg text-slds-success' :
                  invest.overall_score >= 4 ? 'bg-slds-warning-bg text-slds-warning' :
                  'bg-slds-error-bg text-slds-error',
                )}>
                  {invest.overall_score?.toFixed(1)} / 10
                </span>
              </div>
              <div className="slds-card__body">
                <div className="flex gap-3 mb-4 flex-wrap">
                  {INVEST_LABELS.map(({ key, label, letter }) => (
                    <InvestBadge key={key} label={label} letter={letter} score={invest[key]?.score ?? 0} />
                  ))}
                </div>
                <p className="text-sm text-slds-neutral-8 bg-slds-neutral-2 rounded-slds p-3 mb-4">
                  {invest.overall_feedback}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {INVEST_LABELS.map(({ key, label }) => {
                    const c = invest[key]
                    if (!c?.feedback) return null
                    return (
                      <div key={key} className="text-xs">
                        <span className="font-semibold text-slds-neutral-8">{label}:</span>{' '}
                        <span className="text-slds-neutral-7">{c.feedback}</span>
                        {c.suggestions?.length > 0 && (
                          <ul className="mt-1 pl-2 space-y-0.5">
                            {c.suggestions.map((s: string, i: number) => (
                              <li key={i} className="text-slds-brand">→ {s}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Test cases section ───────────────────────────────────────────── */}
      <div className="slds-section">
        <div className="slds-card__header">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-semibold text-slds-neutral-10">Casos de prueba</h2>
            <span className="slds-badge slds-badge-brand">{testCases.length}</span>
            {testCases.length > 0 && (
              <>
                <span className="slds-badge slds-badge-success">{passCount} ✓</span>
                <span className="slds-badge slds-badge-error">{failCount} ✗</span>
                <span className="slds-badge slds-badge-neutral">{pendingCount} pendientes</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowExportMenu(prev => !prev)}
                disabled={selectedIds.size === 0}
                className="slds-btn-neutral text-xs"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
              {showExportMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowExportMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-slds shadow-slds-drop border border-slds-neutral-4 z-40 overflow-hidden">
                    {(['generic', 'zephyr', 'azure'] as const).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => handleExport(fmt)}
                        className="flex w-full px-4 py-2 text-sm text-left text-slds-neutral-8 hover:bg-slds-brand-light hover:text-slds-brand transition-colors"
                      >
                        {{ generic: 'Genérico', zephyr: 'Zephyr (Jira)', azure: 'Azure DevOps' }[fmt]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowAddCase(true)} className="slds-btn-brand text-xs">
              <Plus className="w-3.5 h-3.5" /> Agregar caso
            </button>
          </div>
        </div>

        {casesLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : testCases.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slds-neutral-7 text-sm">No hay casos de prueba aún.</p>
            <p className="text-slds-neutral-6 text-xs mt-1">Usa "Generar" en el proyecto o agrega uno manualmente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(testCases.map(tc => tc.id)))
                        else setSelectedIds(new Set())
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="w-24 whitespace-nowrap">ID</th>
                  <th>Título</th>
                  <th className="w-24 whitespace-nowrap">Tipo</th>
                  <th className="w-20 whitespace-nowrap">Prioridad</th>
                  <th className="w-32 whitespace-nowrap">Estado</th>
                  <th className="text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {testCases.map(tc => {
                  const statusCfg = STATUS_CONFIG[tc.status] || STATUS_CONFIG.pending
                  const StatusIcon = statusCfg.icon
                  return (
                    <tr key={tc.id}>
                      <td className="w-8">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(tc.id)}
                          onChange={e => {
                            setSelectedIds(prev => {
                              const next = new Set(prev)
                              if (e.target.checked) next.add(tc.id)
                              else next.delete(tc.id)
                              return next
                            })
                          }}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="text-xs font-mono text-slds-neutral-6 whitespace-nowrap">{tc.case_id}</td>
                      <td>
                        <button
                          onClick={() => setEditingCase(tc)}
                          className="text-left text-slds-brand hover:underline text-sm font-medium"
                        >
                          {tc.title}
                        </button>
                        {tc.precondition && (
                          <p className="text-xs text-slds-neutral-6 mt-0.5">Pre: {tc.precondition}</p>
                        )}
                      </td>
                      <td>
                        <span className="slds-badge slds-badge-neutral capitalize text-xs whitespace-nowrap">
                          {tc.test_type?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={clsx('text-xs capitalize whitespace-nowrap', PRIORITY_COLOR[tc.priority])}>
                        {tc.priority}
                      </td>
                      <td>
                        <select
                          value={tc.status}
                          onChange={e => updateCaseMutation.mutate({ tcId: tc.id, data: { status: e.target.value } })}
                          className={clsx(
                            'slds-badge border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-slds-brand',
                            statusCfg.cls,
                          )}
                        >
                          <option value="pending">Pendiente</option>
                          <option value="pass">Aprobado</option>
                          <option value="fail">Fallido</option>
                          <option value="blocked">Bloqueado</option>
                          <option value="na">N/A</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1 justify-end flex-nowrap">
                          <button onClick={() => setEditingCase(tc)} className="slds-btn-neutral text-xs py-0.5 px-2">
                            Editar
                          </button>
                          <button
                            onClick={() => { if (confirm('¿Eliminar?')) deleteCaseMutation.mutate(tc.id) }}
                            className="slds-btn-icon w-6 h-6 text-slds-neutral-6 hover:text-slds-error"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Case modal ───────────────────────────────────────────────────── */}
      {(showAddCase || editingCase) && (
        <CaseModal
          initial={editingCase}
          onClose={() => { setShowAddCase(false); setEditingCase(null) }}
          onSave={(data) => {
            if (editingCase) updateCaseMutation.mutate({ tcId: editingCase.id, data })
            else createCaseMutation.mutate(data)
          }}
          saving={updateCaseMutation.isPending || createCaseMutation.isPending}
        />
      )}

      {/* ── Story Review Agent modal ─────────────────────────────────────── */}
      {showAgentModal && (
        <AgentReviewModal
          running={agentReviewing}
          result={agentReviewResult}
          onClose={() => {
            setShowAgentModal(false)
            setAgentReviewResult(null)
          }}
          onReplace={() => handleAgentReview('replace')}
        />
      )}

      {Number.isFinite(Number(projectId)) && Number(projectId) > 0 && (
        <ProjectChatDrawer
          projectId={Number(projectId)}
          activeStoryId={Number.isFinite(Number(storyId)) ? Number(storyId) : undefined}
        />
      )}
    </div>
  )
}

// Componentes auxiliares del modal del agente.
// Se muestran tres tipos de steps según `kind`. La UI es post-hoc (la respuesta
// del backend es sincrónica en este v0.1; futura evolución a SSE solo cambia
// cómo se actualiza `result` — la timeline se queda igual).
const STEP_LABEL: Record<StoryReviewStep['kind'], { label: string; icon: React.ElementType; hint: string }> = {
  invest_analysis: {
    label: 'Análisis INVEST',
    icon: Brain,
    hint: 'Evalúa los 6 criterios de calidad de la HU.',
  },
  context_detection: {
    label: 'Detección de contexto',
    icon: FileSearch,
    hint: 'Identifica archetypes y trae los escenarios baseline curados.',
  },
  generate_test_cases: {
    label: 'Generación de casos',
    icon: ListChecks,
    hint: 'Pide al LLM los casos usando el contexto enriquecido.',
  },
}

const STEP_STATUS_CFG: Record<StoryReviewStep['status'], { label: string; cls: string; icon: React.ElementType }> = {
  ok: { label: 'OK', cls: 'slds-badge-success', icon: CheckCircle },
  skipped: { label: 'Reusado', cls: 'slds-badge-neutral', icon: MinusCircle },
  error: { label: 'Error', cls: 'slds-badge-error', icon: XCircle },
  quota_exceeded: { label: 'Cuota excedida', cls: 'slds-badge-error', icon: AlertTriangle },
}

function AgentReviewModal({
  running,
  result,
  onClose,
  onReplace,
}: {
  running: boolean
  result: StoryReviewResponse | null
  onClose: () => void
  onReplace: () => void
}) {
  // Detectamos si el step de generación fue skipeado por "ya hay casos".
  // Si fue así, le ofrecemos al QA el botón "Reemplazar" como acción de escape.
  const genStep = result?.steps.find((s) => s.kind === 'generate_test_cases')
  const wasSkippedDueToExisting =
    genStep?.status === 'skipped' && genStep.reason === 'already_has_cases'

  return (
    <div className="slds-modal-backdrop">
      <div className="slds-modal" style={{ maxWidth: '720px' }}>
        <div className="slds-modal__header">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-slds-neutral-10">QA Agent — Revisión de la HU</h3>
          </div>
          <button onClick={onClose} className="slds-btn-icon" disabled={running}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="slds-modal__body space-y-4">
          {/* Estado del run (running / ok / partial) */}
          <div className="text-xs text-slds-neutral-7">
            {running && (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slds-brand" />
                El agente está ejecutando los pasos. Esto puede tardar unos segundos según la complejidad de la HU…
              </span>
            )}
            {!running && result && (
              <span>
                Última revisión: {new Date(result.last_review_at).toLocaleString()} ·{' '}
                <strong>{result.test_cases_created}</strong> caso{result.test_cases_created === 1 ? '' : 's'} generado{result.test_cases_created === 1 ? '' : 's'}.
              </span>
            )}
          </div>

          {/* Aviso explícito cuando se skipeó por casos existentes */}
          {!running && wasSkippedDueToExisting && (
            <div className="rounded-slds border border-slds-warning/40 bg-slds-warning-bg p-3 text-xs space-y-2">
              <p className="text-slds-neutral-9">
                <strong>Esta HU ya tiene {genStep?.existing_cases_count ?? '?'} casos.</strong>{' '}
                El agente no generó nuevos para evitar acumular duplicados ni perder
                tus ediciones manuales.
              </p>
              <p className="text-slds-neutral-7">
                Si quieres regenerar desde cero (BORRA los casos actuales antes de generar):
              </p>
              <button
                onClick={onReplace}
                disabled={running}
                className="slds-btn-destructive text-xs"
              >
                Reemplazar todos los casos
              </button>
            </div>
          )}

          {/* Timeline de steps */}
          <ol className="relative border-l border-slds-neutral-4 ml-3 space-y-3">
            {(result?.steps ?? []).map((step, idx) => {
              const meta = STEP_LABEL[step.kind] ?? {
                label: step.kind,
                icon: ChevronRight,
                hint: '',
              }
              const status = STEP_STATUS_CFG[step.status] ?? STEP_STATUS_CFG.error
              const Icon = meta.icon
              const StatusIcon = status.icon
              return (
                <li key={idx} className="ml-4">
                  <span className="absolute -left-2.5 flex items-center justify-center w-5 h-5 rounded-full bg-slds-brand-light ring-2 ring-white">
                    <Icon className="w-3 h-3 text-slds-brand" />
                  </span>
                  <div className="rounded-slds border border-slds-neutral-3 bg-white p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slds-neutral-10">{meta.label}</p>
                        <p className="text-xs text-slds-neutral-6">{meta.hint}</p>
                      </div>
                      <span className={clsx('slds-badge inline-flex items-center gap-1', status.cls)}>
                        <StatusIcon className="w-3 h-3" /> {status.label}
                        <span className="font-mono opacity-70 ml-1">{step.latency_ms}ms</span>
                      </span>
                    </div>
                    <StepDetail step={step} />
                  </div>
                </li>
              )
            })}
            {/* Placeholder para los pasos aún no recibidos cuando el run sigue */}
            {running && (!result?.steps || result.steps.length === 0) && (
              <li className="ml-4">
                <div className="rounded-slds border border-dashed border-slds-neutral-4 bg-slds-neutral-2 p-3 text-xs text-slds-neutral-6 italic">
                  Inicializando agente…
                </div>
              </li>
            )}
          </ol>
        </div>

        <div className="slds-modal__footer">
          <button onClick={onClose} className="slds-btn-neutral" disabled={running}>
            {running ? 'Esperando al agente…' : 'Cerrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StepDetail({ step }: { step: StoryReviewStep }) {
  const bits: React.ReactNode[] = []
  if (step.kind === 'invest_analysis') {
    if (step.reason === 'already_analyzed') {
      bits.push(
        <span key="r" className="text-slds-neutral-7">
          INVEST ya estaba calculado, se reusó (idempotencia).
        </span>,
      )
    }
    if (step.score != null) {
      bits.push(
        <span key="s">
          Score: <strong>{step.score.toFixed(1)}/10</strong>
        </span>,
      )
    }
  }
  if (step.kind === 'context_detection') {
    if (step.archetypes && step.archetypes.length > 0) {
      bits.push(
        <span key="a" className="inline-flex items-center gap-1 flex-wrap">
          <Tag className="w-3 h-3 text-slds-brand" />
          {step.archetypes.map((a) => (
            <span key={a} className="slds-badge slds-badge-brand text-xs">
              {a}
            </span>
          ))}
        </span>,
      )
    } else if (step.status === 'ok') {
      bits.push(
        <span key="none" className="text-slds-neutral-7">
          No se detectaron archetypes (la HU usa el flujo base sin contexto extra).
        </span>,
      )
    }
    if (step.baseline_count != null && step.baseline_count > 0) {
      bits.push(
        <span key="b">
          {step.baseline_count} escenario{step.baseline_count === 1 ? '' : 's'} baseline disponibles.
        </span>,
      )
    }
  }
  if (step.kind === 'generate_test_cases') {
    // Caso skipped por "ya hay casos" → mensaje explicito (el banner del modal
    // ya da la solución con el botón "Reemplazar"; aquí solo el detalle inline).
    if (step.status === 'skipped' && step.reason === 'already_has_cases') {
      bits.push(
        <span key="skip" className="text-slds-neutral-7">
          Skipped: la HU ya tenía <strong>{step.existing_cases_count ?? '?'}</strong> casos
          (modo seguro: no acumular).
        </span>,
      )
    } else if (step.test_cases_created != null) {
      bits.push(
        <span key="t">
          <strong>{step.test_cases_created}</strong> caso{step.test_cases_created === 1 ? '' : 's'} creado{step.test_cases_created === 1 ? '' : 's'}.
        </span>,
      )
    }
    if (step.deleted_count != null && step.deleted_count > 0) {
      bits.push(
        <span key="del" className="text-slds-error">
          Reemplazo: borrados {step.deleted_count} caso{step.deleted_count === 1 ? '' : 's'} previo{step.deleted_count === 1 ? '' : 's'}.
        </span>,
      )
    }
    const ctxBits: string[] = []
    if (step.archetypes_used) ctxBits.push(`${step.archetypes_used} archetypes`)
    if (step.baseline_used) ctxBits.push(`${step.baseline_used} baselines`)
    if (step.invest_used) ctxBits.push('resumen INVEST')
    if (ctxBits.length > 0) {
      bits.push(
        <span key="ctx" className="text-slds-neutral-7">
          Contexto inyectado al prompt: {ctxBits.join(', ')}.
        </span>,
      )
    }
  }
  if (step.error_class) {
    bits.push(
      <span key="err" className="text-slds-error inline-flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        {step.error_class}
      </span>,
    )
  }
  if (bits.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slds-neutral-8">
      {bits}
    </div>
  )
}

function CaseModal({ initial, onClose, onSave, saving }: {
  initial: TestCase | null; onClose: () => void
  onSave: (d: object) => void; saving: boolean
}) {
  const [title, setTitle]         = useState(initial?.title || '')
  const [precondition, setPre]    = useState(initial?.precondition || '')
  const [steps, setSteps]         = useState(
    initial?.steps?.map(s => `${s.action}${s.expected ? ' → ' + s.expected : ''}`).join('\n') || ''
  )
  const [expected, setExpected]   = useState(initial?.expected_result || '')
  const [actual, setActual]       = useState(initial?.actual_result || '')
  const [status, setStatus]       = useState(initial?.status || 'pending')
  const [priority, setPriority]   = useState(initial?.priority || 'medium')
  const [type, setType]           = useState(initial?.test_type || 'functional')
  const [notes, setNotes]         = useState(initial?.notes || '')

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const parsedSteps = steps.split('\n').filter(Boolean).map((line, i) => {
      const parts = line.split(' → ')
      return { order: i + 1, action: parts[0]?.trim(), expected: parts[1]?.trim() || undefined }
    })
    onSave({ title, precondition, steps: parsedSteps, expected_result: expected, actual_result: actual, status, priority, test_type: type, notes })
  }

  return (
    <div className="slds-modal-backdrop">
      <div className="slds-modal" style={{ maxWidth: '680px' }}>
        <div className="slds-modal__header">
          <h3 className="font-semibold text-slds-neutral-10">{initial ? 'Editar caso de prueba' : 'Nuevo caso de prueba'}</h3>
          <button onClick={onClose} className="slds-btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSave} className="slds-modal__body space-y-4">
          <div>
            <label className="slds-label">Título *</label>
            <input className="slds-input" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder="Verificar inicio de sesión con credenciales válidas" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Estado', value: status, set: setStatus, opts: [['pending','Pendiente'],['pass','Aprobado'],['fail','Fallido'],['blocked','Bloqueado'],['na','N/A']] },
              { label: 'Prioridad', value: priority, set: setPriority, opts: [['critical','Crítica'],['high','Alta'],['medium','Media'],['low','Baja']] },
              { label: 'Tipo', value: type, set: setType, opts: [['functional','Funcional'],['negative','Negativo'],['edge_case','Edge Case'],['integration','Integración']] },
            ].map(({ label, value, set, opts }) => (
              <div key={label}>
                <label className="slds-label">{label}</label>
                <select className="slds-input" value={value} onChange={e => set(e.target.value)}>
                  {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div>
            <label className="slds-label">Precondición</label>
            <input className="slds-input" value={precondition} onChange={e => setPre(e.target.value)}
              placeholder="El usuario debe estar registrado en el sistema" />
          </div>

          <div>
            <label className="slds-label">Pasos (uno por línea · usa " → " para separar el resultado del paso)</label>
            <textarea className="slds-textarea font-mono text-xs" rows={5} value={steps} onChange={e => setSteps(e.target.value)}
              placeholder="Ir a la página de login → Se muestra el formulario&#10;Ingresar email válido&#10;Hacer clic en Ingresar → Redirige al dashboard" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="slds-label">Resultado esperado</label>
              <textarea className="slds-textarea" rows={2} value={expected} onChange={e => setExpected(e.target.value)}
                placeholder="El usuario accede al dashboard" />
            </div>
            <div>
              <label className="slds-label">Resultado actual</label>
              <textarea className="slds-textarea" rows={2} value={actual} onChange={e => setActual(e.target.value)}
                placeholder="Completar al ejecutar..." />
            </div>
          </div>

          <div>
            <label className="slds-label">Notas</label>
            <input className="slds-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observaciones adicionales..." />
          </div>
        </form>

        <div className="slds-modal__footer">
          <button type="button" onClick={onClose} className="slds-btn-neutral">Cancelar</button>
          <button
            type="button"
            className="slds-btn-brand"
            disabled={saving || !title.trim()}
            onClick={handleSave as any}
          >
            {saving ? 'Guardando...' : 'Guardar caso'}
          </button>
        </div>
      </div>
    </div>
  )
}
