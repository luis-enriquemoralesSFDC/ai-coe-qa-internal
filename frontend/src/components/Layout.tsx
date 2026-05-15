import { useState } from 'react'
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FolderKanban, LogOut, ChevronLeft,
  ChevronRight, Bell, Search, FlaskConical, Settings, BarChart3,
  ShieldCheck, DollarSign, Sparkles, Languages,
} from 'lucide-react'
import clsx from 'clsx'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import { useLocale } from '../hooks/useLocale'
import { LOCALES } from '../store/locale'
import { meApi } from '../api'

export default function Layout() {
  const { user, logout } = useAuth()
  const { locale, changeLocale } = useLocale()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showLangMenu, setShowLangMenu] = useState(false)

  const NAV_ITEMS = [
    { to: '/', label: t('nav.projects'), icon: FolderKanban },
  ]

  // Resumen de cuota mensual para mostrar en topbar — refresca cada minuto.
  const usageQuery = useQuery({
    queryKey: ['me-usage'],
    queryFn: meApi.usage,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const usage = usageQuery.data

  // Detectar si estamos dentro de un proyecto para mostrar enlace a métricas
  const projectMatch = location.pathname.match(/^\/projects\/(\d+)/)
  const currentProjectId = projectMatch ? projectMatch[1] : null

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function isActive(to: string) {
    // "/" representa la sección "Proyectos" (que también acepta rutas /projects/*).
    if (to === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/projects')
    }
    return location.pathname.startsWith(to)
  }

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : 'QA'

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Top bar — blanco minimalista, estilo Linear/Notion ──────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 bg-white border-b border-slds-neutral-3"
        style={{ height: '52px' }}
      >
        {/* Left: logo + app name */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-slds hover:bg-slds-neutral-2 transition-colors"
            aria-label={t('nav.toggle_sidebar')}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 text-slds-neutral-7" />
              : <ChevronLeft className="w-4 h-4 text-slds-neutral-7" />}
          </button>
          <Link to="/" className="flex items-center gap-2 text-slds-neutral-10 font-semibold text-sm hover:opacity-90">
            <div className="w-7 h-7 rounded-slds flex items-center justify-center bg-slds-brand">
              <FlaskConical className="w-4 h-4 text-white" />
            </div>
            {!collapsed && <span>QA Test Manager</span>}
          </Link>
        </div>

        {/* Center: global search */}
        <div className="hidden md:flex flex-1 mx-8 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slds-neutral-6" />
            <input
              type="text"
              placeholder={t('nav.search_placeholder')}
              className="w-full pl-8 pr-3 py-1.5 rounded-slds text-sm bg-slds-neutral-2 text-slds-neutral-10
                         placeholder-slds-neutral-6 border border-transparent
                         focus:outline-none focus:bg-white focus:border-slds-brand
                         transition-all"
            />
          </div>
        </div>

        {/* Right: usage badge + notifications + user */}
        <div className="flex items-center gap-2">
          {/* Usage / quota widget — refactor a tonos para fondo blanco */}
          {usage && (
            <Link
              to="/"
              title={
                usage.bypass
                  ? t('nav.quota_no_limit_title')
                  : t('nav.quota_title', { spent: usage.cost_usd.toFixed(4), budget: usage.budget_usd.toFixed(2), calls: usage.calls })
              }
              className={clsx(
                'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-slds text-xs font-medium transition-colors',
                usage.bypass
                  ? 'bg-slds-ai-light text-slds-ai-dark hover:bg-purple-100'
                  : usage.cost_usd >= usage.budget_usd
                    ? 'bg-slds-error-bg text-slds-error hover:bg-red-100'
                    : usage.cost_usd / Math.max(usage.budget_usd, 0.01) > 0.75
                      ? 'bg-slds-warning-bg text-slds-warning hover:bg-yellow-100'
                      : 'bg-slds-neutral-2 text-slds-neutral-8 hover:bg-slds-neutral-3',
              )}
            >
              <DollarSign className="w-3.5 h-3.5" />
              {usage.bypass
                ? t('nav.quota_no_limit')
                : `$${usage.cost_usd.toFixed(2)} / $${usage.budget_usd.toFixed(0)}`}
            </Link>
          )}
          {/* Language selector */}
          <div className="relative">
            <button
              onClick={() => setShowLangMenu(m => !m)}
              className="flex items-center gap-1.5 p-1.5 rounded-slds hover:bg-slds-neutral-2 transition-colors text-slds-neutral-7"
              title={LOCALES.find(l => l.value === locale)?.label}
            >
              <Languages className="w-4 h-4" />
              <span className="text-xs font-medium uppercase hidden sm:inline">{locale}</span>
            </button>
            {showLangMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowLangMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-slds shadow-slds-drop border border-slds-neutral-4 z-40 overflow-hidden">
                  {LOCALES.map(l => (
                    <button
                      key={l.value}
                      onClick={() => { changeLocale(l.value); setShowLangMenu(false) }}
                      className={clsx(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors',
                        locale === l.value
                          ? 'bg-slds-brand-light text-slds-brand font-semibold'
                          : 'text-slds-neutral-8 hover:bg-slds-neutral-2',
                      )}
                    >
                      <span>{l.flag}</span>
                      <span>{l.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <button className="p-1.5 rounded-slds hover:bg-slds-neutral-2 transition-colors relative">
            <Bell className="w-4 h-4 text-slds-neutral-7" />
          </button>

          {/* User avatar */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(m => !m)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-slds hover:bg-slds-neutral-2 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-slds-brand flex items-center justify-center text-white text-xs font-bold">
                {initials}
              </div>
              <span className="text-sm text-slds-neutral-10 hidden md:block">{user?.name}</span>
              <ChevronRight className="w-3 h-3 text-slds-neutral-7 rotate-90" />
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-slds shadow-slds-drop border border-slds-neutral-4 z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slds-neutral-3">
                    <p className="font-semibold text-slds-neutral-10 text-sm">{user?.name}</p>
                    <p className="text-xs text-slds-neutral-7">{user?.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slds-neutral-8
                               hover:bg-slds-neutral-2 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> {t('nav.logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex" style={{ paddingTop: '52px' }}>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside
          className="fixed left-0 bottom-0 z-30 flex flex-col bg-white border-r border-slds-neutral-4 transition-all duration-200"
          style={{ top: '52px', width: collapsed ? '56px' : '220px' }}
        >
          {/* Nav items */}
          <nav className="flex-1 pt-3 pb-2 overflow-y-auto">
            <div className={clsx('mb-1', collapsed ? 'px-1' : 'px-1')}>
              {!collapsed && (
                <p className="text-xs font-semibold text-slds-neutral-6 uppercase tracking-widest px-4 mb-2">
                  {t('nav.menu')}
                </p>
              )}
              {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  title={collapsed ? label : undefined}
                  className={clsx(
                    'flex items-center gap-2.5 py-2 text-sm font-medium transition-colors rounded-slds mx-1',
                    collapsed ? 'justify-center px-2' : 'px-3',
                    isActive(to)
                      ? 'bg-slds-brand-light text-slds-brand'
                      : 'text-slds-neutral-8 hover:bg-slds-neutral-2 hover:text-slds-brand',
                  )}
                >
                  <Icon className={clsx('flex-shrink-0', isActive(to) ? 'w-4.5 h-4.5' : 'w-4 h-4')} style={{ width: '1.1rem', height: '1.1rem' }} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && isActive(to) && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-slds-brand" />
                  )}
                </Link>
              ))}

              {/* Admin link — solo visible si el user es admin */}
              {user?.is_admin && (
                <Link
                  to="/admin"
                  title={collapsed ? t('nav.admin') : undefined}
                  className={clsx(
                    'flex items-center gap-2.5 py-2 text-sm font-medium transition-colors rounded-slds mx-1',
                    collapsed ? 'justify-center px-2' : 'px-3',
                    isActive('/admin')
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-slds-neutral-8 hover:bg-purple-50 hover:text-purple-700',
                  )}
                >
                  <ShieldCheck style={{ width: '1.1rem', height: '1.1rem' }} className="flex-shrink-0" />
                  {!collapsed && <span>{t('nav.admin')}</span>}
                  {!collapsed && isActive('/admin') && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-700" />
                  )}
                </Link>
              )}

              {/* Métricas de Calidad — solo visible cuando hay proyecto activo */}
              {currentProjectId && (
                <>
                  {!collapsed && (
                    <p className="text-xs font-semibold text-slds-neutral-6 uppercase tracking-widest px-4 mt-4 mb-1">
                      {t('nav.current_project')}
                    </p>
                  )}
                  {collapsed && <div className="border-t border-slds-neutral-3 my-2 mx-2" />}
                  <Link
                    to={`/projects/${currentProjectId}/metricas`}
                    title={collapsed ? t('nav.quality_metrics') : undefined}
                    className={clsx(
                      'flex items-center gap-2.5 py-2 text-sm font-medium transition-colors rounded-slds mx-1',
                      collapsed ? 'justify-center px-2' : 'px-3',
                      location.pathname.includes('/metricas')
                        ? 'bg-indigo-50 text-indigo-600'
                        : 'text-slds-neutral-8 hover:bg-slds-neutral-2 hover:text-indigo-600',
                    )}
                  >
                    <BarChart3 style={{ width: '1.1rem', height: '1.1rem' }} className="flex-shrink-0" />
                    {!collapsed && <span>{t('nav.quality_metrics')}</span>}
                    {!collapsed && location.pathname.includes('/metricas') && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    )}
                  </Link>
                  <Link
                    to={`/projects/${currentProjectId}/test-plans`}
                    title={collapsed ? t('nav.test_plans') : undefined}
                    className={clsx(
                      'flex items-center gap-2.5 py-2 text-sm font-medium transition-colors rounded-slds mx-1',
                      collapsed ? 'justify-center px-2' : 'px-3',
                      location.pathname.includes('/test-plans')
                        ? 'bg-purple-50 text-purple-700'
                        : 'text-slds-neutral-8 hover:bg-slds-neutral-2 hover:text-purple-700',
                    )}
                  >
                    <Sparkles style={{ width: '1.1rem', height: '1.1rem' }} className="flex-shrink-0" />
                    {!collapsed && <span>{t('nav.test_plans')}</span>}
                    {!collapsed && location.pathname.includes('/test-plans') && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-700" />
                    )}
                  </Link>
                </>
              )}
            </div>
          </nav>

          {/* Bottom: settings */}
          <div className="border-t border-slds-neutral-3 py-2 px-1">
            <button
              title={collapsed ? t('nav.settings') : undefined}
              className={clsx(
                'flex items-center gap-2.5 py-2 text-sm text-slds-neutral-7',
                'hover:bg-slds-neutral-2 hover:text-slds-brand rounded-slds transition-colors w-full',
                collapsed ? 'justify-center px-2' : 'px-3',
              )}
            >
              <Settings style={{ width: '1.1rem', height: '1.1rem' }} />
              {!collapsed && <span>{t('nav.settings')}</span>}
            </button>
          </div>
        </aside>

        {/* ── Main content ───────────────────────────────────────────────── */}
        <main
          className="flex-1 min-h-[calc(100vh-52px)] bg-slds-neutral-2 transition-all duration-200"
          style={{ marginLeft: collapsed ? '56px' : '220px' }}
        >
          <div className="p-6 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
