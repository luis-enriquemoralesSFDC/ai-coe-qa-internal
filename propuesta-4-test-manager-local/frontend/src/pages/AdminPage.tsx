import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate } from 'react-router-dom'
import {
  ShieldCheck, Trash2, UserCog, Loader2, ChevronRight, Home,
  AlertCircle, RefreshCw, DollarSign, Activity,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { adminApi, type AdminUser, type AiUsageRow } from '../api'
import { useAuth } from '../hooks/useAuth'

const OP_LABELS: Record<string, string> = {
  invest_analyze: 'INVEST',
  tc_generate_single: 'TC (1 HU)',
  tc_generate_batch: 'TC (lote)',
  doc_extract: 'Doc → HU',
}

export default function AdminPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined)

  // El backend igual valida con 403, pero esto evita rendering innecesario.
  if (user && !user.is_admin) {
    return <Navigate to="/" replace />
  }

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: adminApi.listUsers,
  })

  const usageQuery = useQuery({
    queryKey: ['admin', 'usage', filterUserId],
    queryFn: () => adminApi.recentUsage(100, filterUserId),
  })

  const setAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: number; isAdmin: boolean }) =>
      adminApi.setAdmin(userId, isAdmin),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('Permisos actualizados')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al actualizar permisos')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => adminApi.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'usage'] })
      toast.success('Usuario eliminado')
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Error al eliminar')
    },
  })

  const users: AdminUser[] = usersQuery.data ?? []
  const recent: AiUsageRow[] = usageQuery.data ?? []

  const totalThisMonth = users.reduce((s, u) => s + u.cost_usd_this_month, 0)
  const totalCalls = users.reduce((s, u) => s + u.calls_this_month, 0)
  const adminsCount = users.filter(u => u.is_admin).length

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="slds-breadcrumb">
        <Link to="/" className="flex items-center gap-1 hover:text-slds-brand">
          <Home className="w-3 h-3" /> Inicio
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-slds-neutral-10 font-medium">Administración</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slds-neutral-10 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-purple-600" /> Administración
          </h1>
          <p className="text-sm text-slds-neutral-7 mt-0.5">
            Gestión de usuarios, permisos y consumo de IA del equipo
          </p>
        </div>
        <button
          onClick={() => {
            usersQuery.refetch()
            usageQuery.refetch()
          }}
          className="slds-btn-neutral text-xs"
          title="Refrescar datos"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refrescar
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <KpiTile
          label="Usuarios"
          value={users.length}
          subtitle={`${adminsCount} admins`}
          icon={UserCog}
          iconBg="bg-blue-50"
          iconColor="text-slds-brand"
        />
        <KpiTile
          label="Gasto del mes"
          value={`$${totalThisMonth.toFixed(2)}`}
          subtitle="Suma de todos los users"
          icon={DollarSign}
          iconBg="bg-green-50"
          iconColor="text-slds-success"
        />
        <KpiTile
          label="Calls a IA (mes)"
          value={totalCalls.toLocaleString()}
          subtitle="Llamadas exitosas"
          icon={Activity}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        <KpiTile
          label="Cap por user"
          value="$100"
          subtitle="Mensual / configurable"
          icon={AlertCircle}
          iconBg="bg-orange-50"
          iconColor="text-slds-warning"
        />
      </div>

      {/* ── Usuarios ──────────────────────────────────────────────────────────── */}
      <div className="slds-section mb-5">
        <div className="slds-card__header">
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4 text-slds-brand" />
            <h2 className="font-semibold text-slds-neutral-10">Usuarios del equipo</h2>
            <span className="slds-badge slds-badge-brand">{users.length}</span>
          </div>
        </div>

        {usersQuery.isLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Proyectos</th>
                  <th>Gasto mes</th>
                  <th>Calls mes</th>
                  <th className="text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const isMe = u.id === user?.id
                  const overBudget = u.cost_usd_this_month >= 100
                  return (
                    <tr key={u.id} className={isMe ? 'bg-slds-brand-light/40' : ''}>
                      <td className="text-sm font-medium text-slds-neutral-10">{u.email}</td>
                      <td className="text-sm text-slds-neutral-8">{u.name}</td>
                      <td>
                        {u.is_admin
                          ? <span className="slds-badge slds-badge-brand">Admin</span>
                          : <span className="slds-badge slds-badge-neutral">QA</span>}
                      </td>
                      <td className="text-sm text-slds-neutral-7">{u.projects_count}</td>
                      <td>
                        <span
                          className={clsx(
                            'text-sm font-mono font-semibold',
                            overBudget && !u.is_admin ? 'text-slds-error' :
                            u.cost_usd_this_month > 75 ? 'text-slds-warning' :
                            'text-slds-neutral-10',
                          )}
                        >
                          ${u.cost_usd_this_month.toFixed(4)}
                        </span>
                      </td>
                      <td className="text-sm font-mono text-slds-neutral-7">{u.calls_this_month}</td>
                      <td className="whitespace-nowrap">
                        <div className="flex justify-end gap-1 flex-nowrap">
                          <button
                            onClick={() => setFilterUserId(u.id)}
                            className="slds-btn-neutral text-xs py-0.5 px-2"
                            title="Ver llamadas a IA de este usuario"
                          >
                            <Activity className="w-3.5 h-3.5" /> Ver uso
                          </button>
                          <button
                            onClick={() => setAdminMutation.mutate({ userId: u.id, isAdmin: !u.is_admin })}
                            disabled={isMe && u.is_admin || setAdminMutation.isPending}
                            className="slds-btn-neutral text-xs py-0.5 px-2"
                            title={isMe && u.is_admin ? 'No podés quitarte tu propio rol' : ''}
                          >
                            {u.is_admin ? 'Quitar admin' : 'Hacer admin'}
                          </button>
                          <button
                            onClick={() => {
                              if (isMe) return
                              if (confirm(`Borrar a ${u.email} y todos sus datos? Esto NO se puede deshacer.`)) {
                                deleteMutation.mutate(u.id)
                              }
                            }}
                            disabled={isMe || deleteMutation.isPending}
                            className="slds-btn-icon w-7 h-7 text-slds-neutral-6 hover:text-slds-error disabled:opacity-30"
                            title={isMe ? 'No podés borrarte a vos mismo' : 'Borrar usuario'}
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

      {/* ── Llamadas recientes a IA ─────────────────────────────────────────────── */}
      <div className="slds-section">
        <div className="slds-card__header">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-600" />
            <h2 className="font-semibold text-slds-neutral-10">Llamadas recientes a IA</h2>
            {filterUserId && (
              <span className="slds-badge slds-badge-warning">
                Filtrado por user #{filterUserId}
              </span>
            )}
          </div>
          {filterUserId && (
            <button
              onClick={() => setFilterUserId(undefined)}
              className="slds-btn-neutral text-xs"
            >
              Quitar filtro
            </button>
          )}
        </div>

        {usageQuery.isLoading ? (
          <div className="p-8 text-center">
            <span className="slds-spinner mx-auto" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : recent.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-slds-neutral-7 text-sm">Sin llamadas registradas todavía.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="slds-table w-full">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Cuándo</th>
                  <th>Usuario</th>
                  <th>Operación</th>
                  <th>Modelo</th>
                  <th className="text-right whitespace-nowrap">Tokens in</th>
                  <th className="text-right whitespace-nowrap">Tokens out</th>
                  <th className="text-right">Costo</th>
                  <th className="text-right">Latencia</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(r => (
                  <tr key={r.id}>
                    <td className="text-xs text-slds-neutral-7 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="text-xs text-slds-neutral-10">
                      {r.user_email ?? `user #${r.user_id}`}
                    </td>
                    <td>
                      <span className="slds-badge slds-badge-neutral text-xs whitespace-nowrap">
                        {OP_LABELS[r.operation] || r.operation}
                      </span>
                    </td>
                    <td className="text-xs font-mono text-slds-neutral-7 whitespace-nowrap">{r.model}</td>
                    <td className="text-xs text-right font-mono whitespace-nowrap">{r.tokens_in.toLocaleString()}</td>
                    <td className="text-xs text-right font-mono whitespace-nowrap">{r.tokens_out.toLocaleString()}</td>
                    <td className="text-xs text-right font-mono font-semibold text-slds-neutral-10 whitespace-nowrap">
                      ${r.cost_usd.toFixed(6)}
                    </td>
                    <td className="text-xs text-right font-mono text-slds-neutral-6 whitespace-nowrap">
                      {r.latency_ms} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiTile({
  label, value, subtitle, icon: Icon, iconBg, iconColor,
}: {
  label: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
}) {
  return (
    <div className="slds-tile">
      <div className={clsx('slds-tile__icon', iconBg)}>
        <Icon className={clsx('w-5 h-5', iconColor)} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slds-neutral-10 leading-none">{value}</p>
        <p className="text-xs text-slds-neutral-7 mt-0.5">{label}</p>
        {subtitle && <p className="text-xs text-slds-neutral-6 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}
