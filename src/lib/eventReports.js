export const FX_EUR_USD = 1.08

export const REPORT_TYPES = ['event', 'partnership', 'launch']

const integerFormatter = new Intl.NumberFormat('uk-UA', {
  maximumFractionDigits: 0,
})

const euroFormatter = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export const safeDiv = (a, b) => (b && b !== 0 ? a / b : 0)

export function toReportNumber(value) {
  if (value === '' || value === null || value === undefined) return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function toNullableReportNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeCampaign(campaign = {}) {
  return {
    name: String(campaign.name || '').trim(),
    ctype: campaign.ctype === 'Leads' ? 'Leads' : 'Clicks',
    spendEur: toReportNumber(campaign.spendEur),
    result: toReportNumber(campaign.result),
    clicks: toReportNumber(campaign.clicks),
    impressions: toReportNumber(campaign.impressions),
    reach: toReportNumber(campaign.reach),
  }
}

export function normalizeResource(resource = {}) {
  return {
    name: String(resource.name || '').trim(),
    url: String(resource.url || '').trim(),
  }
}

export function defaultDateMode(type) {
  return type === 'event' ? 'single' : 'period'
}

export function normalizeReportInput(report = {}) {
  const type = REPORT_TYPES.includes(report.type) ? report.type : 'event'
  const isEvent = type === 'event'
  const isPartnership = type === 'partnership'
  const isLaunch = type === 'launch'
  const dateMode = report.dateMode === 'single' || report.dateMode === 'period'
    ? report.dateMode
    : defaultDateMode(type)
  const promoEnabled =
    isLaunch ? Boolean(report.promoEnabled) : isEvent
  const tgEnabled = isLaunch ? Boolean(report.tgEnabled) : false
  const hireEnabled = isPartnership ? Boolean(report.hireEnabled) : false
  const partnershipViews = report.views ?? report.partnershipViews
  const partnershipClicks = report.clicks ?? report.partnershipClicks
  const reachUniverse = isLaunch ? toReportNumber(report.reachUniverse) : 0
  const reachClevel = isLaunch ? toReportNumber(report.reachClevel) : 0
  const reachMedia = isLaunch ? toReportNumber(report.reachMedia ?? report.mediaReach) : 0
  const tgReach = tgEnabled ? toReportNumber(report.tgReach) : 0
  const reachPartsTotal = reachUniverse + reachClevel + reachMedia + tgReach
  const legacyReachTotal = toReportNumber(report.reachTotal ?? report.totalReach)
  const linkClicks = isLaunch
    ? toReportNumber(report.linkClicks) || toReportNumber(report.clicks)
    : 0
  const campaigns = Array.isArray(report.campaigns)
    ? report.campaigns.map(normalizeCampaign)
    : []

  return {
    type,
    dateMode,
    name: String(report.name || '').trim(),
    date: String(report.date || ''),
    dateStart: String(report.dateStart || ''),
    dateEnd: String(report.dateEnd || ''),
    description: String(report.description || '').trim(),
    goalText: String(report.goalText || '').trim(),

    leadsGoogle: isEvent ? toReportNumber(report.leadsGoogle) : 0,
    leadsMeta: isEvent ? toReportNumber(report.leadsMeta) : 0,
    confirmed: isEvent ? toReportNumber(report.confirmed) : 0,
    attended: isEvent ? toReportNumber(report.attended) : 0,
    teamCount: isEvent ? toReportNumber(report.teamCount) : 0,
    promoSpendUsd: isEvent ? toReportNumber(report.promoSpendUsd) : 0,
    orgSpendUsd: isEvent ? toReportNumber(report.orgSpendUsd) : 0,
    channels: isEvent ? String(report.channels || '').trim() : '',
    engagement: isEvent ? String(report.engagement || '').trim() : '',
    feedback: isEvent ? String(report.feedback || '').trim() : '',
    notes: isEvent ? String(report.notes || '').trim() : '',

    partnershipCost: isPartnership ? toReportNumber(report.partnershipCost) : 0,
    episodes: isPartnership ? toReportNumber(report.episodes) : 0,
    views: isPartnership ? toReportNumber(partnershipViews) : 0,
    clicks: isPartnership ? toReportNumber(partnershipClicks) : 0,
    hireEnabled,
    hireCount: hireEnabled ? toReportNumber(report.hireCount) : 0,

    promoEnabled,
    campaigns: promoEnabled ? campaigns : [],
    reachTotal: isLaunch ? reachPartsTotal || legacyReachTotal : 0,
    mediaMentions: toReportNumber(report.mediaMentions),
    reachUniverse,
    reachClevel,
    reachMedia,
    linkClicks,
    productResultType: isLaunch ? String(report.productResultType || '').trim() : '',
    productResultValue: isLaunch ? toReportNumber(report.productResultValue) : 0,
    productResultNote: isLaunch ? String(report.productResultNote || '').trim() : '',
    tgEnabled,
    tgChannels: tgEnabled ? toReportNumber(report.tgChannels) : 0,
    tgCost: tgEnabled ? toReportNumber(report.tgCost) : 0,
    tgReach,
    tgPosts: tgEnabled ? toReportNumber(report.tgPosts) : 0,
    tgChannelList: tgEnabled ? String(report.tgChannelList || '').trim() : '',
    otherSpendUsd: isLaunch ? toReportNumber(report.otherSpendUsd) : 0,
    budgetOverride: isLaunch ? toNullableReportNumber(report.budgetOverride) : null,
    resources: isLaunch && Array.isArray(report.resources)
      ? report.resources.map(normalizeResource).filter((item) => item.name || item.url)
      : [],

    aiSummary: String(report.aiSummary || ''),
    aiInsights: Array.isArray(report.aiInsights)
      ? report.aiInsights.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    aiPlanFact: String(report.aiPlanFact || ''),
  }
}

export function compute(report = {}) {
  const normalized = normalizeReportInput(report)
  const campaigns = normalized.campaigns.map((campaign) => ({
    ...campaign,
    cpa: safeDiv(campaign.spendEur, campaign.result),
    cpc: safeDiv(campaign.spendEur, campaign.clicks),
    ctr: safeDiv(campaign.clicks, campaign.impressions) * 100,
  }))
  const campaignTotals = campaigns.reduce(
    (totals, campaign) => ({
      spendEur: totals.spendEur + campaign.spendEur,
      spendUsd: totals.spendUsd + campaign.spendEur * FX_EUR_USD,
      result: totals.result + campaign.result,
      clicks: totals.clicks + campaign.clicks,
      impressions: totals.impressions + campaign.impressions,
      reach: totals.reach + campaign.reach,
    }),
    { spendEur: 0, spendUsd: 0, result: 0, clicks: 0, impressions: 0, reach: 0 },
  )

  if (normalized.type === 'partnership') {
    const totalBudget = normalized.partnershipCost

    return {
      type: normalized.type,
      totalBudget,
      partnershipCost: normalized.partnershipCost,
      episodes: normalized.episodes,
      views: normalized.views,
      clicks: normalized.clicks,
      hireEnabled: normalized.hireEnabled,
      hireCount: normalized.hireCount,
      mediaMentions: normalized.mediaMentions,
      cpv: safeDiv(totalBudget, normalized.views),
      cpc: safeDiv(totalBudget, normalized.clicks),
      costPerHire: normalized.hireCount ? safeDiv(totalBudget, normalized.hireCount) : 0,
      campaigns: [],
      campaignTotals,
    }
  }

  if (normalized.type === 'launch') {
    const budgetAuto =
      campaignTotals.spendUsd + normalized.tgCost + normalized.otherSpendUsd
    const effectiveBudget = normalized.budgetOverride ?? budgetAuto
    const clicksForCpc = normalized.linkClicks || campaignTotals.clicks

    return {
      type: normalized.type,
      totalBudget: effectiveBudget,
      budgetAuto,
      budgetOverride: normalized.budgetOverride,
      effectiveBudget,
      campaignSpendUsd: campaignTotals.spendUsd,
      tgCost: normalized.tgCost,
      otherSpendUsd: normalized.otherSpendUsd,
      reachTotal: normalized.reachTotal,
      reachUniverse: normalized.reachUniverse,
      reachClevel: normalized.reachClevel,
      reachMedia: normalized.reachMedia,
      mediaMentions: normalized.mediaMentions,
      linkClicks: normalized.linkClicks,
      clicks: clicksForCpc,
      campaignClicks: campaignTotals.clicks,
      productResultValue: normalized.productResultValue,
      cpc: safeDiv(effectiveBudget, clicksForCpc),
      cpv: safeDiv(effectiveBudget, normalized.reachTotal),
      campaigns,
      campaignTotals,
    }
  }

  const totalBudget = normalized.promoSpendUsd + normalized.orgSpendUsd
  const funnel = normalized.leadsGoogle + normalized.leadsMeta
  const attendedNoTeam = Math.max(normalized.attended - normalized.teamCount, 0)

  return {
    type: normalized.type,
    totalBudget,
    funnel,
    attendedNoTeam,
    cpa: safeDiv(totalBudget, funnel),
    cpl: safeDiv(totalBudget, normalized.attended),
    cplNoTeam: safeDiv(totalBudget, attendedNoTeam),
    leadsGoogle: normalized.leadsGoogle,
    leadsMeta: normalized.leadsMeta,
    confirmed: normalized.confirmed,
    attended: normalized.attended,
    teamCount: normalized.teamCount,
    mediaMentions: normalized.mediaMentions,
    campaigns,
    campaignTotals,
  }
}

export function buildReportFacts(report, metrics = compute(report)) {
  const normalized = normalizeReportInput(report)
  const common = {
    type: normalized.type,
    name: normalized.name,
    dateMode: normalized.dateMode,
    date: normalized.date,
    dateStart: normalized.dateStart,
    dateEnd: normalized.dateEnd,
    displayDate: formatReportDateRange(normalized),
    description: normalized.description,
    goalText: normalized.goalText,
    mediaMentions: normalized.mediaMentions,
  }

  if (normalized.type === 'partnership') {
    return {
      ...common,
      partnership: {
        costUsd: normalized.partnershipCost,
        views: normalized.views,
        clicks: normalized.clicks,
        episodes: normalized.episodes,
        hireEnabled: normalized.hireEnabled,
        hireCount: normalized.hireCount,
        cpvUsd: metrics.cpv,
        cpcUsd: metrics.cpc,
        costPerHireUsd: metrics.costPerHire,
      },
    }
  }

  if (normalized.type === 'launch') {
    return {
      ...common,
      launch: {
        budgetAutoUsd: metrics.budgetAuto,
        budgetOverrideUsd: normalized.budgetOverride,
        effectiveBudgetUsd: metrics.effectiveBudget,
        cpcUsd: metrics.cpc,
        cpvUsd: metrics.cpv,
        reachTotal: normalized.reachTotal,
        reachUniverse: normalized.reachUniverse,
        reachClevel: normalized.reachClevel,
        reachMedia: normalized.reachMedia,
        linkClicks: normalized.linkClicks,
        clicks: metrics.clicks,
        campaignClicks: metrics.campaignTotals.clicks,
        productResultType: normalized.productResultType,
        productResultValue: normalized.productResultValue,
        productResultNote: normalized.productResultNote,
        campaigns: metrics.campaigns.map(campaignFact),
        telegram: normalized.tgEnabled
          ? {
              costUsd: normalized.tgCost,
              reach: normalized.tgReach,
              posts: normalized.tgPosts,
              channelList: normalized.tgChannelList,
            }
          : null,
        resources: normalized.resources,
      },
    }
  }

  return {
    ...common,
    event: {
      totalBudgetUsd: metrics.totalBudget,
      promoSpendUsd: normalized.promoSpendUsd,
      orgSpendUsd: normalized.orgSpendUsd,
      leadsGoogle: normalized.leadsGoogle,
      leadsMeta: normalized.leadsMeta,
      funnel: metrics.funnel,
      confirmed: normalized.confirmed,
      attended: normalized.attended,
      teamCount: normalized.teamCount,
      attendedNoTeam: metrics.attendedNoTeam,
      cpaUsd: metrics.cpa,
      cplUsd: metrics.cpl,
      cplNoTeamUsd: metrics.cplNoTeam,
      channels: normalized.channels,
      engagement: normalized.engagement,
      campaigns: metrics.campaigns.map(campaignFact),
    },
    qualitative: {
      feedback: normalized.feedback,
      notes: normalized.notes,
    },
  }
}

function campaignFact(campaign) {
  return {
    name: campaign.name,
    ctype: campaign.ctype,
    spendEur: campaign.spendEur,
    spendUsd: campaign.spendEur * FX_EUR_USD,
    result: campaign.result,
    clicks: campaign.clicks,
    impressions: campaign.impressions,
    reach: campaign.reach,
    cpaEur: campaign.cpa,
    cpcEur: campaign.cpc,
    ctrPct: campaign.ctr,
  }
}

export function formatUsd(value) {
  return `$${integerFormatter.format(Math.round(toReportNumber(value)))}`
}

export function formatEur(value) {
  return `€${euroFormatter.format(toReportNumber(value))}`
}

export function formatWhole(value) {
  return integerFormatter.format(Math.round(toReportNumber(value)))
}

export function formatPercent(value, digits = 1) {
  const number = toReportNumber(value)
  const formatter =
    digits === 0
      ? integerFormatter
      : new Intl.NumberFormat('uk-UA', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })

  return `${formatter.format(number)}%`
}

export function formatCompact(value) {
  const number = toReportNumber(value)
  const abs = Math.abs(number)

  if (abs >= 1000000) return `${formatShort(number / 1000000)}M`
  if (abs >= 1000) return `${formatShort(number / 1000)}K`
  return integerFormatter.format(Math.round(number))
}

export function formatReportDate(value) {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatReportDateRange(report = {}) {
  const normalized = normalizeReportInput(report)
  if (normalized.dateMode !== 'period') return formatReportDate(normalized.date)

  const start = formatCompactDate(normalized.dateStart)
  const end = formatCompactDate(normalized.dateEnd)
  if (start && end) return `${start}–${end}`
  return start || end || '—'
}

function formatCompactDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}`
}

function formatShort(value) {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return String(rounded).replace('.', ',')
}
