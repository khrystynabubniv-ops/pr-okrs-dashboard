// Pure calculations for the Promo Results page. No I/O: everything here is
// deterministic so it can be unit-tested (see calc.test.js).

import { createHash } from 'node:crypto'

// Campaign type is the 2nd segment of `UNI | Вакансія | AI Motion Designer | 11.2026`.
// Add new types here only: the rest of the code reads this map.
export const CAMPAIGN_TYPES = {
  vac: { label: 'Вакансії', segments: ['вакансія', 'вакансії'] },
  subs: { label: 'Підписники', segments: ['підписники', 'підписник'] },
  aw: { label: 'Awareness', segments: ['awareness'] },
  other: { label: 'Не розпізнано', segments: [] },
}

export const TYPE_ORDER = ['vac', 'subs', 'aw', 'other']
export const FILTERABLE_TYPES = ['all', 'vac', 'subs', 'aw']

// Creative labels (per campaign).
export const LABEL_THRESHOLDS = {
  leaderMinSharePct: 40,
  untestedMaxSpend: 5,
  untestedMaxImpressions: 1000,
  retestMinImpressions: 300,
  weakMinImpressions: 1000,
  weakCtrRatio: 0.5,
}

export function parseCampaignName(name) {
  const text = String(name || '').trim()
  const segments = text.split('|').map((part) => part.trim())

  if (segments.length < 2) return { type: 'other', title: text }

  const key = segments[1].toLowerCase()
  const type =
    TYPE_ORDER.find((candidate) => CAMPAIGN_TYPES[candidate].segments.includes(key)) || 'other'

  if (type === 'other') return { type, title: text }
  return { type, title: segments[2] || text }
}

export function normalizeTypeFilter(value) {
  const text = String(value || 'all').trim().toLowerCase()
  return FILTERABLE_TYPES.includes(text) ? text : 'all'
}

// ---------- dates ----------

export function isMonthKey(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''))
}

export function todayIso(now = new Date(), timeZone = 'Europe/Kyiv') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function monthFirstDay(monthKey) {
  return `${monthKey}-01`
}

export function previousMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysInMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// { since, until } clipped to today for the current month; null for a future month.
export function monthRange(monthKey, today = todayIso()) {
  const since = monthFirstDay(monthKey)
  const last = `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, '0')}`

  if (today < since) return null
  return { since, until: today < last ? today : last }
}

