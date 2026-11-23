import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCampaigns,
  buildReport,
  buildVacancies,
  parseAdVacancy,
  parseTestTags,
  splitIntoTests,
  parseCampaignName,
  vacancyKey,
} from './calc.js'

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

  // Two more LinkedIn-only vacancies come from the unnamed-by-template LinkedIn campaigns.
  assert.equal(vacancies.length, 4)
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

test('every LinkedIn campaign is a vacancy; subscribers and awareness stay Meta-only', () => {
  const all = buildReport({ snapshot, typeFilter: 'all', today: '2026-11-20', linkedinConfigured: true })
  const vac = buildReport({ snapshot, typeFilter: 'vac', today: '2026-11-20', linkedinConfigured: true })
  const subs = buildReport({ snapshot, typeFilter: 'subs', today: '2026-11-20', linkedinConfigured: true })

  const linkedinTemplated = 15 * 12 + 2 * 5
  const linkedinOther = 2 * 3 + 2 * 2 // "Legacy brand campaign" and a "Підписники"-named campaign
  const metaVacSpend = 17 * 20 + 17 * 1 + 3 * 10
  assert.equal(vac.kpis.spend, metaVacSpend + linkedinTemplated + linkedinOther)

  // Names without the template still become vacancies (named after the campaign).
  assert.ok(vac.vacancies.some((vacancy) => vacancy.title === 'Legacy brand campaign'))
  assert.equal(all.unrecognized, 0)
  assert.ok(all.otherCampaigns.every((campaign) => campaign.platform === 'meta'))
  assert.equal(vac.otherCampaigns.length, 0)

  // Subscribers filter: Meta only.
  assert.equal(subs.kpis.spend, 17 * 5)
  assert.ok(subs.campaigns.every((campaign) => campaign.platform === 'meta'))
  assert.deepEqual(subs.weeks.types, ['subs'])

  // The weekly chart's vacancy column includes LinkedIn.
  const vacTotal = vac.weeks.series.vac.reduce((a, b) => a + b, 0)
  assert.equal(vacTotal, vac.kpis.spend)
})

