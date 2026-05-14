import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, X, Loader2 } from 'lucide-react'

import { testRunsApi, type TestRunOut, type TestRunStatus } from '../api'

/**
 * TestRunHistoryDrawer
 *
 * Drawer lateral con el historial de runs automáticos del proyecto. Se abre
 * desde un botón en StoryPage / ProjectPage. Permite al QA:
 *   - ver de un vistazo qué se ha ejecutado
 *   - hacer click en una fila para abrir el TestRunProgressPanel y ver el
 *     reporte completo de ese run (aunque ya esté terminado)
 *
 * Auto-refresh cada 5s mientras el drawer está abierto, para que si hay un run
 * activo se vea moverse en tiempo casi real. Cuando se cierra, paramos.
 */
const REFETCH_MS = 5000

interface Props {
  open: boolean
  projectId: number
  onClose: () => void
  /** Callback cuando el QA hace click en una fila para abrir el detalle. */
  onSelectRun: (runId: number) => void
}

const STATUS_LABELS: Record<TestRunStatus, { label: string; cls: string }> = {
  queued:        { label: 'En cola',      cls: 'bg-slds-neutral-3 text-slds-neutral-9' },
  running:       { label: 'Corriendo',    cls: 'bg-slds-brand-light text-slds-brand' },
  waiting_login: { label: 'Esp. login',   cls: 'bg-amber-100 text-amber-700' },
  finished:      { label: 'Finalizado',   cls: 'bg-emerald-100 text-emerald-700' },
  error:         { label: 'Error',        cls: 'bg-red-100 text-red-700' },
  cancelled:     { label: 'Cancelado',    cls: 'bg-slds-neutral-3 text-slds-neutral-9' },
}

export default function TestRunHistoryDrawer({ open, projectId, onClose, onSelectRun }: Props) {
  // Cerrar con Esc para UX cómoda.
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const { data: runs = [], isLoading, isError, refetch } = useQuery<TestRunOut[]>({
    queryKey: ['test-runs', projectId],
    queryFn: () => testRunsApi.listByProject(projectId),
    enabled: open && projectId > 0,
    // Refetch cuando hay run activo (vemos los cambios en near real time).
    refetchInterval: open ? REFETCH_MS : false,
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex" role="dialog" aria-label="Historial de runs">
      {/* Backdrop */}
      <button
        type="button"
        className="flex-1 bg-black/30"
        onClick={onClose}
        aria-label="Cerrar drawer"
      />

      {/* Panel */}
      <aside className="w-full max-w-md bg-white shadow-xl flex flex-col h-full">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slds-neutral-4">
          <h2 className="font-semibold text-slds-neutral-10 flex items-center gap-2">
            <History className="w-4 h-4 text-slds-brand" />
            Historial de runs
          </h2>
          <button onClick={onClose} className="slds-btn-icon" title="Cerrar (Esc)">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-slds-neutral-7">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Cargando runs…
            </div>
          )}

          {isError && (
            <div className="text-center py-8 text-sm text-slds-error">
              No se pudo cargar el historial.{' '}
              <button onClick={() => refetch()} className="underline">Reintentar</button>
            </div>
          )}

          {!isLoading && !isError && runs.length === 0 && (
            <div className="text-center py-12 text-sm text-slds-neutral-7">
              Aún no se ha ejecutado ningún run en este proyecto.
              <p className="text-xs mt-2">
                Selecciona casos en una HU y dale a "Ejecutar" para crear el primero.
              </p>
            </div>
          )}

          {runs.map((r) => {
            const cfg = STATUS_LABELS[r.status]
            return (
              <button
                key={r.id}
                onClick={() => onSelectRun(r.id)}
                className="w-full text-left bg-white border border-slds-neutral-4 hover:border-slds-brand hover:bg-slds-brand-light/50 rounded-slds p-3 transition-colors"
                title="Ver detalle del run"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-slds-neutral-7">
                    Run #{r.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded-slds text-[10px] font-semibold uppercase tracking-wide ${cfg.cls}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="text-xs text-slds-neutral-9 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold uppercase text-slds-neutral-7">
                      {r.env}
                    </span>
                    <span className="text-slds-neutral-6">·</span>
                    <span>{r.case_ids.length} caso{r.case_ids.length > 1 ? 's' : ''}</span>
                    <span className="text-slds-neutral-6">·</span>
                    <span className="font-mono text-[10px] text-slds-neutral-6 truncate">
                      {r.model_id}
                    </span>
                  </div>
                  <div className="text-slds-neutral-6 text-[11px] truncate" title={r.base_url}>
                    {r.base_url}
                  </div>
                  <div className="text-slds-neutral-6 text-[10px]">
                    {formatRelative(r.created_at)}
                    {r.finished_at && (
                      <>
                        {' · '}
                        duración {durationFor(r.started_at, r.finished_at)}
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <footer className="px-4 py-2 text-[11px] text-slds-neutral-7 border-t border-slds-neutral-4 bg-slds-neutral-2">
          Auto-refresh cada {REFETCH_MS / 1000}s mientras este panel esté abierto.
        </footer>
      </aside>
    </div>
  )
}

function ensureUtc(iso: string): string {
  return iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + 'Z'
}

function formatRelative(iso: string): string {
  const d = new Date(ensureUtc(iso))
  if (isNaN(d.getTime())) return iso
  const diffMs = Date.now() - d.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 5) return 'hace un momento'
  if (sec < 60) return `hace ${sec}s`
  const min = Math.round(sec / 60)
  if (min < 60) return `hace ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `hace ${hr}h`
  return d.toLocaleDateString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function durationFor(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const ms = new Date(ensureUtc(end)).getTime() - new Date(ensureUtc(start)).getTime()
  if (isNaN(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`
}
