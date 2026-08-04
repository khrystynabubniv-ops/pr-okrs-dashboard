export const API_REFRESH_INTERVAL_MS = 5 * 60 * 1000

const apiResponseCache = new Map()
const apiInFlightRequests = new Map()

export async function apiRequest(path, options = {}) {
  const {
    cacheTtlMs = API_REFRESH_INTERVAL_MS,
    forceRefresh = false,
    skipQueryCache = false,
    ...fetchOptions
  } = options
  const method = String(fetchOptions.method || 'GET').toUpperCase()
  const cacheable = method === 'GET' && !skipQueryCache
  const cacheKey = cacheable ? apiCacheKey(path) : ''

  if (cacheable && !forceRefresh) {
    const cached = readApiCache(path, { ttlMs: cacheTtlMs })
    if (cached !== undefined) return cached

    if (!fetchOptions.signal && apiInFlightRequests.has(cacheKey)) {
      return apiInFlightRequests.get(cacheKey)
    }
  }

  const requestPromise = fetch(path, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers || {}),
    },
  })
    .then(async (response) => {
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

      if (cacheable) writeApiCache(path, payload)
      if (!cacheable) invalidateApiCacheForMutation(path)

      return payload
    })
    .finally(() => {
      if (cacheable && !fetchOptions.signal) apiInFlightRequests.delete(cacheKey)
    })

  if (cacheable && !fetchOptions.signal) {
    apiInFlightRequests.set(cacheKey, requestPromise)
  }

  return requestPromise
}

export function readApiCache(path, options = {}) {
  const ttlMs = options.ttlMs ?? API_REFRESH_INTERVAL_MS
  const cacheKey = apiCacheKey(path)
  const cached = apiResponseCache.get(cacheKey)
  if (!cached) return undefined

  if (Date.now() - cached.cachedAt > ttlMs) {
    apiResponseCache.delete(cacheKey)
    return undefined
  }

  return cached.payload
}

export function writeApiCache(path, payload) {
  apiResponseCache.set(apiCacheKey(path), {
    cachedAt: Date.now(),
    payload,
  })
}

export function prefetchApiRequest(path, options = {}) {
  return apiRequest(path, options).catch(() => null)
}

export function invalidateApiCache(match) {
  if (!match) {
    apiResponseCache.clear()
    apiInFlightRequests.clear()
    return
  }

  const shouldDelete =
    typeof match === 'function'
      ? match
      : (key) =>
          Array.isArray(match)
            ? match.some((item) => apiCacheMatches(key, item))
            : apiCacheMatches(key, match)

  ;[...apiResponseCache.keys()].forEach((key) => {
    if (shouldDelete(key)) apiResponseCache.delete(key)
  })
  ;[...apiInFlightRequests.keys()].forEach((key) => {
    if (shouldDelete(key)) apiInFlightRequests.delete(key)
  })
}

function invalidateApiCacheForMutation(path) {
  const key = apiCacheKey(path)

  if (key.startsWith('/api/notion/goals')) {
    invalidateApiCache(['/api/kpi-goals', '/api/notion/kpi-goals'])
    return
  }

  if (key.startsWith('/api/notion/monthly-focus')) {
    invalidateApiCache('/api/notion/monthly-focus')
    return
  }

  if (key.startsWith('/api/notion/events')) {
    invalidateApiCache('/api/notion/events')
    return
  }

  if (key.startsWith('/api/coverage/competitors')) {
    invalidateApiCache(['/api/looqme/coverage', '/api/coverage/competitors'])
    return
  }

  if (key.startsWith('/api/event-reports')) {
    invalidateApiCache('/api/event-reports')
    return
  }

  if (key.startsWith('/api/linkedin-report')) {
    invalidateApiCache('/api/linkedin-report')
    return
  }

  if (key.startsWith('/api/smm/insights/generate')) {
    invalidateApiCache('/api/smm/insights')
    return
  }

  if (key.startsWith('/api/smm/notes')) {
    invalidateApiCache('/api/smm/notes')
    return
  }

  if (key.startsWith('/api/smm/followers')) {
    invalidateApiCache(['/api/smm/followers', '/api/smm/data'])
  }
}

function apiCacheMatches(key, match) {
  if (match instanceof RegExp) return match.test(key)
  return key.startsWith(String(match))
}

function apiCacheKey(path) {
  return typeof path === 'string' ? path : String(path)
}

export function getProgress(goal) {
  if (!goal) return 0
  if (goal.progressMode === 'none') return 0
  if (typeof goal.progress === 'number') return goal.progress

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