test('KPI applies and the vacancies row of the type table', () => {
  const report = buildReport({
    snapshot,
    typeFilter: 'vac',
    today: '2026-11-20',
    applies: { 'ai motion designer': 46 },
  })

  assert.equal(report.kpis.applies, 46)
  assert.equal(report.kpis.vacanciesCount, 4)
  assert.equal(report.kpis.vacanciesMissingApplies, 3)

  const row = report.byType.find((item) => item.type === 'vac')
  assert.equal(row.applies, 46)
  assert.deepEqual(row.platforms, ['Meta Ads', 'LinkedIn'])
  assert.match(report.did[0].text, /Meta: .*LinkedIn для 3 вакансій/)
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

test('campaigns without the template are recognized by keyword', () => {
  assert.equal(parseCampaignName('Vacancies November26').type, 'vac')
  assert.equal(parseCampaignName('Вакансії листопад').type, 'vac')
  assert.equal(parseCampaignName('Instagram followers Q4').type, 'subs')
  assert.equal(parseCampaignName('Instagram New Followers').type, 'subs')
  assert.equal(parseCampaignName('instagram_new_followers_nov26').type, 'subs')
  assert.equal(parseCampaignName('Підписники Instagram').type, 'subs')
  assert.equal(parseCampaignName('Brand awareness').type, 'aw')
  assert.equal(parseCampaignName('Awareness November26').type, 'aw')
  assert.equal(parseCampaignName('Retargeting').type, 'other')
  // the template still wins
  assert.equal(parseCampaignName('UNI | Підписники | Vacancy tips | 11.2026').type, 'subs')
})

test('parseAdVacancy reads the vacancy from the ad name', () => {
  assert.equal(parseAdVacancy('nov26_AI Motion designer_concept1_stat_v1_cv'), 'AI Motion designer')
  assert.equal(parseAdVacancy('nov26_Digital Marketing Specialist_concept1_stat_v1_cv'), 'Digital Marketing Specialist')
  assert.equal(parseAdVacancy('Some ad without a pattern'), '')
  assert.equal(parseAdVacancy('concept1_stat_v1'), '')
})

test('one campaign with many vacancies is split into vacancy cards by ad name', () => {
  const container = {
    month: '2026-11',
    currency: 'USD',
    fetchedAt: '2026-11-23T09:00:00.000Z',
    ads: {
      a1: { campaignId: 'c1', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept1_stat_v1_cv' },
      a2: { campaignId: 'c1', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept1_stat_v1_no_cv' },
      a3: { campaignId: 'c1', campaignName: 'Vacancies November26', name: 'nov26_Digital Marketing Specialist_concept1_stat_v1_cv' },
      a4: { campaignId: 'c1', campaignName: 'Vacancies November26', name: 'Untitled ad' },
    },
    rows: [
      ...rowsFor('a1', 3, 19, 10),
      ...rowsFor('a2', 3, 19, 10),
      ...rowsFor('a3', 10, 15, 20),
      ...rowsFor('a4', 10, 11, 1),
    ],
  }
  const report = buildReport({ snapshot: container, typeFilter: 'vac', today: '2026-11-23' })
  const titles = report.vacancies.map((vacancy) => vacancy.title)

  assert.deepEqual([...titles].sort(), ['AI Motion designer', 'Digital Marketing Specialist', 'Вакансію не визначено'].sort())
  assert.equal(report.vacancies.length, 3)
  assert.equal(report.otherCampaigns.length, 0)
  assert.equal(report.unrecognized, 0)
  assert.equal(report.counts.campaigns, 1)

  const motion = report.vacancies.find((vacancy) => vacancy.key === 'ai motion designer')
  assert.equal(motion.platforms.length, 1)
  assert.equal(motion.platforms[0].creatives.length, 2)
  assert.deepEqual(motion.platforms[0].campaigns, ['Vacancies November26'])
  // cv / no_cv ads are two tests of one vacancy: each gets its own metrics, share and labels
  const { tests } = motion.platforms[0]
  assert.deepEqual(tests.map((test) => test.label), ['З CV', 'Без CV'])
  assert.deepEqual(tests.map((test) => Math.round(test.spend)), [170, 170])
  assert.ok(motion.platforms[0].creatives.every((item) => Math.round(item.sharePct) === 100 && item.label === 'leader'))
  assert.equal(motion.days, 17)

  // Vacancy filter now has data; subscribers/awareness do not pick these ads up.
  assert.equal(buildReport({ snapshot: container, typeFilter: 'subs', today: '2026-11-23' }).counts.creatives, 0)
})

test('vacancies that ran on Meta come first; LinkedIn-only vacancies go below them', () => {
  const mixed = {
    ...snapshot,
    linkedin: {
      ...snapshot.linkedin,
      ads: {
        ...snapshot.linkedin.ads,
        only: { campaignId: 'lc9', campaignName: 'UNI | Вакансія | LinkedIn Only Role | 11.2026', name: 'LI only' },
      },
      rows: [...snapshot.linkedin.rows, ...rowsFor('only', 3, 19, 500)], // biggest spend overall
    },
  }
  const vacancies = buildVacancies(buildCampaigns(mixed, 'vac'), { monthKey: '2026-11', today: '2026-11-20' })

  const keys = vacancies.map((vacancy) => vacancy.key)
  assert.deepEqual(keys.slice(0, 2), ['ai motion designer', 'data analyst'])
  assert.equal(keys[2], 'linkedin only role') // biggest LinkedIn-only spend goes first among them
  assert.ok(vacancies.slice(2).every((vacancy) => vacancy.platforms.every((block) => block.platform === 'linkedin')))
  // On a vacancy that ran on both, Meta stays above LinkedIn.
  assert.deepEqual(vacancies[0].platforms.map((block) => block.platform), ['meta', 'linkedin'])
})

test('with the vacancy filter the weekly chart is split per vacancy', () => {
  const report = buildReport({ snapshot, typeFilter: 'vac', today: '2026-11-20' })
  const { order, series } = report.weeks.vacancies

  assert.ok(order.map((item) => item.key).includes('ai motion designer'))
  assert.ok(order.map((item) => item.key).includes('data analyst'))
  // Meta + LinkedIn spend of the vacancy lands in one series; the sum matches the type series.
  const motionTotal = series['ai motion designer'].reduce((a, b) => a + b, 0)
  assert.equal(motionTotal, 17 * 20 + 17 * 1 + 15 * 12 + 2 * 5)
  const everything = Object.values(series).flat().reduce((a, b) => a + b, 0)
  assert.equal(everything, report.weeks.series.vac.reduce((a, b) => a + b, 0))

  // Other filters keep the per-type chart.
  assert.equal(buildReport({ snapshot, typeFilter: 'all', today: '2026-11-20' }).weeks.vacancies, null)

  // Vacancy rows carry CTR and CPC for the table.
  const motion = report.vacancies.find((vacancy) => vacancy.key === 'ai motion designer')
  assert.equal(motion.impressions > 0, true)
  assert.equal(motion.cpc, motion.spend / motion.clicks)
})

test('parseTestTags reads cv and audience from the ad name', () => {
  assert.deepEqual(parseTestTags('nov26_AI Motion designer_concept1_stat_v1_cv'), { cv: 'cv', audience: '' })
  assert.deepEqual(parseTestTags('nov26_AI Motion designer_concept1_stat_v1_no_cv'), { cv: 'no_cv', audience: '' })
  assert.deepEqual(
    parseTestTags('nov26_Middle/Senior User Acquisition Manager (Google Ads)_concept2_stat_v2_cv_лукалайк'),
    { cv: 'cv', audience: 'lookalike' },
  )
  assert.deepEqual(
    parseTestTags('nov26_Middle/Senior User Acquisition Manager (Google Ads)_concept2_stat_v1_cv_general'),
    { cv: 'cv', audience: 'general' },
  )
  // "CV" inside the vacancy name is not a test tag
  assert.deepEqual(parseTestTags('nov26_CV Reviewer_concept1_stat_v1'), { cv: '', audience: '' })
})

test('only dimensions that differ become tests', () => {
  const ads = (names) => names.map((name, index) => ({ adId: String(index), name, spend: 10 + index, impressions: 2000, clicks: 40, ctr: 2 }))

  // cv always "cv", audience varies -> two arms by audience
  const audience = splitIntoTests(
    ads([
      'nov26_UA Manager_concept2_stat_v2_cv_лукалайк',
      'nov26_UA Manager_concept2_stat_v1_cv_general',
      'nov26_UA Manager_concept2_stat_v3_cv_general',
    ]),
  )
  assert.deepEqual(audience.map((arm) => arm.label), ['General', 'Lookalike'])
  assert.deepEqual(audience.map((arm) => arm.creatives.length), [2, 1])

  // no varying dimension -> a single group, no tests
  const single = splitIntoTests(ads(['nov26_X_concept1_stat_v1_cv', 'nov26_X_concept2_stat_v1_cv']))
  assert.equal(single.length, 1)
  assert.equal(single[0].label, '')
})

test('labels are calculated inside each test, not across the whole vacancy', () => {
  const snap = {
    month: '2026-11',
    currency: 'USD',
    fetchedAt: '2026-11-23T09:00:00.000Z',
    ads: {
      a: { campaignId: 'c', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept1_stat_v1_cv' },
      b: { campaignId: 'c', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept2_stat_v1_cv' },
      c: { campaignId: 'c', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept1_stat_v1_no_cv' },
      d: { campaignId: 'c', campaignName: 'Vacancies November26', name: 'nov26_AI Motion designer_concept2_stat_v1_no_cv' },
    },
    rows: [
      ...rowsFor('a', 3, 10, 30, { impressions: 3000, clicks: 300 }), // cv: big spend, high CTR
      ...rowsFor('b', 3, 10, 5, { impressions: 3000, clicks: 30 }), //  cv: small, low CTR -> weakest of cv
      ...rowsFor('c', 3, 10, 1, { impressions: 3000, clicks: 90 }), // no_cv: tiny but the top of its own test
      ...rowsFor('d', 3, 10, 0.5, { impressions: 3000, clicks: 30 }), // no_cv: weakest of its test
    ],
  }
  const motion = buildReport({ snapshot: snap, typeFilter: 'vac', today: '2026-11-23' }).vacancies[0]
  const label = (id) => motion.platforms[0].creatives.find((item) => item.adId === id).label

  assert.deepEqual(motion.platforms[0].tests.map((test) => test.label), ['З CV', 'Без CV'])
  assert.deepEqual([label('a'), label('b'), label('c'), label('d')], ['leader', 'weak', 'leader', 'weak'])
})
