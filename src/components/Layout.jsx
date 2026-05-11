import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  Gauge,
  Target,
} from 'lucide-react'
import { MONTHS } from '../constants'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/goals', label: 'Goals & Metrics', icon: Target },
  { to: '/monthly', label: 'Monthly Focus', icon: ClipboardList },
  { to: '/events', label: 'Events', icon: CalendarDays },
]

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/goals': 'Goals & Metrics',
  '/monthly': 'Monthly Focus',
  '/events': 'Events',
}

export function Layout({ selectedMonth, onMonthChange, children }) {
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'Comms Tool'

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#4361ee] text-white">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">Comms Tool</p>
            <p className="text-xs text-slate-500">Communications</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-50 text-[#4361ee]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Communications
                </p>
                <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600" htmlFor="month">
                Місяць
              </label>
              <select
                id="month"
                value={selectedMonth}
                onChange={(event) => onMonthChange(event.target.value)}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-[#4361ee] focus:ring-2 focus:ring-blue-100"
              >
                {MONTHS.map((month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 md:hidden">
            {navItems.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                      isActive
                        ? 'bg-blue-50 text-[#4361ee]'
                        : 'text-slate-600 hover:bg-slate-100'
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
