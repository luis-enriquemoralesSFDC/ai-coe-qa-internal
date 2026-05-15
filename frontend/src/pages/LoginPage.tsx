import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FlaskConical, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api'
import { useAuth } from '../hooks/useAuth'

// Mesh gradient estático (sin animación) — multiple radial overlays sobre base navy→azul Salesforce.
// Profundidad sin recurrir a animaciones ni assets externos.
const HERO_BG: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(at 20% 25%, rgba(59, 130, 246, 0.45) 0%, transparent 55%)',   // blue-500
    'radial-gradient(at 85% 70%, rgba(14, 165, 233, 0.5) 0%, transparent 55%)',    // sky-500
    'radial-gradient(at 50% 100%, rgba(1, 118, 211, 0.55) 0%, transparent 60%)',   // slds-brand
    'linear-gradient(135deg, #001a3d 0%, #014486 100%)',                            // navy → slds-brand-dark
  ].join(', '),
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const data = await authApi.login({ email: email.toLowerCase(), password })
      login(data.user, data.access_token)
      navigate('/')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail[0]?.msg ?? t('login.error_default') : detail || t('login.error_default')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      {/* ── Branding side (oculto en mobile) ──────────────────────────────── */}
      <aside
        className="hidden md:flex md:w-1/2 relative overflow-hidden text-white p-12 flex-col justify-between"
        style={HERO_BG}
      >
        {/* Logo + nombre */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-slds flex items-center justify-center bg-white/15 backdrop-blur-sm">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-base">QA Test Manager</span>
        </Link>

        {/* Footer (sin tagline central; el gradient es el protagonista visual) */}
        <p className="text-sm text-white/60">
          © {new Date().getFullYear()} QA Test Manager
        </p>
      </aside>

      {/* ── Form side ─────────────────────────────────────────────────────── */}
      <main className="flex-1 md:w-1/2 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo solo visible en mobile (cuando aside está oculto) */}
          <div className="md:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-slds flex items-center justify-center bg-slds-brand">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg text-slds-neutral-10">QA Test Manager</span>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slds-neutral-10 tracking-tight">
              {t('login.title')}
            </h2>
            <p className="text-slds-neutral-7 mt-2">
              {t('login.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="slds-label">{t('login.email')}</label>
              <input
                id="email"
                type="email"
                className="slds-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={t('login.email_placeholder')}
                autoComplete="email"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="password" className="slds-label">{t('login.password')}</label>
              <input
                id="password"
                type="password"
                className="slds-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="slds-btn-brand w-full justify-center py-2.5 text-sm"
              disabled={loading}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('login.submitting')}</>
                : <>{t('login.submit')} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          {/* Footer link */}
          <p className="mt-8 text-center text-sm text-slds-neutral-7">
            {t('login.no_account')}{' '}
            <Link to="/register" className="text-slds-brand hover:text-slds-brand-dark font-medium">
              {t('login.create_account')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
