import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildReport,
  labelCreatives,
  monthRange,
  parseCampaignName,
  previousMonthKey,
  weeksInRange,
} from './calc.js'

test('parseCampaignName reads type and title from the name template', () => {
  assert.deepEqual(parseCampaignName('UNI | Вакансія | AI Motion Designer | 11.2026'), {
    type: 'vac',
    title: 'AI Motion Designer',
  })
  assert.equal(parseCampaignName('UNI | Підписники | Instagram | 11.2026').type, 'subs')
  assert.equal(parseCampaignName('UNI | awareness | Brand | 11.2026').type, 'aw')
  assert.deepEqual(parseCampaignName('Old campaign'), { type: 'other', title: 'Old campaign' })
  assert.equal(parseCampaignName('UNI | Щось інше | X').type, 'other')
})

test('monthRange clips the current month to today and rejects future months', () => {
  assert.deepEqual(monthRange('2026-11', '2026-11-19'), { since: '2026-11-01', until: '2026-11-19' })
  assert.deepEqual(monthRange('2026-10', '2026-11-19'), { since: '2026-10-01', until: '2026-10-31' })
  assert.equal(monthRange('2026-12', '2026-11-19'), null)
  assert.equal(previousMonthKey('2026-01'), '2025-12')
})

test('weeksInRange splits into Mon–Sun weeks clipped by the range', () => {
  const weeks = weeksInRange({ since: '2026-11-01', until: '2026-11-19' })
  assert.deepEqual(
    weeks.map((week) => week.label),
    ['01.11', '02–08.11', '09–15.11', '16–19.11'],
  )
})

function creative(adId, spend, impressions, clicks) {
  return {
    adId,
    spend,
    impressions,
    clicks,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
  }
}

test('labelCreatives: leader, retest, weak (low-data ads get no label)', () => {
  const labeled = labelCreatives([
    creative('lead', 300, 10000, 1500), // 15% CTR, ~92% of budget
    creative('retest', 12, 800, 140), // CTR 17.5% >= leader, enough impressions
    creative('untested', 2, 90, 1),
    creative('weak', 15, 2000, 20), // 1% CTR < 50% of leader
    creative('fine', 10, 2000, 150), // 7.5% CTR: no label
  ])
  const byId = Object.fromEntries(labeled.map((item) => [item.adId, item.label]))

  assert.equal(byId.lead, 'leader')
  assert.equal(byId.retest, 'retest')
  assert.equal(byId.untested, '')
  assert.equal(byId.weak, 'weak')
  assert.equal(byId.fine, '')
})

test('labelCreatives: two creatives above 40% are both leaders', () => {
  const labeled = labelCreatives([
    creative('a', 50, 5000, 300),
    creative('b', 45, 5000, 250),
    creative('c', 5, 5000, 10),
  ])
  assert.deepEqual(
    labeled.map((item) => item.label),
    ['leader', 'leader', 'weak'],
  )
})

const snapshot = {
  month: '2026-11',
  currency: 'USD',
  fetchedAt: '2026-11-19T09:00:00.000Z',
  ads: {
    1: { campaignId: 'c1', campaignName: 'UNI | Вакансія | AI Motion Designer | 11.2026', name: 'Ad 1' },
    2: { campaignId: 'c2', campaignName: 'UNI | Підписники | Instagram | 11.2026', name: 'Ad 2' },
    3: { campaignId: 'c3', campaignName: 'Legacy campaign', name: 'Ad 3' },
  },
  rows: [
    { adId: '1', date: '2026-11-03', spend: 100, impressions: 10000, clicks: 200, follows: 0 },
    { adId: '1', date: '2026-11-12', spend: 50, impressions: 5000, clicks: 80, follows: 0 },
    { adId: '2', date: '2026-11-12', spend: 20, impressions: 4000, clicks: 40, follows: 80 },
    { adId: '3', date: '2026-11-18', spend: 10, impressions: 1000, clicks: 5, follows: 0 },
  ],
}

test('buildReport filters every block by type', () => {
  const all = buildReport({ snapshot, typeFilter: 'all', today: '2026-11-19' })
  assert.equal(all.counts.campaigns, 3)
  assert.equal(all.kpis.spend, 180)
  assert.equal(all.unrecognized, 1)

  const vac = buildReport({ snapshot, typeFilter: 'vac', today: '2026-11-19' })
  assert.equal(vac.counts.campaigns, 1)
  assert.equal(vac.kpis.spend, 150)
  assert.equal(vac.kpis.follows, 0)
  assert.deepEqual(vac.weeks.types, ['vac'])
  assert.deepEqual(vac.byType.map((row) => row.type), ['vac'])
  assert.equal(vac.did.length, 1)
  assert.equal(vac.unrecognized, 0)
})

test('buildReport computes subscriber cost and deltas only as percentages', () => {
  const previous = {
    ...snapshot,
    month: '2026-10',
    rows: [{ adId: '1', date: '2026-10-05', spend: 100, impressions: 10000, clicks: 100, follows: 0 }],
  }
  const report = buildReport({
    snapshot,
    previousSnapshot: previous,
    typeFilter: 'vac',
    today: '2026-11-19',
  })

  assert.equal(report.kpis.deltas.spend, 50)
  assert.equal(report.kpis.deltas.clicks, 180)
  assert.ok(Math.abs(report.kpis.deltas.ctr - (280 / 15000) * 100 + 1) < 1e-9)

  const subs = buildReport({ snapshot, typeFilter: 'subs', today: '2026-11-19' })
  assert.equal(subs.kpis.cpf, 0.25)
})

test('labelCreatives: an evenly split budget still gets a leader, and weak is judged against it', () => {
  const labeled = labelCreatives([
    creative('a', 82, 4500, 80), // top spender, CTR 1.8%
    creative('b', 82, 5200, 130), // equal spend, CTR 2.5%
    creative('c', 30, 3000, 20), // CTR 0.7%: under half of the leader's CTR
  ])
  const byId = Object.fromEntries(labeled.map((item) => [item.adId, item.label]))

  assert.equal(byId.a, 'leader')
  assert.equal(byId.b, 'leader')
  assert.equal(byId.c, 'weak')
})
