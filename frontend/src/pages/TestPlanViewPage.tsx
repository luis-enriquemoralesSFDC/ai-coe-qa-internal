import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, Home, Sparkles, Download, Copy, Edit3,
  RefreshCw, AlertTriangle, CheckCircle2, Loader2, FileText,
  ArrowLeft, Wand2, Bot,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { projectsApi, testPlansApi } from '../api'

function showApiError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail
  if (err?.response?.status === 429) {
    toast.error(typeof detail === 'string' ? detail : fallback)
    return
  }
  toast.error(typeof detail === 'string' ? detail : fallback)
}

export default function TestPlanViewPage() {
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>()
  const id = Number(projectId)
  const pid = Number(planId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()

  const [useAi, setUseAi] = useState(false)

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
  })
  const { data: plan, isLoading } = useQuery({
    queryKey: ['test-plan', String(pid)],
    queryFn: () => testPlansApi.get(pid),
  })

  const regenerateMutation = useMutation({
    mutationFn: () => testPlansApi.generate(pid, useAi),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['test-plan', String(pid)] })
      queryClient.invalidateQueries({ queryKey: ['test-plans', id] })
      queryClient.invalidateQueries({ queryKey: ['me-usage'] })
      const pendingCount = p.pending_fields.length
      toast.success(
        pendingCount
          ? t('test_plan_view.toast_regen_pending', { n: pendingCount })
          : t('test_plan_view.toast_regen_done')
      )
    },
    onError: (err) => showApiError(err, t('test_plan_view.toast_regen_error')),
  })

  async function handleDownload() {
    if (!plan) return
    try {
      const blob = await testPlansApi.download(plan.id)
      const filename = `${plan.client_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'cliente'}-${(plan.generated_at || plan.created_at).slice(0, 10)}.md`
      const url = URL.createObjectURL(blob as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('test_plan_view.toast_download_done'))
    } catch (err) {
      showApiError(err, t('test_plan_view.toast_download_error'))
    }
  }

  function handleCopy() {
    if (!plan?.markdown_content) return
    navigator.clipboard.writeText(plan.markdown_content)
      .then(() => toast.success(t('test_plan_view.toast_copy_done')))
      .catch(() => toast.error(t('test_plan_view.toast_copy_error')))
  }

  if (isLoading) {
    return (
      <div className="p-12 text-center">
        <Loader2 className="w-8 h-8 text-slds-brand animate-spin mx-auto" />
      </div>
    )
  }
  if (!plan) {
    return (
      <div className="p-12 text-center">
        <p className="text-slds-error font-semibold">{t('test_plan_view.not_found')}</p>
        <Link to={`/projects/${id}/test-plans`} className="slds-btn-neutral text-xs mt-3 inline-flex">
          <ArrowLeft className="w-3.5 h-3.5" /> {t('test_plan_view.btn_back')}
        </Link>
      </div>
    )
  }

  const isDraft = plan.status === 'draft'

  return (
    <div>
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand">
          <Home className="w-3 h-3" /> {t('test_plan_view.breadcrumb_home')}
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}`} className="hover:text-slds-brand">{project?.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}/test-plans`} className="hover:text-slds-brand">Test Plans</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">{plan.client_name}</span>
      </nav>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-slds-brand" />
            QA Plan — {plan.client_name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-xs text-slds-neutral-7">
            <span>v{plan.doc_version}</span>
            <span>·</span>
            <span>SOW {plan.wizard_data.sow_id}</span>
            <span>·</span>
            <span>{t('test_plan_view.created', { date: new Date(plan.created_at).toLocaleDateString() })}</span>
            {plan.generated_at && (
              <>
                <span>·</span>
                <span>{t('test_plan_view.generated', { date: new Date(plan.generated_at).toLocaleDateString() })}</span>
              </>
            )}
            <span
              className={clsx(
                'slds-badge inline-flex items-center gap-1',
                isDraft ? 'slds-badge-warning' : 'slds-badge-success',
              )}
            >
              {isDraft ? <Edit3 className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
              {isDraft ? t('test_plan_view.status_draft') : t('test_plan_view.status_generated')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/projects/${id}/test-plans/${plan.id}/coach`}
            className="slds-btn-neutral text-xs"
            title={t('test_plan_view.btn_coach_title')}
          >
            <Bot className="w-3.5 h-3.5" /> {t('test_plan_view.btn_coach')}
          </Link>
          <Link
            to={`/projects/${id}/test-plans/${plan.id}/edit`}
            className="slds-btn-neutral text-xs"
          >
            <Edit3 className="w-3.5 h-3.5" /> {t('test_plan_view.btn_edit_wizard')}
          </Link>
          {!isDraft && (
            <>
              <button onClick={handleCopy} className="slds-btn-neutral text-xs">
                <Copy className="w-3.5 h-3.5" /> {t('test_plan_view.btn_copy')}
              </button>
              <button onClick={handleDownload} className="slds-btn-brand text-xs">
                <Download className="w-3.5 h-3.5" /> {t('test_plan_view.btn_download')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Estado borrador */}
      {isDraft && (
        <div className="slds-card p-6 text-center">
          <FileText className="w-10 h-10 text-slds-neutral-5 mx-auto mb-3" />
          <p className="text-slds-neutral-10 font-semibold">{t('test_plan_view.draft_title')}</p>
          <p className="text-xs text-slds-neutral-7 mt-1 mb-4">
            {t('test_plan_view.draft_hint')}
          </p>
          <Link to={`/projects/${id}/test-plans/${plan.id}/edit`} className="slds-btn-brand text-xs inline-flex">
            <Edit3 className="w-3.5 h-3.5" /> {t('test_plan_view.btn_open_wizard')}
          </Link>
        </div>
      )}

      {/* Estado generated */}
      {!isDraft && (
        <div className="space-y-4">
          {/* Campos pendientes */}
          {plan.pending_fields.length > 0 && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-slds p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-yellow-900 text-sm">
                    {t('test_plan_view.pending_title', { n: plan.pending_fields.length })}
                  </p>
                  <p className="text-xs text-yellow-800 mt-1 mb-2">
                    {t('test_plan_view.pending_hint')}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {plan.pending_fields.map((f) => (
                      <span key={f} className="text-xs font-mono bg-yellow-100 text-yellow-900 px-2 py-0.5 rounded">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Regenerar */}
          <div className="slds-card p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="text-sm font-semibold text-slds-neutral-10 flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 text-slds-brand" />
                  {t('test_plan_view.regen_title')}
                </p>
                <p className="text-xs text-slds-neutral-7 mt-0.5">
                  {t('test_plan_view.regen_hint')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  <Wand2 className="w-3.5 h-3.5 text-purple-600" />
                  {t('test_plan_view.regen_ai_label')}
                </label>
                <button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  className="slds-btn-brand text-xs"
                >
                  {regenerateMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <RefreshCw className="w-3.5 h-3.5" />}
                  {t('test_plan_view.regen_btn')}
                </button>
              </div>
            </div>
          </div>

          {/* Preview del Markdown */}
          <div className="slds-card">
            <div className="slds-card__header flex items-center gap-2">
              <FileText className="w-4 h-4 text-slds-brand" />
              <h2 className="font-semibold text-slds-neutral-10">{t('test_plan_view.doc_section_title')}</h2>
            </div>
            <pre
              className={clsx(
                'overflow-auto p-6 text-sm leading-relaxed text-slds-neutral-10',
                'whitespace-pre-wrap break-words font-sans',
                'bg-white rounded-b-slds',
              )}
              style={{ maxHeight: '70vh', fontFamily: '"Inter", system-ui, sans-serif' }}
            >
              {plan.markdown_content || t('test_plan_view.doc_empty')}
            </pre>
          </div>
        </div>
      )}

      <div className="mt-6 flex justify-between items-center text-xs text-slds-neutral-7">
        <button
          onClick={() => navigate(`/projects/${id}/test-plans`)}
          className="flex items-center gap-1 hover:text-slds-brand"
        >
          <ArrowLeft className="w-3 h-3" /> {t('test_plan_view.btn_back_list')}
        </button>
      </div>
    </div>
  )
}
