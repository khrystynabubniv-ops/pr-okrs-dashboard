import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CURRENT_MONTH, MONTHS } from './constants'
import { DashboardPage } from './pages/Dashboard'
import { EventReportsPage } from './pages/EventReports'
import { EventsPage } from './pages/Events'
import { GoalsPage } from './pages/Goals'
import { LoginPage } from './pages/Login'
import { MonthlyFocusPage } from './pages/MonthlyFocus'
import { PromoPage } from './pages/Promo'
import { SmmPage } from './pages/Smm'
import LinkedInReport from './features/linkedin-report/LinkedInReport'

const MONTH_STORAGE_KEY = 'okr-dashboard:selected-month'

function readStoredMonth() {
  try {
    const stored = window.localStorage.getItem(MONTH_STORAGE_KEY)
    return MONTHS.includes(stored) ? stored : CURRENT_MONTH
  } catch {
    return CURRENT_MONTH
  }
}

export default function App() {
  const [selectedMonth, setSelectedMonthState] = useState(readStoredMonth)

  // The chosen month survives a page reload (and is shared by every page).
  function setSelectedMonth(month) {
    setSelectedMonthState(month)

    try {
      window.localStorage.setItem(MONTH_STORAGE_KEY, month)
    } catch {
      // Private mode / blocked storage: the month just resets on reload.
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Layout selectedMonth={selectedMonth} onMonthChange={setSelectedMonth}>
            <Routes>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route
                path="dashboard"
                element={<DashboardPage selectedMonth={selectedMonth} />}
              />
              <Route
                path="smm"
                element={
                  <SmmPage
                    selectedMonth={selectedMonth}
                    onMonthChange={setSelectedMonth}
                  />
                }
              />
              <Route path="goals" element={<GoalsPage selectedMonth={selectedMonth} />} />
              <Route
                path="monthly"
                element={<MonthlyFocusPage selectedMonth={selectedMonth} />}
              />
              <Route
                path="events"
                element={<EventsPage selectedMonth={selectedMonth} />}
              />
              <Route path="promo" element={<PromoPage selectedMonth={selectedMonth} />} />
              <Route path="reports/events" element={<EventReportsPage />} />
              <Route path="reports/linkedin" element={<LinkedInReport />} />
              <Route
                path="linkedin-report"
                element={<Navigate to="/reports/linkedin" replace />}
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  )
}
