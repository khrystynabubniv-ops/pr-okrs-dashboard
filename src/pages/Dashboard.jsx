import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ClipboardCopy, FileText, Save } from 'lucide-react'
import { DirectionBadge } from '../components/Badge'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'
import {
  buildMonthlySeries,
  directionProgressSummary,
  hasSeriesData,
  personalBrandBars,
  progressSummary,
} from '../lib/dashboard'

export function DashboardPage({ selectedMonth }) {
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [reportError, setReportError] = useState(null)

  const dashboardQuery = useAsyncData(
    async () => {
      const goals = await apiRequest('/api/notion/kpi-goals')
      const [events, focus, coverage] = await Promise.all([
        optionalRequest(
          `/api/notion/events?month=${encodeURIComponent(selectedMonth)}`,
          { events: [] },
        ),
        optionalRequest(
          `/api/notion/monthly-focus?month=${encodeURIComponent(selectedMonth)}`,
          { entries: [] },
        ),
        optionalRequest(
          `/api/looqme/coverage?month=${encodeURIComponent(selectedMonth)}`,
          { mentions: [], sentiment: [] },
        ),
      ])

      return {
        goals: goals.goals || [],
        events: events.events || [],
        focus: focus.entries || [],
        coverage,
      }
    },
    [selectedMonth],
  )

  const goals = useMemo(
    () => dashboardQuery.data?.goals || [],
    [dashboardQuery.data],
  )
  const events = useMemo(
    () => dashboardQuery.data?.events || [],
    [dashboardQuery.data],
  )
  const focus = useMemo(
    () => dashboardQuery.data?.focus || [],
    [dashboardQuery.data],
  )
  const coverage = useMemo(
    () => dashboardQuery.data?.coverage || {},
    [dashboardQuery.data],
  )

  const summary = useMemo(
    () => progressSummary(goals, selectedMonth),
    [goals, selectedMonth],
  )
  const directionStats = useMemo(
    () => directionProgressSummary(goals, selectedMonth),
    [goals, selectedMonth],
  )
  const instagramSeries = useMemo(
    () =>
      buildMonthlySeries(goals, ['instagram', 'інстаграм'], selectedMonth),
    [goals, selectedMonth],
  )
  const mediaSeries = useMemo(
    () =>
      buildMonthlySeries(goals, ['медіа', 'згад', 'looqme'], selectedMonth),
    [goals, selectedMonth],
  )
  const trafficSeries = useMemo(
    () =>
      buildMonthlySeries(goals, ['трафік', 'organic', 'органіч'], selectedMonth),
    [goals, selectedMonth],
  )
  const personalBrands = useMemo(
    () => personalBrandBars(goals, selectedMonth),
    [goals, selectedMonth],
  )

  const totalContacts = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )

  async function generateReport() {
    setReportLoading(true)
    setSaveStatus('')
    setReportError(null)

    try {
      const result = await apiRequest('/api/generate-report', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          goals,
          focus,
          events,
          coverage,
        }),
      })
      setReport(result.report)
    } catch (error) {
      setReportError(error)
    } finally {
      setReportLoading(false)
    }
  }

  async function saveReportToNotion() {
    if (!report) return
    setSaveStatus('Збереження...')

    try {
      await apiRequest('/api/notion/board-report', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          report,
        }),
      })
      setSaveStatus('Збережено в Notion')
    } catch (error) {
      setSaveStatus(error.message)
    }
  }

  async function copyReport() {
    if (!report) return
    await navigator.clipboard.writeText(report)
    setSaveStatus('Скопійовано')
  }

  return (
    <div className="space-y-6">
      {dashboardQuery.loading ? <LoadingState /> : null}
      {dashboardQuery.error ? (
        <ErrorState error={dashboardQuery.error} onRetry={dashboardQuery.retry} />
      ) : null}
      {reportError ? <ErrorState error={reportError} /> : null}

      {!dashboardQuery.loading && !dashboardQuery.error ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
            <MetricCard
              label="Середній прогрес KPI"
              value={`${summary.average}%`}
              detail={`орієнтир на місяць: ${summary.expected}%`}
              tone="accent"
            />
            <MetricCard
              label="На треку"
              value={`${summary.onTrack}/${summary.total}`}
              detail={`оновлено ${summary.updated}/${summary.total} у місяці`}
              tone="green"
            />
            {directionStats.map((item) => (
              <div
                key={item.direction}
                className="rounded-lg border border-slate-200 bg-white px-4 py-4"
              >
                <DirectionBadge direction={item.direction} />
                <p className="mt-3 text-2xl font-semibold text-slate-950">
                  {item.average}%
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {item.onTrack}/{item.total} на треку · оновлено {item.updated}
                </p>
              </div>
            ))}
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartPanel title="Instagram підписники помісячно">
              {hasSeriesData(instagramSeries) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={instagramSeries} margin={{ top: 24, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={56} />
                    <Tooltip content={<MonthlyTooltip metricLabel="Підписники" />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#4361ee"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      connectNulls
                      name="Підписники"
                    >
                      <LabelList dataKey="deltaLabel" content={<DeltaLabel />} />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Немає помісячних значень"
                  text="Графік підтягнеться з KPI-цілі Instagram, коли у місячних колонках Notion будуть числа."
                />
              )}
            </ChartPanel>

            <ChartPanel title="Медіа згадки помісячно">
              {hasSeriesData(mediaSeries) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={mediaSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={44} />
                    <Tooltip content={<MonthlyTooltip metricLabel="Згадки" />} />
                    <Bar
                      dataKey="value"
                      fill="#f97316"
                      radius={[4, 4, 0, 0]}
                      name="Згадки"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Немає даних для графіка"
                  text="Зараз графік бере значення тільки з KPI-бази. Looqme-блок нижче поки mock."
                />
              )}
            </ChartPanel>

            <ChartPanel title="Органічний трафік помісячно">
              {hasSeriesData(trafficSeries) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trafficSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={56} />
                    <Tooltip content={<MonthlyTooltip metricLabel="Сесії" />} />
                    <Bar
                      dataKey="value"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      name="Сесії"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Немає даних для графіка"
                  text="Додайте у KPI-базі ціль/рядок про органічний трафік і помісячні значення."
                />
              )}
            </ChartPanel>

            <ChartPanel title="Personal Brands фоловери">
              {personalBrands.length ? (
                <div className="space-y-4">
                  {personalBrands.map((item) => (
                    <div key={item.id} className="border-b border-slate-100 pb-4 last:border-0">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-950">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Річна ціль = 100%
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-950">
                          {item.current ?? '—'} / {item.target || '—'}
                          {item.deltaLabel ? (
                            <span
                              className={`ml-2 text-xs ${
                                item.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {item.deltaLabel}
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.progress}% від річної цілі
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Немає Personal Brands цілей"
                  text="Додайте цілі цього напрямку в KPI-базі."
                />
              )}
            </ChartPanel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
            <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Івенти місяця
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {events.length} івентів · {totalContacts} контактів
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {events.length ? (
                  events.slice(0, 5).map((event) => (
                    <div
                      key={event.id}
                      className="flex flex-col gap-1 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-slate-950">{event.title}</p>
                        <p className="text-sm text-slate-500">
                          {event.type || 'Івент'} · {event.role || 'Visitor'}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {event.contacts || 0} контактів
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState title="Немає івентів" />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
              <h2 className="text-base font-semibold text-slate-950">
                Медіа кавередж
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(coverage.mentions || []).map((item) => (
                  <div key={item.brand} className="rounded-md bg-slate-50 px-3 py-3">
                    <p className="text-sm font-medium text-slate-950">{item.brand}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">
                      {item.count}
                    </p>
                    <p className="text-xs text-slate-500">згадки</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={coverage.sentiment || []}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={3}
                    >
                      {(coverage.sentiment || []).map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white px-5 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Board Report Generator
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Збирає KPI, Monthly Focus, Events та media coverage за місяць.
                </p>
              </div>
              <button
                type="button"
                onClick={generateReport}
                disabled={reportLoading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {reportLoading ? 'Генерація...' : 'Згенерувати Board Report'}
              </button>
            </div>
          </section>
        </>
      ) : null}

      {report ? (
        <Modal
          title={`Board Report · ${selectedMonth}`}
          onClose={() => setReport(null)}
          footer={
            <>
              {saveStatus ? (
                <span className="mr-auto text-sm text-slate-600">{saveStatus}</span>
              ) : null}
              <button
                type="button"
                onClick={copyReport}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ClipboardCopy className="h-4 w-4" />
                Копіювати
              </button>
              <button
                type="button"
                onClick={saveReportToNotion}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                Зберегти в Notion
              </button>
            </>
          }
        >
          <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-4 text-sm leading-6 text-slate-800">
            {report}
          </pre>
        </Modal>
      ) : null}
    </div>
  )
}

function DeltaLabel({ x, y, value }) {
  if (!value || x === undefined || y === undefined) return null

  return (
    <text
      x={x}
      y={y - 12}
      textAnchor="middle"
      fill={String(value).startsWith('-') ? '#be123c' : '#047857'}
      fontSize={12}
      fontWeight={600}
    >
      {value}
    </text>
  )
}

function MonthlyTooltip({ active, payload, metricLabel, label }) {
  if (!active || !payload?.length) return null

  const point = payload[0]?.payload || {}

  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-slate-950">{label}</p>
      <p className="mt-1 text-slate-600">
        {metricLabel || payload[0].name}: {formatChartNumber(payload[0].value)}
      </p>
      {point.deltaLabel ? (
        <p className={point.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
          Зміна: {point.deltaLabel}
        </p>
      ) : null}
    </div>
  )
}

function formatChartNumber(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value)
}

function ChartPanel({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  )
}

async function optionalRequest(path, fallback) {
  try {
    return await apiRequest(path)
  } catch {
    return fallback
  }
}