function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dayLabel(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

// Mon–Sun weeks inside the range; first/last are clipped to the range.
export function weeksInRange({ since, until }) {
  const weeks = []
  let start = since

  while (start <= until) {
    const weekday = new Date(`${start}T00:00:00Z`).getUTCDay() // 0 = Sun
    const toSunday = weekday === 0 ? 0 : 7 - weekday
    const sunday = addDays(start, toSunday)
    const end = sunday < until ? sunday : until
    const label =
      start === end
        ? dayLabel(start)
        : `${start.slice(8, 10)}–${end.slice(8, 10)}.${end.slice(5, 7)}`

    weeks.push({ start, end, label })
    start = addDays(end, 1)
  }

  return weeks
}

// ---------- aggregation ----------

const SUM_KEYS = [
  'spend',
  'impressions',
  'reach',
  'clicks',
  'follows',
  'views3s',
  'thruplays',
  'plays',
]

export function emptyTotals() {
  return Object.fromEntries(SUM_KEYS.map((key) => [key, 0]))
}

export function addRow(totals, row) {
  SUM_KEYS.forEach((key) => {
    totals[key] += Number(row[key]) || 0
  })
  return totals
}

export function withRatios(totals) {
  return {
    ...totals,
    ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0,
    cpc: totals.clicks ? totals.spend / totals.clicks : 0,
    cpf: totals.follows ? totals.spend / totals.follows : 0,
    hookRate: totals.impressions && totals.views3s ? (totals.views3s / totals.impressions) * 100 : null,
    holdRate: totals.views3s && totals.thruplays ? (totals.thruplays / totals.views3s) * 100 : null,
  }
}

// ---------- labels ----------

export function labelCreatives(creatives, thresholds = LABEL_THRESHOLDS) {
  const campaignSpend = creatives.reduce((sum, item) => sum + item.spend, 0)
  const withShare = creatives.map((item) => ({
    ...item,
    sharePct: campaignSpend ? (item.spend / campaignSpend) * 100 : 0,
  }))
  const leaders = withShare.filter((item) => item.sharePct >= thresholds.leaderMinSharePct)
  const leaderCtr = leaders.length ? Math.max(...leaders.map((item) => item.ctr)) : null

  return withShare.map((item) => {
    let label = ''

    if (leaders.includes(item)) {
      label = 'leader'
    } else if (
      leaderCtr !== null &&
      item.impressions >= thresholds.retestMinImpressions &&
      item.ctr >= leaderCtr
    ) {
      label = 'retest'
    } else if (
      item.spend < thresholds.untestedMaxSpend ||
      item.impressions < thresholds.untestedMaxImpressions
    ) {
      label = 'untested'
    } else if (
      leaderCtr !== null &&
      item.impressions >= thresholds.weakMinImpressions &&
      item.ctr < leaderCtr * thresholds.weakCtrRatio
    ) {
      label = 'weak'
    }

    return { ...item, label }
  })
}

// ---------- text helpers ----------

export function plural(count, one, few, many) {
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n > 10 && n < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

export function formatMoney(value, currency = 'USD') {
  const symbol = { USD: '$', EUR: '€', UAH: '₴' }[currency] || `${currency} `
  const number = Number(value) || 0
  const digits = number >= 100 ? 0 : 2
  return `${symbol}${number.toLocaleString('uk-UA', {
    minimumFractionDigits: digits === 0 ? 0 : number % 1 === 0 ? 0 : 2,
    maximumFractionDigits: digits,
  })}`
}

// ---------- report ----------

function sortCampaigns(campaigns) {
  return campaigns.sort((a, b) =>
    a.type === b.type
      ? b.spend - a.spend
      : TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  )
}

// Group snapshot rows into campaigns > creatives with totals and labels.
export function buildCampaigns(snapshot, typeFilter = 'all') {
  const ads = snapshot?.ads || {}
  const byAd = new Map()

  ;(snapshot?.rows || []).forEach((row) => {
    if (!byAd.has(row.adId)) byAd.set(row.adId, emptyTotals())
    addRow(byAd.get(row.adId), row)
  })

  const byCampaign = new Map()

  byAd.forEach((totals, adId) => {
    const ad = ads[adId] || {}
    const campaignId = ad.campaignId || `unknown-${adId}`
    const parsed = parseCampaignName(ad.campaignName)

    if (typeFilter !== 'all' && parsed.type !== typeFilter) return

    if (!byCampaign.has(campaignId)) {
      byCampaign.set(campaignId, {
        id: campaignId,
        name: ad.campaignName || '',
        title: parsed.title,
        type: parsed.type,
        creatives: [],
      })
    }

    byCampaign.get(campaignId).creatives.push({
      adId,
      name: ad.name || adId,
      ...withRatios(totals),
      creative: ad.creative || {},
      status: ad.effectiveStatus || ad.status || '',
    })
  })

  const campaigns = [...byCampaign.values()].map((campaign) => {
    const totals = campaign.creatives.reduce(
      (sum, item) => addRow(sum, item),
      emptyTotals(),
    )
    const labeled = labelCreatives(campaign.creatives).sort((a, b) => b.spend - a.spend)

    // Daily reach is not additive, so prefer Meta's campaign-level reach for the month.
    const reach = snapshot?.campaignReach?.[campaign.id] ?? totals.reach

    return { ...campaign, ...withRatios(totals), reach, creatives: labeled }
  })

  return sortCampaigns(campaigns)
}

export function totalsOf(campaigns) {
  const totals = campaigns.reduce((sum, campaign) => addRow(sum, campaign), emptyTotals())
  const ratios = withRatios(totals)
  const followCampaigns = campaigns.filter((campaign) => campaign.follows > 0)
  const followSpend = followCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0)

  return { ...ratios, cpf: totals.follows ? followSpend / totals.follows : 0 }
}

function pctChange(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

export function buildDeltas(current, previous) {
  if (!previous) return null

  return {
    spend: pctChange(current.spend, previous.spend),
    impressions: pctChange(current.impressions, previous.impressions),
    clicks: pctChange(current.clicks, previous.clicks),
    ctr: previous.ctr ? current.ctr - previous.ctr : null, // percentage points
    cpc: pctChange(current.cpc, previous.cpc),
    follows: pctChange(current.follows, previous.follows),
    reach: pctChange(current.reach, previous.reach),
  }
}

export function buildWeeks(snapshot, typeFilter, range) {
  const weeks = weeksInRange(range)
  const ads = snapshot?.ads || {}
  const series = Object.fromEntries(TYPE_ORDER.map((type) => [type, weeks.map(() => 0)]))

  ;(snapshot?.rows || []).forEach((row) => {
    const type = parseCampaignName(ads[row.adId]?.campaignName).type
    if (typeFilter !== 'all' && type !== typeFilter) return

    const index = weeks.findIndex((week) => row.date >= week.start && row.date <= week.end)
    if (index !== -1) series[type][index] += Number(row.spend) || 0
  })

  return {
    labels: weeks.map((week) => week.label),
    series,
    types: TYPE_ORDER.filter((type) => series[type].some((value) => value > 0)),
  }
}

export function buildByType(campaigns) {
  return TYPE_ORDER.map((type) => {
    const list = campaigns.filter((campaign) => campaign.type === type)
    if (!list.length) return null

    const totals = totalsOf(list)
    return {
      type,
      label: CAMPAIGN_TYPES[type].label,
      campaigns: list.length,
      creatives: list.reduce((sum, campaign) => sum + campaign.creatives.length, 0),
      spend: totals.spend,
      clicks: totals.clicks,
      ctr: totals.ctr,
      cpc: totals.cpc,
      follows: totals.follows,
      cpf: totals.cpf,
      reach: totals.reach,
    }
  }).filter(Boolean)
}

// "Що зробили за період": generated by code from the data, no AI.
export function buildDid(campaigns, currency) {
  const money = (value) => formatMoney(value, currency)
  const items = []
  const names = (list) => list.map((campaign) => campaign.title).join(', ')
  const creativesCount = (list) => list.reduce((sum, c) => sum + c.creatives.length, 0)
  const creativesText = (count) =>
    `${count} ${plural(count, 'креатив', 'креативи', 'креативів')}`

  const vac = campaigns.filter((campaign) => campaign.type === 'vac')
  if (vac.length) {
    const spend = vac.reduce((sum, campaign) => sum + campaign.spend, 0)
    items.push({
      lead: `Запустили ${vac.length} ${plural(vac.length, 'кампанію', 'кампанії', 'кампаній')} на вакансії`,
      text: ` — ${names(vac)}: ${creativesText(creativesCount(vac))}, ${money(spend)}.`,
    })
  }

  const subs = campaigns.filter((campaign) => campaign.type === 'subs')
  if (subs.length) {
    const totals = totalsOf(subs)
    items.push({
      lead: `Нарощували підписників`,
      text: ` — ${names(subs)}: ${money(totals.spend)}${
        totals.follows ? `, +${totals.follows} підписників (${money(totals.cpf)} за підписника)` : ''
      }.`,
    })
  }

  const aw = campaigns.filter((campaign) => campaign.type === 'aw')
  if (aw.length) {
    const totals = totalsOf(aw)
    items.push({
      lead: `Підтримували впізнаваність`,
      text: ` — ${names(aw)}: ${money(totals.spend)}, ${Math.round(totals.impressions).toLocaleString('uk-UA')} показів.`,
    })
  }

  const other = campaigns.filter((campaign) => campaign.type === 'other')
  if (other.length) {
    items.push({
      lead: `${other.length} ${plural(other.length, 'кампанію', 'кампанії', 'кампаній')} не розпізнано`,
      text: ` — перейменуйте за шаблоном «UNI | Тип | Назва | ММ.РРРР», щоб вони потрапили у свій тип.`,
    })
  }

  return items
}

export function buildReport({ snapshot, previousSnapshot, typeFilter = 'all', today = todayIso() }) {
  const type = normalizeTypeFilter(typeFilter)
  const monthKey = snapshot.month
  const range = monthRange(monthKey, today) || { since: monthFirstDay(monthKey), until: monthFirstDay(monthKey) }
  const campaigns = buildCampaigns(snapshot, type)
  const totals = totalsOf(campaigns)
  const previousCampaigns = previousSnapshot ? buildCampaigns(previousSnapshot, type) : null
  const previousTotals = previousCampaigns?.length ? totalsOf(previousCampaigns) : null
  const currency = snapshot.currency || 'USD'

  return {
    month: monthKey,
    type,
    asOf: snapshot.fetchedAt,
    currency,
    since: range.since,
    until: range.until,
    kpis: {
      ...totals,
      deltas: buildDeltas(totals, previousTotals),
      previousMonth: previousSnapshot?.month || previousMonthKey(monthKey),
    },
    weeks: buildWeeks(snapshot, type, range),
    byType: buildByType(campaigns),
    did: buildDid(campaigns, currency),
    campaigns,
    counts: {
      campaigns: campaigns.length,
      creatives: campaigns.reduce((sum, campaign) => sum + campaign.creatives.length, 0),
    },
    unrecognized: campaigns.filter((campaign) => campaign.type === 'other').length,
  }
}

// Hash of what the AI sees: when it changes, the analysis is stale.
export function analysisInputHash(campaigns) {
  const payload = campaigns.map((campaign) => ({
    id: campaign.id,
    creatives: campaign.creatives.map((item) => [
      item.adId,
      Math.round(item.spend * 100),
      item.impressions,
      item.clicks,
      item.follows,
      item.label,
      item.creative?.body || '',
    ]),
  }))

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32)
}
