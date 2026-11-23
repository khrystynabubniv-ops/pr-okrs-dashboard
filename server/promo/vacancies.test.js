import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCampaigns, buildReport, buildVacancies, vacancyKey } from './calc.js'

const day = (date) => `2026-11-${String(date).padStart(2, '0')}`

function rowsFor(adId, from, to, spendPerDay, extra = {}) {
  const rows = []
  for (let d = from; d <= to; d += 1) {
    rows.push({ adId, date: day(d), spend: spendPerDay, impressions: 1000, clicks: 20, follows: 0, ...extra })
  }
  return rows
}

const snapshot = {
  month: '2026-11',
  currency: 'USD',
  fetchedAt: '2026-11-20T09:00:00.000Z',
  ads: {
    m1: { campaignId: 'mc1', campaignName: 'UNI | Вакансія | AI Motion Designer | 11.2026', name: 'Біг містом' },
    m2: { campaignId: 'mc1', campaignName: 'UNI | Вакансія | AI Motion Designer | 11.2026', name: 'Портрет' },
    m3: { campaignId: 'mc2', campaignName: 'UNI | Вакансія | Data Analyst | 11.2026', name: 'Чекліст' },
    s1: { campaignId: 'mc3', campaignName: 'UNI | Підписники | Instagram | 11.2026', name: 'Reels' },
  },
  rows: [
    ...rowsFor('m1', 3, 19, 20),
    ...rowsFor('m2', 3, 19, 1),
    ...rowsFor('m3', 10, 12, 10),
    ...rowsFor('s1', 3, 19, 5, { follows: 3 }),
  ],
  linkedin: {
    status: 'ok',
    asOf: '2026-11-20T09:00:00.000Z',
    ads: {
      l1: { campaignId: 'lc1', campaignName: 'UNI | Вакансія | "AI  Motion Designer" | 11.2026', name: 'LI single image' },
      l2: { campaignId: 'lc2', campaignName: 'UNI | Вакансія | ai motion designer | 11.2026', name: 'LI relaunch' },
      l3: { campaignId: 'lc3', campaignName: 'Legacy brand campaign', name: 'LI legacy' },
      l4: { campaignId: 'lc4', campaignName: 'UNI | Підписники | Brand | 11.2026', name: 'LI followers' },
    },
    rows: [
      ...rowsFor('l1', 5, 19, 12),
      ...rowsFor('l2', 17, 18, 5),
      ...rowsFor('l3', 5, 6, 3),
      ...rowsFor('l4', 5, 6, 2),
    ],
  },
}

test('vacancyKey normalizes case, quotes and spaces', () => {
  assert.equal(vacancyKey('  AI  Motion «Designer» '), 'ai motion designer')
  assert.equal(vacancyKey('"Data Analyst"'), 'data analyst')
})

test('Meta and LinkedIn campaigns of one vacancy become one card with a block per platform', () => {
  const campaigns = buildCampaigns(snapshot, 'vac')
  const vacancies = buildVacancies(campaigns, { monthKey: '2026-11', today: '2026-11-20' })
  const motion = vacancies.find((vacancy) => vacancy.key === 'ai motion designer')

  assert.equal(vacancies.length, 2)
  assert.deepEqual(motion.platforms.map((block) => block.platform), ['meta', 'linkedin'])

  const [meta, linkedin] = motion.platforms
  // LinkedIn relaunch merged into the single LinkedIn block, both campaign names listed.
  assert.equal(linkedin.campaigns.length, 2)
  assert.equal(linkedin.creatives.length, 2)

  // Days are counted on spend days only; the month is current and spend was yesterday.
  assert.equal(meta.start, day(3))
  assert.equal(meta.end, null)
  assert.equal(meta.days, 17)
  assert.equal(linkedin.start, day(5))
  assert.equal(linkedin.days, 15)
  assert.equal(motion.start, day(3))
  assert.equal(motion.days, 17)
  assert.equal(motion.end, null)

  // Sorted by total spend, platforms summed.
  assert.equal(vacancies[0].key, 'ai motion designer')
  assert.equal(motion.spend, meta.spend + linkedin.spend)
})

