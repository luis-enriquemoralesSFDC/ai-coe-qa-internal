import client from './client'

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    client.post('/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    client.post('/auth/login', data).then((r) => r.data),
  me: () => client.get('/auth/me').then((r) => r.data),
}

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: () => client.get('/projects/').then((r) => r.data),
  get: (id: number) => client.get(`/projects/${id}`).then((r) => r.data),
  create: (data: { name: string; description?: string }) =>
    client.post('/projects/', data).then((r) => r.data),
  update: (id: number, data: Partial<{ name: string; description: string }>) =>
    client.put(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: number) => client.delete(`/projects/${id}`),
}

// ── User Stories ──────────────────────────────────────────────────────────────
export const storiesApi = {
  list: (projectId: number) =>
    client.get(`/projects/${projectId}/stories/`).then((r) => r.data),
  get: (projectId: number, storyId: number) =>
    client.get(`/projects/${projectId}/stories/${storyId}`).then((r) => r.data),
  create: (projectId: number, data: object) =>
    client.post(`/projects/${projectId}/stories/`, data).then((r) => r.data),
  update: (projectId: number, storyId: number, data: object) =>
    client.put(`/projects/${projectId}/stories/${storyId}`, data).then((r) => r.data),
  delete: (projectId: number, storyId: number) =>
    client.delete(`/projects/${projectId}/stories/${storyId}`),
  bulkImport: (projectId: number, stories: object[], source: string) =>
    client.post(`/projects/${projectId}/stories/bulk-import`, { stories, source }).then((r) => r.data),
  importFile: (projectId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return client.post(`/projects/${projectId}/stories/import-file`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data)
  },
  analyzeInvest: (projectId: number, storyId: number) =>
    client.post(`/projects/${projectId}/stories/${storyId}/analyze-invest`).then((r) => r.data),
  generateTestCases: (projectId: number, storyId: number, maxCases?: number | null) =>
    client.post(
      `/projects/${projectId}/stories/${storyId}/generate-test-cases`,
      maxCases ? { max_cases: maxCases } : {},
    ).then((r) => r.data),
  generateBatch: (projectId: number, storyIds: number[], maxCases?: number | null) =>
    client.post(`/projects/${projectId}/stories/generate-batch`, {
      story_ids: storyIds,
      ...(maxCases ? { max_cases: maxCases } : {}),
    }).then((r) => r.data),
  agentReview: (
    projectId: number,
    storyId: number,
    opts?: {
      maxCases?: number | null
      forceInvest?: boolean
      // mode: que hacer si la HU ya tiene casos.
      // - 'skip' (default): no genera, marca skipped y devuelve existing_count.
      // - 'append': suma encima (legacy).
      // - 'replace': borra previos y regenera. UI debe pedir confirm antes.
      mode?: StoryReviewMode
    },
  ): Promise<StoryReviewResponse> =>
    client
      .post(`/projects/${projectId}/stories/${storyId}/agent/review`, {
        ...(opts?.maxCases ? { max_cases: opts.maxCases } : {}),
        ...(opts?.forceInvest ? { force_invest: true } : {}),
        ...(opts?.mode ? { mode: opts.mode } : {}),
      })
      .then((r) => r.data),
}

// ── Story Review Agent (orquestador de 3 steps sobre una HU) ─────────────────
// Mapea 1:1 los schemas StoryReview* de backend/app/schemas.py.
export type StoryReviewStepKind =
  | 'invest_analysis'
  | 'context_detection'
  | 'generate_test_cases'

export type StoryReviewStepStatus = 'ok' | 'skipped' | 'error' | 'quota_exceeded'

// Espejo del Literal de backend/app/schemas.py:StoryReviewMode.
// Si lo cambian allá, hay que cambiarlo acá tambien.
export type StoryReviewMode = 'skip' | 'append' | 'replace'

