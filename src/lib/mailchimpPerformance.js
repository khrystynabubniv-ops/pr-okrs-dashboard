import { MAILCHIMP_PERFORMANCE_CONFIG, MONTHS } from '../constants'

const UK_MONTH_NAMES = [
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

const MONTH_ALIASES = [
  ['січень', 'january'],
  ['лютий', 'february'],
  ['березень', 'march'],
  ['квітень', 'april'],
  ['травень', 'may'],
  ['червень', 'june'],
  ['липень', 'july'],
  ['серпень', 'august'],
  ['вересень', 'september'],
  ['жовтень', 'october'],
  ['листопад', 'november'],
  ['грудень', 'december'],
]

export function buildMailchimpPerformance(
  payload = {},
  selectedMonth,
  config = MAILCHIMP_PERFORMANCE_CONFIG,
) {
  const currentPayload = payload.current || payload
  const previousPayload = payload.previous || {}
  const currentCampaigns = normalizeCampaigns(currentPayload.campaigns)
  const previousCampaigns = normalizeCampaigns(previousPayload.campaigns)
  const realCurrentCampaigns = filterRealCampaigns(currentCampaigns, config)
  const realPreviousCampaigns = filterRealCampaigns(previousCampaigns, config)
  const currentMetrics = aggregateCampaigns(realCurrentCampaigns)
  const previousMetrics = aggregateCampaigns(realPreviousCampaigns)
  const previousMonth = payload.previous?.month || previousMonthLabel(selectedMonth)
  const audience = normalizeAudience(payload.audience, selectedMonth)
  const bestCampaign = bestCampaignByClickRate(realCurrentCampaigns)
  const campaigns = realCurrentCampaigns
    .map((campaign) => ({
      ...campaign,
      isBest: bestCampaign ? campaign.id === bestCampaign.id : false,
      isWeakClickRate:
        hasNumber(campaign.clickRate) &&
        campaign.clickRate < config.thresholds.weakClickRate,
    }))
    .sort(sortCampaignsByDateDesc)

  return {
    hasCampaigns: realCurrentCampaigns.length > 0,
    selectedMonth,
    previousMonth,
    totalCampaigns: currentCampaigns.length,
    excludedCampaigns: currentCampaigns.length - realCurrentCampaigns.length,
    config,
    engagement: {
      openRate: rateMetric({
        value: currentMetrics.openRate,
        previousValue: previousMetrics.openRate,
        benchmark: config.industryBenchmarks.openRate,
      }),
      clickRate: rateMetric({
        value: currentMetrics.clickRate,
        previousValue: previousMetrics.clickRate,
        benchmark: config.industryBenchmarks.clickRate,
      }),
      reach: {
        uniqueOpens: currentMetrics.uniqueOpens,
        emailsSent: currentMetrics.emailsSent,
      },
    },
    health: {
      baseGrowth: {
        netNew: audience.currentGrowth?.netNew ?? null,
        memberCount: audience.memberCount,
        hasData:
          audience.memberCount !== null || audience.currentGrowth?.netNew !== undefined,
      },
      unsubscribes: {
        rate: currentMetrics.unsubscribeRate,
        count: currentMetrics.unsubscribed,
        isWarning:
          hasNumber(currentMetrics.unsubscribeRate) &&
          currentMetrics.unsubscribeRate > config.thresholds.unsubscribeRateWarning,
      },
      bounce: {
        rate: currentMetrics.bounceRate,
        count: currentMetrics.totalBounces,
        isCritical:
          hasNumber(currentMetrics.bounceRate) &&
          currentMetrics.bounceRate > config.thresholds.bounceRateWarning,
        threshold: config.thresholds.bounceRateWarning,
      },
    },
    campaigns,
    bestCampaignId: bestCampaign?.id || null,
  }
}

export function hasMailchimpPerformanceData(summary) {
  return Boolean(summary?.hasCampaigns)
}

export function previousMonthLabel(month) {
  const knownIndex = MONTHS.indexOf(month)
  if (knownIndex > 0) return MONTHS[knownIndex - 1]

  const parsed = parseMonthLabel(month)
  if (!parsed) return ''

  const previousDate = new Date(Date.UTC(parsed.year, parsed.monthIndex - 1, 1))
  return `${UK_MONTH_NAMES[previousDate.getUTCMonth()]} ${previousDate.getUTCFullYear()}`
}

function normalizeCampaigns(campaigns = []) {
  return (Array.isArray(campaigns) ? campaigns : []).map((campaign, index) => ({
    id: textValue(campaign.id || campaign.campaignId || `campaign-${index + 1}`),
    title: textValue(campaign.title || campaign.name || campaign.subject),
    subject: textValue(campaign.subject),
    listName: textValue(campaign.listName),
    sendTime: textValue(campaign.sendTime),
    archiveUrl: textValue(campaign.archiveUrl),
    emailsSent: numberValue(campaign.emailsSent),
    delivered: numberValue(campaign.delivered),
    uniqueOpens: numberValue(campaign.uniqueOpens),
    uniqueSubscriberClicks: numberValue(campaign.uniqueSubscriberClicks),
    unsubscribed: numberValue(campaign.unsubscribed),
    totalBounces: numberValue(campaign.totalBounces),
    openRate: nullableNumberValue(campaign.openRate),
    clickRate: nullableNumberValue(campaign.clickRate),
  }))
}

function filterRealCampaigns(campaigns, config) {
  return campaigns.filter((campaign) => {
    const haystack = normalizeSearchText(`${campaign.title} ${campaign.subject}`)
    const hasExcludedTitle = config.excludedCampaignTitleTerms.some((term) =>
      haystack.includes(normalizeSearchText(term)),
    )
    const hasEnoughRecipients =
      campaign.emailsSent >= config.thresholds.minCampaignRecipients

    return !hasExcludedTitle && hasEnoughRecipients
  })
}

function aggregateCampaigns(campaigns) {
  const totals = campaigns.reduce(
    (summary, campaign) => {
      summary.campaigns += 1
      summary.emailsSent += campaign.emailsSent
      summary.delivered += campaign.delivered
      summary.uniqueOpens += campaign.uniqueOpens
      summary.uniqueSubscriberClicks += campaign.uniqueSubscriberClicks
      summary.unsubscribed += campaign.unsubscribed
      summary.totalBounces += campaign.totalBounces
      return summary
    },
    {
      campaigns: 0,
      emailsSent: 0,
      delivered: 0,
      uniqueOpens: 0,
      uniqueSubscriberClicks: 0,
      unsubscribed: 0,
      totalBounces: 0,
    },
  )

  return {
    ...totals,
    openRate: rateFromTotals(totals.uniqueOpens, totals.delivered, campaigns, 'openRate'),
    clickRate: rateFromTotals(
      totals.uniqueSubscriberClicks,
      totals.delivered,
      campaigns,
      'clickRate',
    ),
    unsubscribeRate: totals.delivered
      ? roundRate((totals.unsubscribed / totals.delivered) * 100)
      : null,
    bounceRate: totals.emailsSent
      ? roundRate((totals.totalBounces / totals.emailsSent) * 100)
      : null,
  }
}

function rateFromTotals(numerator, denominator, campaigns, fallbackField) {
  if (denominator) return roundRate((numerator / denominator) * 100)

  const rates = campaigns
    .map((campaign) => campaign[fallbackField])
    .filter((value) => hasNumber(value))

  if (!rates.length) return null
  return roundRate(rates.reduce((sum, value) => sum + value, 0) / rates.length)
}

function rateMetric({ value, previousValue, benchmark }) {
  return {
    value,
    delta:
      hasNumber(value) && hasNumber(previousValue)
        ? roundRate(value - previousValue)
        : null,
    benchmark,
    benchmarkStatus:
      hasNumber(value) && hasNumber(benchmark) && value >= benchmark ? 'good' : 'watch',
  }
}

function normalizeAudience(audience = {}, selectedMonth) {
  const growthHistory = Array.isArray(audience.growthHistory)
    ? audience.growthHistory.map(normalizeGrowthHistoryItem)
    : []
  const currentMonthKey = monthKeyFromLabel(selectedMonth)
  const currentGrowth =
    growthHistory.find((item) => item.monthKey === currentMonthKey) || null

  return {
    memberCount: nullableNumberValue(audience.memberCount),
    growthHistory,
    currentGrowth,
  }
}

function normalizeGrowthHistoryItem(item = {}) {
  const imports = numberValue(item.imports)
  const optins = numberValue(item.optins)
  const unsubscribed = numberValue(
    item.unsubscribed ?? item.unsubscribes ?? item.unsubs,
  )
  const cleaned = numberValue(item.cleaned ?? item.cleans)
  const netNew = firstNullableNumber([
    item.netNew,
    item.net_new,
    item.memberCountChange,
    item.member_count_change,
    item.growth,
    imports + optins - unsubscribed - cleaned,
  ])

  return {
    month: textValue(item.month),
    monthKey: monthKeyFromValue(item.month),
    existing: nullableNumberValue(item.existing),
    imports,
    optins,
    unsubscribed,
    cleaned,
    netNew,
  }
}

function bestCampaignByClickRate(campaigns) {
  return campaigns.reduce((best, campaign) => {
    if (!best) return campaign
    const currentClickRate = hasNumber(campaign.clickRate) ? campaign.clickRate : -1
    const bestClickRate = hasNumber(best.clickRate) ? best.clickRate : -1
    if (currentClickRate !== bestClickRate) {
      return currentClickRate > bestClickRate ? campaign : best
    }
    return numberValue(campaign.openRate) > numberValue(best.openRate) ? campaign : best
  }, null)
}

function sortCampaignsByDateDesc(left, right) {
  return Date.parse(right.sendTime || 0) - Date.parse(left.sendTime || 0)
}

function parseMonthLabel(value) {
  const text = textValue(value)
  if (!text) return null

  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] || new Date().getFullYear())
  const knownIndex = MONTHS.indexOf(text)
  if (knownIndex >= 0) return { year, monthIndex: knownIndex }

  const normalized = normalizeSearchText(text)
  const monthIndex = MONTH_ALIASES.findIndex((aliases) =>
    aliases.some((alias) => normalized.includes(normalizeSearchText(alias))),
  )

  return monthIndex >= 0 ? { year, monthIndex } : null
}

function monthKeyFromLabel(value) {
  const parsed = parseMonthLabel(value)
  return parsed ? formatMonthKey(parsed.year, parsed.monthIndex) : ''
}

function monthKeyFromValue(value) {
  const text = textValue(value)
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})\b/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`
  return monthKeyFromLabel(text)
}

function formatMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function normalizeSearchText(value) {
  return textValue(value).toLowerCase().replace(/\s+/g, ' ')
}

function roundRate(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.round(number * 10) / 10
}

function firstNullableNumber(values) {
  for (const value of values) {
    const number = nullableNumberValue(value)
    if (number !== null) return number
  }
  return null
}

function textValue(value) {
  return String(value || '').trim()
}

function numberValue(value) {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function nullableNumberValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function hasNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}
