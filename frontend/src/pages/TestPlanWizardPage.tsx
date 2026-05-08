import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronLeft, ChevronRight, Home, Plus, Sparkles, Save,
  Trash2, Loader2, Wand2, FileCheck2, AlertTriangle, Info, Bot, ListChecks,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import {
  coachApi, emptyWizardData, projectsApi, testPlansApi,
  type ApprovalRow, type AssistField, type AssumptionRow, type CoachAction,
  type DependencyRow, type DeploymentFrequencyRow, type RiskRow, type TestPlanWizardData,
  type VersionHistoryRow,
} from '../api'

// ── Helpers compartidos ──────────────────────────────────────────────────────

function showApiError(err: any, fallback: string, quotaMsg: string) {
  const detail = err?.response?.data?.detail
  if (err?.response?.status === 429) {
    toast.error(typeof detail === 'string' ? detail : quotaMsg)
    return
  }
  toast.error(typeof detail === 'string' ? detail : fallback)
}

const PROBABILITY_VALUES = ['Alto', 'Medio', 'Bajo']
const ROLE_BASE_OPTIONS = ['Project Manager', 'Product Owner', 'QA Lead', 'Business Sponsor']
const SPRINT_WEEKS_OPTIONS = ['1', '2', '3', '4']
const TEST_TOOL_OPTIONS = ['JIRA', 'Azure DevOps', 'TestRail']

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

// ── AI assist textarea ───────────────────────────────────────────────────────

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
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  async function handleAssist() {
    setBusy(true)
    try {
      const r = await testPlansApi.assistField(field, value, projectContext)
      onChange(r.content)
      toast.success(t('wizard.ai_success'))
    } catch (err) {
      showApiError(err, t('wizard.ai_error'), t('wizard.quota_error'))
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
        title={value ? t('wizard.ai_refine_title') : t('wizard.ai_generate_title')}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
        {value ? t('wizard.ai_refine_btn') : t('wizard.ai_generate_btn')}
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
  const { t } = useTranslation()

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
          <Plus className="w-3.5 h-3.5" /> {t('wizard.add_row')}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slds-neutral-6 italic py-3 text-center bg-slds-neutral-1 rounded-slds">
          {emptyHint || t('wizard.empty_rows')}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="border border-slds-neutral-4 rounded-slds p-3 relative">
              <button
                onClick={() => remove(i)}
                className="absolute top-2 right-2 text-slds-neutral-6 hover:text-slds-error"
                title={t('wizard.remove_row')}
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
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('wizard.s0_client_name')} required hint={t('wizard.s0_client_name_hint')}>
          <input
            className="slds-input"
            value={d.client_name}
            onChange={(e) => set({ client_name: e.target.value })}
            placeholder={t('wizard.s0_client_placeholder')}
          />
        </Field>
        <Field label={t('wizard.s0_sow_id')} required hint={t('wizard.s0_sow_id_hint')}>
          <input
            className="slds-input"
            value={d.sow_id}
            onChange={(e) => set({ sow_id: e.target.value })}
            placeholder={t('wizard.s0_sow_placeholder')}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('wizard.s0_version')}>
          <input
            className="slds-input"
            value={d.doc_version}
            onChange={(e) => set({ doc_version: e.target.value })}
            placeholder="1.0"
          />
        </Field>
        <Field label={t('wizard.s0_year')}>
          <input
            className="slds-input"
            value={d.confidentiality_year}
            onChange={(e) => set({ confidentiality_year: e.target.value })}
            placeholder={String(new Date().getFullYear())}
          />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label={t('wizard.s0_tool_test')}>
          <select
            className="slds-input"
            value={d.test_management_tool}
            onChange={(e) => set({ test_management_tool: e.target.value })}
          >
            {[...TEST_TOOL_OPTIONS, t('wizard.option_other')].map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>
        <Field label={t('wizard.s0_tool_defect')}>
          <input
            className="slds-input"
            value={d.defect_management_tool}
            onChange={(e) => set({ defect_management_tool: e.target.value })}
          />
        </Field>
        <Field label={t('wizard.s0_browsers')}>
          <input
            className="slds-input"
            value={d.browsers}
            onChange={(e) => set({ browsers: e.target.value })}
            placeholder={t('wizard.s0_browsers_placeholder')}
          />
        </Field>
      </div>
    </div>
  )
}

