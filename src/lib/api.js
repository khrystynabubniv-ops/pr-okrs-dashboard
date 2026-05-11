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

  const target = Number(goal.target || 0)
  const current = Number(goal.currentValue || 0)

  if (!target || Number.isNaN(target)) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
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
