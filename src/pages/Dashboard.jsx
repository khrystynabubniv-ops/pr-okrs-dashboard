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
import { ArrowDown, ArrowUp, ClipboardCopy, FileText, Save } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DirectionBadge } from '../components/Badge'
import { InfoTooltip } from '../components/InfoTooltip'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'
import {
  buildMonthlySeries,
  directionProgressSummary,
  executiveSummary,
  hasSeriesData,
  mediaCoverageSummary,
  personalBrandBars,
} from '../lib/dashboard'
import {
  eventLeadLabel,
  eventStatusMeta,
  eventSummaryStats,
  parseEventDate,
  sortEventsByDate,
} from '../lib/events'

export function DashboardPage({ selectedMonth }) {
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [reportError, setReportError] = useState(null)

  const dashboardQuery = useAsyncData(
    async () => {
      const [goalsPayload, events, focus, coverage] = await Promise.all([
        optionalRequest('/api/notion/kpi-goals', { goals: [] }),
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
        goals: goalsPayload.goals || [],
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
    () => sortEventsByDate(dashboardQuery.data?.events || []),
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

  const executive = useMemo(
    () =>
      executiveSummary({
        goals,
        focus,
        events,
        coverage,
        selectedMonth,
      }),
    [coverage, events, focus, goals, selectedMonth],
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
  const mediaCoverage = useMemo(
    () => mediaCoverageSummary(coverage),
    [coverage],
  )
  const activeReport = report?.month === selectedMonth ? report.text : null
  const sortedEvents = events
  const eventStats = useMemo(() => eventSummaryStats(events), [events])
  const instagramAxis = useMemo(
    () => getInstagramYAxisConfig(instagramSeries),
    [instagramSeries],
  )
  const hasMonthData = useMemo(
    () =>
      hasDashboardMonthData({
        goals,
        events,
        focus,
        coverage,
        personalBrands,
        selectedMonth,
      }),
    [coverage, events, focus, goals, personalBrands, selectedMonth],
  )

  const totalContacts = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )
  const eventsLeadSummary =
    executive.totalLeads > 0
      ? `${executive.totalLeads} лідів підтягнуто з Activities`
      : eventStats.completed
        ? '0 лідів підтягнуто з Activities'
        : 'Leads is coming'
  const eventsContactsSummary =
    totalContacts > 0
      ? `${totalContacts} контактів`
      : eventStats.completed
        ? '0 контактів у вже проведених'
        : 'Leads is coming'

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
      setReport({ month: selectedMonth, text: result.report })
    } catch (error) {
      setReportError(error)
    } finally {
      setReportLoading(false)
    }
  }

  async function saveReportToNotion() {
    if (!activeReport) return
    setSaveStatus('Збереження...')

    try {
      await apiRequest('/api/notion/board-report', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          report: activeReport,
        }),
      })
      setSaveStatus('Збережено в Notion')
    } catch (error) {
      setSaveStatus(error.message)
    }
  }

  async function copyReport() {
    if (!activeReport) return
    await navigator.clipboard.writeText(activeReport)
    setSaveStatus('Скопійовано')
  }

  function openDirectionGoals(direction) {
    navigate(`/goals?direction=${encodeURIComponent(direction)}`)
  }

  return (
    <div className="space-y-6">
      {dashboardQuery.loading ? <LoadingState /> : null}
      {dashboardQuery.error ? (
        <ErrorState error={dashboardQuery.error} onRetry={dashboardQuery.retry} />
      ) : null}
      {reportError ? <ErrorState error={reportError} /> : null}

      {!dashboardQuery.loading && !dashboardQuery.error && !hasMonthData ? (
        <EmptyState
          title="Інформації по цьому місяцю немає"
          text="Оберіть інший місяць або додайте дані в KPI, Events чи Looqme."
        />
      ) : null}

      {!dashboardQuery.loading && !dashboardQuery.error && hasMonthData ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="KPI в темпі року"
              value={`${executive.kpi.onTrack}/${executive.kpi.measured}`}
              unit="KPI"
              detail={`Для ${selectedMonth.split(' ')[0]} очікувано близько ${executive.kpi.expected}% річної цілі. Відстають: ${executive.kpi.atRisk}.`}
              tooltip={`Більшість KPI річні. Ми дивимось, чи поточний прогрес не відстає від очікуваної частки року. Для ${selectedMonth.split(' ')[0].toLowerCase()} це ${executive.kpi.expected}% річної цілі. KPI потрапляє у ризик, якщо він нижче цього темпу більш ніж на 5 п.п.`}
              tone={executive.kpi.atRisk ? 'orange' : 'green'}
            />
            <EventsMetricCard
              total={executive.eventsTotal}
              completed={eventStats.completed}
              owner={executive.ownerEvents}
              participating={eventStats.participating}
              leadSummary={eventsLeadSummary}
              tooltip="Івенти беруться з календаря івентів. “Організуємо ми” означає роль Owner у календарі. Ліди беруться з Lead count в Activities, якщо той самий івент вдалося зіставити."
            />
            <MetricCard
              label="Наші медіа згадки"
              value={executive.ownMentionsTotal}
              unit="згадок"
              detail={`Конкуренти: ${executive.competitorMentionsTotal}; тональність наших згадок нижче.`}
              tooltip="Поки це mock Looqme-дані. Universe Group рахуємо як наш бренд; Skelar і Headway показані окремо як конкурентний бенчмарк."
              tone="violet"
            />
          </section>

          <DirectionHealthPanel
            items={directionStats}
            selectedMonth={selectedMonth}
            onDirectionOpen={openDirectionGoals}
          />

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartPanel
              title="Instagram підписники помісячно"
              tooltip="Бере значення з KPI-бази Notion: кожна місячна колонка показує фактичну кількість підписників на кінець місяця. Підпис +n/-n показує зміну до попереднього місяця."
            >
              {hasSeriesData(instagramSeries) ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={instagramSeries}
                    margin={{ top: 24, right: 20, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      domain={instagramAxis.domain}
                      ticks={instagramAxis.ticks}
                      tickFormatter={formatChartNumber}
                      allowDecimals={false}
                    />
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

            <ChartPanel
              title="Медіа згадки: помісячна динаміка"
              tooltip="Цей графік бере значення з KPI-бази, якщо є ціль/рядок про медіа згадки. Окремий блок нижче показує mock Looqme coverage."
            >
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

            <ChartPanel
              title="Трафік із сайту: органічний"
              tooltip="Показує органічний трафік сайту з KPI-бази Notion, якщо для цієї метрики заповнені місячні значення."
            >
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

            <ChartPanel
              title="Personal Brands фоловери"
              tooltip="Дані беруться з Excel-таблиці вимірювання результатів. Річна ціль = 100%, а значення місяця показує фактичну кількість фоловерів."
            >
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
                            {item.sourceMonth && item.sourceMonth !== selectedMonth
                              ? `останнє значення: ${item.sourceMonth.split(' ')[0]}`
                              : 'Річна ціль = 100%'}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-slate-950">
                          {formatChartNumber(item.current)} /{' '}
                          {item.target
                            ? formatChartNumber(item.target)
                            : 'ціль не вказана'}
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
                      {item.target ? (
                        <>
                          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${item.progress}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.progress}% від річної цілі
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">
                          Річна ціль у таблиці не вказана
                        </p>
                      )}
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
                    {events.length} івентів · {eventsContactsSummary}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {sortedEvents.length ? (
                  sortedEvents.slice(0, 6).map((event) => (
                    <EventMonthRow key={event.id} event={event} />
                  ))
                ) : (
                  <EmptyState title="Немає івентів" />
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">
                    Медіа кавередж
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Наші згадки окремо від конкурентного бенчмарку.
                  </p>
                </div>
                <InfoTooltip text="Блок показує згадки, охоплення брендів і потенційне охоплення конкретних медіа з Looqme-структури." />
              </div>
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 2xl:grid-cols-2">
                  <LooqmeMetricPanel
                    title="Всі згадки"
                    metric={mediaCoverage.mentionsMetric}
                    formatValue={formatChartNumber}
                  />
                  <LooqmeMetricPanel
                    title="Аудиторія джерела"
                    metric={mediaCoverage.audienceMetric}
                    formatValue={formatReachValue}
                  />
                </div>
                <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <BrandCoverageRow
                    label="Наш бренд"
                    value={`${mediaCoverage.ownTotal} згадок`}
                    reach={mediaCoverage.ownReach}
                    detail={(mediaCoverage.own || [])
                      .map(
                        (item) =>
                          `${item.brand}: ${item.count} · ${formatReachValue(
                            item.reachValue,
                          )}`,
                      )
                      .join(' · ')}
                  />
                  <BrandCoverageRow
                    label="Конкуренти"
                    value={`${mediaCoverage.competitorTotal} згадок`}
                    reach={mediaCoverage.competitorReach}
                    detail={(mediaCoverage.competitors || [])
                      .map(
                        (item) =>
                          `${item.brand}: ${item.count} · ${formatReachValue(
                            item.reachValue,
                          )}`,
                      )
                      .join(' · ')}
                  />
                </div>
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-slate-950">
                      Охоплення по медіа
                    </p>
                    <p className="text-sm font-semibold text-slate-950">
                      {formatReachValue(mediaCoverage.outletsTotalReach)}
                    </p>
                  </div>
                  <div className="mt-3 space-y-2">
                    {mediaCoverage.outlets.length ? (
                      mediaCoverage.outlets.map((item) => (
                        <div
                          key={item.name}
                          className="flex items-center justify-between gap-3 text-xs"
                        >
                          <span className="min-w-0 truncate text-slate-600">
                            {item.name}
                            {item.mentions ? ` · ${item.mentions} зг.` : ''}
                          </span>
                          <span className="shrink-0 font-medium text-slate-950">
                            {formatReachValue(item.reach)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">даних немає</p>
                    )}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm font-medium text-slate-700">
                Тональність наших згадок
              </p>
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
                  Збирає KPI, івенти та медіа за вибраний місяць.
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

      {activeReport ? (
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
            {activeReport}
          </pre>
        </Modal>
      ) : null}
    </div>
  )
}

function hasDashboardMonthData({
  goals,
  events,
  focus,
  coverage,
  personalBrands,
  selectedMonth,
}) {
  const hasKpiForMonth = goals.some((goal) =>
    String(goal.values?.[selectedMonth] ?? '').trim(),
  )
  const hasPersonalBrandForMonth = personalBrands.some(
    (item) => item.sourceMonth === selectedMonth && item.current !== null,
  )
  const hasCoverage = hasCoverageValues(coverage)

  return Boolean(
    hasKpiForMonth ||
      hasPersonalBrandForMonth ||
      events.length ||
      focus.length ||
      hasCoverage,
  )
}

function hasCoverageValues(coverage) {
  const mentions = coverage.mentions || []
  const sentiment = coverage.sentiment || []
  const outlets =
    coverage.mediaOutlets ||
    coverage.outlets ||
    coverage.sources ||
    coverage.publications ||
    []

  return Boolean(
    mentions.length ||
      sentiment.some((item) => Number(item.value || 0) > 0) ||
      outlets.length ||
      coverage.totalReach ||
      coverage.totalAudience ||
      coverage.reach ||
      coverage.audience?.total ||
      coverage.audience?.all,
  )
}

function LooqmeMetricPanel({ title, metric, formatValue }) {
  const segments = metric?.segments || []
  const segmentTotal =
    segments.reduce((sum, item) => sum + Number(item.value || 0), 0) ||
    Number(metric?.value || 0)

  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <DeltaPill value={metric?.delta} />
      </div>
      <p className="mt-4 text-4xl font-semibold leading-none text-slate-950">
        {formatValue(metric?.value || 0)}
      </p>
      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100">
        {segments.length ? (
          segments.map((segment) => (
            <div
              key={segment.label}
              className="h-full"
              style={{
                width: segmentTotal
                  ? `${Math.max(
                      2,
                      (Number(segment.value || 0) / segmentTotal) * 100,
                    )}%`
                  : '0%',
                backgroundColor: segment.color || '#6678ff',
              }}
            />
          ))
        ) : (
          <div className="h-full w-full bg-slate-200" />
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {segments.length ? (
          segments.map((segment) => (
            <div key={segment.label} className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color || '#6678ff' }}
                />
                <span className="truncate">{segment.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-950">
                  {formatValue(segment.value)}
                </span>
                <DeltaPill value={segment.delta} compact />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">даних немає</p>
        )}
      </div>
    </div>
  )
}

function BrandCoverageRow({ label, value, reach, detail }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-slate-950">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
      <p className="text-xs font-medium text-slate-600">
        Охоплення: {formatReachValue(reach)}
      </p>
      <p className="mt-1 text-xs text-slate-500">{detail || 'даних немає'}</p>
    </div>
  )
}

function DeltaPill({ value, compact = false }) {
  if (value === null || value === undefined || value === '') return null

  const numeric = Number(value)
  const isPositive = numeric > 0
  const Icon = isPositive ? ArrowUp : ArrowDown

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${
        compact ? 'text-xs' : 'text-sm'
      } ${
        isPositive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-pink-50 text-pink-600'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(numeric)}%
    </span>
  )
}

function EventMonthRow({ event }) {
  const status = eventStatusMeta(event)
  const leads = eventLeadLabel(event)

  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-950">{event.title}</p>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <p className="text-sm text-slate-500">
          {formatEventDate(event)} · {event.type || 'Івент'} ·{' '}
          {event.role === 'Owner' ? 'організуємо ми' : 'беремо участь'}
        </p>
      </div>
      <span className={`text-sm font-medium ${leads.className}`}>{leads.text}</span>
    </div>
  )
}

function EventsMetricCard({
  total,
  completed,
  owner,
  participating,
  leadSummary,
  tooltip,
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Івенти місяця
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-3xl font-semibold leading-none text-slate-950">{total}</p>
        <span className="text-3xl font-semibold leading-none text-blue-300">/</span>
        <p className="text-3xl font-semibold leading-none text-emerald-700">
          {completed}
        </p>
        <span className="text-sm font-semibold leading-5 text-slate-600">
          виконано
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-white/70 px-2 py-2 ring-1 ring-inset ring-blue-100">
          <p className="font-medium text-slate-500">Own</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-950">{owner}</p>
        </div>
        <div className="rounded-md bg-white/70 px-2 py-2 ring-1 ring-inset ring-blue-100">
          <p className="font-medium text-slate-500">Participate</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-950">
            {participating}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-4 text-slate-500">{leadSummary}</p>
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

function formatReachValue(value) {
  if (!value) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} тис.`
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value)
}

function formatEventDate(event) {
  const date = parseEventDate(event)
  if (!date) return event.date || 'без дати'

  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
  })
}

function getInstagramYAxisConfig(series) {
  const baseline = 10000
  const values = series
    .map((item) => item.value)
    .filter((value) => typeof value === 'number' && Number.isFinite(value))
  const maxValue = Math.max(baseline, ...values)
  const rawStep = Math.max(1, (maxValue - baseline) / 4)
  const step = niceChartStep(rawStep)
  const top = Math.max(baseline + step * 4, Math.ceil(maxValue / step) * step)
  const ticks = []

  for (let value = baseline; value <= top + step / 2; value += step) {
    ticks.push(value)
  }

  return {
    domain: [baseline, top],
    ticks,
  }
}

function niceChartStep(rawStep) {
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude

  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 2.5) return 2.5 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function DirectionHealthPanel({ items, selectedMonth, onDirectionOpen }) {
  const monthName = selectedMonth.split(' ')[0]

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            Стан KPI по напрямах
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Де все йде в темпі року, а де бракує даних або є відставання.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-3 font-semibold">Напрямок</th>
              <th className="px-3 py-3 font-semibold">
                <HeaderWithInfo
                  label="У темпі року"
                  text={`Для ${monthName} порівнюємо прогрес KPI з очікуваною часткою року. Якщо прогрес не нижчий за цей темп, KPI рахується “у темпі”.`}
                />
              </th>
              <th className="px-3 py-3 font-semibold">
                <HeaderWithInfo
                  label="Відстають"
                  text="KPI потрапляє сюди, якщо його прогрес нижчий за очікуваний темп року більш ніж на 5 процентних пунктів."
                />
              </th>
              <th className="px-3 py-3 font-semibold">
                <HeaderWithInfo
                  label={`Заповнено за ${monthName}`}
                  text="Скільки KPI мають значення у місячній колонці Notion для вибраного місяця."
                />
              </th>
              <th className="px-3 py-3 font-semibold">
                <HeaderWithInfo
                  label="До річної цілі"
                  text="Середній прогрес KPI напряму до річної цілі. Для накопичувальних KPI береться сума місяців, для решти - останнє доступне значення."
                />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr
                key={item.direction}
                role="link"
                tabIndex={0}
                title={`Відкрити KPI цілі: ${item.direction}`}
                onClick={() => onDirectionOpen(item.direction)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onDirectionOpen(item.direction)
                  }
                }}
                className="cursor-pointer transition hover:bg-blue-50/60 focus:bg-blue-50 focus:outline-none"
              >
                <td className="px-3 py-4">
                  <DirectionBadge direction={item.direction} />
                </td>
                <td className="whitespace-nowrap px-3 py-4 font-medium text-slate-950">
                  {item.measured ? `${item.onTrack} з ${item.measured} KPI` : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                      item.atRisk
                        ? 'bg-orange-50 text-orange-700 ring-orange-200'
                        : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                    }`}
                  >
                    {item.atRisk ? `${item.atRisk} відстає` : 'не відстають'}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                  {item.updated} з {item.measurable} KPI
                </td>
                <td className="min-w-48 px-3 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#4361ee]"
                        style={{ width: `${Math.min(100, item.average)}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-950">{item.average}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HeaderWithInfo({ label, text }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      <InfoTooltip text={text} />
    </span>
  )
}

function ChartPanel({ title, children, tooltip }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <InfoTooltip text={tooltip} />
      </div>
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
