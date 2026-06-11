import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { BarChart3, CheckCircle2, LockKeyhole, Mail } from 'lucide-react'

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const nextPath = useMemo(() => normalizeNextPath(searchParams.get('next')), [searchParams])
  const [authInfo, setAuthInfo] = useState(null)

  useEffect(() => {
    let isMounted = true

    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => {
        if (isMounted) setAuthInfo(payload)
      })
      .catch(() => {
        if (isMounted) setAuthInfo({ user: null })
      })

    return () => {
      isMounted = false
    }
  }, [])

  if (authInfo?.user) {
    return <Navigate to={nextPath} replace />
  }

  const loginHref = `/api/auth/google/start?next=${encodeURIComponent(nextPath)}`

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_520px]">
        <section className="relative hidden overflow-hidden bg-[#172033] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(#ffffff_1px,transparent_1px),linear-gradient(90deg,#ffffff_1px,transparent_1px)] [background-size:44px_44px]" />
          <div className="relative flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-white text-[#4361ee]">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold">Comms Tool</p>
              <p className="text-xs text-slate-300">PR OKRs Dashboard</p>
            </div>
          </div>

          <div className="relative max-w-xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-emerald-200">
              Secure workspace
            </p>
            <h1 className="max-w-lg text-5xl font-semibold leading-tight tracking-normal">
              Єдиний дашборд для PR цілей, фокусів і звітів.
            </h1>
          </div>

          <div className="relative grid max-w-2xl grid-cols-3 gap-3">
            {[
              ['KPI', '82%', 'bg-emerald-300'],
              ['Media', '142', 'bg-sky-300'],
              ['Events', '18', 'bg-amber-300'],
            ].map(([label, value, color]) => (
              <div
                key={label}
                className="rounded-lg border border-white/12 bg-white/10 p-4 shadow-2xl shadow-black/10 backdrop-blur"
              >
                <div className={`mb-7 h-1.5 w-12 rounded-full ${color}`} />
                <p className="text-xs text-slate-300">{label}</p>
                <p className="mt-1 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-10 flex items-center gap-3 lg:hidden">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#4361ee] text-white">
                <BarChart3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-950">Comms Tool</p>
                <p className="text-xs text-slate-500">PR OKRs Dashboard</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/70 sm:p-8">
              <div className="mb-7 grid h-12 w-12 place-items-center rounded-lg bg-emerald-50 text-emerald-700">
                <LockKeyhole className="h-6 w-6" />
              </div>

              <h2 className="text-2xl font-semibold tracking-normal text-slate-950">
                Увійдіть у Comms Tool
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Доступ відкритий лише для залогінених Google email.
              </p>

              <a
                href={loginHref}
                className="mt-7 flex h-12 w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4361ee] focus:ring-offset-2"
              >
                <GoogleMark />
                Продовжити з Google
              </a>

              <div className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm text-slate-600">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                  <span>Вхід через робочий email</span>
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>Після входу відкриється потрібна сторінка</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.78-.07-1.53-.2-2.23H12v4.22h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.52Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.43l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.12H3.05v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.9a6 6 0 0 1 0-3.8V7.51H3.05a10 10 0 0 0 0 8.98L6.4 13.9Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.98c1.47 0 2.8.5 3.83 1.5l2.87-2.87A9.63 9.63 0 0 0 12 2 10 10 0 0 0 3.05 7.51L6.4 10.1C7.2 7.74 9.4 5.98 12 5.98Z"
      />
    </svg>
  )
}

function normalizeNextPath(value) {
  const path = String(value || '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return '/dashboard'
  if (path.startsWith('/api/')) return '/dashboard'
  return path
}
