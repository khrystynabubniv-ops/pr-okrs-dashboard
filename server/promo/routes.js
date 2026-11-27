// Express routes for the Promo Results page (mounted from server/index.js).

import {
  PLATFORMS,
  buildCampaigns,
  buildReport,
  isMonthKey,
  normalizeTypeFilter,
  previousMonthKey,
  todayIso,
  vacancyKey,
} from './calc.js'
import { createPromoAnalysis } from './analysis.js'
import { isBlock, sanitizeBlock } from './blocks.js'
import { getLinkedInConfig } from './linkedin.js'
import { createPromoStore } from './store.js'
import { createPromoSync } from './sync.js'

const SYNC_RETRY_COOLDOWN_MS = 10 * 60 * 1000
const LIVE_MONTH_GRACE_DAYS = 7 // Meta keeps adjusting numbers for a few days after month end
const AD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const MAX_COMMENT_LENGTH = 2000
const MAX_APPLIES = 100000
// Comments on a whole vacancy live in the same table as creative comments, under their own platform.
const VACANCY_COMMENTS = 'vacancy'
const MAX_VACANCY_KEY_LENGTH = 200

function vacancyCommentId(month, key) {
  return `${month}:${key}`
}

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

  function readPlatform(request) {
    const platform = String(request.query.platform || 'meta').trim().toLowerCase()
    if (!PLATFORMS.includes(platform)) throw createHttpError(400, 'platform має бути meta або linkedin.')
    return platform
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
    // A snapshot saved before LinkedIn was connected has no `linkedin` part: fill it in once.
    const missingLinkedIn = Boolean(getLinkedInConfig()) && snapshot.linkedin === undefined
    const due = age > ttlMs() || missingLinkedIn

    if (isLiveMonth(monthKey) && due && !sync.isSyncing(monthKey) && !recentlyFailed(monthKey)) {
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

  function adUrl(platform, creative) {
    if (platform === 'linkedin') {
      const account = getLinkedInConfig()?.accountId
      return account && creative.campaignId
        ? `https://www.linkedin.com/campaignmanager/accounts/${encodeURIComponent(account)}/campaigns/${encodeURIComponent(creative.campaignId)}`
        : ''
    }

    const account = String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '')
    return account
      ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(account)}&selected_ad_ids=${encodeURIComponent(creative.adId)}`
      : ''
  }

  function presentCreative(item, counts) {
    return {
      adId: item.adId,
      platform: item.platform,
      campaignId: item.campaignId,
      name: item.name,
      kind: item.creative.kind || 'photo',
      objectType: item.creative.objectType || '',
      thumbnailUrl: item.creative.thumbnailUrl || '',
      durationSec: item.creative.durationSec || 0,
      title: item.creative.title || '',
      body: item.creative.body || '',
      status: item.status,
      adsManagerUrl: adUrl(item.platform, item),
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
      commentsCount: counts[`${item.platform}:${item.adId}`] || 0,
    }
  }

  async function presentReport({ snapshot, previousSnapshot, type, staleReason }) {
    const applies = await store.listApplies(snapshot.month)
    const report = buildReport({
      snapshot,
      previousSnapshot,
      typeFilter: type,
      applies,
      linkedinConfigured: Boolean(getLinkedInConfig()),
    })
    const creatives = report.campaigns.flatMap((campaign) => campaign.creatives)
    const counts = await store.commentCounts([
      ...creatives.map((item) => ({ platform: item.platform, adId: item.adId })),
      ...report.vacancies.map((vacancy) => ({
        platform: VACANCY_COMMENTS,
        adId: vacancyCommentId(snapshot.month, vacancy.key),
      })),
    ])

    // `campaigns` stays internal: the response carries vacancies and the other campaigns.
    const { campaigns: _internal, ...rest } = report
    void _internal

    return {
      ...rest,
      staleReason: staleReason || '',
      videoMetrics: Boolean(snapshot.videoMetrics),
      vacancies: report.vacancies.map((vacancy) => ({
        ...vacancy,
        commentsCount: counts[`${VACANCY_COMMENTS}:${vacancyCommentId(snapshot.month, vacancy.key)}`] || 0,
        platforms: vacancy.platforms.map((block) => ({
          ...block,
          creatives: block.creatives.map((item) => presentCreative(item, counts)),
        })),
      })),
      otherCampaigns: report.otherCampaigns.map((campaign) => ({
        ...campaign,
        creatives: campaign.creatives.map((item) => presentCreative(item, counts)),
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

  app.put('/api/promo/vacancies/:vacancyKey/applies', requireAuth, asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const key = vacancyKey(request.params.vacancyKey)
    const raw = request.body?.applies
    let applies = null

    if (raw !== null && raw !== undefined && raw !== '') {
      applies = Number(raw)
      if (!Number.isInteger(applies) || applies < 0 || applies > MAX_APPLIES) {
        throw createHttpError(400, 'Еплаї мають бути цілим числом від 0.')
      }
    }

    const snapshot = await store.getSnapshot(month)
    const vacancy = snapshot
      ? buildCampaigns(snapshot, 'vac').find((campaign) => vacancyKey(campaign.title) === key)
      : null
    if (!vacancy) throw createHttpError(404, 'Вакансію не знайдено серед кампаній цього місяця.')

    const saved = await store.setApplies({
      monthKey: month,
      vacancyKey: key,
      title: vacancy.title,
      applies,
      userId: request.user?.id,
    })

    response.json({ key, applies: saved })
  }))

  // The saved AI analysis plus the team's edits of its blocks (the edits win over the AI text).
  async function presentAnalysis(month, type, snapshot, running) {
    return {
      month,
      type,
      analysis: await analysis.getAnalysis(month, type, snapshot),
      edits: await store.listBlockEdits(month, type),
      running,
    }
  }

  app.get('/api/promo/analysis', asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const snapshot = await store.getSnapshot(month)

    response.json(await presentAnalysis(month, type, snapshot, analysis.isRunning(month, type)))
  }))

  app.post('/api/promo/analysis/run', requireAuth, asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const snapshot = await store.getSnapshot(month)

    if (!snapshot) {
      throw createHttpError(404, 'Немає даних Meta за цей місяць. Спершу оновіть дані.')
    }

    await analysis.runAnalysis({ monthKey: month, type, snapshot, userId: request.user?.id })
    response.json(await presentAnalysis(month, type, snapshot, false))
  }))

  function readBlock(request) {
    const block = String(request.params.block || '')
    if (!isBlock(block)) throw createHttpError(404, 'Невідомий блок.')
    return block
  }

  app.put('/api/promo/blocks/:block', requireAuth, asyncHandler(async (request, response) => {
    const month = readMonth(request)
    const type = normalizeTypeFilter(request.query.type)
    const block = readBlock(request)
    let content

    try {
      content = sanitizeBlock(block, request.body?.content)
    } catch (error) {
      throw createHttpError(400, error.message)
    }

    const edit = await store.saveBlockEdit({
      monthKey: month,
      type,
      block,
      content,
      userId: request.user?.id,
      userName: request.user?.name || request.user?.email || 'Команда',
    })

    response.json({ block, edit })
  }))

  // Drops the edit: the AI text is shown again.
  app.delete('/api/promo/blocks/:block', requireAuth, asyncHandler(async (request, response) => {
    await store.deleteBlockEdit({
      monthKey: readMonth(request),
      type: normalizeTypeFilter(request.query.type),
      block: readBlock(request),
    })

    response.json({ ok: true })
  }))

  function readAdId(request) {
    const adId = String(request.params.adId || '')
    if (!AD_ID_PATTERN.test(adId)) throw createHttpError(400, 'Некоректний ad_id.')
    return adId
  }

  // Comment of a vacancy as a whole: a creative-like target in the same comments table.
  function readVacancyTarget(request) {
    const month = readMonth(request)
    const key = vacancyKey(request.params.vacancyKey)
    if (!key || key.length > MAX_VACANCY_KEY_LENGTH) throw createHttpError(400, 'Некоректна вакансія.')
    return { platform: VACANCY_COMMENTS, adId: vacancyCommentId(month, key) }
  }

  // The same list / add / delete handlers serve creatives and vacancies; `readTarget` says which one.
  function commentHandlers(readTarget) {
    return {
      list: asyncHandler(async (request, response) => {
        const { platform, adId } = readTarget(request)
        const comments = await store.listComments(platform, adId)
        const userId = request.user?.id || null

        response.json({
          comments: comments.map((comment) => ({
            ...comment,
            mine: userId ? comment.authorId === userId : comment.authorId === null,
          })),
        })
      }),

      add: asyncHandler(async (request, response) => {
        const { platform, adId } = readTarget(request)
        const text = String(request.body?.text || '').trim()

        if (!text) throw createHttpError(400, 'Напишіть текст коментаря.')
        if (text.length > MAX_COMMENT_LENGTH) {
          throw createHttpError(400, `Коментар задовгий (максимум ${MAX_COMMENT_LENGTH} символів).`)
        }

        const comment = await store.addComment({
          platform,
          adId,
          authorId: request.user?.id || null,
          authorName: request.user?.name || request.user?.email || 'Команда',
          text,
        })

        response.status(201).json({ comment: { ...comment, mine: true } })
      }),

      remove: asyncHandler(async (request, response) => {
        const { platform, adId } = readTarget(request)
        const result = await store.deleteComment({
          platform,
          adId,
          id: String(request.params.id || ''),
          userId: request.user?.id || null,
        })

        if (result === 'missing') throw createHttpError(404, 'Коментар не знайдено.')
        if (result === 'forbidden') throw createHttpError(403, 'Можна видаляти лише свої коментарі.')
        response.json({ ok: true })
      }),
    }
  }

  const creativeComments = commentHandlers((request) => ({
    platform: readPlatform(request),
    adId: readAdId(request),
  }))
  app.get('/api/promo/creatives/:adId/comments', creativeComments.list)
  app.post('/api/promo/creatives/:adId/comments', requireAuth, creativeComments.add)
  app.delete('/api/promo/creatives/:adId/comments/:id', requireAuth, creativeComments.remove)

  const vacancyComments = commentHandlers(readVacancyTarget)
  app.get('/api/promo/vacancies/:vacancyKey/comments', vacancyComments.list)
  app.post('/api/promo/vacancies/:vacancyKey/comments', requireAuth, vacancyComments.add)
  app.delete('/api/promo/vacancies/:vacancyKey/comments/:id', requireAuth, vacancyComments.remove)
}
