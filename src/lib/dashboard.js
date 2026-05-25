import { DIRECTIONS, MONTHS } from '../constants'
import { PERSONAL_BRANDS_FOLLOWERS } from '../data/personalBrandsFollowers'
import { parseMetricNumber } from './api'

export function progressSummary(goals, selectedMonth) {
  const expected = expectedProgress(selectedMonth)
  const measurableGoals = goals.filter(isMeasurableGoal)
  const measuredGoals = measurableGoals.filter((goal) =>
    hasAnyValueUntilMonth(goal, selectedMonth),
  )
  const progressValues = measuredGoals.map((goal) =>
    getGoalProgressForMonth(goal, selectedMonth),
  )
  const average = averageProgress(progressValues)
  const updated = measurableGoals.filter((goal) =>
    hasValueForMonth(goal, selectedMonth),
  ).length
  const onTrack = measuredGoals.filter(
    (goal) => getGoalProgressForMonth(goal, selectedMonth) >= expected - 5,
  ).length
  const atRisk = measuredGoals.length - onTrack
  const missingSelected = measurableGoals.length - updated
  const completed = measuredGoals.filter(
    (goal) => getGoalProgressForMonth(goal, selectedMonth) >= 100,
  ).length

  return {
    total: goals.length,
    measurable: measurableGoals.length,
    measured: measuredGoals.length,
    average,
    expected,
    updated,
    onTrack,
    atRisk,
    missingSelected,
    completed,
  }
}

export function directionProgressSummary(goals, selectedMonth) {
  return DIRECTIONS.map((direction) => {
    const directionGoals = goals.filter((goal) => goal.direction === direction)
    return {
      direction,
      ...progressSummary(directionGoals, selectedMonth),
    }
  })
}

export function executiveSummary({ goals, focus, events, coverage, selectedMonth }) {
  const kpi = progressSummary(goals, selectedMonth)
  const focusTotal = focus.length
  const focusDone = focus.filter((entry) => entry.achieved).length
  const focusOpen = Math.max(0, focusTotal - focusDone)
  const totalLeads = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )
  const ownerEvents = events.filter((event) => event.role === 'Owner').length
  const eventsWithMetrics = events.filter((event) => event.metricsMatched).length
  const eventMetricReadiness = events.length
    ? Math.round((eventsWithMetrics / events.length) * 100)
    : 0
  const mentionsTotal = (coverage.mentions || []).reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  )
  const ownMentionsTotal = (coverage.mentions || [])
    .filter((item) => isOwnBrand(item.brand))
    .reduce((sum, item) => sum + Number(item.count || 0), 0)
  const competitorMentionsTotal = Math.max(0, mentionsTotal - ownMentionsTotal)
  const positiveSentiment = (coverage.sentiment || []).find(
    (item) => String(item.name || '').toLowerCase() === 'позитив',
  )
  const sentimentTotal = (coverage.sentiment || []).reduce(
    (sum, item) => sum + Number(item.value || 0),
    0,
  )
  const positiveShare =
    sentimentTotal && positiveSentiment
      ? Math.round((Number(positiveSentiment.value || 0) / sentimentTotal) * 100)
      : 0

  const kpiReadiness = kpi.measurable
    ? Math.round((kpi.updated / kpi.measurable) * 100)
    : 0
  const focusReadiness = focusTotal ? 100 : 0
  const coverageReadiness = mentionsTotal ? 100 : 0
  const readiness = Math.round(
    kpiReadiness * 0.4 +
      focusReadiness * 0.25 +
      eventMetricReadiness * 0.2 +
      coverageReadiness * 0.15,
  )

  return {
    readiness,
    kpi,
    focusTotal,
    focusDone,
    focusOpen,
    totalLeads,
    ownerEvents,
    eventsTotal: events.length,
    eventsWithMetrics,
    mentionsTotal,
    ownMentionsTotal,
    competitorMentionsTotal,
    positiveShare,
    coverageSource: coverage.source || 'mock',
  }
}

