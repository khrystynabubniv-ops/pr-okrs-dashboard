// Express routes for the Promo Results page (mounted from server/index.js).

import { buildReport, isMonthKey, normalizeTypeFilter, previousMonthKey, todayIso } from './calc.js'
import { createPromoAnalysis } from './analysis.js'
import { createPromoStore } from './store.js'
import { createPromoSync } from './sync.js'

const SYNC_RETRY_COOLDOWN_MS = 10 * 60 * 1000
const LIVE_MONTH_GRACE_DAYS = 7 // Meta keeps adjusting numbers for a few days after month end
const AD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MAX_COMMENT_LENGTH = 2000

export function registerPromoRoutes(app, deps) {
  const { asyncHandler, createHttpError, requireAuth, generateJsonViaAi, isAiConfigured } = deps
  const store = createPromoStore({ createHttpError })
  const sync = createPromoSync({ ...deps, store })
  const analysis = createPromoAnalysis({ store, generateJsonViaAi, isAiConfigured, createHttpError })

  function ttlMs() {
    const hours = Number(process.env.PROMO_SNAPSHOT_TTL_HOURS)
    return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000
  }

  function readMonth(request) {
    const month = String(request.query.month || '').trim()
    if (!isMonthKey(month)) throw createHttpError(400, 'Передайте month у форматі YYYY-MM.')
    return month
  }

  // Only the current month (and the first days of the next one) is refreshed automatically.
  function isLiveMonth(monthKey) {
    const [year, month] = monthKey.split('-').map(Number)
    const graceEnd = Date.UTC(year, month, 1) + LIVE_MONTH_GRACE_DAYS * 24 * 60 * 60 * 1000
    return Date.parse(`${todayIso()}T00:00:00Z`) < graceEnd
  }

  function recentlyFailed(monthKey) {
    const failure = sync.getLastError(monthKey)
    return Boolean(failure && Date.now() - failure.at < SYNC_RETRY_COOLDOWN_MS)
  }

  function analyseInBackground(monthKey, snapshot) {
    analysis.runMissingAnalyses({ monthKey, snapshot }).catch((error) => {
      console.error('Promo background analysis failed:', error.message)
    })
  }

  async function syncAndAnalyse(monthKey) {
    const snapshot = await sync.syncMonth(monthKey)
    analyseInBackground(monthKey, snapshot)
    return snapshot
  }

  async function ensureSnapshot(monthKey) {
    let snapshot = await store.getSnapshot(monthKey)

    if (!snapshot) {
      return { snapshot: await syncAndAnalyse(monthKey), staleReason: '' }
    }

    const age = Date.now() - Date.parse(snapshot.fetchedAt)
    if (isLiveMonth(monthKey) && age > ttlMs() && !sync.isSyncing(monthKey) && !recentlyFailed(monthKey)) {
      syncAndAnalyse(monthKey).catch(() => {}) // failure is remembered by sync and surfaced as staleReason
    }

    const failure = sync.getLastError(monthKey)
    snapshot = await store.getSnapshot(monthKey)
    const staleReason = failure && failure.at > Date.parse(snapshot.fetchedAt) ? failure.message : ''

    return { snapshot, staleReason }
  }

  // Month-over-month deltas need last month's snapshot. Failure only means "no deltas".
  async function loadPreviousSnapshot(monthKey) {
    const previousKey = previousMonthKey(monthKey)

    try {
      const existing = await store.getSnapshot(previousKey)
      if (existing) return existing
      if (recentlyFailed(previousKey) || recentlyFailed(monthKey)) return null

      return await sync.syncMonth(previousKey)
    } catch {
      return null
    }
  }

  function adsManagerUrl(adId) {
    const account = String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '')
    return account
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(account)}&selected_ad_ids=${encodeURIComponent(adId)}`
      : ''
  }

  async function presentReport({ snapshot, previousSnapshot, type, staleReason }) {
    const report = buildReport({ snapshot, previousSnapshot, typeFilter: type })
    const adIds = report.campaigns.flatMap((campaign) => campaign.creatives.map((item) => item.adId))
    const counts = await store.commentCounts(adIds)

    return {
      ...report,
      staleReason: staleReason || '',
      videoMetrics: Boolean(snapshot.videoMetrics),
      campaigns: report.campaigns.map((campaign) => ({
        ...campaign,
        creatives: campaign.creatives.map((item) => ({
          adId: item.adId,
          name: item.name,
          kind: item.creative.kind || 'photo',
          thumbnailUrl: item.creative.thumbnailUrl || '',
          durationSec: item.creative.durationSec || 0,
          title: item.creative.title || '',
          body: item.creative.body || '',
          status: item.status,
          adsManagerUrl: adsManagerUrl(item.adId),
          spend: item.spend,
          sharePct: item.sharePct,
          impressions: item.impressions,
          clicks: item.clicks,
          ctr: item.ctr,
          cpc: item.cpc,
          follows: item.follows,
          cpf: item.cpf,
          hookRate: item.hookRate,
          holdRate: item.holdRate,
          label: item.label,
          commentsCount: counts[item.adId] || 0,
        })),
      })),
    }
  }

  app.get('/api/promo', asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const { snapshot, staleReason } = await ensureSnapshot(month)
    const previousSnapshot = await loadPreviousSnapshot(month)

    response.json(await presentReport({ snapshot, previousSnapshot, type, staleReason }))
  }))

  app.post('/api/promo/sync', requireAuth, asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    let snapshot
    let staleReason = ''

    try {
      snapshot = await syncAndAnalyse(month)
    } catch (error) {
      snapshot = await store.getSnapshot(month)
      if (!snapshot) throw error
      staleReason = error.message
    }

    const previousSnapshot = await loadPreviousSnapshot(month)
    response.json(await presentReport({ snapshot, previousSnapshot, type, staleReason }))
  }))

  app.get('/api/promo/analysis', asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const snapshot = await store.getSnapshot(month)

    response.json({
      analysis: await analysis.getAnalysis(month, type, snapshot),
      running: analysis.isRunning(month, type),
    })
  }))

  app.post('/api/promo/analysis/run', requireAuth, asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const snapshot = await store.getSnapshot(month)

    if (!snapshot) {
      throw createHttpError(404, 'Немає даних Meta за цей місяць. Спершу оновіть дані.')
    }

    await analysis.runAnalysis({ monthKey: month, type, snapshot, userId: request.user?.id })
    response.json({
      analysis: await analysis.getAnalysis(month, type, snapshot),
      running: false,
    })
  }))

  function readAdId(request) {
    const adId = String(request.params.adId || '')
    if (!AD_ID_PATTERN.test(adId)) throw createHttpError(400, 'Некоректний ad_id.')
    return adId
  }

  app.get('/api/promo/creatives/:adId/comments', asyncHandler(async (request, response) => {
    const comments = await store.listComments(readAdId(request))
    const userId = request.user?.id || null

    response.json({
      comments: comments.map((comment) => ({
        ...comment,
        mine: userId ? comment.authorId === userId : comment.authorId === null,
      })),
    })
  }))

  app.post('/api/promo/creatives/:adId/comments', requireAuth, asyncHandler(async (request, response) => {
    const adId = readAdId(request)
    const text = String(request.body?.text || '').trim()

    if (!text) throw createHttpError(400, 'Напишіть текст коментаря.')
    if (text.length > MAX_COMMENT_LENGTH) {
      throw createHttpError(400, `Коментар задовгий (максимум ${MAX_COMMENT_LENGTH} символів).`)
    }

    const comment = await store.addComment({
      adId,
      authorId: request.user?.id || null,
      authorName: request.user?.name || request.user?.email || 'Команда',
      text,
    })

    response.status(201).json({ comment: { ...comment, mine: true } })
  }))

  app.delete('/api/promo/creatives/:adId/comments/:id', requireAuth, asyncHandler(async (request, response) => {
    const result = await store.deleteComment({
      adId: readAdId(request),
      id: String(request.params.id || ''),
      userId: request.user?.id || null,
    })

    if (result === 'missing') throw createHttpError(404, 'Коментар не знайдено.')
    if (result === 'forbidden') throw createHttpError(403, 'Можна видаляти лише свої коментарі.')
    response.json({ ok: true })
  }))
}
