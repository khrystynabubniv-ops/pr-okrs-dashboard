import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLinkedInClient,
  getLinkedInConfig,
  linkedinCreativeKind,
  mapLinkedInHttpError,
  overlapsRange,
  parseAnalyticsElement,
  restliDateRange,
} from './linkedin.js'

const createHttpError = (status, message) => Object.assign(new Error(message), { status })

test('getLinkedInConfig needs both token and account, version defaults to 202611', () => {
  assert.equal(getLinkedInConfig({}), null)
  assert.equal(getLinkedInConfig({ LINKEDIN_ACCESS_TOKEN: 't' }), null)

  const config = getLinkedInConfig({ LINKEDIN_ACCESS_TOKEN: 't', LINKEDIN_AD_ACCOUNT_ID: 'urn:li:sponsoredAccount:502' })
  assert.equal(config.accountId, '502')
  assert.equal(config.version, '202611')
})

test('restliDateRange uses unpadded numbers', () => {
  assert.equal(
    restliDateRange({ since: '2026-11-01', until: '2026-11-20' }),
    '(start:(year:2026,month:11,day:1),end:(year:2026,month:11,day:20))',
  )
})

test('parseAnalyticsElement maps daily creative stats, preferring landingPageClicks', () => {
  const row = parseAnalyticsElement({
    pivotValues: ['urn:li:sponsoredCreative:1234'],
    dateRange: { start: { year: 2026, month: 11, day: 5 }, end: { year: 2026, month: 11, day: 5 } },
    costInLocalCurrency: '19.91833',
    impressions: 600,
    clicks: 30,
    landingPageClicks: 12,
  })
  assert.deepEqual(
    { date: row.date, adId: row.adId, spend: row.spend, clicks: row.clicks, impressions: row.impressions },
    { date: '2026-11-05', adId: '1234', spend: 19.91833, clicks: 12, impressions: 600 },
  )

  const fallback = parseAnalyticsElement({
    pivotValues: ['urn:li:sponsoredCreative:1'],
    dateRange: { start: { year: 2026, month: 11, day: 5 } },
    clicks: 30,
  })
  assert.equal(fallback.clicks, 30)
  assert.equal(parseAnalyticsElement({ pivotValues: [] }), null)
})

test('overlapsRange uses inclusive start and exclusive optional end', () => {
  const range = { since: '2026-11-01', until: '2026-11-20' }
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`)

  assert.equal(overlapsRange({ runSchedule: { start: ms('2026-10-01') } }, range), true)
  assert.equal(overlapsRange({ runSchedule: { start: ms('2026-10-01'), end: ms('2026-11-01') } }, range), false)
  assert.equal(overlapsRange({ runSchedule: { start: ms('2026-12-01') } }, range), false)
  assert.equal(overlapsRange({}, range), true)
})

test('creative kind falls back to a single image when the API gives no type', () => {
  assert.equal(linkedinCreativeKind({ campaign: { format: 'SINGLE_VIDEO' } }), 'video')
  assert.equal(linkedinCreativeKind({ campaign: { format: 'CAROUSEL' } }), 'carousel')
  assert.equal(linkedinCreativeKind({ campaign: { type: 'TEXT_AD' } }), 'text')
  assert.equal(linkedinCreativeKind({ campaign: { format: 'STANDARD_UPDATE' } }), 'photo')
})

test('mapLinkedInHttpError gives human messages for token, scope and rate limit', () => {
  assert.match(mapLinkedInHttpError(401, '{}', createHttpError).message, /протермінований/)
  assert.match(mapLinkedInHttpError(403, '{}', createHttpError).message, /r_ads/)
  const limited = mapLinkedInHttpError(429, '{}', createHttpError)
  assert.equal(limited.linkedinRateLimited, true)
  assert.match(mapLinkedInHttpError(426, '{"message":"Requested version is not active"}', createHttpError).message, /LINKEDIN_API_VERSION/)
})

test('syncLinkedIn: campaigns -> analytics -> creatives, builds rows and ads', async () => {
  const calls = []
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`)
  const responses = [
    [/adAccounts\/502$/, { currency: 'USD' }],
    [
      /adCampaigns/,
      {
        elements: [
          { id: 11, name: 'UNI | Вакансія | Data Analyst | 11.2026', status: 'ACTIVE', format: 'STANDARD_UPDATE', runSchedule: { start: ms('2026-11-04') } },
          { id: 12, name: 'Old one', status: 'COMPLETED', runSchedule: { start: ms('2026-01-01'), end: ms('2026-02-01') } },
        ],
        metadata: {},
      },
    ],
    [
      /adAnalytics/,
      {
        elements: [
          {
            pivotValues: ['urn:li:sponsoredCreative:900'],
            dateRange: { start: { year: 2026, month: 11, day: 5 }, end: { year: 2026, month: 11, day: 5 } },
            costInLocalCurrency: '10.5',
            impressions: 500,
            landingPageClicks: 7,
          },
        ],
      },
    ],
    [
      /adAccounts\/502\/creatives\?/,
      {
        elements: [
          { id: 'urn:li:sponsoredCreative:900', campaign: 'urn:li:sponsoredCampaign:11', name: 'Ad one', intendedStatus: 'ACTIVE', content: { reference: 'urn:li:share:5' } },
        ],
        metadata: {},
      },
    ],
    [/creatives\/urn%3Ali%3AsponsoredCreative%3A900/, { id: 'x', metadata: { assetURL: 'https://media.licdn.com/a.jpg', adFormat: 'SPONSORED_UPDATE' } }],
    [/posts\//, { commentary: 'Ми шукаємо Data Analyst' }],
  ]
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers })
    const match = responses.find(([pattern]) => pattern.test(String(url)))
    return {
      ok: Boolean(match),
      status: match ? 200 : 404,
      text: async () => JSON.stringify(match ? match[1] : { message: 'nope' }),
    }
  }

  const client = createLinkedInClient({ createHttpError, fetchImpl })
  const config = { accessToken: 'tok', accountId: '502', version: '202611', timeoutMs: 5000, fallbackCurrency: 'USD' }
  const result = await client.syncLinkedIn(config, { since: '2026-11-01', until: '2026-11-20' })

  assert.equal(result.currency, 'USD')
  assert.deepEqual(Object.keys(result.campaigns), ['11']) // the finished campaign is skipped
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].clicks, 7)
  assert.equal(result.ads['900'].name, 'Ad one')
  assert.equal(result.ads['900'].campaignName, 'UNI | Вакансія | Data Analyst | 11.2026')
  assert.equal(result.ads['900'].creative.thumbnailUrl, 'https://media.licdn.com/a.jpg')
  assert.equal(result.ads['900'].creative.body, 'Ми шукаємо Data Analyst')

  const analytics = calls.find((call) => /adAnalytics/.test(call.url))
  assert.match(analytics.url, /pivot=CREATIVE/)
  assert.match(analytics.url, /timeGranularity=DAILY/)
  assert.match(analytics.url, /campaigns=List\(urn%3Ali%3AsponsoredCampaign%3A11\)/)
  assert.equal(analytics.headers['Linkedin-Version'], '202611')
  assert.equal(analytics.headers['X-Restli-Protocol-Version'], '2.0.0')
  const creatives = calls.find((call) => /adAccounts\/502\/creatives\?/.test(call.url))
  assert.equal(creatives.headers['X-RestLi-Method'], 'FINDER')
})
