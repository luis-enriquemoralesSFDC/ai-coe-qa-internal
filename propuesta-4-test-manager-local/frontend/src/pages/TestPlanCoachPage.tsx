import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, Home, Sparkles, Send, Loader2,
  RefreshCw, FileCheck2, ShieldAlert, AlertTriangle,
  Check, X, Bot, User, ListChecks, MessageSquare, ChevronDown,
  Wand2, Edit3,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  coachApi, projectsApi, testPlansApi,
  type CoachAction, type CoachMessageOut, type CoachPicklistField,
  type CoachTurnResponse, type TestPlanWizardData,
} from '../api'

// ── Helpers ──────────────────────────────────────────────────────────────────

function showApiError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail
  if (err?.response?.status === 429) {
    toast.error(typeof detail === 'string' ? detail : 'Cuota mensual de IA excedida')
    return
  }
  toast.error(typeof detail === 'string' ? detail : fallback)
}

const FIELD_LABELS: Record<string, string> = {
  client_name: 'Cliente',
  sow_id: 'SOW ID',
  doc_version: 'Versión',
  confidentiality_year: 'Año confidencialidad',
  test_management_tool: 'Gestión de pruebas',
  defect_management_tool: 'Gestión de defectos',
  browsers: 'Navegadores',
  version_history: 'Historial de versiones',
  business_goal: 'Objetivo de negocio',
  scope_out: 'Alcance fuera',
  sprint_weeks: 'Semanas por sprint',
  project_roadmap: 'Roadmap',
  env_dev_name: 'Ambiente DEV',
  env_qa_name: 'Ambiente QA',
  env_sit_name: 'Ambiente SIT',
  env_uat_name: 'Ambiente UAT',
  deployment_frequency: 'Frecuencia despliegues',
  user_story_lifecycle: 'Ciclo de vida HU',
  salesforce_capacity: 'Capacidad squad',
  extra_assumptions: 'Suposiciones extra',
  extra_risks: 'Riesgos extra',
  extra_dependencies: 'Dependencias extra',
  approvals: 'Aprobadores',
}

function fieldLabel(field?: string | null): string {
  if (!field) return ''
  return FIELD_LABELS[field] || field
}

function valueToPreview(v: any): string {
  if (v === null || v === undefined || v === '') return '(vacío)'
  if (Array.isArray(v)) return `${v.length} item(s)`
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 80)
  return String(v).slice(0, 120)
}

// ── Violations banner (block + warn) ─────────────────────────────────────────

