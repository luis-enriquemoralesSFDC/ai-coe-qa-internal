import { useEffect, useMemo, useState } from 'react'
import { X, Play, Globe, AlertTriangle, Copy, CheckCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

import { testRunsApi } from '../api'

// ── Tipos ──────────────────────────────────────────────────────────────────────
// Forma mínima que el modal necesita de un caso de prueba. Se queda chico a
// propósito: tomamos solo lo necesario para armar el prompt del agente y la
// vista previa, sin acoplarnos a la interfaz completa de StoryPage.
export interface ExecutableTestCase {
  id: number
  case_id?: string
  title: string
  precondition?: string
  steps?: Array<{ order: number; action: string; expected?: string }>
  expected_result?: string
}

interface Environment {
  id: string
  name: string
  isProduction?: boolean
}

// Ambientes hardcoded para esta iteración. Migrar a tabla `project_environments`
// en BD cuando hagamos el endpoint /api/projects/{id}/environments.
const ENVIRONMENTS: Environment[] = [
  { id: 'qa', name: 'QA' },
  { id: 'uat', name: 'UAT' },
  { id: 'prod', name: 'Producción', isProduction: true },
]

// Clave para persistir la última URL usada por ambiente en localStorage.
// Así el QA no tiene que reescribir la URL cada vez que abre el modal.
const URL_STORAGE_KEY = 'qa-hub:execute-modal:last-urls'

function loadLastUrls(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(URL_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveLastUrl(envId: string, url: string) {
  const all = loadLastUrls()
  all[envId] = url
  localStorage.setItem(URL_STORAGE_KEY, JSON.stringify(all))
}

interface Props {
  open: boolean
  cases: ExecutableTestCase[]
  onClose: () => void
  /**
   * Necesario para POST /api/test-runs. Si no se pasa, el botón "Ejecutar" se
   * deshabilita y solo queda disponible "Copiar prompt" como fallback.
   */
  projectId?: number
  /**
   * Callback cuando se crea exitosamente un run. El padre lo usa para abrir
   * el TestRunProgressPanel con el run_id devuelto por el backend.
   */
  onRunCreated?: (runId: number) => void
}

export default function ExecuteTestsModal({ open, cases, onClose, projectId, onRunCreated }: Props) {
  const [envId, setEnvId] = useState<string>('qa')
  const [baseUrl, setBaseUrl] = useState<string>('')
  const [executing, setExecuting] = useState(false)

  // Al abrir el modal, pre-cargar la última URL usada para ese ambiente.
  useEffect(() => {
    if (!open) return
    const last = loadLastUrls()
    setBaseUrl(last[envId] || '')
  }, [open, envId])

  // ── Validaciones ──────────────────────────────────────────────────────────
  const env = ENVIRONMENTS.find(e => e.id === envId)!
  const trimmedUrl = baseUrl.trim()
  const isValidUrl = /^https?:\/\/.+/i.test(trimmedUrl)
  const canConfirm = isValidUrl && cases.length > 0

  // ── Generador del prompt para el agente Playwright MCP ────────────────────
  // El prompt es lo que el QA copia y pega al chat del agente. Debe darle todo
  // lo necesario para ejecutar sin volver a preguntar nada al humano (salvo
  // login si la URL lo requiere).
  const prompt = useMemo(() => buildAgentPrompt(env, trimmedUrl, cases), [env, trimmedUrl, cases])

  if (!open) return null

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      saveLastUrl(envId, trimmedUrl)
      toast.success(
        `Prompt copiado. Pégalo al chat del agente para ejecutar ${cases.length} caso${cases.length > 1 ? 's' : ''}.`,
        { duration: 4500, icon: <CheckCircle className="w-4 h-4 text-slds-success" /> },
      )
      onClose()
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  async function handleExecute() {
    if (!projectId) {
      toast.error('Falta projectId — no se puede ejecutar sin proyecto.')
      return
    }
    setExecuting(true)
    try {
      const run = await testRunsApi.create({
        project_id: projectId,
        case_ids: cases.map((c) => c.id),
        env: envId,
        base_url: trimmedUrl,
        prompt,
      })
      saveLastUrl(envId, trimmedUrl)
      toast.success(
        `Run #${run.id} encolado. El worker lo procesará en breve.`,
        { duration: 3500, icon: <CheckCircle className="w-4 h-4 text-slds-success" /> },
      )
      onRunCreated?.(run.id)
      onClose()
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      // FastAPI puede devolver detail como string o como lista de errores Pydantic.
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join('; ')
          : 'No se pudo crear el run. Verifica que el backend esté corriendo.'
      toast.error(msg, { duration: 5000 })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="slds-modal-backdrop">
      <div className="slds-modal" style={{ maxWidth: '640px' }}>
        <div className="slds-modal__header">
          <h3 className="font-semibold text-slds-neutral-10 flex items-center gap-2">
            <Play className="w-4 h-4 text-slds-brand" />
            Ejecutar casos de prueba
          </h3>
          <button onClick={onClose} className="slds-btn-icon">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="slds-modal__body space-y-4">
          {/* Resumen de casos seleccionados */}
          <div>
            <p className="slds-label mb-1">
              Casos seleccionados
              <span className="ml-2 slds-badge slds-badge-brand">{cases.length}</span>
            </p>
            <ul className="text-xs text-slds-neutral-8 bg-slds-neutral-2 rounded-slds p-2 max-h-32 overflow-y-auto space-y-1">
              {cases.slice(0, 5).map(tc => (
                <li key={tc.id} className="truncate">
                  <span className="font-mono text-slds-neutral-7">{tc.case_id || `TC-${tc.id}`}</span>
                  {' — '}
                  {tc.title}
                </li>
              ))}
              {cases.length > 5 && (
                <li className="italic text-slds-neutral-6">…y {cases.length - 5} más</li>
              )}
            </ul>
          </div>

          {/* Selector de ambiente */}
          <div>
            <label className="slds-label">Ambiente</label>
            <div className="flex gap-2">
              {ENVIRONMENTS.map(e => {
                const active = e.id === envId
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEnvId(e.id)}
                    className={
                      'flex-1 text-xs py-2 px-3 rounded-slds border transition-colors ' +
                      (active
                        ? e.isProduction
                          ? 'border-slds-error bg-slds-error text-white font-semibold'
                          : 'border-slds-brand bg-slds-brand text-white font-semibold'
                        : 'border-slds-neutral-4 bg-white text-slds-neutral-8 hover:bg-slds-neutral-2')
                    }
                  >
                    {e.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* URL base editable */}
          <div>
            <label className="slds-label flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-slds-neutral-7" />
              URL base ({env.name})
            </label>
            <input
              type="url"
              className="slds-input"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder={env.isProduction ? 'https://miapp.com' : `https://${env.id}.miapp.com`}
              autoFocus
            />
            {trimmedUrl && !isValidUrl && (
              <p className="text-xs text-slds-error mt-1">
                La URL debe empezar con http:// o https://
              </p>
            )}
          </div>

          {/* Warning si es producción */}
          {env.isProduction && (
            <div className="flex items-start gap-2 bg-slds-error-bg border border-slds-error rounded-slds p-3 text-xs">
              <AlertTriangle className="w-4 h-4 text-slds-error flex-shrink-0 mt-0.5" />
              <div className="text-slds-error">
                <p className="font-semibold">Estás a punto de ejecutar contra PRODUCCIÓN</p>
                <p className="text-slds-neutral-8 mt-1">
                  Asegúrate de que tus casos sean idempotentes y no realicen acciones destructivas
                  (crear, borrar, modificar datos reales).
                </p>
              </div>
            </div>
          )}

          {/* Explicación de qué va a pasar */}
          <div className="bg-slds-brand-light border border-slds-brand rounded-slds p-3 text-xs text-slds-neutral-8">
            <p className="font-semibold text-slds-brand mb-1">¿Qué pasará al ejecutar?</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Se creará un run en cola y el qa-worker lo tomará en ≤2s.</li>
              <li>El worker abrirá Chromium y navegará a la URL del ambiente.</li>
              <li>Si la app pide login, el run pasará a "Esperando login" y el panel mostrará un botón "Ya me logué".</li>
              <li>Cuando el agente termine, verás el reporte estructurado en el panel.</li>
            </ol>
            <p className="mt-2 text-slds-neutral-7">
              <strong>Requisito:</strong> el qa-worker debe estar corriendo localmente
              (<code className="font-mono text-[10px]">cd qa-worker &amp;&amp; npm start</code>).
            </p>
          </div>
        </div>

        <div className="slds-modal__footer">
          <button onClick={onClose} className="slds-btn-neutral" disabled={executing}>
            Cancelar
          </button>
          <button
            onClick={handleCopyPrompt}
            disabled={!canConfirm || executing}
            className="slds-btn-neutral"
            title={!isValidUrl ? 'Ingresa una URL válida' : 'Copiar prompt al portapapeles (fallback manual)'}
          >
            <Copy className="w-3.5 h-3.5" />
            Solo copiar prompt
          </button>
          <button
            onClick={handleExecute}
            disabled={!canConfirm || executing || !projectId}
            className="slds-btn-brand"
            title={
              !projectId ? 'Falta projectId' :
              !isValidUrl ? 'Ingresa una URL válida' :
              'Crear run y ejecutar automáticamente'
            }
          >
            {executing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {executing ? 'Encolando…' : 'Ejecutar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Builder del prompt ────────────────────────────────────────────────────────
// Aislado en una función pura para poder testearla fácil más adelante y para
// que el componente quede legible. El formato está pensado para que el LLM lo
// entienda sin ambigüedad y mapee cada paso a una tool del MCP.
function buildAgentPrompt(env: Environment, baseUrl: string, cases: ExecutableTestCase[]): string {
  const lines: string[] = []

  lines.push(`Necesito que ejecutes ${cases.length} caso(s) de prueba usando Playwright MCP.`)
  lines.push('')
  lines.push(`AMBIENTE: ${env.name}`)
  lines.push(`URL BASE: ${baseUrl}`)
  if (env.isProduction) {
    lines.push('⚠️ PRODUCCIÓN — evita acciones destructivas; verifica antes de cada submit.')
  }
  lines.push('')
  lines.push('PROTOCOLO:')
  lines.push('1. browser_navigate a la URL base.')
  lines.push('2. Si la app pide login, pausa y dime "necesito que te logues". Yo lo hago manualmente en la ventana.')
  lines.push('3. Cuando confirme que ya estoy logueado, ejecuta cada caso en orden.')
  lines.push('4. Para cada caso:')
  lines.push('   a) PRE-CHECK: browser_snapshot del estado inicial. Si el "Resultado esperado"')
  lines.push('      ya se cumple SIN ejecutar pasos modificatorios, marca el caso como')
  lines.push('      ⚠️ PASSED-PREEXISTING y NO ejecutes acciones que modifiquen datos.')
  lines.push('      Documenta qué evidencia te lleva a esa conclusión.')
  lines.push('   b) Aplica la precondición si existe (solo verificación, no creación de datos).')
  lines.push('      Si la precondición pide datos que no existen, marca ⏸ BLOCKED con razón.')
  lines.push('   c) Recorre los pasos en orden. Mapea cada paso al tool MCP apropiado:')
  lines.push('      "ir a / navegar a X" -> browser_navigate')
  lines.push('      "click en X" -> browser_click')
  lines.push('      "escribir / ingresar X en Y" -> browser_type o browser_fill_form')
  lines.push('      "seleccionar X de Y" -> browser_select_option')
  lines.push('      "subir archivo X" -> browser_file_upload')
  lines.push('   d) Después de cada paso, browser_snapshot para confirmar el estado.')
  lines.push('      Si el paso trae "expected", verifica que aparezca en el snapshot.')
  lines.push('   e) Naming de elementos: si un label literal no aparece, busca variaciones')
  lines.push('      comunes (API name, sufijos custom como __c, _SF, _c, traducciones')
  lines.push('      ES/EN). Si encuentras un candidato razonable úsalo y documéntalo en')
  lines.push('      la nota; si hay ambigüedad real, marca ⏸ BLOCKED.')
  lines.push('   f) Si el caso parece de verificación (verbos: "verificar", "visualizar",')
  lines.push('      "consultar", "validar"), NUNCA hagas click en "Save", "Guardar" ni')
  lines.push('      submits que persistan cambios. Usa "Cancel"/"Cancelar"/Esc para salir.')
  lines.push('5. Al terminar un caso, verifica "Resultado esperado" global y márcalo:')
  lines.push('   ✅ PASSED — todos los pasos corrieron y el resultado esperado se cumple.')
  lines.push('   ⚠️ PASSED-PREEXISTING — el resultado esperado ya estaba cumplido al inicio.')
  lines.push('   ❌ FAILED — un paso o la verificación final no pasó (incluye razón + screenshot).')
  lines.push('   ⏸ BLOCKED — no se pudo ejecutar (datos faltantes, login bloqueado, etc.).')
  lines.push('   ⏭ SKIPPED — el caso no aplica al ambiente actual (razón breve).')
  lines.push('6. Al final, dame una tabla resumen con columnas:')
  lines.push('   case_id | estado | acciones tomadas | evidencia (path screenshot) | nota')
  lines.push('')
  lines.push('CASOS:')
  lines.push('')

  cases.forEach((tc, i) => {
    const id = tc.case_id || `TC-${tc.id}`
    lines.push(`### ${i + 1}. [${id}] ${tc.title}`)
    if (tc.precondition) {
      lines.push(`Precondición: ${tc.precondition}`)
    }
    if (tc.steps && tc.steps.length > 0) {
      lines.push('Pasos:')
      tc.steps.forEach(s => {
        const expected = s.expected ? ` → ${s.expected}` : ''
        lines.push(`  ${s.order}. ${s.action}${expected}`)
      })
    }
    if (tc.expected_result) {
      lines.push(`Resultado esperado: ${tc.expected_result}`)
    }
    lines.push('')
  })

  return lines.join('\n')
}
