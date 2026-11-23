// Meta Ads -> Postgres snapshot for one month.
//
// Meta calls per sync (kept low on purpose, see the rate-limit commit):
//   1. insights level=ad, time_increment=1   (paged)
//   2. insights level=campaign, whole month  (campaign-level reach is not additive over days)
//   3. ad details + creatives via ?ids=...   (50 ads per call)
//   4. video lengths via ?ids=...            (optional, failures are ignored)

import { monthRange, todayIso } from './calc.js'
import { createLinkedInClient, getLinkedInConfig } from './linkedin.js'

const INSIGHT_FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'spend',
  'impressions',
  'reach',
  'inline_link_clicks',
  'clicks',
  'actions',
  'account_currency',
]
const VIDEO_INSIGHT_FIELDS = [
  'video_p25_watched_actions',
  'video_thruplay_watched_actions',
  'video_play_actions',
]
const CREATIVE_FIELDS = 'id,thumbnail_url,image_url,body,title,object_type,video_id,asset_feed_spec'
const IDS_PER_CALL = 50
const INVALID_FIELD_PATTERN =
  /nonexisting field|not valid for fields|unknown field|is not a valid|invalid.*(field|metric)/i

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function sumActions(list, types) {
  if (!Array.isArray(list)) return 0
  return list
    .filter((item) => !types || types.includes(item.action_type))
    .reduce((sum, item) => sum + toNumber(item.value), 0)
}

function chunk(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size))
  return chunks
}

export function normalizeCreative(creative = {}) {
  const feed = creative.asset_feed_spec || {}
  const hasVideo = Boolean(creative.video_id) || (Array.isArray(feed.videos) && feed.videos.length > 0)
  const kind = hasVideo ? 'video' : /multi|carousel/i.test(creative.object_type || '') ? 'carousel' : 'photo'
  const imageUrl = creative.image_url || ''

  return {
    id: creative.id || '',
    kind,
    objectType: creative.object_type || '',
    videoId: creative.video_id || feed.videos?.[0]?.video_id || '',
    body: creative.body || feed.bodies?.[0]?.text || '',
    title: creative.title || feed.titles?.[0]?.text || '',
    thumbnailUrl: kind === 'photo' ? imageUrl || creative.thumbnail_url || '' : creative.thumbnail_url || imageUrl,
    imageUrl,
    durationSec: 0,
  }
}

export function parseInsightRow(row, followActionTypes) {
  return {
    date: row.date_start,
    adId: String(row.ad_id),
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.inline_link_clicks), // link clicks, not all clicks
    follows: sumActions(row.actions, followActionTypes),
    views3s: sumActions(row.actions, ['video_view']),
    thruplays: sumActions(row.video_thruplay_watched_actions),
    plays: sumActions(row.video_play_actions),
  }
}

export function mapAdsError(error, { createHttpError }) {
  if (!error || (!error.metaErrorMessage && !error.metaRateLimited)) return error
  if (error.metaRateLimited || error.metaErrorCode === 190) return error

  const message = error.metaErrorMessage || ''

  if (
    error.metaErrorCode === 10 ||
    error.metaErrorCode === 200 ||
    /ads_read|ads_management|permission/i.test(message)
  ) {
    return createHttpError(
      502,
      'Токен Meta не має доступу до рекламного кабінету (ads_read). Згенеруйте токен із дозволом ads_read і перевірте, що користувач токена має доступ до кабінету з META_AD_ACCOUNT_ID.',
    )
  }

  if (error.metaErrorCode === 100 && /ad account|object with id|does not exist/i.test(message)) {
    return createHttpError(
      502,
      'Meta не бачить цей рекламний кабінет. Перевірте META_AD_ACCOUNT_ID (формат act_XXXX) і доступи токена.',
    )
  }

  return createHttpError(502, `Meta Ads API: ${message}`)
}

