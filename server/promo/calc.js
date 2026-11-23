// Pure calculations for the Promo Results page. No I/O: everything here is
// deterministic so it can be unit-tested (see calc.test.js).

import { createHash } from 'node:crypto'

// Campaign type is the 2nd segment of `UNI | Вакансія | AI Motion Designer | 11.2026`.
// Add new types here only: the rest of the code reads this map.
// `segments` match the template; `keywords` are a fallback for campaigns that do not follow it
// (e.g. one "Vacancies November26" campaign holding every vacancy): matched anywhere in the name.
export const CAMPAIGN_TYPES = {
  vac: { label: 'Вакансії', segments: ['вакансія', 'вакансії'], keywords: ['vacanc', 'вакан'] },
  subs: {
    label: 'Підписники',
    segments: ['підписники', 'підписник'],
    keywords: ['follow', 'підпис', 'подпис', 'subscri'],
  },
  aw: { label: 'Awareness', segments: ['awareness'], keywords: ['awareness', 'awarness', 'awerness', 'впізнаван'] },
  other: { label: 'Не розпізнано', segments: [], keywords: [] },
}

export const TYPE_ORDER = ['vac', 'subs', 'aw', 'other']
export const FILTERABLE_TYPES = ['all', 'vac', 'subs', 'aw']

// Creative labels (per vacancy / campaign).
export const LABEL_THRESHOLDS = {
  leaderMinSharePct: 40,
  weakMinImpressions: 1000,
}

function typeByKeyword(text) {
  const lower = text.toLowerCase()
  return TYPE_ORDER.find((type) => CAMPAIGN_TYPES[type].keywords.some((word) => lower.includes(word))) || 'other'
}

export function parseCampaignName(name) {
  const text = String(name || '').trim()
  const segments = text.split('|').map((part) => part.trim())

  if (segments.length >= 2) {
    const key = segments[1].toLowerCase()
    const type =
      TYPE_ORDER.find((candidate) => CAMPAIGN_TYPES[candidate].segments.includes(key)) || 'other'
    if (type !== 'other') return { type, title: segments[2] || text }
  }

  return { type: typeByKeyword(text), title: text }
}

// `UNI | Вакансія | AI Motion Designer | 11.2026`: the campaign itself names the vacancy.
export function isTemplatedVacancy(campaignName) {
  const segments = String(campaignName || '').split('|').map((part) => part.trim())
  return (
    segments.length >= 3 &&
    Boolean(segments[2]) &&
    CAMPAIGN_TYPES.vac.segments.includes(segments[1].toLowerCase())
  )
}

const UNDEFINED_VACANCY = 'Вакансію не визначено'
const AD_MONTH_TAG = /^[a-zа-яіїє]{3,9}\d{2,4}$/i