function Step1Versions({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <RepeatableSection<VersionHistoryRow>
      title={t('wizard.s1_title')}
      items={d.version_history}
      onChange={(version_history) => set({ version_history })}
      emptyTemplate={() => ({ version: '1.0', date: '', description: '', author: '' })}
      emptyHint={t('wizard.s1_empty_hint')}
      renderRow={(it, _i, update) => (
        <div className="grid grid-cols-12 gap-2 pr-6">
          <div className="col-span-2">
            <label className="text-xs text-slds-neutral-7">{t('wizard.s1_col_version')}</label>
            <input
              className="slds-input text-sm" value={it.version}
              onChange={(e) => update({ version: e.target.value })}
              placeholder="1.0"
            />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-slds-neutral-7">{t('wizard.s1_col_date')}</label>
            <input
              className="slds-input text-sm" value={it.date}
              onChange={(e) => update({ date: e.target.value })}
              placeholder="15/04/2026"
            />
          </div>
          <div className="col-span-5">
            <label className="text-xs text-slds-neutral-7">{t('wizard.s1_col_description')}</label>
            <input
              className="slds-input text-sm" value={it.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Versión inicial"
            />
          </div>
          <div className="col-span-3">
            <label className="text-xs text-slds-neutral-7">{t('wizard.s1_col_author')}</label>
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
  const { t } = useTranslation()
  return (
    <Field label={t('wizard.s2_label')} hint={t('wizard.s2_hint')}>
      <AiTextarea
        field="business_goal" value={d.business_goal}
        onChange={(v) => set({ business_goal: v })}
        rows={6}
        placeholder={t('wizard.s2_placeholder')}
        projectContext={ctx}
      />
    </Field>
  )
}

function Step3Scope({ d, set, ctx }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void; ctx?: string }) {
  const { t } = useTranslation()
  return (
    <Field label={t('wizard.s3_label')} hint={t('wizard.s3_hint')}>
      <AiTextarea
        field="scope_out" value={d.scope_out}
        onChange={(v) => set({ scope_out: v })}
        rows={6}
        placeholder={t('wizard.s3_placeholder')}
        projectContext={ctx}
      />
    </Field>
  )
}

function Step4Schedule({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Field label={t('wizard.s4_sprint_weeks')}>
        <select
          className="slds-input"
          value={d.sprint_weeks}
          onChange={(e) => set({ sprint_weeks: e.target.value })}
        >
          {SPRINT_WEEKS_OPTIONS.map((o) => (
            <option key={o} value={o}>{o} {o !== '1' ? t('wizard.s4_weeks') : t('wizard.s4_week')}</option>
          ))}
        </select>
      </Field>
      <Field label={t('wizard.s4_roadmap')} hint={t('wizard.s4_roadmap_hint')}>
        <textarea
          className="slds-textarea"
          rows={6}
          value={d.project_roadmap}
          onChange={(e) => set({ project_roadmap: e.target.value })}
          placeholder={t('wizard.s4_roadmap_placeholder')}
        />
      </Field>
    </div>
  )
}

function Step5Environments({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-3">
        <Field label={t('wizard.s5_env_dev')}>
          <input className="slds-input" value={d.env_dev_name} onChange={(e) => set({ env_dev_name: e.target.value })} />
        </Field>
        <Field label={t('wizard.s5_env_qa')}>
          <input className="slds-input" value={d.env_qa_name} onChange={(e) => set({ env_qa_name: e.target.value })} />
        </Field>
        <Field label={t('wizard.s5_env_sit')}>
          <input className="slds-input" value={d.env_sit_name} onChange={(e) => set({ env_sit_name: e.target.value })} />
        </Field>
        <Field label={t('wizard.s5_env_uat')}>
          <input className="slds-input" value={d.env_uat_name} onChange={(e) => set({ env_uat_name: e.target.value })} />
        </Field>
      </div>
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>{t('wizard.s5_deploy_hint')}</span>
      </div>
      <RepeatableSection<DeploymentFrequencyRow>
        title={t('wizard.s5_deploy_title')}
        items={d.deployment_frequency}
        onChange={(deployment_frequency) => set({ deployment_frequency })}
        emptyTemplate={() => ({ responsible: '', from_env: '', to_env: '', frequency: '' })}
        emptyHint={t('wizard.s5_deploy_empty')}
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-4 gap-2 pr-6">
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s5_col_responsible')}</label>
              <input className="slds-input text-sm" value={it.responsible} onChange={(e) => update({ responsible: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s5_col_from')}</label>
              <input className="slds-input text-sm" value={it.from_env} onChange={(e) => update({ from_env: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s5_col_to')}</label>
              <input className="slds-input text-sm" value={it.to_env} onChange={(e) => update({ to_env: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s5_col_frequency')}</label>
              <input className="slds-input text-sm" value={it.frequency} onChange={(e) => update({ frequency: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step6Lifecycle({ d, set, ctx }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void; ctx?: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <Field label={t('wizard.s6_lifecycle')} hint={t('wizard.s6_lifecycle_hint')}>
        <AiTextarea
          field="user_story_lifecycle" value={d.user_story_lifecycle}
          onChange={(v) => set({ user_story_lifecycle: v })}
          rows={5}
          placeholder={t('wizard.s6_lifecycle_placeholder')}
          projectContext={ctx}
        />
      </Field>
      <Field label={t('wizard.s6_capacity')} hint={t('wizard.s6_capacity_hint')}>
        <AiTextarea
          field="salesforce_capacity" value={d.salesforce_capacity}
          onChange={(v) => set({ salesforce_capacity: v })}
          rows={4}
          placeholder={t('wizard.s6_capacity_placeholder')}
          projectContext={ctx}
        />
      </Field>
    </div>
  )
}

function Step7Assumptions({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>{t('wizard.s7_hint')}</span>
      </div>
      <RepeatableSection<AssumptionRow>
        title={t('wizard.s7_title')}
        items={d.extra_assumptions}
        onChange={(extra_assumptions) => set({ extra_assumptions })}
        emptyTemplate={() => ({ code: `A${(d.extra_assumptions.length || 0) + 6}`, description: '' })}
        emptyHint={t('wizard.s7_empty')}
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-12 gap-2 pr-6">
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s7_col_code')}</label>
              <input className="slds-input text-sm" value={it.code} onChange={(e) => update({ code: e.target.value })} placeholder="A6" />
            </div>
            <div className="col-span-10">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s7_col_description')}</label>
              <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step8Risks({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <div className="bg-slds-neutral-1 rounded-slds p-3 text-xs text-slds-neutral-7 flex gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>{t('wizard.s8_hint')}</span>
      </div>
      <RepeatableSection<RiskRow>
        title={t('wizard.s8_risks_title')}
        items={d.extra_risks}
        onChange={(extra_risks) => set({ extra_risks })}
        emptyTemplate={() => ({
          code: String((d.extra_risks.length || 0) + 6),
          description: '', probability: 'Medio', impact: 'Medio', mitigation: '',
        })}
        emptyHint={t('wizard.s8_risks_empty')}
        renderRow={(it, _i, update) => (
          <div className="space-y-2 pr-6">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-1">
                <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_num')}</label>
                <input className="slds-input text-sm" value={it.code} onChange={(e) => update({ code: e.target.value })} />
              </div>
              <div className="col-span-7">
                <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_description')}</label>
                <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_probability')}</label>
                <select className="slds-input text-sm" value={it.probability} onChange={(e) => update({ probability: e.target.value })}>
                  {PROBABILITY_VALUES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_impact')}</label>
                <select className="slds-input text-sm" value={it.impact} onChange={(e) => update({ impact: e.target.value })}>
                  {PROBABILITY_VALUES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_mitigation')}</label>
              <input className="slds-input text-sm" value={it.mitigation} onChange={(e) => update({ mitigation: e.target.value })} />
            </div>
          </div>
        )}
      />
      <RepeatableSection<DependencyRow>
        title={t('wizard.s8_deps_title')}
        items={d.extra_dependencies}
        onChange={(extra_dependencies) => set({ extra_dependencies })}
        emptyTemplate={() => ({ description: '', impact: '', responsible: '' })}
        emptyHint={t('wizard.s8_deps_empty')}
        renderRow={(it, _i, update) => (
          <div className="grid grid-cols-3 gap-2 pr-6">
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_description')}</label>
              <input className="slds-input text-sm" value={it.description} onChange={(e) => update({ description: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_impact')}</label>
              <input className="slds-input text-sm" value={it.impact} onChange={(e) => update({ impact: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-slds-neutral-7">{t('wizard.s8_col_responsible')}</label>
              <input className="slds-input text-sm" value={it.responsible} onChange={(e) => update({ responsible: e.target.value })} />
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Step9Approvals({ d, set }: { d: TestPlanWizardData; set: (p: Partial<TestPlanWizardData>) => void }) {
  const { t } = useTranslation()
  return (
    <RepeatableSection<ApprovalRow>
      title={t('wizard.s9_title')}
      items={d.approvals}
      onChange={(approvals) => set({ approvals })}
      emptyTemplate={() => ({ name: '', company: '', role: 'QA Lead', date: '' })}
      emptyHint={t('wizard.s9_empty')}
      renderRow={(it, _i, update) => (
        <div className="space-y-2 pr-6">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-4">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s9_col_name')}</label>
              <input className="slds-input text-sm" value={it.name} onChange={(e) => update({ name: e.target.value })} placeholder="María García" />
            </div>
            <div className="col-span-4">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s9_col_company')}</label>
              <input className="slds-input text-sm" value={it.company} onChange={(e) => update({ company: e.target.value })} placeholder="Cliente / Salesforce" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s9_col_role')}</label>
              <select className="slds-input text-sm" value={it.role} onChange={(e) => update({ role: e.target.value })}>
                {[...ROLE_BASE_OPTIONS, t('wizard.option_other')].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-slds-neutral-7">{t('wizard.s9_col_date')}</label>
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
  const { t } = useTranslation()
  const proseEmpty = !d.business_goal || !d.user_story_lifecycle || !d.salesforce_capacity || !d.scope_out
  const sprintN = Number(d.sprint_weeks)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_client')}</p>
          <p className="font-semibold">{d.client_name || <em className="text-slds-error">{t('wizard.banner_pending')}</em>}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_sow')}</p>
          <p className="font-semibold">{d.sow_id || <em className="text-slds-error">{t('wizard.banner_pending')}</em>}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_version')}</p>
          <p className="font-semibold">v{d.doc_version}</p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_sprint')}</p>
          <p className="font-semibold">
            {sprintN !== 1
              ? t('wizard.s10_sprint_value_plural', { n: d.sprint_weeks })
              : t('wizard.s10_sprint_value', { n: d.sprint_weeks })}
          </p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_approvers')}</p>
          <p className="font-semibold">
            {d.approvals.length !== 1
              ? t('wizard.s10_approvers_value_plural', { n: d.approvals.length })
              : t('wizard.s10_approvers_value', { n: d.approvals.length })}
          </p>
        </div>
        <div className="bg-slds-neutral-1 rounded-slds p-3">
          <p className="text-xs text-slds-neutral-7">{t('wizard.s10_version_history')}</p>
          <p className="font-semibold">{d.version_history.length}</p>
        </div>
      </div>

      {proseEmpty && (
        <div className="border border-yellow-200 bg-yellow-50 rounded-slds p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-yellow-900">{t('wizard.s10_pending_warning')}</p>
            <p className="text-yellow-800 text-xs mt-1">
              {d.business_goal ? '' : t('wizard.s10_pending_business_goal')}
              {d.scope_out ? '' : t('wizard.s10_pending_scope')}
              {d.user_story_lifecycle ? '' : t('wizard.s10_pending_lifecycle')}
              {d.salesforce_capacity ? '' : t('wizard.s10_pending_capacity')}
              {t('wizard.s10_pending_detail')}
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
            {t('wizard.s10_ai_checkbox')}
          </p>
          <p className="text-xs text-slds-neutral-7 mt-1">{t('wizard.s10_ai_checkbox_hint')}</p>
        </div>
      </label>

      <div className="bg-slds-brand-light border border-slds-brand/20 rounded-slds p-3 text-xs text-slds-brand">
        <p className="font-semibold">{t('wizard.s10_info_title')}</p>
        <ol className="list-decimal list-inside space-y-1 mt-1">
          <li>{t('wizard.s10_info_1')}</li>
          <li>{t('wizard.s10_info_2')}</li>
          {useAi && <li>{t('wizard.s10_info_3')}</li>}
          <li>{t('wizard.s10_info_4')}</li>
          <li>{t('wizard.s10_info_5')}</li>
        </ol>
      </div>

      {isGenerating && (
        <div className="text-center py-4">
          <Loader2 className="w-6 h-6 text-slds-brand animate-spin mx-auto" />
          <p className="text-sm text-slds-neutral-7 mt-2">{t('wizard.s10_generating')}</p>
        </div>
      )}
    </div>
  )
}

// ── ViolationsBanner ─────────────────────────────────────────────────────────

function ViolationsBanner({
  violations, onJumpTo,
}: {
  violations: CoachAction[]
  onJumpTo: (step: number) => void
}) {
  const { t } = useTranslation()
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
              ? (blockers.length === 1
                  ? t('wizard.banner_blockers_one', { n: blockers.length })
                  : t('wizard.banner_blockers_other', { n: blockers.length }))
              : (warns.length === 1
                  ? t('wizard.banner_warns_one', { n: warns.length })
                  : t('wizard.banner_warns_other', { n: warns.length }))}
            {warns.length > 0 && hasBlockers && ' · '}
            {warns.length > 0 && hasBlockers && (warns.length === 1
              ? t('wizard.banner_extra_warns', { n: warns.length })
              : t('wizard.banner_extra_warns_plural', { n: warns.length }))}
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
                    {v.rationale || v.label || i18n.t('wizard.violated_rule')}
                    {v.hint && <span className="block text-[11px] opacity-80 mt-0.5">{v.hint}</span>}
                  </span>
                  {targetStep !== undefined && (
                    <button
                      type="button"
                      onClick={() => onJumpTo(targetStep)}
                      className="text-xs underline hover:no-underline flex-shrink-0"
                      title={`Ir al paso ${targetStep + 1}`}
                    >
                      {t('wizard.banner_goto')}
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

// ── Page principal ───────────────────────────────────────────────────────────

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

export default function TestPlanWizardPage() {
  const { t } = useTranslation()
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

  const STEPS = [
    { id: 0, label: t('wizard.step_0'), icon: '0' },
    { id: 1, label: t('wizard.step_1'), icon: '1' },
    { id: 2, label: t('wizard.step_2'), icon: '2' },
    { id: 3, label: t('wizard.step_3'), icon: '3' },
    { id: 4, label: t('wizard.step_4'), icon: '4' },
    { id: 5, label: t('wizard.step_5'), icon: '5' },
    { id: 6, label: t('wizard.step_6'), icon: '6' },
    { id: 7, label: t('wizard.step_7'), icon: '7' },
    { id: 8, label: t('wizard.step_8'), icon: '8' },
    { id: 9, label: t('wizard.step_9'), icon: '9' },
    { id: 10, label: t('wizard.step_10'), icon: '✓' },
  ]

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
      toast.error(t('wizard.toast_draft_required'))
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
      toast.success(t('wizard.toast_draft_saved'))
      refreshValidations(plan.id)
      return plan.id
    } catch (err) {
      showApiError(err, t('wizard.toast_draft_error'), t('wizard.quota_error'))
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
      toast.error(t('wizard.toast_generate_blocked'))
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
          ? t('wizard.toast_generate_pending', { n: pendingCount })
          : t('wizard.toast_generate_done')
      )
      navigate(`/projects/${id}/test-plans/${plan.id}`)
    } catch (err) {
      showApiError(err, t('wizard.toast_generate_error'), t('wizard.quota_error'))
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
          <Home className="w-3 h-3" /> {t('wizard.breadcrumb_home')}
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}`} className="hover:text-slds-brand">{project?.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}/test-plans`} className="hover:text-slds-brand">Test Plans</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">
          {editing ? t('wizard.title_edit') : t('wizard.title_new')}
        </span>
      </nav>

      <div className="flex items-start justify-between mb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-slds-brand" />
            {editing ? t('wizard.title_edit') : t('wizard.title_new')}
          </h1>
          <p className="text-sm text-slds-neutral-7 mt-0.5">{t('wizard.subtitle')}</p>
        </div>
        {editing && (
          <div
            className="inline-flex items-center bg-slds-neutral-2 border border-slds-neutral-4 rounded-slds p-0.5 text-xs flex-shrink-0"
            role="tablist"
            aria-label={t('wizard.tab_form')}
          >
            <span
              className="px-3 py-1.5 rounded-slds bg-white text-slds-neutral-10 font-semibold shadow-sm flex items-center gap-1.5 whitespace-nowrap"
              role="tab"
              aria-selected="true"
            >
              <ListChecks className="w-3.5 h-3.5" /> {t('wizard.tab_form')}
            </span>
            <Link
              to={`/projects/${id}/test-plans/${planId}/coach`}
              className="px-3 py-1.5 rounded-slds text-slds-neutral-7 hover:text-slds-brand hover:bg-white/70 flex items-center gap-1.5 whitespace-nowrap transition-colors"
              title={t('wizard.tab_chat')}
              role="tab"
              aria-selected="false"
            >
              <Bot className="w-3.5 h-3.5" /> {t('wizard.tab_chat')}
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
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
              <ChevronLeft className="w-4 h-4" /> {t('wizard.btn_prev')}
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={isSaving || isGenerating}
                className="slds-btn-neutral text-sm"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? t('wizard.btn_save_draft_saving') : t('wizard.btn_save_draft')}
              </button>
              {!isLastStep ? (
                <button
                  onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  className="slds-btn-brand text-sm"
                >
                  {t('wizard.btn_next')} <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || isSaving || !canGenerate}
                  title={!canGenerate ? t('wizard.btn_generate_title_blocked') : ''}
                  className={clsx(
                    'slds-btn-brand text-sm',
                    !canGenerate && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCheck2 className="w-4 h-4" />}
                  {t('wizard.btn_generate')}
                </button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