export function createPromoSync({
  getMetaAdsConfig,
  metaUrl,
  fetchMetaJsonUrl,
  createHttpError,
  store,
}) {
  const inflight = new Map()
  const lastErrors = new Map()
  const linkedinClient = createLinkedInClient({ createHttpError })

  async function fetchPaged(config, firstUrl, message) {
    const rows = []
    const maxPages = Math.max(1, Math.min(100, Number(process.env.META_PROMO_MAX_PAGES) || 40))
    let url = firstUrl
    let page = 0

    while (url && page < maxPages) {
      page += 1
      const payload = await fetchMetaJsonUrl(config, url, message)
      if (Array.isArray(payload.data)) rows.push(...payload.data)
      url = payload.paging?.next ? new URL(payload.paging.next) : null
    }

    return rows
  }

  async function fetchDailyInsights(config, range) {
    const params = {
      level: 'ad',
      time_increment: 1,
      time_range: JSON.stringify(range),
      limit: 500,
    }
    const build = (fields) => metaUrl(config, `${config.accountId}/insights`, { ...params, fields: fields.join(',') })
    const message = 'Meta Ads не повернув insights.'

    try {
      const rows = await fetchPaged(config, build([...INSIGHT_FIELDS, ...VIDEO_INSIGHT_FIELDS]), message)
      return { rows, videoMetrics: true }
    } catch (error) {
      // An unsupported video field must not take the whole report down: retry once without them.
      if (error?.metaErrorCode === 100 && INVALID_FIELD_PATTERN.test(error.metaErrorMessage || '')) {
        const rows = await fetchPaged(config, build(INSIGHT_FIELDS), message)
        return { rows, videoMetrics: false }
      }
      throw error
    }
  }

  async function fetchCampaignReach(config, range) {
    try {
      const rows = await fetchPaged(
        config,
        metaUrl(config, `${config.accountId}/insights`, {
          level: 'campaign',
          time_range: JSON.stringify(range),
          fields: 'campaign_id,reach',
          limit: 500,
        }),
        'Meta Ads не повернув охоплення кампаній.',
      )
      return Object.fromEntries(rows.map((row) => [String(row.campaign_id), toNumber(row.reach)]))
    } catch (error) {
      if (error?.metaRateLimited) throw error
      return null // optional: falls back to summed daily reach
    }
  }

  async function fetchByIds(config, ids, fields, message) {
    const result = {}

    for (const group of chunk(ids, IDS_PER_CALL)) {
      const payload = await fetchMetaJsonUrl(config, metaUrl(config, '', { ids: group.join(','), fields }), message)
      Object.assign(result, payload)
    }

    return result
  }

  async function fetchAdDetails(config, adIds) {
    const sized = `creative.thumbnail_width(600).thumbnail_height(600){${CREATIVE_FIELDS}}`
    const plain = `creative{${CREATIVE_FIELDS}}`
    const base = 'id,name,status,effective_status,campaign_id,adset_id,created_time'
    const message = 'Meta Ads не повернув креативи.'

    try {
      return await fetchByIds(config, adIds, `${base},${sized}`, message)
    } catch (error) {
      if (error?.metaErrorCode === 100) {
        return fetchByIds(config, adIds, `${base},${plain}`, message)
      }
      // 803: some alias does not exist (deleted ad). Names still come from insights.
      if (error?.metaErrorCode === 803) return {}
      throw error
    }
  }

  async function fetchVideoLengths(config, videoIds) {
    try {
      const videos = await fetchByIds(config, videoIds, 'length', 'Meta не повернула тривалість відео.')
      return Object.fromEntries(
        Object.entries(videos).map(([id, video]) => [id, Math.round(toNumber(video?.length))]),
      )
    } catch {
      return {} // duration is a nice-to-have
    }
  }

  // LinkedIn is optional and independent: whatever happens here, the Meta part of the snapshot is saved.
  // On failure the previous LinkedIn data is kept (marked as stale with its own date).
  async function syncLinkedInPart(monthKey, range, metaCurrency) {
    const config = getLinkedInConfig()
    if (!config) return undefined

    const previous = (await store.getSnapshot(monthKey))?.linkedin
    const kept = previous
      ? {
          currency: previous.currency,
          campaigns: previous.campaigns || {},
          ads: previous.ads || {},
          rows: previous.rows || [],
          asOf: previous.asOf,
        }
      : { campaigns: {}, ads: {}, rows: [] }

    try {
      const data = await linkedinClient.syncLinkedIn(config, range)

      if (data.currency !== metaCurrency) {
        return {
          status: 'error',
          message: `Валюта LinkedIn-кабінету (${data.currency}) відрізняється від Meta (${metaCurrency}): суми не можна об'єднати.`,
          campaigns: {},
          ads: {},
          rows: [],
        }
      }

      return { status: 'ok', asOf: new Date().toISOString(), ...data }
    } catch (error) {
      console.error('LinkedIn sync failed:', error.message)
      return { ...kept, status: 'error', message: error.message }
    }
  }

  async function runSync(monthKey) {
    const config = getMetaAdsConfig()
    const range = monthRange(monthKey, todayIso())

    if (!range) {
      return store.saveSnapshot(monthKey, {
        currency: 'USD',
        rows: [],
        ads: {},
        campaignReach: null,
        videoMetrics: false,
      })
    }

    try {
      const { rows: rawRows, videoMetrics } = await fetchDailyInsights(config, range)
      const campaignReach = await fetchCampaignReach(config, range)
      const rows = rawRows
        .map((row) => parseInsightRow(row, config.followActionTypes))
        .filter((row) => row.spend > 0 || row.impressions > 0)

      const ads = {}
      rawRows.forEach((row) => {
        const adId = String(row.ad_id)
        ads[adId] = ads[adId] || {
          id: adId,
          name: row.ad_name || adId,
          campaignId: String(row.campaign_id || ''),
          campaignName: row.campaign_name || '',
          adsetId: String(row.adset_id || ''),
          adsetName: row.adset_name || '',
          status: '',
          effectiveStatus: '',
          createdTime: '',
          creative: normalizeCreative(),
        }
      })

      const adIds = Object.keys(ads)
      const details = adIds.length ? await fetchAdDetails(config, adIds) : {}

      adIds.forEach((adId) => {
        const detail = details[adId]
        if (!detail) return
        ads[adId] = {
          ...ads[adId],
          name: detail.name || ads[adId].name,
          status: detail.status || '',
          effectiveStatus: detail.effective_status || '',
          createdTime: detail.created_time || '',
          creative: normalizeCreative(detail.creative),
        }
      })

      const videoIds = [
        ...new Set(adIds.map((adId) => ads[adId].creative.videoId).filter(Boolean)),
      ]
      if (videoIds.length) {
        const lengths = await fetchVideoLengths(config, videoIds)
        adIds.forEach((adId) => {
          const creative = ads[adId].creative
          if (creative.videoId && lengths[creative.videoId]) creative.durationSec = lengths[creative.videoId]
        })
      }

      const currency = rawRows.find((row) => row.account_currency)?.account_currency || 'USD'
      const linkedin = await syncLinkedInPart(monthKey, range, currency)

      return await store.saveSnapshot(monthKey, {
        currency,
        rows,
        ads,
        campaignReach,
        videoMetrics,
        range,
        ...(linkedin ? { linkedin } : {}),
      })
    } catch (error) {
      throw mapAdsError(error, { createHttpError })
    }
  }

  // One sync per month at a time: parallel page opens must not multiply Meta calls.
  function syncMonth(monthKey) {
    if (inflight.has(monthKey)) return inflight.get(monthKey)

    const promise = runSync(monthKey)
      .then((snapshot) => {
        lastErrors.delete(monthKey)
        return snapshot
      })
      .catch((error) => {
        lastErrors.set(monthKey, { message: error.message, at: Date.now() })
        throw error
      })
      .finally(() => inflight.delete(monthKey))

    inflight.set(monthKey, promise)
    return promise
  }

  return {
    syncMonth,
    isSyncing: (monthKey) => inflight.has(monthKey),
    getLastError: (monthKey) => lastErrors.get(monthKey) || null,
  }
}