export function mediaCoverageSummary(coverage) {
  const mentions = coverage.mentions || []
  const own = mentions.filter((item) => isOwnBrand(item.brand))
  const competitors = mentions.filter((item) => !isOwnBrand(item.brand))
  const ownTotal = own.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const competitorTotal = competitors.reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  )
  const totalReach = getCoverageReach(coverage, mentions)
  const reachDetail = getCoverageReachDetail(coverage)

  return {
    own,
    competitors,
    ownTotal,
    competitorTotal,
    totalReach,
    reachDetail,
  }
}

export function buildMonthlySeries(goals, keywords, selectedMonth) {
  const normalizedKeywords = (Array.isArray(keywords) ? keywords : [keywords]).map(
    (keyword) => keyword.toLowerCase(),
  )
  const goal = goals.find((item) => {
    const haystack = `${item.title} ${item.dataSource || ''}`.toLowerCase()
    return normalizedKeywords.some((keyword) => haystack.includes(keyword))
  })
  const lastIndex = Math.max(0, MONTHS.indexOf(selectedMonth))
  let previousValue = null

  return MONTHS.slice(0, lastIndex + 1).map((month) => {
    const rawValue = goal?.values?.[month]
    const hasValue = String(rawValue ?? '').trim() !== ''
    const value = hasValue ? parseMetricNumber(rawValue) : null
    const delta = hasValue && previousValue !== null ? value - previousValue : null

    if (hasValue) previousValue = value

    return {
      month: month.split(' ')[0],
      value,
      delta,
      deltaLabel:
        delta === null ? '' : `${delta > 0 ? '+' : ''}${formatDeltaNumber(delta)}`,
    }
  })
}

export function hasSeriesData(series) {
  return series.some((item) => item.value !== null && item.value !== undefined)
}

export function personalBrandBars(goals, selectedMonth) {
  if (PERSONAL_BRANDS_FOLLOWERS.length) {
    return PERSONAL_BRANDS_FOLLOWERS.map((person) => {
      const currentPoint = latestPointUpToMonth(person.values, selectedMonth)
      const previousPoint = currentPoint
        ? latestPointBeforeMonth(person.values, currentPoint.month)
        : null
      const current = currentPoint?.value ?? null
      const previous = previousPoint?.value ?? null
      const target = person.target ? parseMetricNumber(person.target) : null
      const progress =
        target && current !== null
          ? Math.min(100, Math.round((current / target) * 100))
          : 0
      const delta = current !== null && previous !== null ? current - previous : null

      return {
        id: person.id,
        name: person.name,
        current,
        target,
        progress,
        delta,
        sourceMonth: currentPoint?.month || selectedMonth,
        deltaLabel:
          delta === null ? '' : `${delta > 0 ? '+' : ''}${formatDeltaNumber(delta)}`,
      }
    })
  }

  const selectedIndex = Math.max(0, MONTHS.indexOf(selectedMonth))
  const previousMonth = selectedIndex > 0 ? MONTHS[selectedIndex - 1] : null

  return goals
    .filter((goal) => goal.direction === 'Personal Brands')
    .slice(0, 8)
    .map((goal) => {
      const currentRaw = goal.values?.[selectedMonth]
      const hasCurrent = String(currentRaw ?? '').trim() !== ''
      const current = hasCurrent ? parseMetricNumber(currentRaw) : null
      const previous = previousMonth ? parseMetricNumber(goal.values?.[previousMonth]) : null
      const target = parseMetricNumber(goal.target)
      const progress =
        target && current !== null ? Math.min(100, Math.round((current / target) * 100)) : 0
      const delta = current !== null && previous !== null ? current - previous : null

      return {
        id: goal.id,
        name: goal.title,
        current,
        target,
        progress,
        delta,
        deltaLabel:
          delta === null ? '' : `${delta > 0 ? '+' : ''}${formatDeltaNumber(delta)}`,
      }
    })
}

function latestPointUpToMonth(values, selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const monthsToCheck = MONTHS.slice(0, selectedIndex + 1).reverse()

  const month = monthsToCheck.find(
    (item) => values[item] !== null && values[item] !== undefined,
  )

  return month ? { month, value: parseMetricNumber(values[month]) } : null
}

