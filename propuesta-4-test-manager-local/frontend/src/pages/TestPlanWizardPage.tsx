import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Home, Plus, Sparkles, Save,
  Trash2, Loader2, Wand2, FileCheck2, AlertTriangle, Info, Bot, ListChecks,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import {
  coachApi, emptyWizardData, projectsApi, testPlansApi,
  type ApprovalRow, type AssistField, type AssumptionRow, type CoachAction,
  type DependencyRow, type DeploymentFrequencyRow, type RiskRow, type TestPlanWizardData,
  type VersionHistoryRow,
} from '../api'

// ── Helpers compartidos ──────────────────────────────────────────────────────

function showApiError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail
  if (err?.response?.status === 429) {
    toast.error(typeof detail === 'string' ? detail : 'Cuota mensual de IA excedida')
    return
  }
  toast.error(typeof detail === 'string' ? detail : fallback)
}

const PROBABILITY_OPTIONS = ['Alto', 'Medio', 'Bajo']
const ROLE_OPTIONS = ['Project Manager', 'Product Owner', 'QA Lead', 'Business Sponsor', 'Otro']
const SPRINT_WEEKS_OPTIONS = ['1', '2', '3', '4']

// ── Field primitive ──────────────────────────────────────────────────────────

function Field({
  label, hint, required, children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="slds-label flex items-center gap-1">
        {label}
        {required && <span className="text-slds-error">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slds-neutral-6 mt-1">{hint}</p>}
    </div>
  )
}

// ── AI assist textarea: textarea + botón "✨ Generar con AI" ─────────────────

function AiTextarea({
  field, value, onChange, placeholder, rows = 4, projectContext,
}: {
  field: AssistField
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  projectContext?: string
}) {
  const [busy, setBusy] = useState(false)

  async function handleAssist() {
    setBusy(true)
    try {
      const r = await testPlansApi.assistField(field, value, projectContext)
      onChange(r.content)
      toast.success('Texto generado con IA')
    } catch (err) {
      showApiError(err, 'No se pudo generar con IA')
    } finally { setBusy(false) }
  }

  return (
    <div className="relative">
      <textarea
        className="slds-textarea pr-32"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        onClick={handleAssist}
        disabled={busy}
        className={clsx(
          'absolute top-2 right-2 px-2 py-1 rounded-slds text-xs',
          'inline-flex items-center gap-1 border',
          busy
            ? 'bg-slds-neutral-2 border-slds-neutral-4 text-slds-neutral-6'
            : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',
        )}
        title={value ? 'Refinar texto con IA' : 'Generar contenido con IA'}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
        {value ? 'Refinar' : 'Generar'} con IA
      </button>
    </div>
  )
}

// ── Repeatable section primitive ─────────────────────────────────────────────

function RepeatableSection<T>({
  title, items, onChange, emptyTemplate, emptyHint, renderRow,
}: {
  title: string
  items: T[]
  onChange: (next: T[]) => void
  emptyTemplate: () => T
  emptyHint?: string
  renderRow: (item: T, idx: number, update: (patch: Partial<T>) => void, remove: () => void) => React.ReactNode
}) {
  function update(idx: number, patch: Partial<T>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }
  function add() {
    onChange([...items, emptyTemplate()])
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slds-neutral-10">{title}</h4>
        <button onClick={add} className="slds-btn-neutral text-xs">
          <Plus className="w-3.5 h-3.5" /> Agregar
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slds-neutral-6 italic py-3 text-center bg-slds-neutral-1 rounded-slds">
          {emptyHint || 'Sin filas. Hacé clic en "Agregar" para empezar.'}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="border border-slds-neutral-4 rounded-slds p-3 relative">
              <button
                onClick={() => remove(i)}
                className="absolute top-2 right-2 text-slds-neutral-6 hover:text-slds-error"
                title="Eliminar fila"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {renderRow(it, i, (patch) => update(i, patch), () => remove(i))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Steps ────────────────────────────────────────────────────────────────────

function Step0Identification({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Nombre del cliente" required hint="Como debe aparecer en el documento.">
          <input
            className="slds-input"
            value={d.client_name}
            onChange={(e) => set({ client_name: e.target.value })}
            placeholder="Banco Ejemplo S.A."
          />
        </Field>
        <Field label="ID del SOW" required hint="Identificador del Statement of Work.">
          <input
            className="slds-input"
            value={d.sow_id}
            onChange={(e) => set({ sow_id: e.target.value })}
            placeholder="SOW-2026-0123"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Versión inicial">
          <input
            className="slds-input"
            value={d.doc_version}
            onChange={(e) => set({ doc_version: e.target.value })}
            placeholder="1.0"
          />
        </Field>
        <Field label="Año del aviso de confidencialidad">
          <input
            className="slds-input"
            value={d.confidentiality_year}
            onChange={(e) => set({ confidentiality_year: e.target.value })}
            placeholder={String(new Date().getFullYear())}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Herramienta de gestión de pruebas">
          <select
            className="slds-input"
            value={d.test_management_tool}
            onChange={(e) => set({ test_management_tool: e.target.value })}
          >
            {['JIRA', 'Azure DevOps', 'TestRail', 'Otro'].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label="Herramienta de gestión de defectos">
          <input
            className="slds-input"
            value={d.defect_management_tool}
            onChange={(e) => set({ defect_management_tool: e.target.value })}
          />
        </Field>
        <Field label="Navegadores objetivo">
          <input
            className="slds-input"
            value={d.browsers}
            onChange={(e) => set({ browsers: e.target.value })}
            placeholder="Google Chrome"
          />
        </Field>
      </div>
    </div>
  )
}

function Step1Versions({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <RepeatableSection<VersionHistoryRow>
      title="Historial de versiones"
      items={d.version_history}
      onChange={(version_history) => set({ version_history })}
      emptyTemplate={() => ({ version: '1.0', date: '', description: '', author: '' })}
      emptyHint="Si no agregás ninguna fila, se marcará pendiente para que el QA la complete después."
      renderRow={(it, _i, update) => (
        <div className="grid grid-cols-12 gap-2 pr-6">
          <div className="col-span-2">
            <label className="text-xs text-slds-neutral-7">Versión</label>
            <input
              className="slds-input text-sm" value={it.version}
              onChange={(e) => update({ version: e.target.value })}
              placeholder="1.0"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slds-neutral-7">Fecha (DD/MM/YYYY)</label>
            <input
              className="slds-input text-sm" value={it.date}
              onChange={(e) => update({ date: e.target.value })}
              placeholder="15/04/2026"
            />
          </div>
          <div className="col-span-5">
            <label className="text-xs text-slds-neutral-7">Descripción del cambio</label>
            <input
              className="slds-input text-sm" value={it.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Versión inicial"
            />
          </div>
          <div className="col-span-3">
            <label className="text-xs text-slds-neutral-7">Autor</label>
            <input
              className="slds-input text-sm" value={it.author}
              onChange={(e) => update({ author: e.target.value })}
              placeholder="Juan Pérez"
            />
          </div>
        </div>
      )}
    />
  )
}

function Step2BusinessGoal({ d, set, ctx }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void; ctx?: string }) {
  return (
    <Field
      label="Objetivo de negocio"
      hint="1-3 párrafos describiendo el objetivo del proyecto. Si lo dejás vacío, la IA puede escribir una versión inicial."
    >
      <AiTextarea
        field="business_goal" value={d.business_goal}
        onChange={(v) => set({ business_goal: v })}
        rows={6}
        placeholder="El proyecto busca implementar..."
        projectContext={ctx}
      />
    </Field>
  )
}

function Step3Scope({ d, set, ctx }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void; ctx?: string }) {
  return (
    <Field
      label="Alcance — qué queda fuera"
      hint="Bullets de lo que NO entra en alcance del QA (integraciones, performance, mobile, data migration, etc.). 'Refinar con IA' normaliza el formato."
    >
      <AiTextarea
        field="scope_out" value={d.scope_out}
        onChange={(v) => set({ scope_out: v })}
        rows={6}
        placeholder="- Pruebas de performance&#10;- Integraciones con sistemas externos"
        projectContext={ctx}
      />
    </Field>
  )
}

function Step4Schedule({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Semanas por sprint">
        <select
          className="slds-input"
          value={d.sprint_weeks}
          onChange={(e) => set({ sprint_weeks: e.target.value })}
        >
          {SPRINT_WEEKS_OPTIONS.map((o) => (
            <option key={o} value={o}>{o} semana{o !== '1' && 's'}</option>
          ))}
        </select>
      </Field>
      <Field
        label="Roadmap del proyecto"
        hint="Si no tenés roadmap escrito, dejá vacío y se marcará como pendiente."
      >
        <textarea
          className="slds-textarea"
          rows={6}
          value={d.project_roadmap}
          onChange={(e) => set({ project_roadmap: e.target.value })}
          placeholder="Sprint 1: Discovery&#10;Sprint 2-3: MVP&#10;Sprint 4: UAT"
        />
      </Field>
    </div>
  )
}

function Step5Environments({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Field label="Ambiente DEV">
          <input className="slds-input" value={d.env_dev_name} onChange={(e) => set({ env_dev_name: e.target.value })} />
        </Field>
        <Field label="Ambiente QA">
          <input className="slds-input" value={d.env_qa_name} onChange={(e) => set({ env_qa_name: e.target.value })} />
        </Field>
        <Field label="Ambiente SIT">
          <input className="slds-input" value={d.env_sit_name} onChange={(e) => set({ env_sit_name: e.target.value })} />
        </Field>
        <Field label="Ambiente UAT">
          <input className="slds-input" value={d.env_uat_name} onChange={(e) => set({ env_uat_name: e.target.value })} />
        </Field>
      </div>
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Si dejás <strong>Frecuencia de despliegues</strong> vacío, se usa una configuración estándar.
        </span>
      </div>
      <RepeatableSection<DeploymentFrequencyRow>
        title="Frecuencia de despliegues (opcional, sobreescribe defaults)"
        items={d.deployment_frequency}
        onChange={(deployment_frequency) => set({ deployment_frequency })}
        emptyTemplate={() => ({ responsible: '', from_env: '', to_env: '', frequency: '' })}
        emptyHint="Vacío = se usa la configuración estándar."
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-4 gap-2 pr-6">
            <div>
              <label className="text-xs text-slds-neutral-7">Responsable</label>
              <input className="slds-input text-sm" value={it.responsible} onChange={(e) => update({ responsible: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Desde</label>
              <input className="slds-input text-sm" value={it.from_env} onChange={(e) => update({ from_env: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Hacia</label>
              <input className="slds-input text-sm" value={it.to_env} onChange={(e) => update({ to_env: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Frecuencia</label>
              <input className="slds-input text-sm" value={it.frequency} onChange={(e) => update({ frequency: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step6Lifecycle({ d, set, ctx }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void; ctx?: string }) {
  return (
    <div className="space-y-4">
      <Field
        label="Ciclo de vida de la Historia de Usuario"
        hint="Estados que usa el equipo, flujos de aprobación, definition of ready/done."
      >
        <AiTextarea
          field="user_story_lifecycle" value={d.user_story_lifecycle}
          onChange={(v) => set({ user_story_lifecycle: v })}
          rows={5}
          placeholder="Backlog → Ready for Dev → In Progress → Code Review → Ready for QA → In Test → Done"
          projectContext={ctx}
        />
      </Field>
      <Field
        label="Capacidad del squad de Salesforce"
        hint="Cómo se distribuye la capacidad por sprint (% dev, % QA, % otros)."
      >
        <AiTextarea
          field="salesforce_capacity" value={d.salesforce_capacity}
          onChange={(v) => set({ salesforce_capacity: v })}
          rows={4}
          placeholder="60% desarrollo, 30% QA, 10% revisiones e imprevistos"
          projectContext={ctx}
        />
      </Field>
    </div>
  )
}

function Step7Assumptions({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <div className="space-y-3">
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Ya hay 5 suposiciones estándar incluidas. Acá solo agregás las
          adicionales (A6, A7, ...) específicas del cliente. Vacío está OK.
        </span>
      </div>
      <RepeatableSection<AssumptionRow>
        title="Suposiciones extra"
        items={d.extra_assumptions}
        onChange={(extra_assumptions) => set({ extra_assumptions })}
        emptyTemplate={() => ({ code: `A${(d.extra_assumptions.length || 0) + 6}`, description: '' })}
        emptyHint="Sin suposiciones extra. Las 5 estándar ya están incluidas."
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-12 gap-2 pr-6">
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">Código</label>
              <input className="slds-input text-sm" value={it.code} onChange={(e) => update({ code: e.target.value })} placeholder="A6" />
            </div>
            <div className="col-span-10">
              <label className="text-xs text-slds-neutral-7">Descripción</label>
              <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step8Risks({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <div className="space-y-6">
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Ya hay 5 riesgos estándar incluidos (atraso, ambigüedad de requisitos, cambios
          frecuentes, falta de recursos, historias al final del sprint) y 3 dependencias estándar.
          Acá solo agregás los específicos del cliente.
        </span>
      </div>
      <RepeatableSection<RiskRow>
        title="Riesgos extra"
        items={d.extra_risks}
        onChange={(extra_risks) => set({ extra_risks })}
        emptyTemplate={() => ({
          code: String((d.extra_risks.length || 0) + 6),
          description: '', probability: 'Medio', impact: 'Medio', mitigation: '',
        })}
        emptyHint="Sin riesgos extra. Los 5 estándar ya están incluidos."
        renderRow={(it, _i, update) => (
          <div className="space-y-2 pr-6">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-1">
                <label className="text-xs text-slds-neutral-7">#</label>
                <input className="slds-input text-sm" value={it.code} onChange={(e) => update({ code: e.target.value })} />
              </div>
              <div className="col-span-7">
                <label className="text-xs text-slds-neutral-7">Descripción</label>
                <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slds-neutral-7">Probabilidad</label>
                <select className="slds-input text-sm" value={it.probability} onChange={(e) => update({ probability: e.target.value })}>
                  {PROBABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slds-neutral-7">Impacto</label>
                <select className="slds-input text-sm" value={it.impact} onChange={(e) => update({ impact: e.target.value })}>
                  {PROBABILITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Estrategia de mitigación</label>
              <input className="slds-input text-sm" value={it.mitigation} onChange={(e) => update({ mitigation: e.target.value })} />
            </div>
          </div>
        )}
      />
      <RepeatableSection<DependencyRow>
        title="Dependencias extra"
        items={d.extra_dependencies}
        onChange={(extra_dependencies) => set({ extra_dependencies })}
        emptyTemplate={() => ({ description: '', impact: '', responsible: '' })}
        emptyHint="Sin dependencias extra. Las 3 estándar ya están incluidas."
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-3 gap-2 pr-6">
            <div>
              <label className="text-xs text-slds-neutral-7">Descripción</label>
              <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Impacto</label>
              <input className="slds-input text-sm" value={it.impact} onChange={(e) => update({ impact: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">Responsables</label>
              <input className="slds-input text-sm" value={it.responsible} onChange={(e) => update({ responsible: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step9Approvals({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  return (
    <RepeatableSection<ApprovalRow>
      title="Aprobadores del plan"
      items={d.approvals}
      onChange={(approvals) => set({ approvals })}
      emptyTemplate={() => ({ name: '', company: '', role: 'QA Lead', date: '' })}
      emptyHint="Si no agregás aprobadores, se marca pendiente. Los nombres se cierran a mano en Google Docs después."
      renderRow={(it, _i, update) => (
        <div className="space-y-2 pr-6">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <label className="text-xs text-slds-neutral-7">Nombre</label>
              <input className="slds-input text-sm" value={it.name} onChange={(e) => update({ name: e.target.value })} placeholder="María García" />
            </div>
            <div className="col-span-4">
              <label className="text-xs text-slds-neutral-7">Compañía</label>
              <input className="slds-input text-sm" value={it.company} onChange={(e) => update({ company: e.target.value })} placeholder="Cliente / Salesforce" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">Rol</label>
              <select className="slds-input text-sm" value={it.role} onChange={(e) => update({ role: e.target.value })}>
                {ROLE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">Fecha (opcional)</label>
              <input className="slds-input text-sm" value={it.date || ''} onChange={(e) => update({ date: e.target.value })} placeholder="15/05/2026" />
            </div>
          </div>
        </div>
      )}
    />
  )
}

function StepReview({
  d, useAi, setUseAi, isGenerating,
}: {
  d: TestPlanWizardData
  useAi: boolean
  setUseAi: (v: boolean) => void
  isGenerating: boolean
}) {
  const proseEmpty = !d.business_goal || !d.user_story_lifecycle || !d.salesforce_capacity || !d.scope_out
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">Cliente</p>
          <p className="font-semibold">{d.client_name || <em className="text-slds-error">Pendiente</em>}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">SOW</p>
          <p className="font-semibold">{d.sow_id || <em className="text-slds-error">Pendiente</em>}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">Versión</p>
          <p className="font-semibold">v{d.doc_version}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">Sprint</p>
          <p className="font-semibold">{d.sprint_weeks} semana{d.sprint_weeks !== '1' && 's'}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">Aprobadores</p>
          <p className="font-semibold">{d.approvals.length} cargado{d.approvals.length !== 1 && 's'}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">Versiones en historial</p>
          <p className="font-semibold">{d.version_history.length}</p>
        </div>
      </div>

      {proseEmpty && (
        <div className="border border-yellow-200 bg-yellow-50 rounded-slds p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-yellow-900">Hay campos narrativos vacíos</p>
            <p className="text-yellow-800 text-xs mt-1">
              {d.business_goal ? '' : 'objetivo de negocio, '}
              {d.scope_out ? '' : 'alcance, '}
              {d.user_story_lifecycle ? '' : 'ciclo de vida, '}
              {d.salesforce_capacity ? '' : 'capacidad del squad, '}
              están vacíos. Activá "Generar con IA" para que se completen automáticamente.
              Si no, quedarán como <code>[[PENDIENTE]]</code> en el documento.
            </p>
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer p-3 border border-slds-neutral-4 rounded-slds hover:bg-slds-neutral-1">
        <input
          type="checkbox"
          checked={useAi}
          onChange={(e) => setUseAi(e.target.checked)}
          className="mt-1"
        />
        <div>
          <p className="text-sm font-semibold flex items-center gap-1">
            <Wand2 className="w-3.5 h-3.5 text-purple-600" />
            Generar campos narrativos vacíos con IA
          </p>
          <p className="text-xs text-slds-neutral-7 mt-1">
            Cuenta contra tu cuota mensual de IA. Si lo desactivás, los campos vacíos quedan
            como <code>[[PENDIENTE]]</code> y los completás manualmente en Google Docs.
          </p>
        </div>
      </label>

      <div className="bg-slds-brand-light border border-slds-brand/20 rounded-slds p-3 text-xs text-slds-brand">
        <p className="font-semibold">¿Qué pasa al generar?</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li>Se carga la plantilla del documento.</li>
          <li>Se llenan los datos que cargaste en el asistente.</li>
          {useAi && <li>La IA llena los campos narrativos vacíos.</li>}
          <li>Cualquier campo sin datos queda como <code>[[PENDIENTE: NOMBRE]]</code>.</li>
          <li>El plan queda en estado <strong>generated</strong> y podés descargar el .md.</li>
        </ol>
      </div>

      {isGenerating && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 text-slds-brand animate-spin mx-auto" />
          <p className="text-sm text-slds-neutral-7 mt-2">Generando test plan...</p>
        </div>
      )}
    </div>
  )
}

// ── Page principal ───────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: 'Identificación', icon: '0' },
  { id: 1, label: 'Historial de versiones', icon: '1' },
  { id: 2, label: 'Objetivo de negocio', icon: '2' },
  { id: 3, label: 'Alcance', icon: '3' },
  { id: 4, label: 'Cronograma', icon: '4' },
  { id: 5, label: 'Ambientes', icon: '5' },
  { id: 6, label: 'HU lifecycle', icon: '6' },
  { id: 7, label: 'Suposiciones extra', icon: '7' },
  { id: 8, label: 'Riesgos & Dependencias', icon: '8' },
  { id: 9, label: 'Aprobación', icon: '9' },
  { id: 10, label: 'Revisar y generar', icon: '✓' },
]

const FIELD_TO_STEP: Record<string, number> = {
  client_name: 0, sow_id: 0, doc_version: 0, confidentiality_year: 0,
  test_management_tool: 0, defect_management_tool: 0, browsers: 0,
  version_history: 1,
  business_goal: 2,
  scope_out: 3,
  sprint_weeks: 4, project_roadmap: 4,
  env_dev_name: 5, env_qa_name: 5, env_sit_name: 5, env_uat_name: 5,
  deployment_frequency: 5,
  user_story_lifecycle: 6, salesforce_capacity: 6,
  extra_assumptions: 7,
  extra_risks: 8, extra_dependencies: 8,
  approvals: 9,
}

function ViolationsBanner({
  violations, onJumpTo,
}: {
  violations: CoachAction[]
  onJumpTo: (step: number) => void
}) {
  if (!violations || violations.length === 0) return null

  const blockers = violations.filter((v) => v.kind === 'block' || v.severity === 'error')
  const warns = violations.filter((v) => v.kind === 'warn' || (v.severity === 'warn' && v.kind !== 'block'))

  const hasBlockers = blockers.length > 0
  const tone = hasBlockers
    ? { wrap: 'border-red-300 bg-red-50', title: 'text-red-900', body: 'text-red-800', icon: 'text-red-600' }
    : { wrap: 'border-amber-300 bg-amber-50', title: 'text-amber-900', body: 'text-amber-800', icon: 'text-amber-600' }

  const items = [...blockers, ...warns]

  return (
    <div className={clsx('border rounded-slds p-3 mb-3', tone.wrap)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={clsx('w-4 h-4 mt-0.5 flex-shrink-0', tone.icon)} />
        <div className="flex-1">
          <p className={clsx('text-sm font-semibold', tone.title)}>
            {hasBlockers
              ? `${blockers.length} ${blockers.length === 1 ? 'error que bloquea la generación' : 'errores que bloquean la generación'}`
              : `${warns.length} ${warns.length === 1 ? 'aviso' : 'avisos'} para revisar`}
            {warns.length > 0 && hasBlockers && ` · ${warns.length} aviso${warns.length === 1 ? '' : 's'} adicional${warns.length === 1 ? '' : 'es'}`}
          </p>
          <ul className={clsx('mt-2 space-y-1.5', tone.body)}>
            {items.map((v, i) => {
              const targetStep = v.field ? FIELD_TO_STEP[v.field] : undefined
              return (
                <li key={i} className="text-xs flex items-start gap-2">
                  <span className="leading-relaxed flex-1">
                    <span className="font-semibold">
                      {v.kind === 'block' || v.severity === 'error' ? '⚠ ' : '· '}
                    </span>
                    {v.rationale || v.label || 'Regla violada'}
                    {v.hint && <span className="block text-[11px] opacity-80 mt-0.5">{v.hint}</span>}
                  </span>
                  {targetStep !== undefined && (
                    <button
                      type="button"
                      onClick={() => onJumpTo(targetStep)}
                      className="text-xs underline hover:no-underline flex-shrink-0"
                      title={`Ir al paso ${targetStep + 1}`}
                    >
                      Ir al campo →
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function TestPlanWizardPage() {
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>()
  const id = Number(projectId)
  const editing = !!planId
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState(0)
  const [data, setData] = useState<TestPlanWizardData>(emptyWizardData())
  const [useAi, setUseAi] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [isGenerating, setGenerating] = useState(false)
  const [violations, setViolations] = useState<CoachAction[]>([])
  const [canGenerate, setCanGenerate] = useState(true)

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
  })
  const { data: existingPlan } = useQuery({
    queryKey: ['test-plan', planId],
    queryFn: () => testPlansApi.get(Number(planId)),
    enabled: editing,
  })

  useEffect(() => {
    if (existingPlan) setData(existingPlan.wizard_data)
  }, [existingPlan])

  useEffect(() => {
    if (existingPlan?.id) {
      refreshValidations(existingPlan.id)
    }
  }, [existingPlan?.id])

  async function refreshValidations(
    targetId: number,
  ): Promise<{ canGenerate: boolean; violations: CoachAction[] } | null> {
    try {
      const r = await coachApi.validate(targetId)
      setViolations(r.violations)
      setCanGenerate(r.can_generate)
      return { canGenerate: r.can_generate, violations: r.violations }
    } catch {
      return null
    }
  }

  function patch(p: Partial<TestPlanWizardData>) {
    setData((prev) => ({ ...prev, ...p }))
  }

  async function handleSaveDraft(): Promise<number | null> {
    if (!data.client_name.trim() || !data.sow_id.trim()) {
      toast.error('Cliente y SOW son obligatorios para guardar')
      setStep(0)
      return null
    }
    setSaving(true)
    try {
      let plan
      if (editing) {
        plan = await testPlansApi.update(Number(planId), data)
      } else {
        plan = await testPlansApi.create(id, data)
      }
      queryClient.invalidateQueries({ queryKey: ['test-plans', id] })
      queryClient.invalidateQueries({ queryKey: ['test-plan', String(plan.id)] })
      toast.success('Borrador guardado')
      refreshValidations(plan.id)
      return plan.id
    } catch (err) {
      showApiError(err, 'No se pudo guardar')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    const targetId = await handleSaveDraft()
    if (!targetId) return
    const v = await refreshValidations(targetId)
    if (v && !v.canGenerate) {
      const firstBlocker = v.violations.find((x) => x.kind === 'block' || x.severity === 'error')
      const targetStep = firstBlocker?.field ? FIELD_TO_STEP[firstBlocker.field] : undefined
      toast.error('Hay errores que bloquean la generación. Mirá el banner arriba.')
      if (typeof targetStep === 'number') setStep(targetStep)
      return
    }
    setGenerating(true)
    try {
      const plan = await testPlansApi.generate(targetId, useAi)
      queryClient.invalidateQueries({ queryKey: ['test-plans', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      const pendingCount = plan.pending_fields.length
      toast.success(
        pendingCount
          ? `Test plan generado (${pendingCount} campos pendientes)`
          : 'Test plan generado completo'
      )
      navigate(`/projects/${id}/test-plans/${plan.id}`)
    } catch (err) {
      showApiError(err, 'No se pudo generar')
    } finally {
      setGenerating(false)
    }
  }

  const ctx = project?.description as string | undefined

  function renderStep() {
    switch (step) {
      case 0: return <Step0Identification d={data} set={patch} />
      case 1: return <Step1Versions d={data} set={patch} />
      case 2: return <Step2BusinessGoal d={data} set={patch} ctx={ctx} />
      case 3: return <Step3Scope d={data} set={patch} ctx={ctx} />
      case 4: return <Step4Schedule d={data} set={patch} />
      case 5: return <Step5Environments d={data} set={patch} />
      case 6: return <Step6Lifecycle d={data} set={patch} ctx={ctx} />
      case 7: return <Step7Assumptions d={data} set={patch} />
      case 8: return <Step8Risks d={data} set={patch} />
      case 9: return <Step9Approvals d={data} set={patch} />
      case 10: return <StepReview d={data} useAi={useAi} setUseAi={setUseAi} isGenerating={isGenerating} />
      default: return null
    }
  }

  const isLastStep = step === STEPS.length - 1

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
          {editing ? 'Editar' : 'Nuevo'}
        </span>
      </nav>

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-slds-brand" />
            {editing ? 'Editar' : 'Nuevo'} Test Plan
          </h1>
          <p className="text-sm text-slds-neutral-7 mt-0.5">
            Asistente paso a paso para llenar el documento.
          </p>
        </div>
        {editing && (
          <div
            className="inline-flex items-center bg-slds-neutral-2 border border-slds-neutral-4 rounded-slds p-0.5 text-xs flex-shrink-0"
            role="tablist"
            aria-label="Modo de edición"
          >
            <span
              className="px-3 py-1.5 rounded-slds bg-white text-slds-neutral-10 font-semibold shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              role="tab"
              aria-selected="true"
            >
              <ListChecks className="w-3.5 h-3.5" /> Formulario
            </span>
            <Link
              to={`/projects/${id}/test-plans/${planId}/coach`}
              className="px-3 py-1.5 rounded-slds text-slds-neutral-7 hover:text-slds-brand hover:bg-white/70 flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title="Cambiar a chat conversacional con el QA Coach"
              role="tab"
              aria-selected="false"
            >
              <Bot className="w-3.5 h-3.5" /> Chat
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar de pasos */}
        <aside className="col-span-3">
          <div className="slds-card p-2 sticky top-4">
            {STEPS.map((s) => (
              <button
                key={s.id}
                onClick={() => setStep(s.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-slds text-sm flex items-center gap-2',
                  s.id === step
                    ? 'bg-slds-brand text-white font-semibold'
                    : 'text-slds-neutral-10 hover:bg-slds-neutral-1',
                )}
              >
                <span className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  s.id === step
                    ? 'bg-white/20 text-white'
                    : s.id < step
                      ? 'bg-slds-success text-white'
                      : 'bg-slds-neutral-3 text-slds-neutral-7',
                )}>
                  {s.id < step && s.id !== STEPS.length - 1 ? '✓' : s.icon}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Form area */}
        <main className="col-span-9">
          <ViolationsBanner violations={violations} onJumpTo={(s) => setStep(s)} />
          <div className="slds-card p-6">
            <h2 className="font-semibold text-slds-neutral-10 mb-4 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-slds-brand text-white flex items-center justify-center text-sm font-bold">
                {STEPS[step].icon}
              </span>
              {STEPS[step].label}
            </h2>
            {renderStep()}
          </div>

          <div className="flex justify-between mt-4">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className={clsx(
                'slds-btn-neutral text-sm',
                step === 0 && 'opacity-40 cursor-not-allowed',
              )}
            >
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving || isGenerating}
                className="slds-btn-neutral text-sm"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar borrador
              </button>
              {!isLastStep ? (
                <button
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  className="slds-btn-brand text-sm"
                >
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || isSaving || !canGenerate}
                  title={!canGenerate ? 'Resolvé los errores marcados arriba antes de generar' : ''}
                  className={clsx(
                    'slds-btn-brand text-sm',
                    !canGenerate && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  Generar Test Plan
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
