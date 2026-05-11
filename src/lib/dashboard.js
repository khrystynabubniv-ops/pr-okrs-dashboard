import { DIRECTIONS, MONTHS } from '../constants'
import { getProgress } from './api'

const sampleSeries = {
  instagram: [12800, 13240, 13920, 14480, 15140, 0, 0, 0, 0, 0, 0, 0],
  media: [18, 24, 31, 29, 36, 0, 0, 0, 0, 0, 0, 0],
  traffic: [9200, 9800, 10340, 11200, 12150, 0, 0, 0, 0, 0, 0, 0],
}

export function countGoals(goals) {
  const total = goals.length
  const done = goals.filter((goal) => getProgress(goal) >= 100).length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}

export function directionSummary(goals) {
  return DIRECTIONS.map((direction) => {
    const directionGoals = goals.filter((goal) => goal.direction === direction)
    const summary = countGoals(directionGoals)
    return { direction, ...summary }
  })
}

export function buildMonthlySeries(goals, keyword, fallbackKey) {
  const normalizedKeyword = keyword.toLowerCase()
  const goal = goals.find((item) =>
    `${item.title} ${item.dataSource || ''}`.toLowerCase().includes(normalizedKeyword),
  )
  const fallback = sampleSeries[fallbackKey] || []

  return MONTHS.map((month, index) => ({
    month: month.split(' ')[0],
    value: Number(goal?.values?.[month] ?? fallback[index] ?? 0),
  })).filter((item, index) => index <= 4 || item.value > 0)
}

export function personalBrandBars(goals) {
  const items = goals
    .filter((goal) => goal.direction === 'Personal Brands')
    .slice(0, 5)
    .map((goal) => ({
      name: goal.title.length > 28 ? `${goal.title.slice(0, 28)}...` : goal.title,
      current: Number(goal.currentValue || 0),
      target: Number(goal.target || 0),
    }))

  if (items.length) return items

  return [
    { name: 'CEO LinkedIn', current: 8200, target: 12000 },
    { name: 'Tech Leads', current: 5400, target: 8000 },
    { name: 'Recruiting voices', current: 3100, target: 5000 },
  ]
}
