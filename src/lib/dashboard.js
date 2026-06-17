import { DIRECTIONS, MONTHS } from '../constants'
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
  const mentions = (coverage.mentions || []).map((item) => ({
    ...item,
    reachValue: parseReachNumber(
      item.reach ?? item.audience ?? item.totalReach ?? item.totalAudience,
    ),
  }))
  const own = mentions.filter((item) => isOwnBrand(item.brand))
  const competitors = mentions.filter((item) => !isOwnBrand(item.brand))
  const ownTotal = own.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const competitorTotal = competitors.reduce(
    (sum, item) => sum + Number(item.count || 0),
    0,
  )
  const ownReach = sumMentionReach(own)
  const competitorReach = sumMentionReach(competitors)
  const outlets = getCoverageOutlets(coverage)
  const totalReach = getCoverageReach(coverage, mentions)
  const reachDetail = getCoverageReachDetail(coverage)
  const mentionsMetric = getCoverageMetric(coverage.mentionsMetric, {
    value: ownTotal + competitorTotal,
    segments: [
      {
        label: 'ЗМІ(Медіа)',
        value: Number(coverage.mentionsByChannel?.media ?? 0),
        delta: coverage.mentionsByChannel?.mediaDelta,
        color: '#6678ff',
      },
      {
        label: 'Соціальні мережі',
        value: Number(coverage.mentionsByChannel?.social ?? 0),
        delta: coverage.mentionsByChannel?.socialDelta,
        color: '#2dd68f',
      },
    ],
  })
  const audienceMetric = getCoverageMetric(coverage.audienceMetric, {
    value: totalReach,
    delta: coverage.audienceDelta,
    segments: [
      {
        label: 'ЗМІ(Медіа)',
        value: parseReachNumber(coverage.audience?.media),
        delta: coverage.audience?.mediaDelta,
        color: '#6678ff',
      },
      {
        label: 'Соціальні мережі',
        value: parseReachNumber(coverage.audience?.social),
        delta: coverage.audience?.socialDelta,
        color: '#2dd68f',
      },
    ],
  })

  return {
    own,
    competitors,
    ownTotal,
    competitorTotal,
    ownReach,
    competitorReach,
    outlets,
    outletsTotalReach: outlets.reduce((sum, item) => sum + item.reach, 0),
    mentionsMetric,
    audienceMetric,
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

export function candidateAwarenessKpi(goals, selectedMonth) {
  const goal = findCandidateAwarenessGoal(goals)
  if (!goal) return null

  const target = parseMetricNumber(goal.target)
  const point = latestRawPointUpToMonth(goal.values || {}, selectedMonth)
  const shouldUseCalculatedAverage = goal.calculationType === 'averagePercent'
  const rawValue =
    (shouldUseCalculatedAverage ? goal.currentValue || goal.displayCurrentValue : point?.value) ||
    goal.currentValue ||
    goal.displayCurrentValue ||
    goal.progressLabel ||
    ''
  const awareness = parseAwarenessPercent(rawValue, target)
  const knownCount = parseKnownCount(rawValue, target)
  const progress =
    typeof goal.progress === 'number'
      ? goal.progress
      : target && awareness !== null
        ? clampDashboardPercent(Math.round((awareness / target) * 100))
        : null

  return {
    goal,
    title: goal.title,
    owner: goal.owner,
    framework: goal.framework,
    target,
    awareness,
    knownCount,
    progress,
    sourceMonth: point?.month || selectedMonth,
  }
}

export function hasSeriesData(series) {
  return series.some((item) => item.value !== null && item.value !== undefined)
}

export function personalBrandBars(goals, selectedMonth) {
  return goals
    .filter(isPersonalBrandFollowerGoal)
    .map((goal) => {
      const currentPoint = latestPointUpToMonth(goal.values || {}, selectedMonth)
      const previousPoint = currentPoint
        ? latestPointBeforeMonth(goal.values || {}, currentPoint.month)
        : null
      const current = currentPoint?.value ?? null
      const previous = previousPoint?.value ?? null
      const target = parseMetricNumber(goal.target)
      const progress =
        target && current !== null ? Math.min(100, Math.round((current / target) * 100)) : 0
      const delta = current !== null && previous !== null ? current - previous : null

      return {
        id: goal.id,
        name: personalBrandDisplayName(goal.title),
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

function latestPointUpToMonth(values, selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const monthLimit = selectedIndex >= 0 ? selectedIndex + 1 : MONTHS.length
  const monthsToCheck = MONTHS.slice(0, monthLimit).reverse()

  const month = monthsToCheck.find((item) => isFilledGoalValue(values[item]))

  return month ? { month, value: parseMetricNumber(values[month]) } : null
}

function latestPointBeforeMonth(values, month) {
  const monthIndex = MONTHS.indexOf(month)
  const monthsToCheck = MONTHS.slice(0, Math.max(0, monthIndex)).reverse()
  const previousMonth = monthsToCheck.find((item) => isFilledGoalValue(values[item]))

  return previousMonth
    ? { month: previousMonth, value: parseMetricNumber(values[previousMonth]) }
    : null
}

function isPersonalBrandFollowerGoal(goal) {
  if (goal.direction !== 'Personal Brands') return false

  const haystack = normalizeDashboardSearchText(
    `${goal.title || ''} ${goal.dataSource || ''}`,
  )

  return (
    haystack.includes('фоловер') ||
    haystack.includes('followers') ||
    haystack.includes('підписник') ||
    haystack.includes('підписників')
  )
}

function personalBrandDisplayName(title) {
  const text = String(title || '').trim()
  const match = text.match(
    /(?:на\s+сторінці|сторінці)\s+(.+?)(?:\s+до\s+[\d\s\u00a0,.]+)?$/i,
  )

  return match?.[1]?.trim() || text || 'Без назви'
}

function latestRawPointUpToMonth(values, selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const monthLimit = selectedIndex >= 0 ? selectedIndex + 1 : MONTHS.length
  const month = MONTHS.slice(0, monthLimit)
    .reverse()
    .find((item) => isFilledGoalValue(values[item]))

  return month ? { month, value: values[month] } : null
}

function findCandidateAwarenessGoal(goals) {
  const scoredGoals = goals
    .map((goal) => ({
      goal,
      score: candidateAwarenessScore(goal),
    }))
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score)

  return scoredGoals[0]?.goal || null
}

function candidateAwarenessScore(goal) {
  const haystack = normalizeDashboardSearchText(
    `${goal.title || ''} ${goal.dataSource || ''} ${goal.direction || ''} ${
      goal.framework || ''
    }`,
  )
  let score = 0

  if (haystack.includes('знають про компан')) score += 6
  if (haystack.includes('знають про universe')) score += 6
  if (haystack.includes('кандидат')) score += 3
  if (haystack.includes('awareness') || haystack.includes('евернес')) score += 3
  if (haystack.includes('everness') || haystack.includes('впізнаван')) score += 3
  if (goal.direction === 'PR') score += 1

  return score
}

function normalizeDashboardSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseAwarenessPercent(value, target) {
  const percentMatches = [
    ...String(value || '').matchAll(/(-?\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*%/g),
  ]

  if (percentMatches.length) {
    return parseMetricNumber(percentMatches.at(-1)[1])
  }

  const numbers = extractDashboardNumbers(value)
  if (!numbers.length) return null

  if (target > 0 && target <= 100 && numbers.length > 1) return numbers.at(-1)
  if (numbers.length === 1 && numbers[0] <= 100) return numbers[0]

  return null
}

function parseKnownCount(value, target) {
  const numbers = extractDashboardNumbers(value)
  if (!numbers.length) return null
  if (numbers.length > 1) return numbers[0]
  if (target > 0 && target <= 100 && numbers[0] > 100) return numbers[0]
  return null
}

function extractDashboardNumbers(value) {
  return [
    ...String(value || '').matchAll(
      /-?\d+(?:[\s\u00a0]?\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g,
    ),
  ]
    .map((match) => parseMetricNumber(match[0]))
    .filter((number) => Number.isFinite(number))
}

function clampDashboardPercent(value) {
  return Math.max(0, Math.min(100, value))
}

function isFilledGoalValue(value) {
  const text = String(value ?? '').trim()
  return Boolean(text && text !== '-' && text !== '—' && !text.startsWith('#'))
}

function isMeasurableGoal(goal) {
  if (goal.progressMode === 'none') return false
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
  if (goal.progressMode === 'none') return 0
  if (typeof goal.progress === 'number') return goal.progress

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

function sumMentionReach(mentions) {
  return mentions.reduce(
    (sum, item) =>
      sum +
      (item.reachValue ??
        parseReachNumber(
          item.reach ?? item.audience ?? item.totalReach ?? item.totalAudience,
        )),
    0,
  )
}

function getCoverageOutlets(coverage) {
  const rawOutlets =
    coverage.mediaOutlets ||
    coverage.outlets ||
    coverage.sources ||
    coverage.publications ||
    []

  return rawOutlets
    .map((item, index) => {
      const name =
        item.name ||
        item.media ||
        item.outlet ||
        item.source ||
        item.title ||
        `Медіа ${index + 1}`
      const reach = parseReachNumber(
        item.reach ??
          item.audience ??
          item.potentialAudience ??
          item.totalReach ??
          item.totalAudience ??
          item.views,
      )
      const mentions = Number(item.mentions ?? item.count ?? item.articles ?? 0)

      return { name, reach, mentions }
    })
    .filter((item) => item.name || item.reach || item.mentions)
}

function getCoverageMetric(metric, fallback) {
  const source = metric || fallback || {}
  const value = parseReachNumber(source.value ?? source.total ?? fallback?.value)
  const segments = normalizeCoverageMetricSegments(
    (source.segments || fallback?.segments || [])
      .map((segment) => ({
        label: segment.label || segment.name || segment.channel || 'Канал',
        value: parseReachNumber(segment.value ?? segment.count ?? segment.reach),
        delta:
          segment.delta ??
          segment.change ??
          segment.changePercent ??
          segment.percentChange,
        color: segment.color,
      }))
      .filter((segment) => segment.label || segment.value),
    value,
  )

  return {
    value,
    delta:
      source.delta ??
      source.change ??
      source.changePercent ??
      source.percentChange ??
      fallback?.delta,
    segments,
  }
}

function normalizeCoverageMetricSegments(segments, totalValue) {
  const segmentTotal = segments.reduce(
    (sum, segment) => sum + Number(segment.value || 0),
    0,
  )

  if (!looksLikePercentSplit(segmentTotal, totalValue)) return segments

  const values = allocateTotalByWeights(
    Math.round(totalValue),
    segments.map((segment) => Number(segment.value || 0)),
  )

  return segments.map((segment, index) => ({
    ...segment,
    value: values[index],
  }))
}

function looksLikePercentSplit(segmentTotal, totalValue) {
  return (
    totalValue > 0 &&
    Math.abs(segmentTotal - 100) <= 0.5 &&
    Math.abs(segmentTotal - totalValue) > 0.5
  )
}

function allocateTotalByWeights(total, weights) {
  const weightTotal = weights.reduce((sum, value) => sum + Number(value || 0), 0)
  if (!total || !weightTotal) return weights.map(() => 0)

  const exactValues = weights.map((weight) => (Number(weight || 0) / weightTotal) * total)
  const floors = exactValues.map(Math.floor)
  const remainder = total - floors.reduce((sum, value) => sum + value, 0)
  const byRemainder = exactValues
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((left, right) => right.remainder - left.remainder)

  return floors.map((value, index) => {
    const receivesExtra = byRemainder
      .slice(0, remainder)
      .some((item) => item.index === index)
    return receivesExtra ? value + 1 : value
  })
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
