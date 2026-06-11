export const FX_EUR_USD = 1.08

export const REPORT_TYPES = ['event', 'partnership']
export const SENTIMENTS = ['Позитивна', 'Нейтральна', 'Змішана', 'Негативна']

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

export function normalizeReportInput(report = {}) {
  const type = report.type === 'partnership' ? 'partnership' : 'event'
  const sentiment = SENTIMENTS.includes(report.sentiment)
    ? report.sentiment
    : 'Нейтральна'

  return {
    type,
    name: String(report.name || '').trim(),
    date: String(report.date || ''),
    description: String(report.description || '').trim(),
    goalText: String(report.goalText || '').trim(),
    planAttendees: toReportNumber(report.planAttendees),
    leadsGoogle: toReportNumber(report.leadsGoogle),
    leadsMeta: toReportNumber(report.leadsMeta),
    confirmed: toReportNumber(report.confirmed),
    attended: toReportNumber(report.attended),
    teamCount: toReportNumber(report.teamCount),
    partnershipCost: toReportNumber(report.partnershipCost),
    partnershipClicks: toReportNumber(report.partnershipClicks),
    partnershipLeads: toReportNumber(report.partnershipLeads),
    partnershipViews: toReportNumber(report.partnershipViews),
    campaigns: Array.isArray(report.campaigns)
      ? report.campaigns.map(normalizeCampaign)
      : [],
    promoSpendUsd: toReportNumber(report.promoSpendUsd),
    orgSpendUsd: toReportNumber(report.orgSpendUsd),
    publications: toReportNumber(report.publications),
    mediaMentions: toReportNumber(report.mediaMentions),
    totalReach: toReportNumber(report.totalReach),
    sentiment,
    engagement: String(report.engagement || '').trim(),
    feedback: String(report.feedback || '').trim(),
    notes: String(report.notes || '').trim(),
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
      result: totals.result + campaign.result,
      clicks: totals.clicks + campaign.clicks,
      impressions: totals.impressions + campaign.impressions,
      reach: totals.reach + campaign.reach,
    }),
    { spendEur: 0, result: 0, clicks: 0, impressions: 0, reach: 0 },
  )

  if (normalized.type === 'partnership') {
    const totalBudget =
      normalized.partnershipCost ||
      normalized.promoSpendUsd + normalized.orgSpendUsd

    return {
      type: normalized.type,
      totalBudget,
      partnershipCost: normalized.partnershipCost,
      partnershipClicks: normalized.partnershipClicks,
      partnershipLeads: normalized.partnershipLeads,
      partnershipViews: normalized.partnershipViews,
      cpc: safeDiv(normalized.partnershipCost, normalized.partnershipClicks),
      cpl: safeDiv(normalized.partnershipCost, normalized.partnershipLeads),
      cpv: safeDiv(normalized.partnershipCost, normalized.partnershipViews),
      campaigns,
      campaignTotals,
    }
  }

  const totalBudget = normalized.promoSpendUsd + normalized.orgSpendUsd
  const funnel = normalized.leadsGoogle + normalized.leadsMeta
  const attendedNoTeam = Math.max(normalized.attended - normalized.teamCount, 0)
  const planDelta = normalized.attended - normalized.planAttendees
  const planPct = normalized.planAttendees
    ? (planDelta / normalized.planAttendees) * 100
    : null

  return {
    type: normalized.type,
    totalBudget,
    funnel,
    attendedNoTeam,
    cpa: safeDiv(totalBudget, funnel),
    cpl: safeDiv(totalBudget, normalized.attended),
    cplNoTeam: safeDiv(totalBudget, attendedNoTeam),
    planDelta,
    planPct,
    planAttendees: normalized.planAttendees,
    leadsGoogle: normalized.leadsGoogle,
    leadsMeta: normalized.leadsMeta,
    confirmed: normalized.confirmed,
    attended: normalized.attended,
    teamCount: normalized.teamCount,
    campaigns,
    campaignTotals,
  }
}

export function buildReportFacts(report, metrics = compute(report)) {
  const normalized = normalizeReportInput(report)
  const facts = {
    type: normalized.type,
    name: normalized.name,
    date: normalized.date,
    description: normalized.description,
    goalText: normalized.goalText,
    budget: {
      totalBudgetUsd: metrics.totalBudget,
      promoSpendUsd: normalized.promoSpendUsd,
      orgSpendUsd: normalized.orgSpendUsd,
      fxEurUsd: FX_EUR_USD,
    },
    campaigns: metrics.campaigns.map((campaign) => ({
      name: campaign.name,
      ctype: campaign.ctype,
      spendEur: campaign.spendEur,
      result: campaign.result,
      clicks: campaign.clicks,
      impressions: campaign.impressions,
      reach: campaign.reach,
      cpaEur: campaign.cpa,
      cpcEur: campaign.cpc,
      ctrPct: campaign.ctr,
    })),
    media: {
      publications: normalized.publications,
      mediaMentions: normalized.mediaMentions,
      totalReach: normalized.totalReach,
      sentiment: normalized.sentiment,
      engagement: normalized.engagement,
    },
    qualitative: {
      feedback: normalized.feedback,
      notes: normalized.notes,
    },
  }

  if (normalized.type === 'partnership') {
    return {
      ...facts,
      partnership: {
        partnershipCostUsd: normalized.partnershipCost,
        views: normalized.partnershipViews,
        clicks: normalized.partnershipClicks,
        leads: normalized.partnershipLeads,
        cpcUsd: metrics.cpc,
        cplUsd: metrics.cpl,
        cpvUsd: metrics.cpv,
      },
    }
  }

  return {
    ...facts,
    event: {
      planAttendees: normalized.planAttendees,
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
      planDelta: metrics.planDelta,
      planPct: metrics.planPct,
    },
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

export function formatPlanDelta(delta, pct) {
  const sign = delta > 0 ? '+' : ''
  const percent = pct === null || pct === undefined ? '' : ` (${formatPercent(pct, 0)})`
  return `${sign}${formatWhole(delta)}${percent}`
}

function formatShort(value) {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10
  return String(rounded).replace('.', ',')
}
