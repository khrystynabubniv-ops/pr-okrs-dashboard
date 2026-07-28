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
  ExternalLink,
  FileText,
  Mail,
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
import { API_REFRESH_INTERVAL_MS, apiRequest } from '../lib/api'
import {
  buildMonthlySeries,
  candidateAwarenessKpi,
  directionProgressSummary,
  executiveSummary,
  hasSeriesData,
  mediaCoverageSummary,
} from '../lib/dashboard'
import {
  eventLeadLabel,
  eventStatusMeta,
  eventSummaryStats,
  parseEventDate,
  sortEventsByDate,
} from '../lib/events'
import {
  buildMailchimpPerformance,
  hasMailchimpPerformanceData,
} from '../lib/mailchimpPerformance'

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000
const COVERAGE_CACHE_TTL_MS = API_REFRESH_INTERVAL_MS
const MAILCHIMP_CACHE_TTL_MS = API_REFRESH_INTERVAL_MS
const DASHBOARD_NOTION_TIMEOUT_MS = 15000
const COVERAGE_FALLBACK_SOURCES = new Set([
  'looqme-timeout',
  'looqme-missing-token',
  'looqme-missing-url',
])
const MAILCHIMP_FALLBACK_SOURCES = new Set([
  'mailchimp-timeout',
  'mailchimp-missing-token',
  'mailchimp-missing-server',
])
const LOOQME_DASHBOARD_URL = normalizeExternalDashboardUrl(
  import.meta.env.VITE_LOOQME_DASHBOARD_URL ||
    import.meta.env.VITE_LOOKER_DASHBOARD_URL,
)
const MAILCHIMP_DASHBOARD_URL = normalizeExternalDashboardUrl(
  import.meta.env.VITE_MAILCHIMP_DASHBOARD_URL,
)
const dashboardPayloadCache = new Map()
const coveragePayloadCache = new Map()
const mailchimpPayloadCache = new Map()

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
      backgroundRefresh: true,
      refreshIntervalMs: API_REFRESH_INTERVAL_MS,
    },
  )
  const coverageQuery = useAsyncData(
    () => loadCoveragePayload(selectedMonth),
    [selectedMonth],
    {
      initialData: () =>
        readCachedPayload(coveragePayloadCache, selectedMonth, COVERAGE_CACHE_TTL_MS),
      keepPreviousData: true,
      backgroundRefresh: true,
      refreshIntervalMs: API_REFRESH_INTERVAL_MS,
    },
  )
  const mailchimpQuery = useAsyncData(
    () => loadMailchimpPayload(selectedMonth),
    [selectedMonth],
    {
      initialData: () =>
        readCachedPayload(mailchimpPayloadCache, selectedMonth, MAILCHIMP_CACHE_TTL_MS),
      keepPreviousData: true,
      backgroundRefresh: true,
      refreshIntervalMs: API_REFRESH_INTERVAL_MS,
    },
  )
  const activeDashboardData =
    dashboardQuery.data?.month === selectedMonth ? dashboardQuery.data : null
  const rawCoverageData =
    coverageQuery.data?.month === selectedMonth ? coverageQuery.data : null
  const coverageFallback = isCoverageFallbackPayload(rawCoverageData)
  const activeCoverageData =
    rawCoverageData && !coverageFallback ? rawCoverageData : null
  const rawMailchimpData =
    mailchimpQuery.data?.month === selectedMonth ? mailchimpQuery.data : null
  const mailchimpFallback = isMailchimpFallbackPayload(rawMailchimpData)
  const activeMailchimpData =
    rawMailchimpData && !mailchimpFallback ? rawMailchimpData : null

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
  const coverageUnavailable = !coverageLoading && coverageFallback
  const mailchimp = useMemo(
    () => activeMailchimpData || {},
    [activeMailchimpData],
  )
  const mailchimpPerformance = useMemo(
    () => buildMailchimpPerformance(mailchimp, selectedMonth),
    [mailchimp, selectedMonth],
  )
  const mailchimpLoading = mailchimpQuery.loading && !activeMailchimpData
  const mailchimpUnavailable = !mailchimpLoading && mailchimpFallback
  const mailchimpTooltip = [
    'Бере Mailchimp reports за вибраний і попередній календарний місяць. Дельти — різниця агрегатів поточного і попереднього календарного місяця.',
    'Малі розсилки включені в метрики та список.',
    'Тестові/копії за назвою не відображаються і не входять у метрики.',
    mailchimpPerformance.excludedCampaigns
      ? `За цей місяць виключено ${formatChartNumber(
          mailchimpPerformance.excludedCampaigns,
        )} тестових або копій.`
      : null,
  ]
    .filter(Boolean)
    .join(' ')
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
        mailchimp,
        selectedMonth,
      }),
    [coverage, events, focus, goals, mailchimp, selectedMonth],
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
        mailchimpPerformance,
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
      mailchimpPerformance,
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
          mailchimp,
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
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
              tooltip="Бере coverage з Looqme. Universe Group рахуємо як наш бренд; конкурентів показуємо окремо для порівняння."
              tone="violet"
            />
            <MailchimpMetricCard
              performance={mailchimpPerformance}
              loading={mailchimpLoading}
              unavailable={mailchimpUnavailable}
              onRetry={mailchimpQuery.retry}
              tooltip={mailchimpTooltip}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
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

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
            <ChartPanel
              title="Media coverage"
              tooltip="Цей графік бере значення з KPI-спредшиту, якщо є ціль/рядок про медіа згадки. Окремий блок нижче показує Looqme coverage."
            >
              {hasSeriesData(mediaSeries) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mediaSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={44} />
                    <Tooltip content={<MonthlyTooltip metricLabel="Згадки" />} />
                    <Bar
                      dataKey="value"
                      fill="var(--accent)"
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
              title="Email performance"
              tooltip={mailchimpTooltip}
            >
              <MailchimpPerformancePanel
                performance={mailchimpPerformance}
                loading={mailchimpLoading}
                unavailable={mailchimpUnavailable}
                href={MAILCHIMP_DASHBOARD_URL}
                onRetry={mailchimpQuery.retry}
              />
            </ChartPanel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <ChartPanel
              title="Instagram підписники помісячно"
              tooltip="Бере значення з KPI-спредшиту: кожна місячна колонка показує фактичну кількість підписників на кінець місяця. Підпис +n/-n показує зміну до попереднього місяця."
            >
              {hasSeriesData(instagramSeries) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={instagramSeries}
                    margin={{ top: 24, right: 20, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
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
                      stroke="var(--accent)"
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
              title="Трафік із сайту: органічний"
              tooltip="Показує органічний трафік сайту з KPI-спредшиту, якщо для цієї метрики заповнені місячні значення."
            >
              {hasSeriesData(trafficSeries) ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trafficSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={56} />
                    <Tooltip content={<MonthlyTooltip metricLabel="Сесії" />} />
                    <Bar
                      dataKey="value"
                      fill="var(--warn)"
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
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="panel px-5 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    Upcoming events
                  </h2>
                  <p className="mt-1 text-sm text-ink3">
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

            <div className="panel px-5 py-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    Recent coverage
                  </h2>
                  <p className="mt-1 text-sm text-ink3">
                    Наші згадки окремо від конкурентного порівняння.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openCompetitorModal}
                    className="ui-button ui-button-ghost min-h-9 px-3 py-2"
                  >
                    <Plus className="h-4 w-4" />
                    Конкурент
                  </button>
                  <InfoTooltip text="Блок показує згадки, охоплення брендів і потенційне охоплення конкретних медіа з Looqme-структури." />
                </div>
              </div>
              {coverageLoading ? (
                <div className="mt-4 flex min-h-48 items-center justify-center rounded-card border border-line bg-surface-2 text-sm font-medium text-muted">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin text-accent" />
                  Завантажуємо Looqme coverage...
                </div>
              ) : coverageUnavailable ? (
                <div className="mt-4 flex min-h-48 flex-col items-center justify-center rounded-card border border-line bg-warn-soft px-4 text-center">
                  <p className="text-sm font-semibold text-ink">
                    Looqme не встиг повернути дані.
                  </p>
                  <p className="mt-1 max-w-md text-sm text-muted">
                    Це не означає, що згадок немає. Запит можна повторити, а успішний результат закешується.
                  </p>
                  <button
                    type="button"
                    onClick={() => coverageQuery.retry()}
                    className="ui-button ui-button-ghost mt-4 min-h-9 px-3 py-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Повторити
                  </button>
                </div>
              ) : (
                <>
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 2xl:grid-cols-2">
                  <LooqmeMetricPanel
                    title="Всі згадки"
                    metric={mediaCoverage.mentionsMetric}
                    formatValue={formatChartNumber}
                    href={LOOQME_DASHBOARD_URL}
                  />
                  <LooqmeMetricPanel
                    title="Аудиторія джерела"
                    metric={mediaCoverage.audienceMetric}
                    formatValue={formatReachValue}
                    href={LOOQME_DASHBOARD_URL}
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
                      Ручне конкурентне порівняння
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
                    className="ui-button-icon shrink-0 hover:text-warn"
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

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="panel px-5 py-5">
              <div>
                <p className="section-label">Board report</p>
                <h2 className="mt-1 text-base font-semibold text-ink">
                  Генерація звіту
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink2">
                  Збирає KPI, івенти, coverage та email performance за вибраний місяць.
                </p>
              </div>
              <button
                type="button"
                onClick={generateReport}
                disabled={reportLoading}
                className="ui-button ui-button-primary mt-5"
              >
                <FileText className="h-4 w-4" />
                {reportLoading ? 'Генерація...' : 'Згенерувати Board Report'}
              </button>
              {saveStatus ? (
                <p className="mt-3 text-sm font-medium text-ink3">{saveStatus}</p>
              ) : null}
            </div>

            <div className="panel overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-line2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    Preview · {selectedMonth}
                  </h2>
                  <p className="mt-1 text-sm text-ink3">
                    {activeReport ? 'Готовий текст звіту' : 'Зʼявиться після генерації'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyReport}
                    disabled={!activeReport}
                    className="ui-button ui-button-ghost min-h-9 px-3 py-2"
                  >
                    <ClipboardCopy className="h-4 w-4" />
                    Копіювати
                  </button>
                  <button
                    type="button"
                    onClick={saveReportToNotion}
                    disabled={!activeReport}
                    className="ui-button ui-button-primary min-h-9 px-3 py-2"
                  >
                    <Save className="h-4 w-4" />
                    Зберегти
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto px-5 py-4">
                {activeReport ? (
                  <pre className="whitespace-pre-wrap text-sm leading-6 text-ink2">
                    {activeReport}
                  </pre>
                ) : (
                  <div className="grid min-h-48 place-items-center rounded-card border border-dashed border-line bg-surface-2 px-4 text-center text-sm text-muted">
                    {reportLoading ? (
                      <span className="inline-flex items-center gap-2 font-semibold text-ink2">
                        <RefreshCw className="h-4 w-4 animate-spin text-accent" />
                        Генеруємо Board Report...
                      </span>
                    ) : (
                      'Натисніть генерацію, щоб переглянути текст перед копіюванням або збереженням.'
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {competitorModalOpen ? (
            <Modal
              title="Конкурентне порівняння"
              onClose={() => setCompetitorModalOpen(false)}
              footer={
                <>
                  <button
                    type="button"
                    onClick={() => setCompetitorModalOpen(false)}
                    className="ui-button ui-button-ghost"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    form="competitor-form"
                    disabled={competitorSaving || !competitorForm.brand.trim()}
                    className="ui-button ui-button-primary"
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

    </div>
  )
}

function hasDashboardMonthData({
  goals,
  events,
  focus,
  coverage,
  mailchimpPerformance,
  eventAwareness,
  candidateAwareness,
  selectedMonth,
}) {
  const hasKpiForMonth = goals.some((goal) =>
    String(goal.values?.[selectedMonth] ?? '').trim(),
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
      events.length ||
      focus.length ||
      hasCoverage ||
      hasMailchimpPerformanceData(mailchimpPerformance) ||
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

function LooqmeMetricPanel({ title, metric, formatValue, href }) {
  const segments = metric?.segments || []
  const segmentTotal =
    segments.reduce((sum, item) => sum + Number(item.value || 0), 0) ||
    Number(metric?.value || 0)
  const className = `block rounded-card border border-line bg-surface px-4 py-4 shadow-soft ${
    href
      ? 'transition hover:border-accent hover:shadow-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-soft'
      : ''
  }`

  const panel = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <span className="flex items-center gap-2">
          <DeltaPill value={metric?.delta} />
          {href ? <ExternalLink className="h-4 w-4 text-muted" /> : null}
        </span>
      </div>
      <p className="mono mt-4 text-2xl font-bold leading-none text-ink">
        {formatValue(metric?.value || 0)}
      </p>
      <div className="mt-5 flex h-3 overflow-hidden rounded-tag bg-line">
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
                backgroundColor: segment.color || 'var(--accent)',
              }}
            />
          ))
        ) : (
          <div className="h-full w-full bg-line" />
        )}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {segments.length ? (
          segments.map((segment) => (
            <div key={segment.label} className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-medium text-muted">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color || 'var(--accent)' }}
                />
                <span className="truncate">{segment.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="mono text-sm font-semibold text-ink">
                  {formatValue(segment.value)}
                </span>
                <DeltaPill value={segment.delta} compact />
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted">даних немає</p>
        )}
      </div>
    </>
  )

  return href ? (
    <a
      href={href}
      className={className}
      aria-label={`${title}: відкрити Looqme dashboard`}
    >
      {panel}
    </a>
  ) : (
    <div className={className}>{panel}</div>
  )
}

function BrandCoverageRow({ label, value, reach, detail }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink">{label}</p>
      <p className="mono mt-1 text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs font-medium text-muted">
        Охоплення: {formatReachValue(reach)}
      </p>
      <p className="mt-1 text-xs text-muted">{detail || 'даних немає'}</p>
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
          ? 'bg-good-soft text-good'
          : 'bg-warn-soft text-warn'
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
    <div className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink">{event.title}</p>
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}
          >
            {status.label}
          </span>
        </div>
        <p className="text-sm text-muted">
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
    <div className="rounded-card border border-line bg-accent-soft p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Івенти місяця
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="mono text-2xl font-bold leading-none text-ink">{total}</p>
        <span className="mono text-2xl font-bold leading-none text-accent">/</span>
        <p className="mono text-2xl font-bold leading-none text-good">
          {completed}
        </p>
        <span className="text-sm font-semibold leading-5 text-muted">
          виконано
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-input bg-surface/70 px-2 py-2 ring-1 ring-inset ring-line">
          <p className="font-medium text-muted">Own</p>
          <p className="mono mt-0.5 text-sm font-semibold text-ink">{owner}</p>
        </div>
        <div className="rounded-input bg-surface/70 px-2 py-2 ring-1 ring-inset ring-line">
          <p className="font-medium text-muted">Participate</p>
          <p className="mono mt-0.5 text-sm font-semibold text-ink">
            {participating}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-4 text-muted">{leadSummary}</p>
    </div>
  )
}

function EventAwarenessMetricCard({ awareness, tooltip }) {
  const audiences = awareness?.audiences || []
  const students = audiences.find((item) => item.key === 'students')
  const middle = audiences.find((item) => item.key === 'middle')
  const overall = awareness?.overall

  return (
    <div className="rounded-card border border-line bg-good-soft p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Awareness після івентів
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="mono text-2xl font-bold leading-none text-ink">
          {formatPercent(overall?.awareness)}
        </p>
        <span className="text-sm font-semibold leading-5 text-muted">
          загалом
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <AwarenessAudiencePill audience={students} />
        <AwarenessAudiencePill audience={middle} />
      </div>
      <p className="mt-2 text-xs leading-4 text-muted">
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
    <div className="rounded-card border border-line bg-accent-soft p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Awareness кандидатів
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="mono text-2xl font-bold leading-none text-ink">
          {formatPercentNumber(kpi?.awareness)}
        </p>
        <span className="text-sm font-semibold leading-5 text-muted">
          знають
        </span>
      </div>
      <div className="mt-4 grid gap-2 text-xs">
        <div className="rounded-input bg-surface/70 px-2 py-2 ring-1 ring-inset ring-line">
          <p className="font-medium text-muted">Річна ціль</p>
          <p className="mono mt-0.5 text-sm font-semibold text-ink">
            {formatPercentNumber(kpi?.target)}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs leading-4 text-muted">
        {detail || 'Додайте значення в KPI-спредшиті'}
      </p>
    </div>
  )
}

function MailchimpMetricCard({ performance, loading, unavailable, onRetry, tooltip }) {
  const hasData = performance?.hasCampaigns
  const openRate = performance?.engagement?.openRate?.value
  const detail = loading
    ? 'Завантажуємо campaign reports...'
    : unavailable
      ? 'Потрібен Mailchimp API key'
      : hasData
        ? `${formatChartNumber(performance.campaigns.length)} реальних кампаній · ${formatChartNumber(
            performance.engagement.reach.emailsSent,
          )} sent · CR ${formatRateValue(performance.engagement.clickRate.value)}`
        : performance?.totalCampaigns
          ? `${formatChartNumber(performance.totalCampaigns)} кампаній відфільтровано як тестові/копії`
          : 'Кампаній за місяць немає'

  return (
    <div className="rounded-card border border-line bg-warn-soft p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Email open rate
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <Mail className="h-6 w-6 text-warn" />
        <p className="mono text-2xl font-bold leading-none text-ink">
          {loading ? '...' : hasData ? formatRateValue(openRate) : '—'}
        </p>
      </div>
      <p className="mt-3 text-sm leading-5 text-muted">{detail}</p>
      {unavailable ? (
        <button
          type="button"
          onClick={onRetry}
          className="ui-button ui-button-ghost mt-3 min-h-8 px-3 py-2 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Повторити
        </button>
      ) : null}
    </div>
  )
}

function MailchimpPerformancePanel({
  performance,
  loading,
  unavailable,
  href,
  onRetry,
}) {
  if (loading) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-card border border-line bg-surface-2 text-sm font-medium text-muted">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin text-warn" />
        Завантажуємо Mailchimp...
      </div>
    )
  }

  if (unavailable) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-card border border-line bg-warn-soft px-4 text-center">
        <p className="text-sm font-semibold text-ink">
          Mailchimp ще не підключений.
        </p>
        <p className="mt-1 max-w-md text-sm text-muted">
          Додайте API key і server prefix у змінні середовища, щоб бачити email-метрики.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="ui-button ui-button-ghost mt-4 min-h-9 px-3 py-2"
        >
          <RefreshCw className="h-4 w-4" />
          Повторити
        </button>
      </div>
    )
  }

  if (!performance?.hasCampaigns) {
    const emptyText = performance?.totalCampaigns
      ? `${formatChartNumber(
          performance.totalCampaigns,
        )} кампаній за місяць були виключені як тестові або копії.`
      : 'Панель заповниться, коли за вибраний місяць у Mailchimp будуть sent campaigns.'

    return (
      <EmptyState
        title="Немає Mailchimp кампаній"
        text={emptyText}
      />
    )
  }

  return (
    <div className="space-y-5">
      <MailchimpLevel title="Рівень 1 — Залученість">
        <div className="grid gap-3 md:grid-cols-3">
          <MailchimpRateMetricCard
            label="Open rate"
            metric={performance.engagement.openRate}
          />
          <MailchimpRateMetricCard
            label="Click rate"
            metric={performance.engagement.clickRate}
          />
          <MailchimpExecutiveMetricCard
            label="Охоплення"
            value={formatChartNumber(performance.engagement.reach.uniqueOpens)}
            detail={`${formatChartNumber(
              performance.engagement.reach.emailsSent,
            )} надісланих`}
          />
        </div>
      </MailchimpLevel>

      <MailchimpLevel title="Рівень 2 — Здоровʼя бази">
        <div className="grid gap-3 md:grid-cols-3">
          <MailchimpExecutiveMetricCard
            label="Зростання бази"
            value={formatSignedChartNumber(performance.health.baseGrowth.netNew)}
            detail={
              performance.health.baseGrowth.memberCount !== null
                ? `Поточний розмір бази: ${formatChartNumber(
                    performance.health.baseGrowth.memberCount,
                  )}`
                : 'Розмір бази недоступний: потрібен Audience ID'
            }
          />
          <MailchimpExecutiveMetricCard
            label="Відписки"
            value={formatRateValue(performance.health.unsubscribes.rate)}
            detail={`${formatChartNumber(performance.health.unsubscribes.count)} людей`}
            tone={performance.health.unsubscribes.isWarning ? 'warning' : 'neutral'}
          />
          <MailchimpExecutiveMetricCard
            label="Bounce"
            value={formatRateValue(performance.health.bounce.rate)}
            detail={`${formatChartNumber(
              performance.health.bounce.count,
            )} bounced · поріг ${formatRateValue(performance.health.bounce.threshold)}`}
            tone={performance.health.bounce.isCritical ? 'critical' : 'neutral'}
          />
        </div>
      </MailchimpLevel>

      <MailchimpLevel
        title="Рівень 3 — Топ-кампанії"
        action={
          href ? (
            <a
              href={href}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-d"
            >
              Відкрити
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null
        }
      >
        <div className="space-y-2">
          {performance.campaigns.map((campaign) => (
            <MailchimpCampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      </MailchimpLevel>
    </div>
  )
}

function MailchimpLevel({ title, action, children }) {
  return (
    <section className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function MailchimpRateMetricCard({ label, metric }) {
  return (
    <MailchimpExecutiveMetricCard
      label={label}
      value={formatRateValue(metric.value)}
    >
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MailchimpDeltaBadge value={metric.delta} />
      </div>
    </MailchimpExecutiveMetricCard>
  )
}

function MailchimpExecutiveMetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  children,
}) {
  const tones = {
    neutral: 'border-line bg-surface-2',
    good: 'border-line bg-good-soft',
    warning: 'border-line bg-warn-soft',
    critical: 'border-line bg-warn-soft',
  }

  return (
    <div className={`rounded-card border p-3.5 ${tones[tone] || tones.neutral}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="mono mt-2 text-2xl font-bold leading-none text-ink">
        {value}
      </p>
      {detail ? <p className="mt-2 text-xs leading-5 text-muted">{detail}</p> : null}
      {children}
    </div>
  )
}

function MailchimpDeltaBadge({ value }) {
  if (value === null || value === undefined) {
    return (
      <span className="ui-tag bg-surface-2 text-muted">
        MoM —
      </span>
    )
  }

  const isPositive = value > 0
  const isFlat = value === 0
  const Icon = isPositive || isFlat ? ArrowUp : ArrowDown
  const className = isFlat
    ? 'bg-surface-2 text-muted'
    : isPositive
      ? 'bg-good-soft text-good'
      : 'bg-warn-soft text-warn'

  return (
    <span
      className={`ui-tag gap-1 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {formatDeltaPp(value)}
    </span>
  )
}

function MailchimpCampaignRow({ campaign }) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-card border bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${
        campaign.isBest
          ? 'border-line border-l-4 border-l-accent bg-accent-soft/40'
          : 'border-line border-l-4 border-l-transparent'
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">
            {campaign.title || campaign.subject || 'Campaign'}
          </p>
          {campaign.isBest ? (
            <span className="ui-tag ring-1 ring-inset ring-line">
              Найкраща за місяць
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-muted">
          {[formatCampaignDate(campaign.sendTime), campaign.subject, campaign.listName]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <div className="flex shrink-0 gap-2 text-xs">
        <MailchimpCampaignRateBadge label="OR" value={campaign.openRate} />
        <MailchimpCampaignRateBadge
          label="CR"
          value={campaign.clickRate}
          weak={campaign.isWeakClickRate}
        />
      </div>
    </div>
  )
}

function MailchimpCampaignRateBadge({ label, value, weak = false }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-semibold ${
        weak ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent-d'
      }`}
    >
      {label} {formatRateValue(value)}
    </span>
  )
}

function AwarenessAudiencePill({ audience }) {
  return (
    <div className="rounded-input bg-surface/70 px-2 py-2 ring-1 ring-inset ring-line">
      <p className="font-medium text-muted">{audience?.label || '—'}</p>
      <p className="mono mt-0.5 text-sm font-semibold text-ink">
        {formatPercent(audience?.awareness)}
      </p>
      {audience?.total ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted">
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
      fill={String(value).startsWith('-') ? 'var(--warn)' : 'var(--good)'}
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
    <div className="rounded-card border border-line bg-surface px-3 py-2 text-sm shadow-soft">
      <p className="font-medium text-ink">{label}</p>
      <p className="mt-1 text-muted">
        {metricLabel || payload[0].name}: {formatChartNumber(payload[0].value)}
      </p>
      {point.deltaLabel ? (
        <p className={point.delta >= 0 ? 'text-good' : 'text-warn'}>
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

function formatSignedChartNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const number = Number(value)
  const prefix = number > 0 ? '+' : ''
  return `${prefix}${formatChartNumber(number)}`
}

function formatDeltaPp(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  const number = Number(value)
  const prefix = number > 0 ? '+' : ''
  return `${prefix}${new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 1,
  }).format(number)} п.п.`
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

function formatRateValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 1,
  }).format(Number(value || 0))}%`
}

function formatReachValue(value) {
  if (!value) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} тис.`
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value)
}

function formatCampaignDate(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
  })
}

function normalizeExternalDashboardUrl(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  return /^https?:\/\//i.test(text) ? text : `https://${text}`
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
    <section className="panel">
      <div className="flex flex-col gap-1 border-b border-line2 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Стан KPI по напрямах
          </h2>
          <p className="mt-1 text-sm text-ink3">
            Де все йде в темпі року, а де бракує даних або є відставання.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto p-5">
        <table className="min-w-full divide-y divide-line2 text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-ink3">
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
          <tbody className="divide-y divide-line2">
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
                className="cursor-pointer transition hover:bg-soft/40 focus:bg-soft/50 focus:outline-none"
              >
                <td className="px-3 py-4">
                  <DirectionBadge direction={item.direction} />
                </td>
                <td className="mono whitespace-nowrap px-3 py-4 font-semibold text-ink">
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
                <td className="whitespace-nowrap px-3 py-4 text-ink2">
                  {item.updated} з {item.measurable} KPI
                </td>
                <td className="min-w-48 px-3 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-line2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, item.average)}%` }}
                      />
                    </div>
                    <span className="mono font-semibold text-ink">{item.average}%</span>
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
    <div className="panel min-w-0 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
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

  const [goalsPayload, eventAwareness] = await Promise.all([
    optionalRequest('/api/kpi-goals', { goals: [] }, 10000),
    optionalRequest('/api/event-awareness', { audiences: [], overall: null }, 6000),
  ])
  const events = await optionalRequest(
    `/api/notion/events?month=${encodeURIComponent(selectedMonth)}`,
    { events: [], isFallback: true },
    DASHBOARD_NOTION_TIMEOUT_MS,
  )
  const focus = await optionalRequest(
    `/api/notion/monthly-focus?month=${encodeURIComponent(selectedMonth)}`,
    { entries: [], isFallback: true },
    DASHBOARD_NOTION_TIMEOUT_MS,
  )
  const payload = {
    month: selectedMonth,
    goals: goalsPayload.goals || [],
    events: events.events || [],
    focus: focus.entries || [],
    eventAwareness,
  }

  if (!events.isFallback && !focus.isFallback) {
    writeCachedPayload(dashboardPayloadCache, selectedMonth, payload)
  }
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
    {
      month: selectedMonth,
      mentions: [],
      sentiment: [],
      source: 'looqme-timeout',
      isFallback: true,
    },
    35000,
  )
  const coverage = {
    ...payload,
    month: payload.month || selectedMonth,
  }

  if (!isCoverageFallbackPayload(coverage)) {
    writeCachedPayload(coveragePayloadCache, selectedMonth, coverage)
  }

  return coverage
}

async function loadMailchimpPayload(selectedMonth) {
  const cached = readCachedPayload(
    mailchimpPayloadCache,
    selectedMonth,
    MAILCHIMP_CACHE_TTL_MS,
  )
  if (cached) return cached

  const payload = await optionalRequest(
    `/api/mailchimp/campaigns?month=${encodeURIComponent(selectedMonth)}`,
    {
      month: selectedMonth,
      campaigns: [],
      metrics: {},
      source: 'mailchimp-timeout',
      isFallback: true,
    },
    16000,
  )
  const mailchimp = {
    ...payload,
    month: payload.month || selectedMonth,
  }

  if (!isMailchimpFallbackPayload(mailchimp)) {
    writeCachedPayload(mailchimpPayloadCache, selectedMonth, mailchimp)
  }

  return mailchimp
}

function isCoverageFallbackPayload(payload) {
  if (!payload) return false
  if (payload.isFallback) return true
  return COVERAGE_FALLBACK_SOURCES.has(payload.source)
}

function isMailchimpFallbackPayload(payload) {
  if (!payload) return false
  if (payload.isFallback) return true
  return MAILCHIMP_FALLBACK_SOURCES.has(payload.source)
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
