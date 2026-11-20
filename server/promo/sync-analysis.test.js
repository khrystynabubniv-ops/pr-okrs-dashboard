import assert from 'node:assert/strict'
import test from 'node:test'
import { validateAnalysis } from './analysis.js'
import { mapAdsError, normalizeCreative, parseInsightRow } from './sync.js'

const createHttpError = (status, message) => Object.assign(new Error(message), { status })

test('parseInsightRow counts link clicks and follow actions only', () => {
  const row = parseInsightRow(
    {
      date_start: '2026-11-03',
      ad_id: 12,
      spend: '10.5',
      impressions: '1000',
      clicks: '99',
      inline_link_clicks: '40',
      actions: [
        { action_type: 'follow', value: '7' },
        { action_type: 'link_click', value: '40' },
        { action_type: 'video_view', value: '300' },
      ],
      video_thruplay_watched_actions: [{ action_type: 'video_view', value: '120' }],
    },
    ['follow'],
  )

  assert.equal(row.adId, '12')
  assert.equal(row.clicks, 40)
  assert.equal(row.follows, 7)
  assert.equal(row.views3s, 300)
  assert.equal(row.thruplays, 120)
})

test('normalizeCreative detects video and falls back to asset_feed_spec text', () => {
  const creative = normalizeCreative({
    id: '1',
    thumbnail_url: 'https://x/t.jpg',
    asset_feed_spec: { videos: [{ video_id: '55' }], bodies: [{ text: 'Привіт' }] },
  })

  assert.equal(creative.kind, 'video')
  assert.equal(creative.videoId, '55')
  assert.equal(creative.body, 'Привіт')
})

test('mapAdsError turns permission errors into the ads_read message', () => {
  const error = Object.assign(new Error('x'), {
    metaErrorCode: 200,
    metaErrorMessage: '(#200) Ad account owner has NOT grant ads_read or ads_management permission',
  })
  assert.match(mapAdsError(error, { createHttpError }).message, /ads_read/)

  const expired = Object.assign(new Error('expired'), { metaErrorCode: 190, metaErrorMessage: 'Session has expired' })
  assert.equal(mapAdsError(expired, { createHttpError }), expired)
})

const campaigns = [
  {
    title: 'AI Motion Designer',
    creatives: [
      { adId: '1', name: 'A', ctr: 15.7, cpc: 0.2, follows: 0, clicks: 10, label: 'leader' },
    ],
  },
]

test('validateAnalysis drops unknown ad_ids, recomputes metrics and enforces the utm tip', () => {
  const result = validateAnalysis(
    {
      key: [{ title: 'Висновок', text: 'Текст' }],
      works: [
        {
          kind: 'visual',
          title: 'Людина в дії',
          conclusion: 'CTR вищий',
          examples: [{ ad_id: '1', metric: 'вигадано' }, { ad_id: '999' }],
        },
      ],
      fails: [{ kind: 'text', title: 'Без прикладів', conclusion: 'x', examples: [{ ad_id: '999' }] }],
      recs: { brief: ['ТЗ'], scale_stop_retest: [], measure: ['Дивитись CTR'] },
    },
    campaigns,
  )

  assert.deepEqual(result.works[0].examples, [{ ad_id: '1', metric: 'CTR 15.7% · 0.20/клік' }])
  assert.equal(result.fails.length, 0)
  assert.ok(result.recs.measure.some((tip) => tip.includes('utm_content')))
})

test('validateAnalysis rejects an answer with no usable findings', () => {
  assert.throws(() => validateAnalysis({ key: [], works: [], fails: [] }, campaigns))
})
