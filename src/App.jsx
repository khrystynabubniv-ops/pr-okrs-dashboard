import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { CURRENT_MONTH } from './constants'
import { DashboardPage } from './pages/Dashboard'
import { EventReportsPage } from './pages/EventReports'
import { EventsPage } from './pages/Events'
import { GoalsPage } from './pages/Goals'
import { LoginPage } from './pages/Login'
import { MonthlyFocusPage } from './pages/MonthlyFocus'

export default function App() {
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH)

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
              <Route path="goals" element={<GoalsPage selectedMonth={selectedMonth} />} />
              <Route
                path="monthly"
                element={<MonthlyFocusPage selectedMonth={selectedMonth} />}
              />
              <Route
                path="events"
                element={<EventsPage selectedMonth={selectedMonth} />}
              />
              <Route path="reports/events" element={<EventReportsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Layout>
        }
      />
    </Routes>
  )
}
