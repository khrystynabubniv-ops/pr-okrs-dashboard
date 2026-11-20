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

export const CREATIVE_LABELS = {
  leader: { text: 'лідер', tone: 'good' },
  retest: { text: 'перетестувати', tone: 'accent' },
  untested: { text: 'не дотестований', tone: 'mute' },
  weak: { text: 'слабкий', tone: 'warn' },
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
      { label: 'Підписники', value: `+${formatInt(creative.follows)}` },
      { label: 'Ціна підп.', value: creative.follows ? formatUnitMoney(creative.cpf, currency) : '—' },
      { label: 'CTR', value: formatPercent(creative.ctr) },
    ]
  }

  return [
    { label: 'Кліки', value: formatInt(creative.clicks) },
    { label: 'CTR', value: formatPercent(creative.ctr) },
    { label: 'Ціна кліку', value: formatUnitMoney(creative.cpc, currency) },
  ]
}

export function campaignMetrics(campaign, currency) {
  if (campaign.type === 'subs') {
    return [
      { label: 'Витрачено', value: formatMoney(campaign.spend, currency) },
      { label: 'Підписники', value: `+${formatInt(campaign.follows)}` },
      { label: 'Ціна підп.', value: campaign.follows ? formatUnitMoney(campaign.cpf, currency) : '—' },
      { label: 'Кліки', value: formatInt(campaign.clicks) },
    ]
  }

  return [
    { label: 'Витрачено', value: formatMoney(campaign.spend, currency) },
    { label: 'Кліки', value: formatInt(campaign.clicks) },
    { label: 'CTR', value: formatPercent(campaign.ctr) },
    { label: 'Ціна кліку', value: formatUnitMoney(campaign.cpc, currency) },
  ]
}

export function monthLabelFromKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-')
  return MONTH_GENITIVE[Number(month) - 1] ? `${MONTH_GENITIVE[Number(month) - 1]} ${year}` : ''
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

export function findCreative(report, adId) {
  for (const campaign of report?.campaigns || []) {
    const creative = campaign.creatives.find((item) => item.adId === adId)
    if (creative) return { creative, campaign }
  }
  return null
}

export function promoReportPath(monthKey, type) {
  return `/api/promo?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`
}

export function promoAnalysisPath(monthKey, type) {
  return `/api/promo/analysis?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`
}
