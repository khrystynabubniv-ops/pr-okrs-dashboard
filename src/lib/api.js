export async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      payload.message ||
      payload.error ||
      'Не вдалося отримати дані. Перевірте інтеграцію і спробуйте ще раз.'
    const error = new Error(message)
    error.status = response.status
    error.details = payload.details
    throw error
  }

  return payload
}

export function getProgress(goal) {
  if (!goal) return 0

  if (goal.metricType === 'Якісна') {
    const current = String(goal.currentValue || '').trim().toLowerCase()
    return ['так', 'yes', 'done', 'true', 'виконано'].includes(current) ? 100 : 0
  }

  const target = parseMetricNumber(goal.target)
  const current = parseMetricNumber(goal.currentValue)

  if (!target || Number.isNaN(target)) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

export function parseMetricNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value || '').trim()
  if (!text) return 0

  const match = text.match(/-?\d[\d\s\u00a0]*(?:[.,]\d+)?/)
  if (!match) return 0

  const normalized = match[0].replace(/[\s\u00a0]/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isNaN(number) ? 0 : number
}

export function formatMetricValue(goal) {
  if (!goal) return '0'

  if (goal.metricType === 'Відсоткова') {
    return `${goal.currentValue || 0}%`
  }

  return goal.currentValue || goal.currentValue === 0 ? goal.currentValue : '—'
}

export function displayTarget(goal) {
  if (!goal) return '—'

  if (goal.metricType === 'Якісна') {
    return goal.criterion || 'Так/ні'
  }

  if (goal.metricType === 'Відсоткова') {
    return `${goal.target || 0}%`
  }

  return goal.target || '—'
}
