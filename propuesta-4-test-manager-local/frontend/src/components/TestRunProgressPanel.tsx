import { useEffect, useState } from 'react'
import {
  X, Loader2, CheckCircle2, AlertCircle, Ban, LogIn,
  Clock, Play, FileText,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { testRunsApi, type TestRunOut, type TestRunStatus } from '../api'

/**
 * TestRunProgressPanel
 *
 * Modal flotante que muestra el progreso de un test_run en vivo. Se monta cuando
 * el QA dispara una ejecución desde ExecuteTestsModal y se queda visible hasta
 * que el run llega a un estado terminal (finished/error/cancelled) o el QA lo
 * cierra explícitamente.
 *
 * Polling: cada POLL_INTERVAL_MS mientras el run esté activo. Se detiene en
 * estados terminales para no spamear la API. Cuando el run pasa a
 * 'waiting_login', el panel muestra un botón "Ya me logué" que dispara
 * POST /test-runs/{id}/continue.
 *
 * Cancelación: el botón "Cancelar run" está disponible en cualquier estado no
 * terminal. Idempotente — el backend maneja el caso de race.
 *
 * Esta versión NO muestra timeline de tool calls (Fase 3 MVP). Solo el status
 * actual y el reporte final cuando llega. Para timeline detallado habría que
 * implementar la tabla test_run_events en backend (Fase B/4).
 */

const POLL_INTERVAL_MS = 3000

interface Props {
  runId: number
  /**
   * Callback al cerrar el panel. Permite al padre limpiar su estado y, si lo
   * desea, refrescar la lista de runs históricos.
   */
  onClose: () => void
  /**
   * Callback opcional al alcanzar un estado terminal. El padre puede usarlo
   * para invalidar caches de listados de runs / badges en filas de TC.
   */
  onTerminalState?: (run: TestRunOut) => void
}

const STATUS_META: Record<TestRunStatus, {
  label: string
  bg: string
  text: string
  icon: React.ElementType
  spin?: boolean
  description: string
}> = {
  queued: {
    label: 'En cola',
    bg: 'bg-slds-neutral-3',
    text: 'text-slds-neutral-10',
    icon: Clock,
    description: 'El worker tomará este run en breve. No requiere acción de tu parte.',
  },
  running: {
    label: 'Ejecutando',
    bg: 'bg-slds-brand-light',
    text: 'text-slds-brand',
    icon: Loader2,
    spin: true,
    description: 'El agente está navegando y ejecutando los pasos. Puede tardar varios minutos.',
  },
  waiting_login: {
    label: 'Esperando login',
    bg: 'bg-amber-100',
    text: 'text-amber-700',
    icon: LogIn,
    description: 'Inicia sesión manualmente en la ventana de Chromium que abrió el agente. Cuando estés dentro, presiona "Ya me logué" para continuar.',
  },
  finished: {
    label: 'Finalizado',
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
    icon: CheckCircle2,
    description: 'El agente completó el caso. Mira el reporte abajo.',
  },
  error: {
    label: 'Error',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: AlertCircle,
    description: 'El run terminó con error. Revisa el detalle abajo.',
  },
  cancelled: {
    label: 'Cancelado',
    bg: 'bg-slds-neutral-3',
    text: 'text-slds-neutral-9',
    icon: Ban,
    description: 'Run abortado por timeout, cancel manual, o cierre del worker.',
  },
}

const TERMINAL_STATES: TestRunStatus[] = ['finished', 'error', 'cancelled']

export default function TestRunProgressPanel({ runId, onClose, onTerminalState }: Props) {
  const [run, setRun] = useState<TestRunOut | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [continuePending, setContinuePending] = useState(false)
  const [cancelPending, setCancelPending] = useState(false)
  const [terminalNotified, setTerminalNotified] = useState(false)

  // Polling: arranca al montar y se detiene cuando el run está en estado terminal.
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function poll() {
      try {
        const fresh = await testRunsApi.get(runId)
        if (cancelled) return
        setRun(fresh)
        setLoadError(null)

        if (TERMINAL_STATES.includes(fresh.status)) {
          // No reagendamos — el polling terminó.
          if (!terminalNotified) {
            setTerminalNotified(true)
            onTerminalState?.(fresh)
          }
          return
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (err as Error)?.message ||
          'No se pudo obtener el estado del run.'
        setLoadError(msg)
        // Reintentamos suavemente en caso de hipo de red.
        timer = setTimeout(poll, POLL_INTERVAL_MS * 2)
      }
    }

    poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [runId, onTerminalState, terminalNotified])

  async function handleContinue() {
    if (!run) return
    setContinuePending(true)
    try {
      const updated = await testRunsApi.continue(runId)
      setRun(updated)
      if (updated.status === 'waiting_login') {
        toast(
          'Señal enviada. El worker reanudará el run en su próximo poll (~2s).',
          { duration: 3500 },
        )
      }
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudo enviar la señal de continuar.'
      toast.error(msg)
    } finally {
      setContinuePending(false)
    }
  }

  async function handleCancel() {
    if (!run) return
    if (!window.confirm('¿Cancelar este run? Si el agente está en medio de un paso, lo abortará.')) {
      return
    }
    setCancelPending(true)
    try {
      const updated = await testRunsApi.cancel(runId)
      setRun(updated)
      toast('Cancelación solicitada. El worker actuará en su próximo ciclo.')
    } catch (err) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'No se pudo cancelar el run.'
      toast.error(msg)
    } finally {
      setCancelPending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!run && !loadError) {
    return (
      <div className="slds-modal-backdrop">
        <div className="slds-modal" style={{ maxWidth: '560px' }}>
          <div className="slds-modal__body py-8 text-center text-slds-neutral-8">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-slds-brand" />
            Cargando estado del run #{runId}…
          </div>
        </div>
      </div>
    )
  }

  if (loadError && !run) {
    return (
      <div className="slds-modal-backdrop">
        <div className="slds-modal" style={{ maxWidth: '560px' }}>
          <div className="slds-modal__header">
            <h3 className="font-semibold text-slds-error">Error al cargar el run</h3>
            <button onClick={onClose} className="slds-btn-icon">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="slds-modal__body">
            <p className="text-sm text-slds-neutral-9">{loadError}</p>
          </div>
          <div className="slds-modal__footer">
            <button onClick={onClose} className="slds-btn-neutral">Cerrar</button>
          </div>
        </div>
      </div>
    )
  }

  const r = run!
  const meta = STATUS_META[r.status]
  const Icon = meta.icon
  const isTerminal = TERMINAL_STATES.includes(r.status)

  return (
    <div className="slds-modal-backdrop">
      <div className="slds-modal" style={{ maxWidth: '720px' }}>
        <div className="slds-modal__header">
          <h3 className="font-semibold text-slds-neutral-10 flex items-center gap-2">
            <Play className="w-4 h-4 text-slds-brand" />
            Run #{r.id} — {r.case_ids.length} caso{r.case_ids.length > 1 ? 's' : ''}
          </h3>
          <button onClick={onClose} className="slds-btn-icon" title="Cerrar panel (el run sigue corriendo)">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="slds-modal__body space-y-4">
          {/* Status banner */}
          <div className={`flex items-start gap-3 p-3 rounded-slds ${meta.bg}`}>
            <Icon className={`w-5 h-5 ${meta.text} flex-shrink-0 mt-0.5 ${meta.spin ? 'animate-spin' : ''}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${meta.text}`}>{meta.label}</p>
              <p className="text-xs text-slds-neutral-9 mt-0.5">{meta.description}</p>
            </div>
          </div>

          {/* Metadata del run */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slds-neutral-2 rounded-slds p-2">
              <p className="text-slds-neutral-7 mb-0.5">Ambiente</p>
              <p className="font-mono text-slds-neutral-10">{r.env.toUpperCase()}</p>
            </div>
            <div className="bg-slds-neutral-2 rounded-slds p-2">
              <p className="text-slds-neutral-7 mb-0.5">Modelo</p>
              <p className="font-mono text-slds-neutral-10 truncate" title={r.model_id}>{r.model_id}</p>
            </div>
            <div className="bg-slds-neutral-2 rounded-slds p-2 col-span-2">
              <p className="text-slds-neutral-7 mb-0.5">URL base</p>
              <p className="font-mono text-slds-neutral-10 truncate" title={r.base_url}>{r.base_url}</p>
            </div>
            {r.agent_id && (
              <div className="bg-slds-neutral-2 rounded-slds p-2 col-span-2">
                <p className="text-slds-neutral-7 mb-0.5">Agent ID</p>
                <p className="font-mono text-slds-neutral-10 text-[10px] truncate" title={r.agent_id}>{r.agent_id}</p>
              </div>
            )}
            <div className="bg-slds-neutral-2 rounded-slds p-2">
              <p className="text-slds-neutral-7 mb-0.5">Iniciado</p>
              <p className="text-slds-neutral-10">{formatTs(r.started_at) || '—'}</p>
            </div>
            <div className="bg-slds-neutral-2 rounded-slds p-2">
              <p className="text-slds-neutral-7 mb-0.5">Finalizado</p>
              <p className="text-slds-neutral-10">{formatTs(r.finished_at) || '—'}</p>
            </div>
          </div>

          {/* Reporte final / error / partial */}
          {r.result && (
            <div>
              <p className="slds-label flex items-center gap-1 mb-1">
                <FileText className="w-3.5 h-3.5 text-slds-neutral-7" />
                Reporte del agente
              </p>
              <pre className="text-xs bg-slds-neutral-2 border border-slds-neutral-4 rounded-slds p-3 overflow-x-auto max-h-72 whitespace-pre-wrap break-words font-mono text-slds-neutral-10">
                {r.result}
              </pre>
            </div>
          )}

          {r.error_message && (
            <div className="text-xs bg-red-50 border border-red-200 rounded-slds p-3">
              <p className="font-semibold text-red-700 mb-1">Detalle del error</p>
              <p className="font-mono text-red-700 whitespace-pre-wrap break-words">{r.error_message}</p>
            </div>
          )}

          {loadError && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-slds p-2">
              Aviso: hipo al actualizar estado ({loadError}). Reintentando automáticamente…
            </p>
          )}
        </div>

        <div className="slds-modal__footer">
          {/* Cancelar siempre visible mientras no esté en terminal */}
          {!isTerminal && (
            <button
              onClick={handleCancel}
              disabled={cancelPending}
              className="slds-btn-neutral"
              title="Detener el run en curso"
            >
              {cancelPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Cancelar run
            </button>
          )}

          {/* Continuar solo en waiting_login */}
          {r.status === 'waiting_login' && (
            <button
              onClick={handleContinue}
              disabled={continuePending}
              className="slds-btn-brand"
            >
              {continuePending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
              Ya me logué, continuar
            </button>
          )}

          {/* Cerrar en terminales o como secundario */}
          {isTerminal ? (
            <button onClick={onClose} className="slds-btn-brand">Cerrar</button>
          ) : (
            <button onClick={onClose} className="slds-btn-neutral" title="El run sigue corriendo en background">
              Ocultar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTs(iso: string | null): string {
  if (!iso) return ''
  // Backend devuelve timestamps naive UTC sin sufijo Z. Forzamos UTC para
  // evitar que JS los interprete como hora local (lo cual descalibraría -6h).
  const isoUtc = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z'
  const d = new Date(isoUtc)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