export interface StoryReviewStep {
  kind: StoryReviewStepKind
  status: StoryReviewStepStatus
  latency_ms: number
  // Campos opcionales por step
  score?: number | null
  reason?: string | null
  archetypes?: string[] | null
  baseline_count?: number | null
  test_cases_created?: number | null
  with_context?: boolean | null
  archetypes_used?: number | null
  baseline_used?: number | null
  invest_used?: boolean | null
  existing_cases_count?: number | null  // generate_test_cases — cuántos casos había antes
  deleted_count?: number | null         // generate_test_cases — solo cuando mode=replace
  mode?: StoryReviewMode | null         // generate_test_cases — modo aplicado
  error_class?: string | null
}

export interface StoryReviewResponse {
  story_id: number
  project_id: number
  last_review_at: string
  steps: StoryReviewStep[]
  test_cases_created: number
}

// ── Usage / Quota (current user) ─────────────────────────────────────────────
export interface UsageSummary {
  user_id: number
  period: string
  cost_usd: number
  tokens_in: number
  tokens_out: number
  calls: number
  budget_usd: number
  remaining_usd: number
  bypass: boolean
}

export const meApi = {
  usage: (): Promise<UsageSummary> =>
    client.get('/auth/me/usage').then((r) => r.data),
}

// ── Admin (solo para users con is_admin=true) ────────────────────────────────
export interface AdminUser {
  id: number
  name: string
  email: string
  is_admin: boolean
  created_at: string
  projects_count: number
  cost_usd_this_month: number
  calls_this_month: number
}

export interface AiUsageRow {
  id: number
  user_id: number
  user_email: string | null
  operation: string
  model: string
  tokens_in: number
  tokens_out: number
  cost_usd: number
  latency_ms: number
  created_at: string
}

export const adminApi = {
  listUsers: (): Promise<AdminUser[]> =>
    client.get('/admin/users').then((r) => r.data),
  setAdmin: (userId: number, isAdmin: boolean): Promise<AdminUser> =>
    client.patch(`/admin/users/${userId}`, { is_admin: isAdmin }).then((r) => r.data),
  deleteUser: (userId: number) =>
    client.delete(`/admin/users/${userId}`),
  recentUsage: (limit = 100, userId?: number): Promise<AiUsageRow[]> =>
    client.get('/admin/usage/recent', {
      params: { limit, ...(userId ? { user_id: userId } : {}) },
    }).then((r) => r.data),
}

// ── Test Cases ────────────────────────────────────────────────────────────────
export const testCasesApi = {
  list: (storyId: number) =>
    client.get(`/stories/${storyId}/test-cases/`).then((r) => r.data),
  create: (storyId: number, data: object) =>
    client.post(`/stories/${storyId}/test-cases/`, data).then((r) => r.data),
  update: (storyId: number, tcId: number, data: object) =>
    client.put(`/stories/${storyId}/test-cases/${tcId}`, data).then((r) => r.data),
  delete: (storyId: number, tcId: number) =>
    client.delete(`/stories/${storyId}/test-cases/${tcId}`),
}

// ── Export ────────────────────────────────────────────────────────────────────
export const exportApi = {
  excel: (projectId: number) =>
    client.get(`/projects/${projectId}/export/excel`, { responseType: 'blob' }).then((r) => r.data),
}

