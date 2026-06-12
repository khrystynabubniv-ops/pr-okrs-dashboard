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
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  FileText,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { DirectionBadge } from '../components/Badge'
import { InfoTooltip } from '../components/InfoTooltip'
import { MetricCard } from '../components/MetricCard'
import { Modal } from '../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { MONTHS } from '../constants'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'
import {
  buildMonthlySeries,
  candidateAwarenessKpi,
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

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const COVERAGE_CACHE_TTL_MS = 10 * 60 * 1000
const dashboardPayloadCache = new Map()
const coveragePayloadCache = new Map()

export function DashboardPage({ selectedMonth }) {
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [reportError, setReportError] = useState(null)
  const [competitorModalOpen, setCompetitorModalOpen] = useState(false)
  const [competitorSaving, setCompetitorSaving] = useState(false)
  const [competitorForm, setCompetitorForm] = useState(() =>
    createEmptyCompetitorForm(selectedMonth),
  )

  const dashboardQuery = useAsyncData(
    () => loadDashboardPayload(selectedMonth),
    [selectedMonth],
    {
      initialData: () =>
        readCachedPayload(dashboardPayloadCache, selectedMonth, DASHBOARD_CACHE_TTL_MS),
      keepPreviousData: true,
    },
  )
  const coverageQuery = useAsyncData(
    () => loadCoveragePayload(selectedMonth),
    [selectedMonth],
    {
      initialData: () =>
        readCachedPayload(coveragePayloadCache, selectedMonth, COVERAGE_CACHE_TTL_MS),
      keepPreviousData: true,
    },
  )
  const activeDashboardData =
    dashboardQuery.data?.month === selectedMonth ? dashboardQuery.data : null
  const activeCoverageData =
    coverageQuery.data?.month === selectedMonth ? coverageQuery.data : null

  const goals = useMemo(
    () => activeDashboardData?.goals || [],
    [activeDashboardData],
  )
  const events = useMemo(
    () => sortEventsByDate(activeDashboardData?.events || []),
    [activeDashboardData],
  )
  const focus = useMemo(
    () => activeDashboardData?.focus || [],
    [activeDashboardData],
  )
  const coverage = useMemo(
    () => activeCoverageData || {},
    [activeCoverageData],
  )
  const coverageLoading = coverageQuery.loading && !activeCoverageData
  const eventAwareness = useMemo(
    () => activeDashboardData?.eventAwareness || { audiences: [], overall: null },
    [activeDashboardData],
  )
  const candidateAwareness = useMemo(
    () => candidateAwarenessKpi(goals, selectedMonth),
    [goals, selectedMonth],
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
  const manualCompetitors = useMemo(
    () =>
      (coverage.mentions || []).filter(
        (item) => item.source === 'manual-competitor',
      ),
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
        eventAwareness,
        candidateAwareness,
        selectedMonth,
      }),
    [
      candidateAwareness,
      coverage,
      eventAwareness,
      events,
      focus,
      goals,
      personalBrands,
      selectedMonth,
    ],
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

  function openCompetitorModal() {
    setReportError(null)
    setCompetitorForm(createEmptyCompetitorForm(selectedMonth))
    setCompetitorModalOpen(true)
  }

  async function saveCompetitor(event) {
    event.preventDefault()
    setCompetitorSaving(true)
    setReportError(null)

    try {
      await apiRequest('/api/coverage/competitors', {
        method: 'POST',
        body: JSON.stringify(competitorForm),
      })
      setCompetitorModalOpen(false)
      invalidateCachedPayload(coveragePayloadCache, selectedMonth)
      await coverageQuery.retry()
    } catch (error) {
      setReportError(error)
    } finally {
      setCompetitorSaving(false)
    }
  }

  async function removeCompetitor(id) {
    setReportError(null)

    try {
      await apiRequest(`/api/coverage/competitors/${id}`, {
        method: 'DELETE',
      })
      invalidateCachedPayload(coveragePayloadCache, selectedMonth)
      await coverageQuery.retry()
    } catch (error) {
      setReportError(error)
    }
  }

  function openDirectionGoals(direction) {
    navigate(`/goals?direction=${encodeURIComponent(direction)}`)
  }

  return (
    <div className="space-y-6">
      {dashboardQuery.loading && !activeDashboardData ? <LoadingState /> : null}
      {dashboardQuery.error && !activeDashboardData ? (
        <ErrorState error={dashboardQuery.error} onRetry={dashboardQuery.retry} />
      ) : null}
      {reportError ? <ErrorState error={reportError} /> : null}

      {!dashboardQuery.loading &&
      !dashboardQuery.error &&
      activeDashboardData &&
      !hasMonthData ? (
        <EmptyState
          title="Інформації по цьому місяцю немає"
          text="Оберіть інший місяць або додайте дані в KPI, Events чи Looqme."
        />
      ) : null}

      {!dashboardQuery.error && activeDashboardData && hasMonthData ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
              tooltip="Бере coverage з Looqme. Universe Group рахуємо як наш бренд; конкуренти показані окремо як бенчмарк."
              tone="violet"
            />
            <EventAwarenessMetricCard
              awareness={eventAwareness}
              tooltip="Показує awareness по бренду після івентів з Google Sheet Awaraness 2025-2026: окремо Students і Middle+."
            />
            <CandidateAwarenessKpiCard
              kpi={candidateAwareness}
              tooltip="Показує KPI з рядка “Збільшити к-сть кандидатів, які знають про компанію”: відсоток awareness, ціль і прогрес до 70%."
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
              tooltip="Бере значення з KPI-спредшиту: кожна місячна колонка показує фактичну кількість підписників на кінець місяця. Підпис +n/-n показує зміну до попереднього місяця."
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
                  text="Графік підтягнеться з KPI-цілі Instagram, коли у місячних колонках спредшиту будуть числа."
                />
              )}
            </ChartPanel>

            <ChartPanel
              title="Медіа згадки: помісячна динаміка"
              tooltip="Цей графік бере значення з KPI-спредшиту, якщо є ціль/рядок про медіа згадки. Окремий блок нижче показує Looqme coverage."
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
                  text="Зараз графік бере значення тільки з KPI-спредшиту. Looqme-блок нижче показує coverage за вибраний місяць."
                />
              )}
            </ChartPanel>

            <ChartPanel
              title="Трафік із сайту: органічний"
              tooltip="Показує органічний трафік сайту з KPI-спредшиту, якщо для цієї метрики заповнені місячні значення."
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
                  text="Додайте у KPI-спредшит ціль/рядок про органічний трафік і помісячні значення."
                />
              )}
            </ChartPanel>

            <ChartPanel
              title="Personal Brands фоловери"
              tooltip="Дані беруться з KPI-спредшиту. Значення місяця показує фактичну кількість фоловерів; якщо річна ціль у спредшиті порожня, прогрес не рахується."
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
                              ? `останнє значення: ${item.sourceMonth.split(' ')[0]}${
                                  item.target ? '' : ' · ціль не вказана'
                                }`
                              : item.target
                                ? 'Річна ціль = 100%'
                                : 'ціль не вказана'}
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
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Немає Personal Brands цілей"
                  text="Додайте цілі цього напрямку в KPI-спредшит."
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
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openCompetitorModal}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-4 w-4" />
                    Конкурент
                  </button>
                  <InfoTooltip text="Блок показує згадки, охоплення брендів і потенційне охоплення конкретних медіа з Looqme-структури." />
                </div>
              </div>
              {coverageLoading ? (
                <div className="mt-4 flex min-h-48 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-sm font-medium text-slate-500">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin text-indigo-500" />
                  Завантажуємо Looqme coverage...
                </div>
              ) : (
                <>
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
                {manualCompetitors.length ? (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-sm font-medium text-slate-950">
                      Ручний конкурентний бенчмарк
                    </p>
                    <div className="mt-3 space-y-2">
                      {manualCompetitors.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 truncate text-slate-700">
                            {item.brand} · {item.count} зг. · {formatReachValue(item.reach)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeCompetitor(item.id)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-rose-600"
                            aria-label="Видалити конкурента"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                </>
              )}
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

          {competitorModalOpen ? (
            <Modal
              title="Конкурентний бенчмарк"
              onClose={() => setCompetitorModalOpen(false)}
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => setCompetitorModalOpen(false)}
                    className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    form="competitor-form"
                    disabled={competitorSaving || !competitorForm.brand.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    Зберегти
                  </button>
                </>
              }
            >
              <form id="competitor-form" onSubmit={saveCompetitor} className="space-y-4">
                <label className="field">
                  <span>Бренд</span>
                  <input
                    value={competitorForm.brand}
                    onChange={(event) =>
                      setCompetitorForm({ ...competitorForm, brand: event.target.value })
                    }
                    placeholder="Наприклад, Skelar"
                    required
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="field">
                    <span>Місяць</span>
                    <select
                      value={competitorForm.month}
                      onChange={(event) =>
                        setCompetitorForm({
                          ...competitorForm,
                          month: event.target.value,
                        })
                      }
                    >
                      {MONTHS.map((month) => (
                        <option key={month}>{month}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Згадки</span>
                    <input
                      type="number"
                      min="0"
                      value={competitorForm.mentions}
                      onChange={(event) =>
                        setCompetitorForm({
                          ...competitorForm,
                          mentions: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Охоплення</span>
                    <input
                      type="number"
                      min="0"
                      value={competitorForm.reach}
                      onChange={(event) =>
                        setCompetitorForm({
                          ...competitorForm,
                          reach: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Нотатка</span>
                  <textarea
                    value={competitorForm.note}
                    onChange={(event) =>
                      setCompetitorForm({ ...competitorForm, note: event.target.value })
                    }
                    rows="3"
                  />
                </label>
              </form>
            </Modal>
          ) : null}
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
  eventAwareness,
  candidateAwareness,
  selectedMonth,
}) {
  const hasKpiForMonth = goals.some((goal) =>
    String(goal.values?.[selectedMonth] ?? '').trim(),
  )
  const hasPersonalBrandForMonth = personalBrands.some(
    (item) => item.sourceMonth === selectedMonth && item.current !== null,
  )
  const hasCoverage = hasCoverageValues(coverage)
  const hasEventAwareness = (eventAwareness?.audiences || []).some(
    (item) => item.awareness !== null && item.awareness !== undefined,
  )
  const hasCandidateAwareness =
    candidateAwareness &&
    (candidateAwareness.awareness !== null || candidateAwareness.knownCount !== null)

  return Boolean(
    hasKpiForMonth ||
      hasPersonalBrandForMonth ||
      events.length ||
      focus.length ||
      hasCoverage ||
      hasEventAwareness ||
      hasCandidateAwareness,
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

function createEmptyCompetitorForm(selectedMonth) {
  return {
    month: selectedMonth,
    brand: '',
    mentions: '',
    reach: '',
    note: '',
  }
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

function EventAwarenessMetricCard({ awareness, tooltip }) {
  const audiences = awareness?.audiences || []
  const students = audiences.find((item) => item.key === 'students')
  const middle = audiences.find((item) => item.key === 'middle')
  const overall = awareness?.overall

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Awareness після івентів
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-semibold leading-none text-slate-950">
          {formatPercent(overall?.awareness)}
        </p>
        <span className="text-sm font-semibold leading-5 text-slate-600">
          загалом
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <AwarenessAudiencePill audience={students} />
        <AwarenessAudiencePill audience={middle} />
      </div>
      <p className="mt-2 text-xs leading-4 text-slate-500">
        {overall?.total
          ? `${formatChartNumber(overall.known)} з ${formatChartNumber(
              overall.total,
            )} відповідей`
          : 'дані з таблиці не підтягнулись'}
      </p>
    </div>
  )
}

function CandidateAwarenessKpiCard({ kpi, tooltip }) {
  const sourceMonth = kpi?.sourceMonth ? kpi.sourceMonth.split(' ')[0] : ''
  const detail = kpi
    ? [
        kpi.knownCount ? `${formatChartNumber(kpi.knownCount)} кандидатів` : null,
        sourceMonth ? `останній замір: ${sourceMonth}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'KPI-рядок ще не знайдено'

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Awareness кандидатів
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-semibold leading-none text-slate-950">
          {formatPercentNumber(kpi?.awareness)}
        </p>
        <span className="text-sm font-semibold leading-5 text-slate-600">
          знають
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs">
        <div className="rounded-md bg-white/70 px-2 py-2 ring-1 ring-inset ring-cyan-100">
          <p className="font-medium text-slate-500">Річна ціль</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-950">
            {formatPercentNumber(kpi?.target)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-4 text-slate-500">
        {detail || 'Додайте значення в KPI-спредшиті'}
      </p>
    </div>
  )
}

function AwarenessAudiencePill({ audience }) {
  return (
    <div className="rounded-md bg-white/70 px-2 py-2 ring-1 ring-inset ring-emerald-100">
      <p className="font-medium text-slate-500">{audience?.label || '—'}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-950">
        {formatPercent(audience?.awareness)}
      </p>
      {audience?.total ? (
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          {formatChartNumber(audience.known)} / {formatChartNumber(audience.total)}
        </p>
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

function formatPercent(value) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 1,
    style: 'percent',
  }).format(value)
}

function formatPercentNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 1,
  }).format(value)}%`
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
                  text="Скільки KPI мають значення у місячній колонці KPI-спредшиту для вибраного місяця."
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

async function loadDashboardPayload(selectedMonth) {
  const cached = readCachedPayload(
    dashboardPayloadCache,
    selectedMonth,
    DASHBOARD_CACHE_TTL_MS,
  )
  if (cached) return cached

  const [goalsPayload, events, focus, eventAwareness] = await Promise.all([
    optionalRequest('/api/kpi-goals', { goals: [] }, 10000),
    optionalRequest(
      `/api/notion/events?month=${encodeURIComponent(selectedMonth)}`,
      { events: [] },
      4000,
    ),
    optionalRequest(
      `/api/notion/monthly-focus?month=${encodeURIComponent(selectedMonth)}`,
      { entries: [] },
      4000,
    ),
    optionalRequest('/api/event-awareness', { audiences: [], overall: null }, 6000),
  ])
  const payload = {
    month: selectedMonth,
    goals: goalsPayload.goals || [],
    events: events.events || [],
    focus: focus.entries || [],
    eventAwareness,
  }

  writeCachedPayload(dashboardPayloadCache, selectedMonth, payload)
  return payload
}

async function loadCoveragePayload(selectedMonth) {
  const cached = readCachedPayload(
    coveragePayloadCache,
    selectedMonth,
    COVERAGE_CACHE_TTL_MS,
  )
  if (cached) return cached

  const payload = await optionalRequest(
    `/api/looqme/coverage?month=${encodeURIComponent(selectedMonth)}`,
    { month: selectedMonth, mentions: [], sentiment: [], source: 'looqme-timeout' },
    35000,
  )
  const coverage = {
    ...payload,
    month: payload.month || selectedMonth,
  }

  writeCachedPayload(coveragePayloadCache, selectedMonth, coverage)
  return coverage
}

function readCachedPayload(cache, key, ttlMs) {
  const cached = cache.get(key)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > ttlMs) {
    cache.delete(key)
    return null
  }

  return cached.payload
}

function writeCachedPayload(cache, key, payload) {
  cache.set(key, {
    cachedAt: Date.now(),
    payload,
  })
}

function invalidateCachedPayload(cache, key) {
  cache.delete(key)
}

async function optionalRequest(path, fallback, timeoutMs = 10000) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await apiRequest(path, { signal: controller.signal })
  } catch {
    return fallback
  } finally {
    window.clearTimeout(timeout)
  }
}
