// LinkedIn Marketing API -> compact rows for the Promo page.
//
// Verified against the LinkedIn docs (li-lms-2026-11):
//   campaigns : GET /rest/adAccounts/{id}/adCampaigns?q=search&search=(status:(values:List(...)))
//   creatives : GET /rest/adAccounts/{id}/creatives?q=criteria&campaigns=List(urn...)  (X-RestLi-Method: FINDER)
//   analytics : GET /rest/adAnalytics?q=analytics&pivot=CREATIVE&timeGranularity=DAILY&dateRange=(...)&campaigns=List(urn...)
// Not verified (no token at development time): the `accounts` facet with pivot=CREATIVE (so `campaigns` is used),
// `costInUsd` (not documented, `costInLocalCurrency` is used) and creative thumbnails/post text, which are
// best-effort and never fail the sync.

const API_BASE = 'https://api.linkedin.com/rest'
export const DEFAULT_LINKEDIN_VERSION = '202611'
const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED', 'COMPLETED', 'CANCELED']
const CAMPAIGNS_PER_REQUEST = 20
const ANALYTICS_ELEMENT_LIMIT = 15000
const MAX_ENRICHED_CREATIVES = 24
const MAX_PAGES = 20
const MIN_ASSET_URL_VERSION = 202610 // metadata.assetURL exists from this version on

export function getLinkedInConfig(env = process.env) {
  const accessToken = String(env.LINKEDIN_ACCESS_TOKEN || '').trim()
  const accountId = String(env.LINKEDIN_AD_ACCOUNT_ID || '')
    .trim()
    .replace(/^urn:li:sponsoredAccount:/, '')

  if (!accessToken || !accountId) return null

  return {
    accessToken,
    accountId,
    version: String(env.LINKEDIN_API_VERSION || DEFAULT_LINKEDIN_VERSION).trim(),
    timeoutMs: Math.min(
      120000,
      Math.max(1000, Number(env.LINKEDIN_TIMEOUT_MS) || 30000),
    ),
    fallbackCurrency: String(env.LINKEDIN_CURRENCY || 'USD').trim().toUpperCase(),
  }
}

export const urnId = (urn) => String(urn || '').split(':').pop()
export const campaignUrn = (id) => `urn:li:sponsoredCampaign:${id}`
const encodeUrn = (urn) => urn.replaceAll(':', '%3A')
const restliList = (urns) => `List(${urns.map(encodeUrn).join(',')})`