function latestPointBeforeMonth(values, month) {
  const monthIndex = MONTHS.indexOf(month)
  const monthsToCheck = MONTHS.slice(0, Math.max(0, monthIndex)).reverse()
  const previousMonth = monthsToCheck.find(
    (item) => values[item] !== null && values[item] !== undefined,
  )

  return previousMonth
    ? { month: previousMonth, value: parseMetricNumber(values[previousMonth]) }
    : null
}

function isMeasurableGoal(goal) {
  if (goal.metricType === 'Якісна') return true
  return parseMetricNumber(goal.target) > 0
}

function hasAnyValueUntilMonth(goal, selectedMonth) {
  if (String(goal.currentValue ?? '').trim()) return true

  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const monthsToCheck = MONTHS.slice(0, selectedIndex + 1)
  return monthsToCheck.some((month) => String(goal.values?.[month] ?? '').trim())
}

function getGoalProgressForMonth(goal, selectedMonth) {
  if (goal.metricType === 'Якісна') {
    const value = latestGoalValueUntilMonth(goal, selectedMonth)
    return ['так', 'yes', 'done', 'true', 'виконано'].includes(
      String(value || '').trim().toLowerCase(),
    )
      ? 100
      : 0
  }

  const target = parseMetricNumber(goal.target)
  const current =
    goal.metricType === 'Накопичувальна'
      ? sumGoalValuesUntilMonth(goal, selectedMonth)
      : parseMetricNumber(latestGoalValueUntilMonth(goal, selectedMonth))

  if (!target) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function latestGoalValueUntilMonth(goal, selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const monthsToCheck = MONTHS.slice(0, selectedIndex + 1).reverse()
  const month = monthsToCheck.find((item) => String(goal.values?.[item] ?? '').trim())

  return month ? goal.values[month] : goal.currentValue
}

function sumGoalValuesUntilMonth(goal, selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  return MONTHS.slice(0, selectedIndex + 1).reduce(
    (sum, month) => sum + parseMetricNumber(goal.values?.[month]),
    0,
  )
}

function averageProgress(values) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function expectedProgress(selectedMonth) {
  const index = MONTHS.indexOf(selectedMonth)
  if (index < 0) return 0
  return Math.round(((index + 1) / MONTHS.length) * 100)
}

function hasValueForMonth(goal, selectedMonth) {
  return String(goal?.values?.[selectedMonth] ?? '').trim() !== ''
}

function formatDeltaNumber(value) {
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 0,
  }).format(value)
}

function isOwnBrand(brand) {
  return String(brand || '').toLowerCase().includes('universe')
}

function getCoverageReach(coverage, mentions) {
  const directReach =
    coverage.totalReach ??
    coverage.totalAudience ??
    coverage.reach ??
    coverage.audience?.total ??
    coverage.audience?.all

  if (directReach !== null && directReach !== undefined) {
    return parseReachNumber(directReach)
  }

  return mentions.reduce(
    (sum, item) =>
      sum +
      parseReachNumber(
        item.reach ?? item.audience ?? item.totalReach ?? item.totalAudience,
      ),
    0,
  )
}

function getCoverageReachDetail(coverage) {
  const audience = coverage.audience
  if (!audience || typeof audience !== 'object') return ''

  const parts = [
    ['ЗМІ', audience.media],
    ['Соцмережі', audience.social],
  ].filter(([, value]) => value !== null && value !== undefined)

  return parts
    .map(([label, value]) => `${label}: ${formatReachShort(parseReachNumber(value))}`)
    .join(' · ')
}

function parseReachNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value || '').trim().toLowerCase()
  const number = parseMetricNumber(text)
  if (!number) return 0

  if (/млн|million|\bm\b/.test(text)) return number * 1_000_000
  if (/тис|тыс|thousand|\bk\b/.test(text)) return number * 1_000

  return number
}

function formatReachShort(value) {
  if (!value) return '0'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)} тис.`
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value)
}
