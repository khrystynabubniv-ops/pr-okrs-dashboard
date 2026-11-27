// Shared helpers for the Promo Results page.

import { MONTHS } from '../constants'

// 'Листопад 2026' -> '2026-11'. The only place that converts the global month label.
export function promoMonthKey(monthLabel) {
  const index = MONTHS.indexOf(monthLabel)
  const year = Number(String(monthLabel || '').match(/\d{4}/)?.[0])
  if (index === -1 || !year) return ''
  return `${year}-${String(index + 1).padStart(2, '0')}`
}

export const PROMO_TYPE_FILTERS = [
  { key: 'all', label: 'Усі' },
  { key: 'vac', label: 'Вакансії' },
  { key: 'subs', label: 'Підписники' },
  { key: 'aw', label: 'Awareness' },
]

// Chart colors + tag classes (see Promo.css). Same palette for chart, legend and tags.
export const PROMO_TYPES = {
  vac: { label: 'Вакансії', singular: 'Вакансія', color: '#6560e8', tagClass: 'pr-tag' },
  subs: { label: 'Підписники', singular: 'Підписники', color: '#58aee0', tagClass: 'pr-tag pr-tag-sky' },
  aw: { label: 'Awareness', singular: 'Awareness', color: '#e38bab', tagClass: 'pr-tag pr-tag-rose' },
  other: { label: 'Не розпізнано', singular: 'Без типу', color: '#d3d4de', tagClass: 'pr-tag pr-tag-mute' },
}

// Chart colors for the per-vacancy view ("Вакансії" filter); extra vacancies are grouped into "Інші".
export const VACANCY_COLORS = [
  '#6560e8',
  '#58aee0',
  '#e38bab',
  '#f0a35e',
  '#5fc3a1',
  '#b08cf0',
  '#e0c455',
  '#8a8ca0',
]
export const VACANCY_OTHERS_COLOR = '#d3d4de'

// Weekly series per vacancy -> chart rows, legend and tooltip names (top 8 + "Інші").
export function vacancyChartModel(weeks) {
  const { order, series } = weeks.vacancies
  const shown = order.slice(0, VACANCY_COLORS.length)
  const rest = order.slice(VACANCY_COLORS.length)
  const bars = shown.map((item, index) => ({
    dataKey: `v${index}`,
    label: item.title,
    color: VACANCY_COLORS[index],
    values: series[item.key],
  }))

  if (rest.length) {
    bars.push({
      dataKey: 'vOthers',
      label: `Інші вакансії (${rest.length})`,
      color: VACANCY_OTHERS_COLOR,
      values: weeks.labels.map((_, week) => rest.reduce((sum, item) => sum + series[item.key][week], 0)),
    })
  }

  const data = weeks.labels.map((week, index) => ({
    week,
    ...Object.fromEntries(bars.map((bar) => [bar.dataKey, bar.values[index]])),
  }))

  return { bars, data }
}

export const CREATIVE_LABELS = {
  leader: { text: 'лідер', tone: 'good' },
  weak: { text: 'найслабший', tone: 'warn' },
}

export const PROMO_README_URL =
  'https://github.com/khrystynabubniv-ops/pr-okrs-dashboard#meta-ads-promo-page'

const MONTH_GENITIVE = [
  'січня',
  'лютого',
  'березня',
  'квітня',
  'травня',
  'червня',
  'липня',
  'серпня',
  'вересня',
  'жовтня',
  'листопада',
  'грудня',
]

const numberFormat = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 })

export function formatInt(value) {
  return numberFormat.format(Math.round(Number(value) || 0))
}

export function formatCompactNumber(value) {
  const number = Number(value) || 0
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)}M`
  if (number >= 1e4) return `${Math.round(number / 1e3)}K`
  return formatInt(number)
}

export function currencySymbol(currency) {
  return { USD: '$', EUR: '€', UAH: '₴' }[currency] || `${currency || '$'} `
}

// Totals: whole units from 100 up, cents below.
export function formatMoney(value, currency = 'USD') {
  const number = Number(value) || 0
  const symbol = currencySymbol(currency)
  if (number >= 100) return `${symbol}${numberFormat.format(Math.round(number))}`
  return `${symbol}${number % 1 === 0 ? String(number) : number.toFixed(2)}`
}

// Unit prices (CPC, cost per follower): always cents.
export function formatUnitMoney(value, currency = 'USD') {
  return `${currencySymbol(currency)}${(Number(value) || 0).toFixed(2)}`
}

export function formatPercent(value, digits = 1) {
  return `${(Number(value) || 0).toFixed(digits)}%`
}

export function pluralUk(count, one, few, many) {
  const n = Math.abs(count) % 100
  const last = n % 10
  if (n > 10 && n < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

export function commentsLabel(count) {
  if (!count) return 'Додати коментар'
  return `${count} ${pluralUk(count, 'коментар', 'коментарі', 'коментарів')}`
}

function pad(value) {
  return String(value).padStart(2, '0')
}

export function formatDayMonth(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`
}