function ViolationsBanner({
  violations, onFix,
}: {
  violations: CoachAction[]
  onFix?: (field: string) => void
}) {
  const blocks = violations.filter((v) => v.kind === 'block')
  const warns = violations.filter((v) => v.kind === 'warn')

  if (blocks.length === 0 && warns.length === 0) {
    return (
      <div className="border border-green-200 bg-green-50 rounded-slds p-3 mb-3">
        <div className="flex items-start gap-2 text-sm">
          <Check className="w-4 h-4 text-green-700 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-900">Sin reglas violadas</p>
            <p className="text-green-800 text-xs mt-0.5">
              Podés generar el plan cuando quieras (botón abajo).
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2 mb-3">
      {blocks.length > 0 && (
        <div className="border border-red-200 bg-red-50 rounded-slds p-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-red-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-900 text-sm">
                {blocks.length} regla{blocks.length !== 1 ? 's' : ''} bloquea
                {blocks.length === 1 ? '' : 'n'} la generación
              </p>
              <ul className="mt-1 space-y-1">
                {blocks.map((b, i) => (
                  <li key={i} className="text-red-800 text-xs flex items-start justify-between gap-2">
                    <span>
                      <strong>{fieldLabel(b.field) || b.rule_id}:</strong> {b.label || b.rationale}
                      {b.hint && <span className="block text-red-700 italic">{b.hint}</span>}
                    </span>
                    {b.field && onFix && (
                      <button
                        onClick={() => onFix(b.field!)}
                        className="text-red-700 hover:text-red-900 text-xs underline whitespace-nowrap"
                      >
                        Arreglar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      {warns.length > 0 && (
        <div className="border border-yellow-200 bg-yellow-50 rounded-slds p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-yellow-900 text-sm">
                {warns.length} advertencia{warns.length !== 1 ? 's' : ''} (no bloquea
                {warns.length === 1 ? '' : 'n'})
              </p>
              <ul className="mt-1 space-y-1">
                {warns.map((w, i) => (
                  <li key={i} className="text-yellow-800 text-xs">
                    <strong>{fieldLabel(w.field) || w.rule_id}:</strong> {w.label || w.rationale}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Action widgets ───────────────────────────────────────────────────────────

function AskTextWidget({
  action, onSubmit, busy,
}: {
  action: CoachAction
  onSubmit: (text: string) => void
  busy: boolean
}) {
  const [val, setVal] = useState('')
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (val.trim()) onSubmit(val.trim()) }}
      className="mt-2 border border-slds-brand/30 bg-slds-brand-light rounded-slds p-2"
    >
      <div className="text-xs text-slds-brand mb-1 flex items-center gap-1">
        <MessageSquare className="w-3 h-3" />
        <span>Respondé sobre <strong>{fieldLabel(action.field)}</strong></span>
      </div>
      <div className="flex gap-2 items-end">
        <textarea
          autoFocus
          rows={2}
          className="slds-textarea text-sm flex-1"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={action.hint || 'Tu respuesta...'}
        />
        <button
          type="submit"
          disabled={busy || !val.trim()}
          className="slds-btn-brand text-xs whitespace-nowrap"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          Enviar
        </button>
      </div>
    </form>
  )
}

function AskPicklistWidget({
  action, onSubmit, busy,
}: {
  action: CoachAction
  onSubmit: (answers: Record<string, string>) => void
  busy: boolean
}) {
  const fields = action.picklist_fields || []
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    fields.forEach((f) => { initial[f.field] = f.current_value || '' })
    return initial
  })
  const allFilled = fields.every((f) => vals[f.field])
  return (
    <div className="mt-2 border border-slds-brand/30 bg-slds-brand-light rounded-slds p-3">
      <div className="text-xs text-slds-brand mb-2 flex items-center gap-1">
        <ListChecks className="w-3 h-3" />
        <span>Respondé las {fields.length} preguntas:</span>
      </div>
      <div className="space-y-3">
        {fields.map((f: CoachPicklistField) => (
          <div key={f.field}>
            <label className="text-xs font-medium text-slds-neutral-10">
              {f.label}
              {f.hint && <span className="text-slds-neutral-7 font-normal italic"> — {f.hint}</span>}
            </label>
            <select
              className="slds-input text-sm mt-1"
              value={vals[f.field]}
              onChange={(e) => setVals((p) => ({ ...p, [f.field]: e.target.value }))}
            >
              <option value="">— Selecciona —</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label || o.value}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSubmit(vals)}
        disabled={busy || !allFilled}
        className="slds-btn-brand text-xs mt-3"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        Enviar respuestas
      </button>
    </div>
  )
}

function ConfirmValueWidget({
  action, onAccept, onReject, busy,
}: {
  action: CoachAction
  onAccept: () => void
  onReject: () => void
  busy: boolean
}) {
  return (
    <div className="mt-2 border border-blue-200 bg-blue-50 rounded-slds p-3">
      <div className="text-xs text-blue-700 mb-2 flex items-center gap-1">
        <ShieldAlert className="w-3 h-3" />
        <span>Confirmá el valor para <strong>{fieldLabel(action.field)}</strong></span>
      </div>
      <div className="text-sm font-mono bg-white border border-blue-200 rounded px-2 py-1.5 mb-2">
        {valueToPreview(action.proposed_value)}
      </div>
      {action.rationale && (
        <p className="text-xs text-blue-800 italic mb-2">{action.rationale}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="slds-btn-brand text-xs"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Sí, confirmar
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="slds-btn-neutral text-xs"
        >
          <X className="w-3.5 h-3.5" />
          No, otro valor
        </button>
      </div>
    </div>
  )
}

function SuggestReplaceWidget({
  action, onAccept, onReject, busy,
}: {
  action: CoachAction
  onAccept: () => void
  onReject: () => void
  busy: boolean
}) {
  return (
    <div className="mt-2 border border-purple-200 bg-purple-50 rounded-slds p-3">
      <div className="text-xs text-purple-700 mb-2 flex items-center gap-1">
        <Wand2 className="w-3 h-3" />
        <span>Sugerencia para <strong>{fieldLabel(action.field)}</strong></span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-xs text-slds-neutral-7 mb-1">Actual</p>
          <div className="text-xs font-mono bg-white border border-slds-neutral-4 rounded px-2 py-1.5 line-through text-slds-neutral-7">
            {valueToPreview(action.current_value)}
          </div>
        </div>
        <div>
          <p className="text-xs text-purple-700 mb-1">Propuesto</p>
          <div className="text-xs font-mono bg-white border border-purple-300 rounded px-2 py-1.5 text-purple-900">
            {valueToPreview(action.proposed_value)}
          </div>
        </div>
      </div>
      {action.rationale && (
        <p className="text-xs text-purple-800 italic mb-2">{action.rationale}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={onAccept}
          disabled={busy}
          className="slds-btn-brand text-xs bg-purple-600 hover:bg-purple-700 border-purple-600"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Aceptar
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="slds-btn-neutral text-xs"
        >
          <X className="w-3.5 h-3.5" />
          Rechazar
        </button>
      </div>
    </div>
  )
}

function FollowUpWidget({
  action, onPick, onText, busy,
}: {
  action: CoachAction
  onPick: (option: string) => void
  onText: (text: string) => void
  busy: boolean
}) {
  const [val, setVal] = useState('')
  return (
    <div className="mt-2 border border-slds-neutral-4 bg-slds-neutral-1 rounded-slds p-2">
      {action.quick_options && action.quick_options.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {action.quick_options.map((o) => (
            <button
              key={o}
              onClick={() => onPick(o)}
              disabled={busy}
              className="px-2 py-1 text-xs bg-white border border-slds-neutral-4 rounded-slds hover:bg-slds-brand-light hover:border-slds-brand text-slds-neutral-10"
            >
              {o}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) onText(val.trim()) }}>
        <div className="flex gap-2 items-end">
          <input
            className="slds-input text-sm flex-1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="O respondé tu propio texto..."
          />
          <button
            type="submit"
            disabled={busy || !val.trim()}
            className="slds-btn-neutral text-xs whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar
          </button>
        </div>
      </form>
    </div>
  )
}

function SummaryCard({ action }: { action: CoachAction }) {
  const filled = action.filled_fields || []
  const pending = action.pending_fields || []
  return (
    <div className="mt-2 border border-slds-neutral-4 bg-white rounded-slds p-3">
      <div className="flex items-center gap-1 text-xs text-slds-neutral-7 mb-2">
        <ListChecks className="w-3 h-3" />
        <span>Progreso del wizard</span>
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="font-semibold text-green-700 mb-1">
            <Check className="w-3 h-3 inline mr-0.5" />
            Listo ({filled.length})
          </p>
          {filled.length === 0 ? (
            <p className="text-slds-neutral-6 italic">— ninguno aún —</p>
          ) : (
            <ul className="space-y-0.5">
              {filled.map((f) => (
                <li key={f} className="text-slds-neutral-10">{fieldLabel(f)}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="font-semibold text-slds-neutral-7 mb-1">
            <ChevronDown className="w-3 h-3 inline mr-0.5" />
            Pendiente ({pending.length})
          </p>
          {pending.length === 0 ? (
            <p className="text-slds-neutral-6 italic">— todo cubierto —</p>
          ) : (
            <ul className="space-y-0.5">
              {pending.map((f) => (
                <li key={f} className="text-slds-neutral-10">{fieldLabel(f)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Renderizador de UNA action ───────────────────────────────────────────────

function ActionWidget({
  action, onText, onPicklist, onAccept, onReject, busy,
}: {
  action: CoachAction
  onText: (text: string) => void
  onPicklist: (answers: Record<string, string>) => void
  onAccept: () => void
  onReject: () => void
  busy: boolean
}) {
  switch (action.kind) {
    case 'ask_text':
      return <AskTextWidget action={action} onSubmit={onText} busy={busy} />
    case 'ask_picklist':
      return <AskPicklistWidget action={action} onSubmit={onPicklist} busy={busy} />
    case 'confirm_value':
      return <ConfirmValueWidget action={action} onAccept={onAccept} onReject={onReject} busy={busy} />
    case 'suggest_replace':
    case 'set_field':
      return <SuggestReplaceWidget action={action} onAccept={onAccept} onReject={onReject} busy={busy} />
    case 'follow_up':
      return <FollowUpWidget action={action} onPick={onText} onText={onText} busy={busy} />
    case 'summary':
      return <SummaryCard action={action} />
    case 'block':
    case 'warn':
      // Estos los muestra el banner, no el chat
      return null
    default:
      return null
  }
}

// ── Mensaje individual ───────────────────────────────────────────────────────

function MessageBubble({
  msg, isLast, onText, onPicklist, onAccept, onReject, busy,
}: {
  msg: CoachMessageOut
  isLast: boolean
  onText: (text: string) => void
  onPicklist: (answers: Record<string, string>) => void
  onAccept: (field: string) => void
  onReject: (field: string) => void
  busy: boolean
}) {
  const isAssistant = msg.role === 'assistant'
  return (
    <div className={clsx('flex gap-2', isAssistant ? 'justify-start' : 'justify-end')}>
      {isAssistant && (
        <div className="w-7 h-7 rounded-full bg-slds-brand text-white flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4" />
        </div>
      )}
      <div className={clsx('max-w-[80%]', isAssistant ? '' : 'order-first')}>
        <div
          className={clsx(
            'rounded-slds px-3 py-2 text-sm whitespace-pre-wrap',
            isAssistant
              ? 'bg-white border border-slds-neutral-4 text-slds-neutral-10'
              : 'bg-slds-brand text-white',
          )}
        >
          {msg.content}
        </div>
        {/* Solo el último mensaje del assistant tiene widgets activos. */}
        {isAssistant && isLast && (msg.actions || []).map((a, i) => (
          <ActionWidget
            key={i}
            action={a}
            busy={busy}
            onText={onText}
            onPicklist={onPicklist}
            onAccept={() => a.field && onAccept(a.field)}
            onReject={() => a.field && onReject(a.field)}
          />
        ))}
      </div>
      {!isAssistant && (
        <div className="w-7 h-7 rounded-full bg-slds-neutral-4 text-slds-neutral-10 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  )
}

// ── Wizard mini-summary lateral (panel derecho) ──────────────────────────────

function WizardSidePanel({
  wizard, onOpenWizard,
}: {
  wizard: TestPlanWizardData | null
  onOpenWizard: () => void
}) {
  if (!wizard) return null
  const fields: Array<[string, string]> = [
    ['client_name', wizard.client_name || ''],
    ['sow_id', wizard.sow_id || ''],
    ['doc_version', wizard.doc_version || ''],
    ['confidentiality_year', wizard.confidentiality_year || ''],
    ['sprint_weeks', wizard.sprint_weeks || ''],
    ['business_goal', wizard.business_goal || ''],
    ['scope_out', wizard.scope_out || ''],
    ['user_story_lifecycle', wizard.user_story_lifecycle || ''],
    ['salesforce_capacity', wizard.salesforce_capacity || ''],
    ['project_roadmap', wizard.project_roadmap || ''],
  ]
  const tableCounts: Array<[string, number]> = [
    ['version_history', wizard.version_history?.length || 0],
    ['deployment_frequency', wizard.deployment_frequency?.length || 0],
    ['extra_assumptions', wizard.extra_assumptions?.length || 0],
    ['extra_risks', wizard.extra_risks?.length || 0],
    ['extra_dependencies', wizard.extra_dependencies?.length || 0],
    ['approvals', wizard.approvals?.length || 0],
  ]
  return (
    <div className="slds-card p-3 sticky top-4 max-h-[calc(100vh-140px)] overflow-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slds-neutral-10 flex items-center gap-1.5">
          <ListChecks className="w-4 h-4 text-slds-brand" />
          Estado del wizard
        </h3>
        <button
          onClick={onOpenWizard}
          className="text-xs text-slds-brand hover:underline flex items-center gap-1"
        >
          <Edit3 className="w-3 h-3" />
          Wizard
        </button>
      </div>
      <div className="space-y-1.5 text-xs">
        {fields.map(([f, v]) => (
          <div key={f} className="flex justify-between gap-2">
            <span className="text-slds-neutral-7">{fieldLabel(f)}</span>
            <span className={clsx(
              'font-mono truncate max-w-[150px] text-right',
              v ? 'text-slds-neutral-10' : 'text-slds-neutral-5 italic',
            )}>
              {v ? (v.length > 24 ? v.slice(0, 22) + '…' : v) : '(vacío)'}
            </span>
          </div>
        ))}
        <hr className="my-2 border-slds-neutral-3" />
        {tableCounts.map(([f, n]) => (
          <div key={f} className="flex justify-between gap-2">
            <span className="text-slds-neutral-7">{fieldLabel(f)}</span>
            <span className={clsx(
              'font-mono',
              n > 0 ? 'text-slds-neutral-10' : 'text-slds-neutral-5 italic',
            )}>
              {n > 0 ? `${n} fila${n !== 1 ? 's' : ''}` : '0'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Página principal ────────────────────────────────────────────────────────

export default function TestPlanCoachPage() {
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>()
  const id = Number(projectId)
  const pid = Number(planId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [messages, setMessages] = useState<CoachMessageOut[]>([])
  const [wizard, setWizard] = useState<TestPlanWizardData | null>(null)
  const [violations, setViolations] = useState<CoachAction[]>([])
  const [canGenerate, setCanGenerate] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [bootstrapped, setBootstrapped] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
  })
  const { data: plan, refetch: refetchPlan } = useQuery({
    queryKey: ['test-plan', String(pid)],
    queryFn: () => testPlansApi.get(pid),
  })

  // Auto-scroll al final cuando llegan mensajes nuevos.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Hidratar wizard inicial desde el plan.
  useEffect(() => {
    if (plan && !wizard) {
      setWizard(plan.wizard_data)
    }
  }, [plan, wizard])

  // Cargar historial al entrar.
  useEffect(() => {
    if (!pid || bootstrapped) return
    setBootstrapped(true)
    ;(async () => {
      try {
        const history = await coachApi.messages(pid)
        setMessages(history)
        // Si no hay mensajes previos, arrancar conversación.
        if (history.length === 0) {
          await handleStart()
        } else {
          // Refresh violations y can_generate sin llamar al LLM.
          const v = await coachApi.validate(pid)
          setViolations(v.violations)
          setCanGenerate(v.can_generate)
        }
      } catch (err) {
        showApiError(err, 'No se pudo cargar la conversación')
      }
    })()
  }, [pid, bootstrapped])

  function applyTurnResponse(r: CoachTurnResponse) {
    setMessages((prev) => {
      // Re-fetchamos historial completo para incluir el user message persistido
      // (que no viene en r.message). Más simple que reconstruirlo.
      coachApi.messages(pid).then(setMessages).catch(() => {})
      return prev
    })
    setWizard(r.wizard_data)
    setViolations(r.violations)
    setCanGenerate(r.can_generate)
  }

  async function handleStart() {
    setBusy(true)
    try {
      const r = await coachApi.start(pid, project?.description as string | undefined)
      const history = await coachApi.messages(pid)
      setMessages(history)
      setWizard(r.wizard_data)
      setViolations(r.violations)
      setCanGenerate(r.can_generate)
    } catch (err) {
      showApiError(err, 'No se pudo iniciar la conversación')
    } finally {
      setBusy(false)
    }
  }

  const sendMutation = useMutation({
    mutationFn: (body: Parameters<typeof coachApi.turn>[1]) => coachApi.turn(pid, body),
    onMutate: () => setBusy(true),
    onSettled: () => setBusy(false),
    onSuccess: applyTurnResponse,
    onError: (err) => showApiError(err, 'No se pudo enviar el turno'),
  })

  const applyMutation = useMutation({
    mutationFn: (body: Parameters<typeof coachApi.applyAction>[1]) => coachApi.applyAction(pid, body),
    onMutate: () => setBusy(true),
    onSettled: () => setBusy(false),
    onSuccess: applyTurnResponse,
    onError: (err) => showApiError(err, 'No se pudo aplicar la acción'),
  })

  function handleSendText(text: string) {
    setChatInput('')
    sendMutation.mutate({ text })
  }

  function handlePicklistAnswers(answers: Record<string, string>) {
    sendMutation.mutate({ picklist_answers: answers })
  }

  function handleAcceptSuggestion(field: string) {
    sendMutation.mutate({ accept_suggestion_for: field })
  }

  function handleRejectSuggestion(field: string) {
    sendMutation.mutate({ reject_suggestion_for: field })
  }

  function handleFixField(field: string) {
    // Quick-fix: enviar mensaje sintético al coach pidiendo guía sobre ese campo.
    sendMutation.mutate({ text: `Vamos a arreglar el campo "${fieldLabel(field)}". ¿Qué necesitas?` })
  }

  async function handleReset() {
    if (!confirm('¿Reiniciar conversación? Se borra el historial pero el wizard_data se mantiene.')) return
    try {
      await coachApi.reset(pid)
      setMessages([])
      setBootstrapped(false)  // re-arranca con un nuevo /start
    } catch (err) {
      showApiError(err, 'No se pudo reiniciar')
    }
  }

  async function handleGenerate() {
    if (!canGenerate) {
      toast.error('Resolvé los bloqueos antes de generar')
      return
    }
    setGenerating(true)
    try {
      const newPlan = await testPlansApi.generate(pid, true)
      queryClient.invalidateQueries({ queryKey: ['test-plans', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      queryClient.invalidateQueries({ queryKey: ['test-plan', String(pid)] })
      const pendingCount = newPlan.pending_fields.length
      toast.success(
        pendingCount
          ? `Test plan generado (${pendingCount} campos pendientes)`
          : 'Test plan generado completo'
      )
      navigate(`/projects/${id}/test-plans/${pid}`)
    } catch (err) {
      showApiError(err, 'No se pudo generar')
    } finally {
      setGenerating(false)
    }
  }

  // Encontrar el último mensaje assistant para activar widgets sólo en él.
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i
    }
    return -1
  }, [messages])

  return (
    <div>
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand">
          <Home className="w-3 h-3" /> Inicio
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}`} className="hover:text-slds-brand">{project?.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}/test-plans`} className="hover:text-slds-brand">Test Plans</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">
          Coach {plan ? `· ${plan.client_name}` : ''}
        </span>
      </nav>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <Bot className="w-5 h-5 text-slds-brand" />
            QA Coach
          </h1>
          <p className="text-sm text-slds-neutral-7 mt-0.5">
            Te guío en chat. Respondo preguntas, sugiero ajustes y te aviso si algo no está bien.
            Cuando el plan esté listo, le das al botón de generar.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div
            className="inline-flex items-center bg-slds-neutral-2 border border-slds-neutral-4 rounded-slds p-0.5 text-xs"
            role="tablist"
            aria-label="Modo de edición"
          >
            <Link
              to={`/projects/${id}/test-plans/${pid}/edit`}
              className="px-3 py-1.5 rounded-slds text-slds-neutral-7 hover:text-slds-brand hover:bg-white/70 flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="Cambiar a formulario clásico (10 pasos)"
              role="tab"
              aria-selected="false"
            >
              <ListChecks className="w-3.5 h-3.5" /> Formulario
            </Link>
            <span
              className="px-3 py-1.5 rounded-slds bg-white text-slds-neutral-10 font-semibold shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              role="tab"
              aria-selected="true"
            >
              <Bot className="w-3.5 h-3.5" /> Chat
            </span>
          </div>
          <button
            onClick={handleReset}
            disabled={busy}
            className="slds-btn-neutral text-xs"
            title="Borrar historial (no afecta wizard)"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reiniciar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Chat (8/12) */}
        <main className="col-span-8">
          <ViolationsBanner violations={violations} onFix={handleFixField} />

          <div className="slds-card flex flex-col" style={{ height: 'calc(100vh - 320px)' }}>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slds-neutral-1">
              {messages.length === 0 && !busy && (
                <div className="text-center py-12 text-slds-neutral-6 text-sm">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-slds-neutral-5" />
                  Iniciando coach...
                </div>
              )}
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  msg={m}
                  isLast={i === lastAssistantIdx}
                  onText={handleSendText}
                  onPicklist={handlePicklistAnswers}
                  onAccept={handleAcceptSuggestion}
                  onReject={handleRejectSuggestion}
                  busy={busy}
                />
              ))}
              {busy && messages.length > 0 && (
                <div className="flex items-center gap-2 text-slds-neutral-6 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Coach pensando...
                </div>
              )}
            </div>

            {/* Input libre siempre visible (chat libre cuando no hay action específica) */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (chatInput.trim() && !busy) handleSendText(chatInput.trim())
              }}
              className="border-t border-slds-neutral-3 p-3 bg-white"
            >
              <div className="flex gap-2">
                <input
                  className="slds-input text-sm flex-1"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Escribe libremente, o respondé los widgets de arriba..."
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy || !chatInput.trim()}
                  className="slds-btn-brand text-sm whitespace-nowrap"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar
                </button>
              </div>
            </form>
          </div>

          {/* Footer: CTA generar */}
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-slds-neutral-7">
              {canGenerate
                ? 'Sin bloqueos: el plan se puede generar cuando quieras.'
                : `${violations.filter((v) => v.kind === 'block').length} bloqueo(s) pendientes — resolvelos para habilitar la generación.`}
            </p>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating || busy}
              className={clsx(
                'slds-btn-brand text-sm whitespace-nowrap',
                (!canGenerate || generating) && 'opacity-50 cursor-not-allowed',
              )}
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
              Generar Test Plan
            </button>
          </div>
        </main>

        {/* Sidebar (4/12) */}
        <aside className="col-span-4">
          <WizardSidePanel
            wizard={wizard}
            onOpenWizard={() => navigate(`/projects/${id}/test-plans/${pid}/edit`)}
          />
        </aside>
      </div>
    </div>
  )
}
