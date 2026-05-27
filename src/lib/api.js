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

  if (goal.progressMode === 'none') return 0
  if (typeof goal.progress === 'number') {
    return Math.max(0, Math.min(100, Math.round(goal.progress)))
  }

  if (goal.metricType === 'Якісна') {
    const current = String(goal.currentValue || '').trim().toLowerCase()
    return ['так', 'yes', 'done', 'true', 'виконано'].includes(current) ? 100 : 0
  }

  const target = parseMetricNumber(goal.target)
  const current =
    goal.metricType === 'Відсоткова'
      ? parsePercentMetricNumber(goal.currentValue)
      : parseMetricNumber(goal.currentValue)

  if (!target || Number.isNaN(target)) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

export function parseMetricNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value || '').trim()
  if (!text) return 0

  const match = text.match(/-?\d[\d\s\u00a0.,]*(?:[.,]\d+)?/)
  if (!match) return 0

  const normalized = normalizeNumericText(match[0])
  const number = Number(normalized)
  return Number.isNaN(number) ? 0 : number
}

function normalizeNumericText(value) {
  let text = String(value || '').replace(/[\s\u00a0]/g, '')

  if (text.includes(',') && text.includes('.')) {
    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','

    return text
      .replaceAll(thousandsSeparator, '')
      .replace(decimalSeparator, '.')
  }

  const separator = text.includes(',') ? ',' : text.includes('.') ? '.' : null
  if (!separator) return text

  const parts = text.split(separator)
  const fractional = parts.at(-1) || ''
  const looksLikeThousands =
    parts.length > 2 || (parts.length === 2 && fractional.length === 3 && parts[0].length <= 3)

  return looksLikeThousands ? parts.join('') : text.replace(separator, '.')
}

export function formatMetricValue(goal) {
  if (!goal) return '0'
  if (goal.displayCurrentValue) return goal.displayCurrentValue

  const value = goal.currentValue
  const text = String(value ?? '').trim()

  if (!text || text === '-' || text === '—') return '—'

  if (goal.metricType === 'Відсоткова') {
    if (text.includes('%')) return text
    if (!/-?\d/.test(text)) return text
    return `${text}%`
  }

  return value || value === 0 ? value : '—'
}

export function displayTarget(goal) {
  if (!goal) return '—'
  if (goal.displayTarget) return goal.displayTarget

  if (goal.metricType === 'Якісна') {
    return goal.criterion || 'Так/ні'
  }

  if (goal.metricType === 'Відсоткова') {
    return `${goal.target || 0}%`
  }

  return goal.target || '—'
}

function parsePercentMetricNumber(value) {
  const text = String(value || '').trim()
  const percentMatches = [...text.matchAll(/(-?\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*%/g)]

  if (percentMatches.length) {
    const lastPercentValue = percentMatches[percentMatches.length - 1][1]
    return parseMetricNumber(lastPercentValue)
  }

  return parseMetricNumber(value)
}
