import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronRight, FileText, Home, Plus, Loader2,
  Edit3, Download, Trash2, Sparkles, Bot,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { projectsApi, testPlansApi, type TestPlanListItem } from '../api'
import TestPlanStatusBadge from '../components/TestPlanStatusBadge'

function showApiError(err: any, fallback: string) {
  const detail = err?.response?.data?.detail
  toast.error(typeof detail === 'string' ? detail : fallback)
}

export default function TestPlanListPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const id = Number(projectId)
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data: project } = useQuery({
    queryKey: ['project', id],
    queryFn: () => projectsApi.get(id),
  })
  const { data: plans = [], isLoading } = useQuery<TestPlanListItem[]>({
    queryKey: ['test-plans', id],
    queryFn: () => testPlansApi.list(id),
  })

  const deleteMutation = useMutation({
    mutationFn: (planId: number) => testPlansApi.delete(planId),
    onMutate: (planId) => setDeletingId(planId),
    onSettled: () => setDeletingId(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-plans', id] })
      toast.success(t('test_plan_list.toast_deleted'))
    },
    onError: (err) => showApiError(err, t('test_plan_list.toast_delete_error')),
  })

  async function handleDownload(planId: number, filename: string) {
    try {
      const blob = await testPlansApi.download(planId)
      const url = URL.createObjectURL(blob as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('test_plan_list.toast_download_done'))
    } catch (err) {
      showApiError(err, t('test_plan_list.toast_download_error'))
    }
  }

  return (
    <div>
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand">
          <Home className="w-3 h-3" /> {t('test_plan_list.breadcrumb_home')}
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link to={`/projects/${id}`} className="hover:text-slds-brand">{project?.name}</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">{t('test_plan_list.title')}</span>
      </nav>

      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-slds-brand" /> {t('test_plan_list.title')}
          </h1>
          <p className="text-sm text-slds-neutral-7 mt-0.5">
            {t('test_plan_list.subtitle')}
          </p>
        </div>
        <Link
          to={`/projects/${id}/test-plans/new`}
          className="slds-btn-brand text-xs"
        >
          <Plus className="w-3.5 h-3.5" /> {t('test_plan_list.new_plan')}
        </Link>
      </div>

      <div className="slds-section">
        <div className="slds-card__header">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slds-brand" />
            <h2 className="font-semibold text-slds-neutral-10">{t('test_plan_list.section_title')}</h2>
            <span className="slds-badge slds-badge-brand">{plans.length}</span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-slds-brand mx-auto" />
          </div>
        ) : plans.length === 0 ? (
          <div className="py-16 text-center">
            <Sparkles className="w-12 h-12 text-slds-neutral-5 mx-auto mb-3" />
            <p className="text-slds-neutral-7 font-semibold">{t('test_plan_list.no_plans')}</p>
            <p className="text-slds-neutral-6 text-xs mt-1 mb-4">
              {t('test_plan_list.no_plans_hint')}
            </p>
            <Link
              to={`/projects/${id}/test-plans/new`}
              className="slds-btn-brand text-xs inline-flex"
            >
              <Plus className="w-3.5 h-3.5" /> {t('test_plan_list.create_first')}
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table">
              <thead>
                <tr>
                  <th>{t('test_plan_list.col_client')}</th>
                  <th className="whitespace-nowrap">{t('test_plan_list.col_version')}</th>
                  <th>{t('test_plan_list.col_status')}</th>
                  <th className="whitespace-nowrap">{t('test_plan_list.col_created')}</th>
                  <th className="whitespace-nowrap">{t('test_plan_list.col_generated')}</th>
                  <th className="text-right whitespace-nowrap">{t('test_plan_list.col_actions')}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => {
                  const filename = `${p.client_name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/(^-|-$)/g, '') || 'cliente'}-${(p.generated_at || p.created_at).slice(0, 10)}.md`
                  return (
                    <tr key={p.id}>
                      <td className="font-medium text-slds-neutral-10">
                        <Link
                          to={`/projects/${id}/test-plans/${p.id}`}
                          className="text-slds-brand hover:underline"
                        >
                          {p.client_name}
                        </Link>
                      </td>
                      <td className="text-xs font-mono text-slds-neutral-7 whitespace-nowrap">v{p.doc_version}</td>
                      <td><TestPlanStatusBadge status={p.status} /></td>
                      <td className="text-xs text-slds-neutral-7 whitespace-nowrap">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                      <td className="text-xs text-slds-neutral-7 whitespace-nowrap">
                        {p.generated_at ? new Date(p.generated_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex gap-1 justify-end flex-nowrap">
                          <Link
                            to={`/projects/${id}/test-plans/${p.id}/coach`}
                            className="slds-btn-neutral text-xs py-0.5 px-2"
                            title={t('test_plan_list.btn_coach_title')}
                          >
                            <Bot className="w-3.5 h-3.5" />
                            {t('test_plan_list.btn_coach')}
                          </Link>
                          <Link
                            to={`/projects/${id}/test-plans/${p.id}`}
                            className="slds-btn-neutral text-xs py-0.5 px-2"
                            title={t('test_plan_list.btn_open_title')}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {t('test_plan_list.btn_open')}
                          </Link>
                          <button
                            onClick={() => handleDownload(p.id, filename)}
                            disabled={p.status !== 'generated'}
                            className={clsx(
                              'slds-btn-neutral text-xs py-0.5 px-2',
                              p.status !== 'generated' && 'opacity-40 cursor-not-allowed',
                            )}
                            title={p.status === 'generated'
                              ? t('test_plan_list.btn_download_title_ready')
                              : t('test_plan_list.btn_download_title_not_ready')}
                          >
                            <Download className="w-3.5 h-3.5" />
                            .md
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(t('test_plan_list.confirm_delete', { client: p.client_name }))) {
                                deleteMutation.mutate(p.id)
                              }
                            }}
                            disabled={deletingId === p.id}
                            className="slds-btn-neutral text-xs py-0.5 px-2 text-slds-error hover:bg-slds-error-bg"
                            title={t('common.delete')}
                          >
                            {deletingId === p.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
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
    </div>
  )
}