export function formatTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isToday(iso) {
  const date = new Date(iso)
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

// "сьогодні о 09:12" / "17.11 о 09:12"
export function formatUpdatedAt(iso) {
  if (!iso) return ''
  return isToday(iso)
    ? `сьогодні о ${formatTime(iso)}`
    : `${formatDayMonth(iso)} о ${formatTime(iso)}`
}

export function formatAnalysisDate(iso) {
  return iso ? `${formatDayMonth(iso)}, ${formatTime(iso)}` : ''
}

export function formatDuration(seconds) {
  const total = Math.round(Number(seconds) || 0)
  if (!total) return ''
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

// Delta vs previous month: { text, tone } or null. `kind` is 'percent' or 'points'.
export function formatDelta(value, previousMonthKey, { inverse = false, kind = 'percent' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null

  const monthIndex = Number(String(previousMonthKey || '').slice(5, 7)) - 1
  const month = MONTH_GENITIVE[monthIndex] || 'минулого місяця'
  const rounded = kind === 'points' ? Math.round(value * 10) / 10 : Math.round(value)
  const sign = rounded > 0 ? '▲ +' : rounded < 0 ? '▼ −' : '● '
  const amount = Math.abs(rounded)
  const body = kind === 'points' ? `${amount} pp` : `${amount}%`
  const good = inverse ? rounded < 0 : rounded > 0

  return {
    text: `${sign}${body} до ${month}`,
    tone: rounded === 0 ? 'flat' : good ? 'up' : 'down',
  }
}

export function creativeMetrics(creative, campaignType, currency) {
  if (campaignType === 'subs') {
    return [
      { label: 'Followers', value: `+${formatInt(creative.follows)}` },
      { label: 'CPF', value: creative.follows ? formatUnitMoney(creative.cpf, currency) : '—' },
      { label: 'CTR', value: formatPercent(creative.ctr) },
    ]
  }

  return [
    { label: 'Clicks', value: formatInt(creative.clicks) },
    { label: 'CTR', value: formatPercent(creative.ctr) },
    { label: 'CPC', value: formatUnitMoney(creative.cpc, currency) },
  ]
}

export function campaignMetrics(campaign, currency) {
  if (campaign.type === 'subs') {
    return [
      { label: 'Spend', value: formatMoney(campaign.spend, currency) },
      { label: 'Followers', value: `+${formatInt(campaign.follows)}` },
      { label: 'CPF', value: campaign.follows ? formatUnitMoney(campaign.cpf, currency) : '—' },
      { label: 'Clicks', value: formatInt(campaign.clicks) },
    ]
  }

  return [
    { label: 'Spend', value: formatMoney(campaign.spend, currency) },
    { label: 'Clicks', value: formatInt(campaign.clicks) },
    { label: 'CTR', value: formatPercent(campaign.ctr) },
    { label: 'CPC', value: formatUnitMoney(campaign.cpc, currency) },
  ]
}

export function campaignMonthWord(monthKey) {
  const names = [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень',
  ]
  return names[Number(String(monthKey || '').slice(5, 7)) - 1] || ''
}

export function initials(name) {
  return (
    String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}

export const PLATFORM_LABELS = { meta: 'Meta Ads', linkedin: 'LinkedIn' }

// Bullets of an AI block. Analyses saved before the bullet format carry one paragraph:
// it is split into sentences so old results read the same way.
export function pointsOf(item, textField) {
  if (Array.isArray(item?.points) && item.points.length) return item.points

  return String(item?.[textField] || '')
    .split(/(?<=[.!?])\s+(?=[А-ЯІЇЄҐA-Z«"(])/)
    .map((part) => part.trim())
    .filter(Boolean)
}

// Editor <-> content: one bullet per line of a textarea.
export const pointsToText = (points) => (points || []).join('\n')

export const textToPoints = (text) =>
  String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

// "МАСШТАБУВАТИ: ..." → { lead: 'МАСШТАБУВАТИ', rest: '...' }.
export function splitLead(text) {
  const match = /^([А-ЯІЇЄҐA-Z][А-ЯІЇЄҐA-Z' ]{3,}):\s+([\s\S]*)$/.exec(String(text || ''))
  return match ? { lead: match[1], rest: match[2] } : { lead: '', rest: String(text || '') }
}

// Placeholder text for ads without a preview (LinkedIn does not always give one).
export const KIND_LABELS = {
  photo: 'Single image',
  carousel: 'Carousel',
  document: 'Document',
  video: 'Video',
  text: 'Text',
}

// Finds a creative by (platform, adId) and returns it with what the modal header needs.
export function findCreative(report, platform, adId) {
  const wanted = platform || 'meta'

  for (const vacancy of report?.vacancies || []) {
    for (const block of vacancy.platforms) {
      const creative = block.creatives.find((item) => item.platform === wanted && item.adId === adId)
      if (creative) {
        return { creative, context: { type: 'vac', title: vacancy.title, platform: block.platform } }
      }
    }
  }

  for (const campaign of report?.otherCampaigns || []) {
    const creative = campaign.creatives.find((item) => item.platform === wanted && item.adId === adId)
    if (creative) {
      return { creative, context: { type: campaign.type, title: campaign.title, platform: campaign.platform } }
    }
  }

  return null
}

export function dayWord(count) {
  const n = Number(count) || 0
  return `${n} ${pluralUk(n, 'день', 'дні', 'днів')}`
}

// '2026-11-03' -> '03.11'
export function formatIsoDay(iso) {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : ''
}

export function formatPeriod(start, end) {
  return `${formatIsoDay(start)} – ${end ? formatIsoDay(end) : 'зараз'}`
}

// Optimistic update of everything that depends on a vacancy's applies.
export function applyApplies(report, key, value) {
  const vacancies = report.vacancies.map((vacancy) =>
    vacancy.key === key
      ? { ...vacancy, applies: value, costPerApply: value > 0 ? vacancy.spend / value : null }
      : vacancy,
  )
  const applies = vacancies.reduce((sum, vacancy) => sum + (vacancy.applies || 0), 0)

  return {
    ...report,
    vacancies,
    byType: report.byType.map((row) => (row.type === 'vac' ? { ...row, applies } : row)),
    kpis: {
      ...report.kpis,
      applies,
      vacanciesMissingApplies: vacancies.filter((vacancy) => vacancy.applies === null).length,
    },
  }
}

// Updates commentsCount for one creative everywhere in the report.
export function applyCommentsCount(report, platform, adId, count) {
  const update = (creatives) =>
    creatives.map((creative) =>
      creative.platform === platform && creative.adId === adId && creative.commentsCount !== count
        ? { ...creative, commentsCount: count }
        : creative,
    )

  return {
    ...report,
    vacancies: report.vacancies.map((vacancy) => ({
      ...vacancy,
      platforms: vacancy.platforms.map((block) => ({ ...block, creatives: update(block.creatives) })),
    })),
    otherCampaigns: report.otherCampaigns.map((campaign) => ({
      ...campaign,
      creatives: update(campaign.creatives),
    })),
  }
}

// Updates commentsCount of one vacancy (comments on the vacancy as a whole).
export function applyVacancyCommentsCount(report, key, count) {
  return {
    ...report,
    vacancies: report.vacancies.map((vacancy) =>
      vacancy.key === key && vacancy.commentsCount !== count ? { ...vacancy, commentsCount: count } : vacancy,
    ),
  }
}

export function vacancyCommentsPath(monthKey, vacancyKey, commentId = '') {
  return `/api/promo/vacancies/${encodeURIComponent(vacancyKey)}/comments${
    commentId ? `/${encodeURIComponent(commentId)}` : ''
  }?month=${encodeURIComponent(monthKey)}`
}

export function blockPath(monthKey, type, block) {
  return `/api/promo/blocks/${encodeURIComponent(block)}?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`
}

export function commentsPath(platform, adId, commentId = '') {
  return `/api/promo/creatives/${encodeURIComponent(adId)}/comments${
    commentId ? `/${encodeURIComponent(commentId)}` : ''
  }?platform=${encodeURIComponent(platform || 'meta')}`
}

export function appliesPath(monthKey, vacancyKey) {
  return `/api/promo/vacancies/${encodeURIComponent(vacancyKey)}/applies?month=${encodeURIComponent(monthKey)}`
}

export function promoReportPath(monthKey, type) {
  return `/api/promo?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`
}

export function promoAnalysisPath(monthKey, type) {
  return `/api/promo/analysis?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`
}