// ── KPIs / Métricas ───────────────────────────────────────────────────────────
export const kpisApi = {
  summary: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/summary`).then((r) => r.data),
  severityBySprint: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/severity-by-sprint`).then((r) => r.data),
  fpy: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/fpy`).then((r) => r.data),
  effectiveness: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/effectiveness`).then((r) => r.data),
  sprints: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/sprints`).then((r) => r.data),

  // Bug reports
  listReports: (projectId: number) =>
    client.get(`/projects/${projectId}/kpis/bugs/reports`).then((r) => r.data),
  deleteReport: (projectId: number, reportId: number) =>
    client.delete(`/projects/${projectId}/kpis/bugs/reports/${reportId}`),
  uploadReport: (projectId: number, file: File, sprintName?: string, source?: string) => {
    const form = new FormData()
    form.append('file', file)
    const params = new URLSearchParams()
    if (sprintName) params.set('sprint_name', sprintName)
    if (source) params.set('source', source)
    return client.post(
      `/projects/${projectId}/kpis/bugs/upload?${params.toString()}`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ).then((r) => r.data)
  },

  // Bugs
  listBugs: (projectId: number, filters?: { sprint?: string; environment?: string; severity?: string; status?: string }) =>
    client.get(`/projects/${projectId}/kpis/bugs/`, { params: filters }).then((r) => r.data),
  linkBug: (projectId: number, bugId: number, data: { story_id?: number; linked_case_id?: string }) =>
    client.patch(`/projects/${projectId}/kpis/bugs/${bugId}/link`, data).then((r) => r.data),
}

// ── Test Plan Generator ──────────────────────────────────────────────────────
// Mapea 1:1 los schemas de backend/app/schemas.py (TestPlan*).

export interface VersionHistoryRow {
  version: string
  date: string
  description: string
  author: string
}

export interface DeploymentFrequencyRow {
  responsible: string
  from_env: string
  to_env: string
  frequency: string
}

export interface AssumptionRow {
  code: string
  description: string
}

export interface RiskRow {
  code: string
  description: string
  probability: 'Alto' | 'Medio' | 'Bajo' | string
  impact: 'Alto' | 'Medio' | 'Bajo' | string
  mitigation: string
}

export interface DependencyRow {
  description: string
  impact: string
  responsible: string
}

export interface ApprovalRow {
  name: string
  company: string
  role: string
  date?: string | null
}

export interface TestPlanWizardData {
  // Bloque 0
  client_name: string
  sow_id: string
  doc_version: string
  confidentiality_year: string
  test_management_tool: string
  defect_management_tool: string
  browsers: string

  // Bloque 1
  version_history: VersionHistoryRow[]

  // Bloque 2
  business_goal: string

  // Bloque 3
  scope_out: string

  // Bloque 4
  sprint_weeks: string
  project_roadmap: string

  // Bloque 5
  env_dev_name: string
  env_qa_name: string
  env_sit_name: string
  env_uat_name: string
  deployment_frequency: DeploymentFrequencyRow[]

  // Bloque 6
  user_story_lifecycle: string
  salesforce_capacity: string

  // Bloque 7
  extra_assumptions: AssumptionRow[]

  // Bloque 8
  extra_risks: RiskRow[]
  extra_dependencies: DependencyRow[]

  // Bloque 9
  approvals: ApprovalRow[]
}

export interface TestPlanListItem {
  id: number
  project_id: number
  client_name: string
  doc_version: string
  status: 'draft' | 'generated'
  created_at: string
  updated_at?: string | null
  generated_at?: string | null
}

export interface TestPlanOut extends TestPlanListItem {
  user_id: number
  wizard_data: TestPlanWizardData
  markdown_content?: string | null
  pending_fields: string[]
}

export type AssistField =
  | 'business_goal'
  | 'user_story_lifecycle'
  | 'salesforce_capacity'
  | 'scope_out'

export interface AiAssistResponse {
  field: AssistField
  content: string
}

export function emptyWizardData(clientName = '', sowId = ''): TestPlanWizardData {
  const now = new Date()
  return {
    client_name: clientName,
    sow_id: sowId,
    doc_version: '1.0',
    confidentiality_year: String(now.getFullYear()),
    test_management_tool: 'JIRA',
    defect_management_tool: 'Complemento de JIRA (Zephyr, Xray, etc.)',
    browsers: 'Google Chrome',
    version_history: [],
    business_goal: '',
    scope_out: '',
    sprint_weeks: '2',
    project_roadmap: '',
    env_dev_name: 'DEV',
    env_qa_name: 'QA',
    env_sit_name: 'SIT',
    env_uat_name: 'UAT',
    deployment_frequency: [],
    user_story_lifecycle: '',
    salesforce_capacity: '',
    extra_assumptions: [],
    extra_risks: [],
    extra_dependencies: [],
    approvals: [],
  }
}

export const testPlansApi = {
  list: (projectId: number): Promise<TestPlanListItem[]> =>
    client.get(`/projects/${projectId}/test-plans/`).then((r) => r.data),

  create: (projectId: number, wizardData: TestPlanWizardData): Promise<TestPlanOut> =>
    client
      .post(`/projects/${projectId}/test-plans/`, { wizard_data: wizardData })
      .then((r) => r.data),

  get: (planId: number): Promise<TestPlanOut> =>
    client.get(`/test-plans/${planId}`).then((r) => r.data),

  update: (planId: number, wizardData: TestPlanWizardData): Promise<TestPlanOut> =>
    client.put(`/test-plans/${planId}`, { wizard_data: wizardData }).then((r) => r.data),

  generate: (planId: number, useAiForProse = true): Promise<TestPlanOut> =>
    client
      .post(`/test-plans/${planId}/generate`, { use_ai_for_prose: useAiForProse })
      .then((r) => r.data),

  delete: (planId: number) => client.delete(`/test-plans/${planId}`),

  // Descarga el .md como Blob para que el navegador dispare el download.
  download: (planId: number) =>
    client.get(`/test-plans/${planId}/download`, { responseType: 'blob' }).then((r) => r.data),

  assistField: (
    field: AssistField,
    userInput: string,
    projectContext?: string,
  ): Promise<AiAssistResponse> =>
    client
      .post(`/test-plans/assist-field`, {
        field,
        user_input: userInput,
        project_context: projectContext ?? null,
      })
      .then((r) => r.data),
}

// ── Test Plan Coach (chat conversacional, sabor "como Cursor") ────────────────
// Mapea 1:1 los schemas Coach* de backend/app/schemas.py.

export type CoachActionKind =
  | 'ask_text'
  | 'ask_picklist'
  | 'confirm_value'
  | 'confirm_bulk'
  | 'suggest_replace'
  | 'set_field'
  | 'block'
  | 'warn'
  | 'summary'
  | 'follow_up'
  | 'ready_to_generate'

export interface CoachPicklistOption {
  value: string
  label?: string | null
}

export interface CoachPicklistField {
  field: string
  label: string
  hint?: string | null
  options: CoachPicklistOption[]
  current_value?: string | null
}

export interface CoachAction {
  kind: CoachActionKind
  rationale?: string
  severity?: 'info' | 'warn' | 'error'
  field?: string | null
  label?: string | null
  hint?: string | null
  current_value?: any
  proposed_value?: any
  picklist_fields?: CoachPicklistField[] | null
  bulk_items?: Array<Record<string, any>> | null
  filled_fields?: string[] | null
  pending_fields?: string[] | null
  blocked_count?: number | null
  quick_options?: string[] | null
  rule_id?: string | null
  blocks_generation?: boolean
  fix_options?: Array<Record<string, string>> | null
  use_ai_for_prose?: boolean | null
}

export interface CoachMessageOut {
  id: number
  plan_id: number
  turn_index: number
  role: 'user' | 'assistant' | 'system'
  content: string
  actions: CoachAction[]
  created_at: string
}

export interface CoachTurnRequest {
  text?: string | null
  picklist_answers?: Record<string, string> | null
  bulk_confirm?: boolean | null
  accept_suggestion_for?: string | null
  reject_suggestion_for?: string | null
}

export interface CoachTurnResponse {
  message: CoachMessageOut
  wizard_data: TestPlanWizardData
  violations: CoachAction[]
  can_generate: boolean
}

export interface CoachValidateResponse {
  violations: CoachAction[]
  can_generate: boolean
  blocking_count: number
  warning_count: number
}

export const coachApi = {
  start: (planId: number, projectContext?: string): Promise<CoachTurnResponse> =>
    client
      .post(`/test-plans/${planId}/coach/start`, {
        project_context: projectContext ?? null,
      })
      .then((r) => r.data),

  turn: (planId: number, body: CoachTurnRequest): Promise<CoachTurnResponse> =>
    client.post(`/test-plans/${planId}/coach/turn`, body).then((r) => r.data),

  applyAction: (planId: number, body: CoachTurnRequest): Promise<CoachTurnResponse> =>
    client.post(`/test-plans/${planId}/coach/apply-action`, body).then((r) => r.data),

  messages: (planId: number): Promise<CoachMessageOut[]> =>
    client.get(`/test-plans/${planId}/coach/messages`).then((r) => r.data),

  reset: (planId: number) =>
    client.delete(`/test-plans/${planId}/coach/messages`),

  validate: (planId: number): Promise<CoachValidateResponse> =>
    client.post(`/test-plans/${planId}/coach/validate`).then((r) => r.data),
}


export interface ProjectChatMessageOut {
  id: number
  project_id: number
  turn_index: number
  role: 'user' | 'assistant'
  content: string
  story_id?: number | null
  created_at: string
}

export interface ProjectChatSendResponse {
  user_message: ProjectChatMessageOut
  assistant_message: ProjectChatMessageOut
}

export const projectChatApi = {
  list: (projectId: number): Promise<ProjectChatMessageOut[]> =>
    client.get(`/projects/${projectId}/chat/messages`).then((r) => r.data),

  send: (
    projectId: number,
    message: string,
    storyId?: number,
  ): Promise<ProjectChatSendResponse> =>
    client
      .post(`/projects/${projectId}/chat/messages`, {
        message,
        story_id: storyId ?? null,
      })
      .then((r) => r.data),

  clear: (projectId: number): Promise<void> =>
    client.delete(`/projects/${projectId}/chat/messages`).then(() => undefined),
}


// ── Test Runs (ejecución automática vía Cursor SDK + Playwright MCP) ─────────
// El backend crea filas queued; el qa-worker (proceso aparte) las ejecuta y
// va escribiendo el status. La UI consume estos endpoints para crear runs y
// hacer polling del progreso.

export type TestRunStatus =
  | 'queued'
  | 'running'
  | 'waiting_login'
  | 'finished'
  | 'error'
  | 'cancelled'

export interface TestRunOut {
  id: number
  user_id: number
  project_id: number
  case_ids: number[]
  env: string
  base_url: string
  model_id: string
  prompt: string
  status: TestRunStatus
  continue_signal: boolean
  cancel_signal: boolean
  agent_id: string | null
  result: string | null
  error_message: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface TestRunCreate {
  project_id: number
  case_ids: number[]
  env: string
  base_url: string
  prompt: string
  model_id?: string
}

export const testRunsApi = {
  create: (data: TestRunCreate): Promise<TestRunOut> =>
    client.post('/test-runs', data).then((r) => r.data),

  get: (runId: number): Promise<TestRunOut> =>
    client.get(`/test-runs/${runId}`).then((r) => r.data),

  // El backend espera ?project_id= como query param.
  listByProject: (projectId: number): Promise<TestRunOut[]> =>
    client.get('/test-runs', { params: { project_id: projectId } }).then((r) => r.data),

  // Idempotente: si el run no está en waiting_login, devuelve la fila tal cual.
  continue: (runId: number): Promise<TestRunOut> =>
    client.post(`/test-runs/${runId}/continue`).then((r) => r.data),

  // Idempotente: en estados terminales es no-op.
  cancel: (runId: number): Promise<TestRunOut> =>
    client.post(`/test-runs/${runId}/cancel`).then((r) => r.data),
}