test('a vacancy that stopped gets a fixed end date', () => {
  const vacancies = buildVacancies(buildCampaigns(snapshot, 'vac'), { monthKey: '2026-11', today: '2026-11-20' })
  const analyst = vacancies.find((vacancy) => vacancy.key === 'data analyst')

  assert.equal(analyst.start, day(10))
  assert.equal(analyst.end, day(12))
  assert.equal(analyst.days, 3)
})

test('applies drive cost per apply; missing applies give null', () => {
  const vacancies = buildVacancies(buildCampaigns(snapshot, 'vac'), {
    monthKey: '2026-11',
    today: '2026-11-20',
    applies: { 'ai motion designer': 10 },
  })
  const motion = vacancies.find((vacancy) => vacancy.key === 'ai motion designer')
  const analyst = vacancies.find((vacancy) => vacancy.key === 'data analyst')

  assert.equal(motion.applies, 10)
  assert.equal(motion.costPerApply, motion.spend / 10)
  assert.equal(analyst.applies, null)
  assert.equal(analyst.costPerApply, null)
})

test('LinkedIn shows up in totals for all and vac only, never for subs', () => {
  const all = buildReport({ snapshot, typeFilter: 'all', today: '2026-11-20', linkedinConfigured: true })
  const vac = buildReport({ snapshot, typeFilter: 'vac', today: '2026-11-20', linkedinConfigured: true })
  const subs = buildReport({ snapshot, typeFilter: 'subs', today: '2026-11-20', linkedinConfigured: true })

  const linkedinSpend = 15 * 12 + 2 * 5
  const metaVacSpend = 17 * 20 + 17 * 1 + 3 * 10
  assert.equal(vac.kpis.spend, metaVacSpend + linkedinSpend)

  // Unrecognized LinkedIn campaigns (legacy name, non-vacancy type) land in "other" with the platform.
  const other = all.otherCampaigns.filter((campaign) => campaign.type === 'other')
  assert.deepEqual(other.map((campaign) => campaign.platform), ['linkedin', 'linkedin'])
  assert.equal(all.unrecognized, 2)
  assert.equal(vac.otherCampaigns.length, 0)

  // Subscribers filter: Meta only.
  assert.equal(subs.kpis.spend, 17 * 5)
  assert.ok(subs.campaigns.every((campaign) => campaign.platform === 'meta'))
  assert.deepEqual(subs.weeks.types, ['subs'])

  // The weekly chart's vacancy column includes LinkedIn.
  const vacTotal = vac.weeks.series.vac.reduce((a, b) => a + b, 0)
  assert.equal(vacTotal, metaVacSpend + linkedinSpend)
})

test('KPI applies and the vacancies row of the type table', () => {
  const report = buildReport({
    snapshot,
    typeFilter: 'vac',
    today: '2026-11-20',
    applies: { 'ai motion designer': 46 },
  })

  assert.equal(report.kpis.applies, 46)
  assert.equal(report.kpis.vacanciesCount, 2)
  assert.equal(report.kpis.vacanciesMissingApplies, 1)

  const row = report.byType.find((item) => item.type === 'vac')
  assert.equal(row.applies, 46)
  assert.deepEqual(row.platforms, ['Meta Ads', 'LinkedIn'])
  assert.match(report.did[0].text, /Meta: .*LinkedIn для 1 вакансії/)
})

test('without LinkedIn data the report works as before and reports the status', () => {
  const { linkedin: _drop, ...metaOnly } = snapshot
  void _drop

  const notConfigured = buildReport({ snapshot: metaOnly, typeFilter: 'vac', today: '2026-11-20' })
  assert.equal(notConfigured.linkedin.status, 'not_configured')

  const pending = buildReport({ snapshot: metaOnly, typeFilter: 'vac', today: '2026-11-20', linkedinConfigured: true })
  assert.equal(pending.linkedin.status, 'pending')
  assert.equal(pending.vacancies[0].platforms.length, 1)

  const failed = buildReport({
    snapshot: { ...metaOnly, linkedin: { status: 'error', message: 'токен', asOf: '2026-11-18T00:00:00.000Z', rows: [], ads: {} } },
    typeFilter: 'all',
    today: '2026-11-20',
    linkedinConfigured: true,
  })
  assert.deepEqual(failed.linkedin, { status: 'error', message: 'токен', asOf: '2026-11-18T00:00:00.000Z' })
})
