import { DIRECTIONS, MONTHS } from '../constants'
import { PERSONAL_BRANDS_FOLLOWERS } from '../data/personalBrandsFollowers'
import { getProgress, parseMetricNumber } from './api'

export function progressSummary(goals, selectedMonth) {
  const total = goals.length
  const progressValues = goals.map(getProgress)
  const average = averageProgress(progressValues)
  const expected = expectedProgress(selectedMonth)
  const updated = goals.filter((goal) => hasValueForMonth(goal, selectedMonth)).length
  const onTrack = goals.filter((goal) => getProgress(goal) >= expected).length
  const completed = goals.filter((goal) => getProgress(goal) >= 100).length

  return { total, average, expected, updated, onTrack, completed }
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
