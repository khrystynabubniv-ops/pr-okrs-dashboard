import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  Gauge,
  LogIn,
  LogOut,
  Target,
} from 'lucide-react'
import { InstagramIcon } from './icons/InstagramIcon'
import { MONTHS } from '../constants'

const navSections = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: Gauge }],
  },
  {
    label: 'Channels',
    items: [{ to: '/smm', label: 'Instagram / SMM', icon: InstagramIcon }],
  },
  {
    label: 'Planning',
    items: [
      { to: '/goals', label: 'Goals & KPIs', icon: Target },
      { to: '/monthly', label: 'Monthly Focus', icon: ClipboardList },
      { to: '/events', label: 'Events', icon: CalendarDays },
    ],
  },
  {
    label: 'Reports',
    items: [{ to: '/reports/events', label: 'Event Reports', icon: FileText }],
  },
]

const navItems = navSections.flatMap((section) => section.items)

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/smm': 'Instagram / SMM',
  '/goals': 'Goals & KPIs',
  '/monthly': 'Monthly Focus',
  '/events': 'Events',
  '/reports/events': 'Звіти по івентах',
}

export function Layout({ selectedMonth, onMonthChange, children }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Comms Tool'
  const [authInfo, setAuthInfo] = useState({ auth: { enabled: false }, user: null })

  useEffect(() => {
    let isMounted = true

    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((payload) => {
        if (isMounted) setAuthInfo(payload)
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuthInfo((current) => ({ ...current, user: null }))
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-line px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-white">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Comms Tool</p>
            <p className="text-xs text-ink3">Communications</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-5 px-3 py-5">
          {navSections.map((section) => (
            <div key={section.label}>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink3">
                {section.label}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${
                          isActive
                            ? 'bg-soft text-accent2'
                            : 'text-ink2 hover:bg-line2 hover:text-ink'
                        }`
                      }
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="md:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink3">
                  Communications
                </p>
                <h1 className="text-xl font-semibold text-ink">{title}</h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {authInfo.auth?.enabled ? (
                authInfo.user ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink2 hover:bg-line2"
                  >
                    <LogOut className="h-4 w-4" />
                    {authInfo.user.name || authInfo.user.email || 'Вийти'}
                  </button>
                ) : (
                  <a
                    href="/api/auth/google/start"
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink2 hover:bg-line2"
                  >
                    <LogIn className="h-4 w-4" />
                    Увійти
                  </a>
                )
              ) : null}
              <label className="text-sm font-semibold text-ink2" htmlFor="month">
                Місяць
              </label>
              <select
                id="month"
                value={selectedMonth}
                onChange={(event) => onMonthChange(event.target.value)}
                className="h-10 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-soft"
              >
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-line2 px-3 py-2 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${
                      isActive
                        ? 'bg-soft text-accent2'
                        : 'text-ink2 hover:bg-line2'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              )
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
