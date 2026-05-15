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
import { useTranslation } from 'react-i18next'
import { storiesApi, testCasesApi, type StoryReviewResponse, type StoryReviewStep, type StoryReviewMode } from '../api'
import InvestBadge from '../components/InvestBadge'
import ProjectChatDrawer from '../components/ProjectChatDrawer'

function getStatusConfig(t: (k: string) => string): Record<string, { label: string; cls: string; icon: React.ElementType }> {
  return {
    pending: { label: t('story.status_pending'), cls: 'slds-badge-brand',   icon: Clock },
    pass:    { label: t('story.status_pass'),    cls: 'slds-badge-success', icon: CheckCircle },
    fail:    { label: t('story.status_fail'),    cls: 'slds-badge-error',   icon: XCircle },
    blocked: { label: t('story.status_blocked'), cls: 'slds-badge-warning', icon: MinusCircle },
    na:      { label: t('story.status_na'),      cls: 'slds-badge-neutral', icon: MinusCircle },
  }
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
  const { t } = useTranslation()
  const STATUS_CONFIG = getStatusConfig(t)

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
      toast.success(t('story.toast_case_updated'))
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
      toast.success(t('story.toast_case_created'))
      setShowAddCase(false)
    },
  })

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      await storiesApi.analyzeInvest(pid, sid)
      queryClient.invalidateQueries({ queryKey: ['story', pid, sid] })
      toast.success(t('story.toast_analyze_done'))
    } catch { toast.error(t('story.toast_analyze_error')) } finally { setAnalyzing(false) }
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
      const ok = window.confirm(t('story.confirm_replace'))
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
        toast(t('story.agent_toast_skipped', { n: genStep.existing_cases_count ?? '?' }), { icon: 'ℹ️' })
      } else {
        toast.success(t('story.agent_toast_done', { n: result.test_cases_created }))
      }
    } catch (err: any) {
      const status = err?.response?.status
      if (status === 429) {
        toast.error(t('story.agent_toast_quota'))
      } else if (status === 422 || status === 400) {
        toast.error(err?.response?.data?.detail ?? t('story.agent_toast_invalid'))
      } else {
        toast.error(t('story.agent_toast_error'))
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
      toast.error(t('story.select_to_export'))
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
    toast.success(t('story.export_done', { n: selected.length }))
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
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand"><Home className="w-3 h-3" /> {t('story.breadcrumb_home')}</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${pid}`} className="hover:text-slds-brand">{t('story.breadcrumb_project')}</Link>
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
                  {invest ? t('story.btn_reanalyze') : t('story.btn_analyze')}
                </button>
                <button
                  onClick={() => handleAgentReview()}
                  disabled={agentReviewing}
                  className="slds-btn-brand text-xs"
                  title={t('story.btn_agent_title')}
                >
                  {agentReviewing ? <span className="slds-spinner" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {t('story.btn_agent')}
                </button>
              </div>
            </div>

            <div className="slds-card__body">
              <h1 className="text-lg font-bold text-slds-neutral-10 mb-4">{story?.title}</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {story?.description && (
                  <div>
                    <p className="slds-label mb-1">{t('story.section_description')}</p>
                    <p className="text-sm text-slds-neutral-9 whitespace-pre-line">{story.description}</p>
                  </div>
                )}
                {story?.acceptance_criteria && (
                  <div>
                    <p className="slds-label mb-1">{t('story.section_acceptance')}</p>
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
                  <h2 className="font-semibold text-slds-neutral-10">{t('story.section_invest')}</h2>
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
            <h2 className="font-semibold text-slds-neutral-10">{t('story.test_cases_title')}</h2>
            <span className="slds-badge slds-badge-brand">{testCases.length}</span>
            {testCases.length > 0 && (
              <>
                <span className="slds-badge slds-badge-success">{passCount} ✓</span>
                <span className="slds-badge slds-badge-error">{failCount} ✗</span>
                <span className="slds-badge slds-badge-neutral">{pendingCount} {t('story.pending_badge')}</span>
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
                <Download className="w-3.5 h-3.5" /> {t('story.export_csv')}
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
                        {{
                          generic: t('story.export_generic'),
                          zephyr: t('story.export_zephyr'),
                          azure: t('story.export_azure'),
                        }[fmt]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button onClick={() => setShowAddCase(true)} className="slds-btn-brand text-xs">
              <Plus className="w-3.5 h-3.5" /> {t('story.add_case')}
            </button>
          </div>
        </div>

        {casesLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : testCases.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slds-neutral-7 text-sm">{t('story.no_cases')}</p>
            <p className="text-slds-neutral-6 text-xs mt-1">{t('story.no_cases_hint')}</p>
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
                  <th className="w-24 whitespace-nowrap">{t('story.col_id')}</th>
                  <th>{t('story.col_title')}</th>
                  <th className="w-24 whitespace-nowrap">{t('story.col_type')}</th>
                  <th className="w-20 whitespace-nowrap">{t('story.col_priority')}</th>
                  <th className="w-32 whitespace-nowrap">{t('story.col_status')}</th>
                  <th className="text-right whitespace-nowrap">{t('story.col_actions')}</th>
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
                          <option value="pending">{t('story.status_pending')}</option>
                          <option value="pass">{t('story.status_pass')}</option>
                          <option value="fail">{t('story.status_fail')}</option>
                          <option value="blocked">{t('story.status_blocked')}</option>
                          <option value="na">{t('story.status_na')}</option>
                        </select>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1 justify-end flex-nowrap">
                          <button onClick={() => setEditingCase(tc)} className="slds-btn-neutral text-xs py-0.5 px-2">
                            {t('story.btn_edit')}
                          </button>
                          <button
                            onClick={() => { if (confirm(t('story.confirm_delete'))) deleteCaseMutation.mutate(tc.id) }}
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
function getStepLabel(t: (k: string) => string): Record<StoryReviewStep['kind'], { label: string; icon: React.ElementType; hint: string }> {
  return {
    invest_analysis: { label: t('story.step_invest_label'), icon: Brain, hint: t('story.step_invest_hint') },
    context_detection: { label: t('story.step_context_label'), icon: FileSearch, hint: t('story.step_context_hint') },
    generate_test_cases: { label: t('story.step_generate_label'), icon: ListChecks, hint: t('story.step_generate_hint') },
  }
}

function getStepStatusCfg(t: (k: string) => string): Record<StoryReviewStep['status'], { label: string; cls: string; icon: React.ElementType }> {
  return {
    ok: { label: t('story.step_status_ok'), cls: 'slds-badge-success', icon: CheckCircle },
    skipped: { label: t('story.step_status_skipped'), cls: 'slds-badge-neutral', icon: MinusCircle },
    error: { label: t('story.step_status_error'), cls: 'slds-badge-error', icon: XCircle },
    quota_exceeded: { label: t('story.step_status_quota'), cls: 'slds-badge-error', icon: AlertTriangle },
  }
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
  const { t } = useTranslation()
  const STEP_LABEL = getStepLabel(t)
  const STEP_STATUS_CFG = getStepStatusCfg(t)

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
            <h3 className="font-semibold text-slds-neutral-10">{t('story.agent_modal_title')}</h3>
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
                {t('story.agent_running')}
              </span>
            )}
            {!running && result && (
              <span>
                {t('story.agent_last_review', { date: new Date(result.last_review_at).toLocaleString(), n: result.test_cases_created })}
              </span>
            )}
          </div>

          {/* Aviso explícito cuando se skipeó por casos existentes */}
          {!running && wasSkippedDueToExisting && (
            <div className="rounded-slds border border-slds-warning/40 bg-slds-warning-bg p-3 text-xs space-y-2">
              <p className="text-slds-neutral-9">
                <strong>{t('story.agent_warning_existing', { n: genStep?.existing_cases_count ?? '?' })}</strong>
                {t('story.agent_warning_existing2')}
              </p>
              <p className="text-slds-neutral-7">
                {t('story.agent_replace_hint')}
              </p>
              <button
                onClick={onReplace}
                disabled={running}
                className="slds-btn-destructive text-xs"
              >
                {t('story.agent_replace_btn')}
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
                  {t('story.agent_initializing')}
                </div>
              </li>
            )}
          </ol>
        </div>

        <div className="slds-modal__footer">
          <button onClick={onClose} className="slds-btn-neutral" disabled={running}>
            {running ? t('story.agent_waiting') : t('story.agent_close')}
          </button>
        </div>
      </div>
    </div>
  )
}

function StepDetail({ step }: { step: StoryReviewStep }) {
  const { t } = useTranslation()
  const bits: React.ReactNode[] = []
  if (step.kind === 'invest_analysis') {
    if (step.reason === 'already_analyzed') {
      bits.push(
        <span key="r" className="text-slds-neutral-7">
          {t('story.step_invest_reused')}
        </span>,
      )
    }
    if (step.score != null) {
      bits.push(
        <span key="s">
          <strong>{step.score.toFixed(1)}/10</strong>
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
          {t('story.step_no_archetypes')}
        </span>,
      )
    }
    if (step.baseline_count != null && step.baseline_count > 0) {
      bits.push(
        <span key="b">
          {t('story.step_baseline', { n: step.baseline_count })}
        </span>,
      )
    }
  }
  if (step.kind === 'generate_test_cases') {
    if (step.status === 'skipped' && step.reason === 'already_has_cases') {
      bits.push(
        <span key="skip" className="text-slds-neutral-7">
          {t('story.step_skipped_existing', { n: step.existing_cases_count ?? '?' })}
        </span>,
      )
    } else if (step.test_cases_created != null) {
      bits.push(
        <span key="t">
          {t('story.step_cases_created', { n: step.test_cases_created })}
        </span>,
      )
    }
    if (step.deleted_count != null && step.deleted_count > 0) {
      bits.push(
        <span key="del" className="text-slds-error">
          {t('story.step_deleted', { n: step.deleted_count })}
        </span>,
      )
    }
    const ctxBits: string[] = []
    if (step.archetypes_used) ctxBits.push(`${step.archetypes_used} archetypes`)
    if (step.baseline_used) ctxBits.push(`${step.baseline_used} baselines`)
    if (step.invest_used) ctxBits.push('INVEST')
    if (ctxBits.length > 0) {
      bits.push(
        <span key="ctx" className="text-slds-neutral-7">
          {t('story.step_context_injected', { parts: ctxBits.join(', ') })}
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
  const { t } = useTranslation()
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
          <h3 className="font-semibold text-slds-neutral-10">{initial ? t('story.case_modal_edit') : t('story.case_modal_new')}</h3>
          <button onClick={onClose} className="slds-btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSave} className="slds-modal__body space-y-4">
          <div>
            <label className="slds-label">{t('story.case_title_label')}</label>
            <input className="slds-input" value={title} onChange={e => setTitle(e.target.value)} required
              placeholder={t('story.case_title_placeholder')} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: t('story.case_status_label'), value: status, set: setStatus, opts: [['pending', t('story.status_pending')],['pass', t('story.status_pass')],['fail', t('story.status_fail')],['blocked', t('story.status_blocked')],['na', t('story.status_na')]] },
              { label: t('story.case_priority_label'), value: priority, set: setPriority, opts: [['critical', t('story.priority_critical')],['high', t('story.priority_high')],['medium', t('story.priority_medium')],['low', t('story.priority_low')]] },
              { label: t('story.case_type_label'), value: type, set: setType, opts: [['functional', t('story.type_functional')],['negative', t('story.type_negative')],['edge_case', t('story.type_edge_case')],['integration', t('story.type_integration')]] },
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
            <label className="slds-label">{t('story.case_precondition_label')}</label>
            <input className="slds-input" value={precondition} onChange={e => setPre(e.target.value)}
              placeholder={t('story.case_precondition_placeholder')} />
          </div>

          <div>
            <label className="slds-label">{t('story.case_steps_label')}</label>
            <textarea className="slds-textarea font-mono text-xs" rows={5} value={steps} onChange={e => setSteps(e.target.value)}
              placeholder={t('story.case_steps_placeholder')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="slds-label">{t('story.case_expected_label')}</label>
              <textarea className="slds-textarea" rows={2} value={expected} onChange={e => setExpected(e.target.value)}
                placeholder={t('story.case_expected_placeholder')} />
            </div>
            <div>
              <label className="slds-label">{t('story.case_actual_label')}</label>
              <textarea className="slds-textarea" rows={2} value={actual} onChange={e => setActual(e.target.value)}
                placeholder={t('story.case_actual_placeholder')} />
            </div>
          </div>

          <div>
            <label className="slds-label">{t('story.case_notes_label')}</label>
            <input className="slds-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('story.case_notes_placeholder')} />
          </div>
        </form>

        <div className="slds-modal__footer">
          <button type="button" onClick={onClose} className="slds-btn-neutral">{t('story.case_cancel')}</button>
          <button
            type="button"
            className="slds-btn-brand"
            disabled={saving || !title.trim()}
            onClick={handleSave as any}
          >
            {saving ? t('story.case_saving') : t('story.case_save')}
          </button>
        </div>
      </div>
    </div>
  )
}