// `nov26_AI Motion designer_concept1_stat_v1_cv` -> "AI Motion designer".
// The vacancy is the segment after the month tag; ads that do not follow it return ''.
export function parseAdVacancy(adName) {
  const parts = String(adName || '')
    .split('_')
    .map((part) => part.trim())

  if (parts.length >= 3 && AD_MONTH_TAG.test(parts[0]) && parts[1]) return parts[1]
  return ''
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
  // The biggest spender of the group is always a leader (Meta gave it the budget), even when the
  // budget is spread evenly; any other ad above the share threshold is a leader too.
  const topSpend = Math.max(0, ...withShare.map((item) => item.spend))
  const leaders = withShare.filter(
    (item) =>
      item.spend > 0 && (item.spend === topSpend || item.sharePct >= thresholds.leaderMinSharePct),
  )
  const leaderCtr = leaders.length ? Math.max(...leaders.map((item) => item.ctr)) : null
  // The weakest ad of the group: the lowest CTR among the ads that got enough impressions,
  // and below the leader's CTR. Needs at least two ads in the group to be meaningful.
  const candidates = withShare.filter(
    (item) =>
      !leaders.includes(item) &&
      item.impressions >= thresholds.weakMinImpressions &&
      item.ctr < leaderCtr,
  )
  const weakest =
    creatives.length >= 2 && leaders.length
      ? candidates.reduce((worst, item) => (!worst || item.ctr < worst.ctr ? item : worst), null)
      : null

  return withShare.map((item) => {
    let label = ''

    if (leaders.includes(item)) label = 'leader'
    else if (item === weakest) label = 'weak'

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

// ---------- platforms, campaigns, vacancies ----------

export const PLATFORMS = ['meta', 'linkedin']
const PLATFORM_LABELS = { meta: 'Meta Ads', linkedin: 'LinkedIn' }

// "AI  Motion «Designer»" -> "ai motion designer": one vacancy across platforms.
export function vacancyKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/["'“”„«»‘’`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// We only run vacancies on LinkedIn, so every LinkedIn campaign is a vacancy. The vacancy name comes
// from the template when it is used, otherwise from the ad name or, failing that, the campaign name.
function resolveCampaignType(platform, name) {
  const parsed = parseCampaignName(name)
  if (platform === 'linkedin') {
    return { type: 'vac', title: parsed.type === 'vac' ? parsed.title : String(name || '').trim() }
  }
  return parsed
}

function platformSources(snapshot) {
  const sources = [
    { platform: 'meta', rows: snapshot?.rows || [], ads: snapshot?.ads || {}, campaignReach: snapshot?.campaignReach },
  ]
  const linkedin = snapshot?.linkedin

  if (linkedin && Array.isArray(linkedin.rows) && linkedin.rows.length) {
    sources.push({ platform: 'linkedin', rows: linkedin.rows, ads: linkedin.ads || {}, campaignReach: null })
  }

  return sources
}

// A/B tests are encoded in names: `..._cv` / `..._no_cv` (CV required or not) and `..._general` /
// `..._лукалай(к)` (audience). Looked up in the ad name first, then in the ad set name it ran in.
// Returns '' for a dimension the text does not mention.
function testTagsFromText(text) {
  const joined = `_${String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґ]+/g, '_')}_`

  const cv = /_(no|without|без)_?cv_/.test(joined) ? 'no_cv' : /_cv_/.test(joined) ? 'cv' : ''
  const audience = /_(lookalikes?|look_a_likes?|lal|лукалай[^_]*)_/.test(joined)
    ? 'lookalike'
    : /_(generals?|broad|генерал[^_]*|широк[^_]*)_/.test(joined)
      ? 'general'
      : ''

  return { cv, audience }
}

export function parseTestTags(adName, adsetName = '') {
  const parts = String(adName || '')
    .split('_')
    .map((part) => part.trim())
  // Skip `nov26_<Vacancy>` so a word in the vacancy name is not read as a tag.
  const rest = parts.length >= 3 && AD_MONTH_TAG.test(parts[0]) ? parts.slice(2) : parts

  const fromAd = testTagsFromText(rest.join('_'))
  const fromAdset = testTagsFromText(adsetName)

  return { cv: fromAd.cv || fromAdset.cv, audience: fromAd.audience || fromAdset.audience }
}

const TEST_LABELS = { cv: 'З CV', no_cv: 'Без CV', general: 'General', lookalike: 'Lookalike', other: 'Інше' }
const TEST_ORDER = ['cv', 'no_cv', 'general', 'lookalike', 'other']

// Splits the ads of one vacancy into test arms. A dimension is a test only when its values differ
// between ads (cv vs no_cv, general vs lookalike); otherwise the vacancy stays one group.
export function splitIntoTests(creatives) {
  const tags = creatives.map((item) => parseTestTags(item.name, item.adsetName))
  const varies = (field) => new Set(tags.map((tag) => tag[field]).filter(Boolean)).size >= 2
  const useCv = varies('cv')
  const useAudience = varies('audience')

  if (!useCv && !useAudience) return [{ key: 'all', label: '', creatives }]

  const arms = new Map()
  creatives.forEach((item, index) => {
    const parts = [
      useCv ? tags[index].cv || 'other' : '',
      useAudience ? tags[index].audience || 'other' : '',
    ].filter(Boolean)
    const key = parts.join('|')

    if (!arms.has(key)) {
      arms.set(key, { key, label: parts.map((part) => TEST_LABELS[part]).join(' · '), order: parts.map((part) => TEST_ORDER.indexOf(part)), creatives: [] })
    }
    arms.get(key).creatives.push(item)
  })

  return [...arms.values()].sort((a, b) => {
    for (let i = 0; i < Math.max(a.order.length, b.order.length); i += 1) {
      const diff = (a.order[i] ?? 0) - (b.order[i] ?? 0)
      if (diff) return diff
    }
    return 0
  })
}

// Vacancy name of an ad in a vacancy campaign: from the template campaign, else from the ad name.
function vacancyTitleFor(platform, campaignName, adName, resolvedTitle) {
  if (isTemplatedVacancy(campaignName)) return resolvedTitle
  // A LinkedIn campaign without the template is usually named after the vacancy itself.
  return parseAdVacancy(adName) || (platform === 'linkedin' && resolvedTitle) || UNDEFINED_VACANCY
}

// Vacancy campaigns are grouped by (platform, vacancy), because one campaign can hold many vacancies
// (the vacancy is then read from the ad name). Everything else is grouped by campaign.
// Labels and budget shares are calculated inside each group.
function groupPlatformCampaigns({ platform, rows, ads, campaignReach }, typeFilter) {
  const byAd = new Map()

  rows.forEach((row) => {
    if (!byAd.has(row.adId)) byAd.set(row.adId, { totals: emptyTotals(), first: '', last: '' })
    const entry = byAd.get(row.adId)
    addRow(entry.totals, row)

    if ((Number(row.spend) || 0) > 0) {
      if (!entry.first || row.date < entry.first) entry.first = row.date
      if (!entry.last || row.date > entry.last) entry.last = row.date
    }
  })

  const groups = new Map()

  byAd.forEach((entry, adId) => {
    const ad = ads[adId] || {}
    const campaignId = ad.campaignId || `unknown-${adId}`
    const resolved = resolveCampaignType(platform, ad.campaignName)

    if (typeFilter !== 'all' && resolved.type !== typeFilter) return

    const isVacancy = resolved.type === 'vac'
    const vacancyTitle = isVacancy ? vacancyTitleFor(platform, ad.campaignName, ad.name, resolved.title) : ''
    const groupKey = isVacancy ? `vac:${vacancyKey(vacancyTitle)}` : `campaign:${campaignId}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        id: isVacancy ? `${platform}:${groupKey}` : campaignId,
        platform,
        title: isVacancy ? vacancyTitle : resolved.title,
        type: resolved.type,
        creatives: [],
        firstDate: '',
        lastDate: '',
        campaignRefs: new Set(),
        campaignNames: new Set(),
        reachSource: isVacancy ? null : campaignId,
      })
    }

    const group = groups.get(groupKey)
    group.campaignRefs.add(`${platform}:${campaignId}`)
    group.campaignNames.add(ad.campaignName || '')
    group.creatives.push({
      adId,
      platform,
      campaignId,
      name: ad.name || adId,
      adsetName: ad.adsetName || '',
      ...withRatios(entry.totals),
      creative: ad.creative || {},
      status: ad.effectiveStatus || ad.status || '',
    })
    if (entry.first && (!group.firstDate || entry.first < group.firstDate)) group.firstDate = entry.first
    if (entry.last && (!group.lastDate || entry.last > group.lastDate)) group.lastDate = entry.last
  })

  return [...groups.values()].map((group) => {
    const totals = group.creatives.reduce((sum, item) => addRow(sum, item), emptyTotals())
    const names = [...group.campaignNames].filter(Boolean)
    // Daily reach is not additive, so prefer Meta's campaign-level reach for the month.
    // Vacancy groups span campaigns and show no reach.
    const reach = group.reachSource ? campaignReach?.[group.reachSource] ?? totals.reach : 0

    // Vacancy ads are split into A/B test arms; labels and budget shares are calculated per arm.
    const arms = group.type === 'vac' ? splitIntoTests(group.creatives) : [{ key: 'all', label: '', creatives: group.creatives }]
    const labeled = arms
      .flatMap((arm) =>
        labelCreatives(arm.creatives).map((item) => ({ ...item, test: arm.key, testLabel: arm.label })),
      )
      .sort((a, b) => b.spend - a.spend)
    const tests =
      arms.length > 1
        ? arms.map((arm) => {
            const members = labeled.filter((item) => item.test === arm.key)
            const armTotals = withRatios(members.reduce((sum, item) => addRow(sum, item), emptyTotals()))
            return {
              key: arm.key,
              label: arm.label,
              spend: armTotals.spend,
              clicks: armTotals.clicks,
              impressions: armTotals.impressions,
              ctr: armTotals.ctr,
              cpc: armTotals.cpc,
              adIds: members.map((item) => item.adId),
            }
          })
        : []

    return {
      ...group,
      reachSource: undefined,
      name: names.join(' · '),
      campaignNames: names,
      campaignRefs: [...group.campaignRefs],
      ...withRatios(totals),
      reach,
      tests,
      creatives: labeled,
    }
  })
}

function sortCampaigns(campaigns) {
  return campaigns.sort((a, b) =>
    a.type === b.type
      ? b.spend - a.spend
      : TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
  )
}

// Meta + LinkedIn campaigns of the selected type. LinkedIn never carries "subs"/"aw",
// so those filters naturally show Meta only.
export function buildCampaigns(snapshot, typeFilter = 'all') {
  const campaigns = platformSources(snapshot).flatMap((source) => groupPlatformCampaigns(source, typeFilter))
  return sortCampaigns(campaigns)
}

export function totalsOf(campaigns) {
  const totals = campaigns.reduce((sum, campaign) => addRow(sum, campaign), emptyTotals())
  const ratios = withRatios(totals)
  const followCampaigns = campaigns.filter((campaign) => campaign.follows > 0)
  const followSpend = followCampaigns.reduce((sum, campaign) => sum + campaign.spend, 0)

  return { ...ratios, cpf: totals.follows ? followSpend / totals.follows : 0 }
}

function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000)
}

// Days with spend > 0. "Still running" = the month is the current one and the last spend was
// yesterday or today; then `end` is null ("зараз"). Days are counted to the last spend day.
function runWindow(firstDate, lastDate, monthKey, today) {
  if (!firstDate || !lastDate) return { start: '', end: null, days: 0, lastDate: '' }

  const running = today.slice(0, 7) === monthKey && lastDate >= addDays(today, -1)
  return {
    start: firstDate,
    end: running ? null : lastDate,
    days: daysBetween(firstDate, lastDate) + 1,
    lastDate,
  }
}

function platformBlock(platform, campaigns, monthKey, today) {
  const spend = campaigns.reduce((sum, campaign) => sum + campaign.spend, 0)
  const clicks = campaigns.reduce((sum, campaign) => sum + campaign.clicks, 0)
  const impressions = campaigns.reduce((sum, campaign) => sum + campaign.impressions, 0)
  const firstDate = campaigns.map((c) => c.firstDate).filter(Boolean).sort()[0] || ''
  const lastDate = campaigns.map((c) => c.lastDate).filter(Boolean).sort().at(-1) || ''
  const campaignNames = [...new Set(campaigns.flatMap((campaign) => campaign.campaignNames))]

  return {
    platform,
    label: PLATFORM_LABELS[platform],
    campaigns: campaignNames,
    tests: campaigns.flatMap((campaign) => campaign.tests || []),
    ...runWindow(firstDate, lastDate, monthKey, today),
    spend,
    clicks,
    impressions,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cpc: clicks ? spend / clicks : 0,
    creatives: campaigns
      .flatMap((campaign) => campaign.creatives)
      .sort((a, b) => b.spend - a.spend),
  }
}

// One card per vacancy, regardless of how many platforms ran it.
export function buildVacancies(campaigns, { applies = {}, monthKey, today = todayIso() }) {
  const groups = new Map()

  campaigns
    .filter((campaign) => campaign.type === 'vac')
    .forEach((campaign) => {
      const key = vacancyKey(campaign.title)
      if (!groups.has(key)) groups.set(key, { key, title: campaign.title, campaigns: [] })
      groups.get(key).campaigns.push(campaign)
    })

  return [...groups.values()]
    .map((group) => {
      const blocks = PLATFORMS.map((platform) => {
        const list = group.campaigns.filter((campaign) => campaign.platform === platform)
        return list.length ? platformBlock(platform, list, monthKey, today) : null
      }).filter(Boolean)

      const spend = blocks.reduce((sum, block) => sum + block.spend, 0)
      const clicks = blocks.reduce((sum, block) => sum + block.clicks, 0)
      const impressions = blocks.reduce((sum, block) => sum + block.impressions, 0)
      const start = blocks.map((block) => block.start).filter(Boolean).sort()[0] || ''
      const lastDate = blocks.map((block) => block.lastDate).filter(Boolean).sort().at(-1) || ''
      const running = blocks.some((block) => block.start && block.end === null)
      const entered = applies[group.key]
      const hasApplies = entered !== undefined && entered !== null

      return {
        key: group.key,
        title: group.title,
        start,
        end: running ? null : lastDate || null,
        days: start && lastDate ? daysBetween(start, lastDate) + 1 : 0,
        spend,
        clicks,
        impressions,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpc: clicks ? spend / clicks : 0,
        applies: hasApplies ? entered : null,
        costPerApply: hasApplies && entered > 0 ? spend / entered : null,
        platforms: blocks,
      }
    })
    .sort((a, b) => {
      // Vacancies that ran on Meta (alone or with LinkedIn) first, LinkedIn-only ones below them.
      const aMeta = a.platforms.some((block) => block.platform === 'meta') ? 0 : 1
      const bMeta = b.platforms.some((block) => block.platform === 'meta') ? 0 : 1
      return aMeta - bMeta || b.spend - a.spend
    })
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
  const series = Object.fromEntries(TYPE_ORDER.map((type) => [type, weeks.map(() => 0)]))
  const byVacancy = new Map()

  platformSources(snapshot).forEach((source) => {
    source.rows.forEach((row) => {
      const ad = source.ads[row.adId]
      const resolved = resolveCampaignType(source.platform, ad?.campaignName)
      if (typeFilter !== 'all' && resolved.type !== typeFilter) return

      const index = weeks.findIndex((week) => row.date >= week.start && row.date <= week.end)
      if (index === -1) return
      const spend = Number(row.spend) || 0
      series[resolved.type][index] += spend

      // With the "Вакансії" filter the chart is split per vacancy instead of per type.
      if (typeFilter === 'vac') {
        const title = vacancyTitleFor(source.platform, ad?.campaignName, ad?.name, resolved.title)
        const key = vacancyKey(title)
        if (!byVacancy.has(key)) byVacancy.set(key, { key, title, total: 0, values: weeks.map(() => 0) })
        const entry = byVacancy.get(key)
        entry.values[index] += spend
        entry.total += spend
      }
    })
  })

  const vacancies =
    typeFilter === 'vac'
      ? (() => {
          const sorted = [...byVacancy.values()].sort((a, b) => b.total - a.total)
          return {
            order: sorted.map(({ key, title, total }) => ({ key, title, total })),
            series: Object.fromEntries(sorted.map((entry) => [entry.key, entry.values])),
          }
        })()
      : null

  return {
    labels: weeks.map((week) => week.label),
    series,
    types: TYPE_ORDER.filter((type) => series[type].some((value) => value > 0)),
    vacancies,
  }
}

export function buildByType(campaigns, vacancies = []) {
  const applies = vacancies.reduce((sum, vacancy) => sum + (vacancy.applies || 0), 0)

  return TYPE_ORDER.map((type) => {
    const list = campaigns.filter((campaign) => campaign.type === type)
    if (!list.length) return null

    const totals = totalsOf(list)
    return {
      type,
      label: CAMPAIGN_TYPES[type].label,
      campaigns: new Set(list.flatMap((campaign) => campaign.campaignRefs)).size,
      creatives: list.reduce((sum, campaign) => sum + campaign.creatives.length, 0),
      spend: totals.spend,
      clicks: totals.clicks,
      ctr: totals.ctr,
      cpc: totals.cpc,
      follows: totals.follows,
      cpf: totals.cpf,
      reach: totals.reach,
      platforms: PLATFORMS.filter((platform) => list.some((campaign) => campaign.platform === platform)).map(
        (platform) => PLATFORM_LABELS[platform],
      ),
      ...(type === 'vac' ? { applies } : {}),
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
  const adsText = (count) => `${count} ${plural(count, 'оголошення', 'оголошення', 'оголошень')}`

  const vac = campaigns.filter((campaign) => campaign.type === 'vac')
  if (vac.length) {
    const vacancyList = buildVacancies(vac, { monthKey: '' })
    const meta = vac.filter((campaign) => campaign.platform === 'meta')
    const linkedin = vac.filter((campaign) => campaign.platform === 'linkedin')
    const linkedinVacancies = new Set(linkedin.map((campaign) => vacancyKey(campaign.title))).size
    const parts = []

    if (meta.length) {
      parts.push(
        `Meta: ${creativesText(creativesCount(meta))}, ${money(meta.reduce((sum, c) => sum + c.spend, 0))}`,
      )
    }
    if (linkedin.length) {
      parts.push(
        `LinkedIn для ${linkedinVacancies} ${plural(linkedinVacancies, 'вакансії', 'вакансій', 'вакансій')}: ${adsText(
          creativesCount(linkedin),
        )}, ${money(linkedin.reduce((sum, c) => sum + c.spend, 0))}`,
      )
    }

    items.push({
      lead: `Просували ${vacancyList.length} ${plural(vacancyList.length, 'вакансію', 'вакансії', 'вакансій')}`,
      text: ` — ${vacancyList.map((vacancy) => vacancy.title).join(', ')}. ${parts.join('; ')}.`,
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
    const linkedinCount = other.filter((campaign) => campaign.platform === 'linkedin').length
    items.push({
      lead: `${other.length} ${plural(other.length, 'кампанію', 'кампанії', 'кампаній')} не розпізнано`,
      text: ` — перейменуйте за шаблоном «UNI | Тип | Назва | ММ.РРРР», щоб вони потрапили у свій тип${
        linkedinCount ? ` (з них у LinkedIn: ${linkedinCount})` : ''
      }.`,
    })
  }

  return items
}

// Status block for the response: 'ok' | 'not_configured' | 'error' | 'pending'.
export function describeLinkedIn(snapshot, configured) {
  if (!configured) return { status: 'not_configured' }

  const linkedin = snapshot?.linkedin
  if (!linkedin) return { status: 'pending', message: 'Дані LinkedIn ще не завантажені.' }

  return {
    status: linkedin.status || 'ok',
    ...(linkedin.message ? { message: linkedin.message } : {}),
    ...(linkedin.asOf ? { asOf: linkedin.asOf } : {}),
  }
}

// Per-platform totals for the KPI tiles; only platforms that have data are listed.
function platformTotals(campaigns) {
  const result = {}

  ;['meta', 'linkedin'].forEach((platform) => {
    const own = campaigns.filter((campaign) => (campaign.platform || 'meta') === platform)
    if (!own.length) return

    const totals = totalsOf(own)
    result[platform] = {
      spend: totals.spend,
      impressions: totals.impressions,
      clicks: totals.clicks,
      ctr: totals.ctr,
      cpc: totals.cpc,
      follows: totals.follows,
      reach: totals.reach,
    }
  })

  return result
}

export function buildReport({
  snapshot,
  previousSnapshot,
  typeFilter = 'all',
  today = todayIso(),
  applies = {},
  linkedinConfigured = false,
}) {
  const type = normalizeTypeFilter(typeFilter)
  const monthKey = snapshot.month
  const range = monthRange(monthKey, today) || { since: monthFirstDay(monthKey), until: monthFirstDay(monthKey) }
  const campaigns = buildCampaigns(snapshot, type)
  const totals = totalsOf(campaigns)
  const previousCampaigns = previousSnapshot ? buildCampaigns(previousSnapshot, type) : null
  const previousTotals = previousCampaigns?.length ? totalsOf(previousCampaigns) : null
  const currency = snapshot.currency || 'USD'
  const vacancies = buildVacancies(campaigns, { applies, monthKey, today })
  const missing = vacancies.filter((vacancy) => vacancy.applies === null).length

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
      byPlatform: platformTotals(campaigns),
      previousMonth: previousSnapshot?.month || previousMonthKey(monthKey),
      applies: vacancies.reduce((sum, vacancy) => sum + (vacancy.applies || 0), 0),
      vacanciesCount: vacancies.length,
      vacanciesMissingApplies: missing,
    },
    weeks: buildWeeks(snapshot, type, range),
    byType: buildByType(campaigns, vacancies),
    did: buildDid(campaigns, currency),
    campaigns,
    vacancies,
    otherCampaigns: campaigns.filter((campaign) => campaign.type !== 'vac'),
    linkedin: describeLinkedIn(snapshot, linkedinConfigured),
    counts: {
      campaigns: new Set(campaigns.flatMap((campaign) => campaign.campaignRefs)).size,
      creatives: campaigns.reduce((sum, campaign) => sum + campaign.creatives.length, 0),
    },
    unrecognized: campaigns.filter((campaign) => campaign.type === 'other').length,
  }
}

// Hash of what the AI sees: when it changes, the analysis is stale.
export function analysisInputHash(campaigns) {
  const payload = campaigns.map((campaign) => ({
    id: `${campaign.platform || 'meta'}:${campaign.id}`,
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