export function restliDateRange({ since, until }) {
  const part = (iso) => {
    const [year, month, day] = iso.split('-').map(Number)
    return `(year:${year},month:${month},day:${day})`
  }
  return `(start:${part(since)},end:${part(until)})`
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function chunk(list, size) {
  const chunks = []
  for (let index = 0; index < list.length; index += size) chunks.push(list.slice(index, index + size))
  return chunks
}

function pad(value) {
  return String(value).padStart(2, '0')
}

// ---------- pure helpers (unit-tested) ----------

export function mapLinkedInHttpError(status, bodyText, createHttpError) {
  const message = (() => {
    try {
      return String(JSON.parse(bodyText)?.message || '')
    } catch {
      return ''
    }
  })()

  let error
  if (status === 401) {
    error = createHttpError(
      502,
      'LinkedIn access token протермінований або недійсний. Згенеруйте новий токен і оновіть LINKEDIN_ACCESS_TOKEN у Railway Variables.',
    )
  } else if (status === 403) {
    error = createHttpError(
      502,
      'LinkedIn не дає доступу до рекламного кабінету. Перевірте scopes токена (r_ads, r_ads_reporting) і що користувач токена має роль у кабінеті з LINKEDIN_AD_ACCOUNT_ID.',
    )
  } else if (status === 429) {
    error = createHttpError(
      502,
      'LinkedIn тимчасово обмежив кількість запитів (rate limit). Зачекайте кілька хвилин і спробуйте ще раз.',
    )
    error.linkedinRateLimited = true
  } else if ((status === 400 || status === 426) && /version/i.test(message)) {
    error = createHttpError(
      502,
      'LinkedIn не приймає версію API. Перевірте LINKEDIN_API_VERSION (формат YYYYMM, наприклад 202611).',
    )
  } else {
    error = createHttpError(502, `LinkedIn API (${status}): ${message || 'невідома помилка'}`)
  }

  error.linkedinStatus = status
  error.linkedinMessage = message
  return error
}

// Campaigns whose schedule can overlap the month. runSchedule.start is inclusive and
// end is exclusive and optional (both epoch milliseconds).
export function overlapsRange(campaign, { since, until }) {
  const rangeStart = Date.parse(`${since}T00:00:00Z`)
  const rangeEnd = Date.parse(`${until}T00:00:00Z`) + 24 * 60 * 60 * 1000
  const start = Number(campaign.runSchedule?.start)
  const end = Number(campaign.runSchedule?.end)

  if (Number.isFinite(start) && start >= rangeEnd) return false
  if (Number.isFinite(end) && end > 0 && end <= rangeStart) return false
  return true
}

export function normalizeCampaign(element) {
  return {
    id: String(element.id),
    name: element.name || '',
    status: element.status || '',
    type: element.type || '',
    format: element.format || '',
    runSchedule: element.runSchedule || null,
  }
}

// The creative response has no "image / carousel / document" field: infer what the API allows.
export function linkedinCreativeKind({ campaign = {}, content = {}, adFormat = '' }) {
  if (content.videoAd || /VIDEO/i.test(adFormat) || /VIDEO/i.test(campaign.format)) return 'video'
  if (/CAROUSEL/i.test(campaign.format)) return 'carousel'
  if (/TEXT/i.test(adFormat) || /TEXT/i.test(campaign.format) || campaign.type === 'TEXT_AD') return 'text'
  return 'photo'
}

export function contentReference(content = {}) {
  return content.reference || content.standardUpdateAd?.reference || content.videoAd?.reference || ''
}

export function normalizeCreative(element, campaignsById) {
  const campaignId = urnId(element.campaign)
  const campaign = campaignsById[campaignId] || {}

  return {
    id: urnId(element.id),
    campaignId,
    name: element.name || '',
    status: element.intendedStatus || '',
    reference: contentReference(element.content),
    kind: linkedinCreativeKind({ campaign, content: element.content }),
  }
}

export function parseAnalyticsElement(element) {
  const start = element.dateRange?.start
  const creativeUrn = Array.isArray(element.pivotValues) ? element.pivotValues[0] : ''
  if (!start || !creativeUrn) return null

  return {
    date: `${start.year}-${pad(start.month)}-${pad(start.day)}`,
    adId: urnId(creativeUrn),
    spend: toNumber(element.costInLocalCurrency),
    impressions: toNumber(element.impressions),
    reach: 0,
    // Landing page clicks are the closest thing to Meta's inline_link_clicks;
    // plain `clicks` (all clicks incl. social actions) only as a fallback.
    clicks: toNumber(element.landingPageClicks ?? element.clicks),
    follows: 0,
    views3s: 0,
    thruplays: 0,
    plays: 0,
  }
}

// ---------- client ----------

export function createLinkedInClient({ createHttpError, fetchImpl = fetch }) {
  async function request(config, path, query = '', { finder = false } = {}) {
    const url = `${API_BASE}/${path}${query ? `?${query}` : ''}`
    const headers = {
      Authorization: `Bearer ${config.accessToken}`,
      'Linkedin-Version': config.version,
      'X-Restli-Protocol-Version': '2.0.0',
      Accept: 'application/json',
    }
    if (finder) headers['X-RestLi-Method'] = 'FINDER'

    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    const body = await response.text()

    if (!response.ok) throw mapLinkedInHttpError(response.status, body, createHttpError)
    return body ? JSON.parse(body) : {}
  }

  async function paged(config, path, baseQuery, options = {}) {
    const elements = []
    let pageToken = ''

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = `${baseQuery}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      const payload = await request(config, path, query, options)
      elements.push(...(payload.elements || []))
      pageToken = payload.metadata?.nextPageToken || ''
      if (!pageToken) break
    }

    return elements
  }

  async function listCampaigns(config) {
    const base = (statuses) =>
      `q=search&search=(status:(values:List(${statuses.join(',')})))&pageSize=1000`
    const path = `adAccounts/${config.accountId}/adCampaigns`

    try {
      return (await paged(config, path, base(CAMPAIGN_STATUSES))).map(normalizeCampaign)
    } catch (error) {
      // More than 1000 matches is a 400 "too many entities": ask status by status instead.
      if (error.linkedinStatus === 400 && /too many/i.test(error.linkedinMessage)) {
        const all = []
        for (const status of CAMPAIGN_STATUSES) {
          all.push(...(await paged(config, path, base([status]))))
        }
        return all.map(normalizeCampaign)
      }
      throw error
    }
  }

  async function fetchAnalyticsChunk(config, campaignIds, range) {
    const query = [
      'q=analytics',
      'pivot=CREATIVE',
      'timeGranularity=DAILY',
      `dateRange=${restliDateRange(range)}`,
      `campaigns=${restliList(campaignIds.map(campaignUrn))}`,
      'fields=dateRange,pivotValues,impressions,clicks,landingPageClicks,costInLocalCurrency',
    ].join('&')
    const payload = await request(config, 'adAnalytics', query)
    const elements = payload.elements || []

    // Responses are capped at 15 000 elements and not paginated: split the campaigns and retry.
    if (elements.length >= ANALYTICS_ELEMENT_LIMIT && campaignIds.length > 1) {
      const half = Math.ceil(campaignIds.length / 2)
      return [
        ...(await fetchAnalyticsChunk(config, campaignIds.slice(0, half), range)),
        ...(await fetchAnalyticsChunk(config, campaignIds.slice(half), range)),
      ]
    }

    return elements
  }

  async function fetchAnalytics(config, campaignIds, range) {
    const rows = []

    for (const ids of chunk(campaignIds, CAMPAIGNS_PER_REQUEST)) {
      const elements = await fetchAnalyticsChunk(config, ids, range)
      elements.forEach((element) => {
        const row = parseAnalyticsElement(element)
        if (row) rows.push(row)
      })
    }

    return rows
  }

  async function listCreatives(config, campaignIds, campaignsById) {
    const creatives = []

    for (const ids of chunk(campaignIds, CAMPAIGNS_PER_REQUEST)) {
      const elements = await paged(
        config,
        `adAccounts/${config.accountId}/creatives`,
        `q=criteria&campaigns=${restliList(ids.map(campaignUrn))}&pageSize=100`,
        { finder: true },
      )
      elements.forEach((element) => creatives.push(normalizeCreative(element, campaignsById)))
    }

    return creatives
  }

  async function fetchAccountCurrency(config) {
    try {
      const account = await request(config, `adAccounts/${config.accountId}`)
      return String(account.currency || '').toUpperCase() || config.fallbackCurrency
    } catch (error) {
      if (error.linkedinStatus === 401 || error.linkedinStatus === 429) throw error
      return config.fallbackCurrency
    }
  }

  // Thumbnail (metadata.assetURL, version >= 202610, single creative only) and post text are
  // best-effort. Capped, cached in the snapshot, and any failure just leaves the field empty.
  async function enrichCreative(config, creative, state) {
    const extra = { thumbnailUrl: '', body: '' }

    if (Number(config.version) >= MIN_ASSET_URL_VERSION) {
      try {
        const urn = encodeUrn(`urn:li:sponsoredCreative:${creative.id}`)
        const detail = await request(config, `adAccounts/${config.accountId}/creatives/${urn}`, 'fields=id,metadata')
        extra.thumbnailUrl = detail.metadata?.assetURL || ''
        if (/VIDEO/i.test(detail.metadata?.adFormat || '')) extra.kind = 'video'
        else if (/TEXT/i.test(detail.metadata?.adFormat || '')) extra.kind = 'text'
      } catch (error) {
        if (error.linkedinRateLimited || error.linkedinStatus === 401) throw error
      }
    }

    if (creative.reference && !state.postsDenied) {
      try {
        const post = await request(config, `posts/${encodeUrn(creative.reference)}`)
        extra.body = String(post.commentary || '')
      } catch (error) {
        if (error.linkedinRateLimited || error.linkedinStatus === 401) throw error
        if (error.linkedinStatus === 403) state.postsDenied = true // needs r_organization_social
      }
    }

    return extra
  }

  async function syncLinkedIn(config, range) {
    const currency = await fetchAccountCurrency(config)
    const campaigns = (await listCampaigns(config)).filter((campaign) => overlapsRange(campaign, range))
    const campaignsById = Object.fromEntries(campaigns.map((campaign) => [campaign.id, campaign]))
    const campaignIds = campaigns.map((campaign) => campaign.id)

    if (!campaignIds.length) {
      return { currency, campaigns: {}, ads: {}, rows: [] }
    }

    const allRows = await fetchAnalytics(config, campaignIds, range)
    const creatives = await listCreatives(config, campaignIds, campaignsById)
    const creativesById = Object.fromEntries(creatives.map((creative) => [creative.id, creative]))
    const rows = allRows.filter((row) => row.spend > 0 || row.impressions > 0)

    const spendByCreative = {}
    rows.forEach((row) => {
      spendByCreative[row.adId] = (spendByCreative[row.adId] || 0) + row.spend
    })
    const activeIds = Object.keys(spendByCreative).sort((a, b) => spendByCreative[b] - spendByCreative[a])
    const state = { postsDenied: false }
    const enriched = {}

    for (const id of activeIds.slice(0, MAX_ENRICHED_CREATIVES)) {
      if (creativesById[id]) enriched[id] = await enrichCreative(config, creativesById[id], state)
    }

    const ads = {}
    activeIds.forEach((id) => {
      const creative = creativesById[id] || { id, campaignId: '', name: '', kind: 'photo', status: '' }
      const campaign = campaignsById[creative.campaignId] || {}
      const extra = enriched[id] || {}

      ads[id] = {
        id,
        name: creative.name || `Креатив ${id}`,
        campaignId: creative.campaignId,
        campaignName: campaign.name || '',
        status: creative.status,
        effectiveStatus: campaign.status || '',
        creative: {
          kind: extra.kind || creative.kind,
          thumbnailUrl: extra.thumbnailUrl || '',
          imageUrl: '',
          body: extra.body || '',
          title: '',
          objectType: campaign.format || campaign.type || '',
          durationSec: 0,
        },
      }
    })

    const usedCampaigns = {}
    Object.values(ads).forEach((ad) => {
      if (campaignsById[ad.campaignId]) usedCampaigns[ad.campaignId] = campaignsById[ad.campaignId]
    })

    return { currency, campaigns: usedCampaigns, ads, rows }
  }

  return { syncLinkedIn }
}
