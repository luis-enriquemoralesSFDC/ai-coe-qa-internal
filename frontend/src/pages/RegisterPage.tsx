import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FlaskConical, ArrowRight, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { authApi } from '../api'
import { useAuth } from '../hooks/useAuth'

const ALLOWED_DOMAIN = 'salesforce.com'

function isAllowedEmail(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at < 0) return false
  return email.slice(at + 1).toLowerCase() === ALLOWED_DOMAIN
}

// Mesh gradient estático — coherente con LoginPage (navy → azul Salesforce).
const HERO_BG: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(at 20% 25%, rgba(59, 130, 246, 0.45) 0%, transparent 55%)',
    'radial-gradient(at 85% 70%, rgba(14, 165, 233, 0.5) 0%, transparent 55%)',
    'radial-gradient(at 50% 100%, rgba(1, 118, 211, 0.55) 0%, transparent 60%)',
    'linear-gradient(135deg, #001a3d 0%, #014486 100%)',
  ].join(', '),
}

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const emailLooksWrong = email.length > 0 && email.includes('@') && !isAllowedEmail(email)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isAllowedEmail(email)) {
      toast.error(t('register.domain_toast_error', { domain: ALLOWED_DOMAIN }))
      return
    }
    setLoading(true)
    try {
      const data = await authApi.register({ name, email: email.toLowerCase(), password })
      login(data.user, data.access_token)
      navigate('/')
    } catch (err: any) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail[0]?.msg ?? t('register.error_default') : detail || t('register.error_default')
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
          <div className="md:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-slds flex items-center justify-center bg-slds-brand">
              <FlaskConical className="w-5 h-5 text-white" />
            </div>
            <span className="font-semibold text-lg text-slds-neutral-10">QA Test Manager</span>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-slds-neutral-10 tracking-tight">
              {t('register.title')}
            </h2>
            <p className="text-slds-neutral-7 mt-2">
              {t('register.subtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="name" className="slds-label">{t('register.full_name')}</label>
              <input
                id="name"
                type="text"
                className="slds-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder={t('register.full_name_placeholder')}
                autoComplete="name"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="email" className="slds-label">{t('register.email')}</label>
              <input
                id="email"
                type="email"
                className="slds-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder={`tu@${ALLOWED_DOMAIN}`}
                pattern={`.+@${ALLOWED_DOMAIN}$`}
                title={t('register.domain_hint', { domain: ALLOWED_DOMAIN })}
                autoComplete="email"
              />
              <p className={`mt-1 text-xs ${emailLooksWrong ? 'text-slds-error font-medium' : 'text-slds-neutral-6'}`}>
                {emailLooksWrong
                  ? t('register.domain_error', { domain: ALLOWED_DOMAIN })
                  : t('register.domain_hint', { domain: ALLOWED_DOMAIN })}
              </p>
            </div>
            <div>
              <label htmlFor="password" className="slds-label">{t('register.password')}</label>
              <input
                id="password"
                type="password"
                className="slds-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={t('register.password_placeholder')}
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              className="slds-btn-brand w-full justify-center py-2.5 text-sm"
              disabled={loading || emailLooksWrong}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('register.submitting')}</>
                : <>{t('register.submit')} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </form>

          <p className="mt-8 text-center text-sm text-slds-neutral-7">
            {t('register.already_have')}{' '}
            <Link to="/login" className="text-slds-brand hover:text-slds-brand-dark font-medium">
              {t('register.sign_in')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
