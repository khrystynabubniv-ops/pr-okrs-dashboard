import { useEffect } from 'react'
import {
  API_REFRESH_INTERVAL_MS,
  prefetchApiRequest,
} from '../lib/api'
import { monthToIsoMonth } from '../lib/smmData'

const WARMUP_CONCURRENCY = 3
const WARMUP_START_DELAY_MS = 600
const activeWarmups = new Map()

export function usePageDataWarmup(selectedMonth, enabled) {
  useEffect(() => {
    if (!enabled) return undefined

    const startWarmup = () => {
      void warmPageData(selectedMonth)
    }
    const timeout = window.setTimeout(startWarmup, WARMUP_START_DELAY_MS)
    const interval = window.setInterval(() => {
      void warmPageData(selectedMonth, { forceRefresh: true })
    }, API_REFRESH_INTERVAL_MS)

    return () => {
      window.clearTimeout(timeout)
      window.clearInterval(interval)
    }
  }, [enabled, selectedMonth])
}

export function warmPageData(selectedMonth, options = {}) {
  const key = `${selectedMonth}:${options.forceRefresh ? 'refresh' : 'warm'}`
  if (activeWarmups.has(key)) return activeWarmups.get(key)

  const promise = runWarmupQueue(
    buildWarmupRequests(selectedMonth),
    (request) => warmRequest(request, options),
    WARMUP_CONCURRENCY,
  ).finally(() => {
    activeWarmups.delete(key)
  })

  activeWarmups.set(key, promise)
  return promise
}

function buildWarmupRequests(selectedMonth) {
  const encodedMonth = encodeURIComponent(selectedMonth)
  const isoMonth = monthToIsoMonth(selectedMonth) || selectedMonth
  const encodedIsoMonth = encodeURIComponent(isoMonth)

  return [
    { path: '/api/kpi-goals', timeoutMs: 10000 },
    { path: '/api/notion/kpi-goals', timeoutMs: 10000 },
    { path: '/api/event-awareness', timeoutMs: 8000 },
    {
      path: `/api/notion/events?month=${encodedMonth}`,
      timeoutMs: 15000,
    },
    {
      path: `/api/notion/monthly-focus?month=${encodedMonth}`,
      timeoutMs: 15000,
    },
    {
      path: `/api/looqme/coverage?month=${encodedMonth}`,
      timeoutMs: 35000,
    },
    {
      path: `/api/mailchimp/campaigns?month=${encodedMonth}`,
      timeoutMs: 20000,
    },
    {
      path: `/api/smm/data?month=${encodedIsoMonth}`,
      timeoutMs: 40000,
    },
    {
      path: `/api/smm/insights?month=${encodedIsoMonth}`,
      timeoutMs: 8000,
    },
    { path: '/api/event-reports', timeoutMs: 10000 },
    { path: '/api/linkedin-report', timeoutMs: 10000 },
  ]
}

async function warmRequest(request, options) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), request.timeoutMs)

  try {
    await prefetchApiRequest(request.path, {
      signal: controller.signal,
      forceRefresh: Boolean(options.forceRefresh),
      cacheTtlMs: API_REFRESH_INTERVAL_MS,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

async function runWarmupQueue(items, worker, concurrency) {
  let nextIndex = 0

  async function runNext() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      await worker(items[index])
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => runNext(),
    ),
  )
}
