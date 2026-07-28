import { MONTHS } from '../constants'
import { getViewsBenchmark } from './smmBenchmark'

const monthStats = {
  'Лютий 2026': {
    posts: 18,
    followers: 12870,
    netFollowers: 218,
    newFollowers: 332,
    unfollows: 114,
    avgReelViews: 12100,
    reelViewsDelta: 5,
    shares: 820,
    sharesDelta: 7,
    er: 4.2,
    goalCurrent: 12100,
    goalTarget: 20000,
    statusTone: 'yellow',
  },
  'Березень 2026': {
    posts: 21,
    followers: 13240,
    netFollowers: 370,
    newFollowers: 503,
    unfollows: 133,
    avgReelViews: 13800,
    reelViewsDelta: 14,
    shares: 1010,
    sharesDelta: 23,
    er: 4.5,
    goalCurrent: 13800,
    goalTarget: 20000,
    statusTone: 'yellow',
  },
  'Квітень 2026': {
    posts: 20,
    followers: 13695,
    netFollowers: 455,
    newFollowers: 620,
    unfollows: 165,
    avgReelViews: 14900,
    reelViewsDelta: 8,
    shares: 1240,
    sharesDelta: 23,
    er: 4.8,
    goalCurrent: 14900,
    goalTarget: 20000,
    statusTone: 'green',
  },
  'Травень 2026': {
    posts: 24,
    followers: 14380,
    netFollowers: 685,
    newFollowers: 842,
    unfollows: 157,
    avgReelViews: 16800,
    reelViewsDelta: 13,
    shares: 1480,
    sharesDelta: 19,
    er: 5.1,
    goalCurrent: 16800,
    goalTarget: 20000,
    statusTone: 'green',
  },
  'Червень 2026': {
    posts: 23,
    followers: 14892,
    netFollowers: 512,
    newFollowers: 711,
    unfollows: 199,
    avgReelViews: 15300,
    reelViewsDelta: -9,
    shares: 1390,
    sharesDelta: -6,
    er: 4.3,
    goalCurrent: 15300,
    goalTarget: 20000,
    statusTone: 'yellow',
  },
  'Липень 2026': {
    posts: 26,
    followers: 15420,
    netFollowers: 528,
    newFollowers: 704,
    unfollows: 176,
    avgReelViews: 18200,
    reelViewsDelta: 19,
    shares: 1710,
    sharesDelta: 23,
    er: 5.4,
    goalCurrent: 18200,
    goalTarget: 20000,
    statusTone: 'green',
  },
}

const weeklyTrends = {
  followers: [82, 96, 118, 102, 144, 133, 151, 172, 160, 186, 202, 214],
  reelViews: [11800, 12600, 12100, 13900, 14600, 15200, 14800, 16100, 15800, 17600, 18400, 19200],
  er: [4.1, 4.3, 4.0, 4.6, 4.8, 4.5, 4.9, 5.1, 4.7, 5.2, 5.4, 5.6],
}

const contentTypeBreakdown = [
  {
    format: 'Reels',
    posts: 14,
    avgViews: 18200,
    er: 4.9,
    note: 'Найбільший внесок у reach',
  },
  {
    format: 'Carousel',
    posts: 7,
    avgViews: 9200,
    er: 5.8,
    note: 'Найсильніший ER',
  },
  {
    format: 'Static',
    posts: 3,
    avgViews: 6100,
    er: 3.6,
    note: 'Працює для announcements',
  },
  {
    format: 'Stories',
    posts: 22,
    avgViews: 4200,
    er: 2.8,
    note: 'Підтримка частоти контакту',
  },
]

const posts = [
  {
    id: 'post_001',
    type: 'reel',
    publishedAt: '2026-07-10',
    thumbnailUrl: null,
    views: 21400,
    engagement: { likes: 840, shares: 148, saves: 302, total: 1290 },
    newFollowers: 57,
    er: 5.9,
    err: 7.6,
    nonFollowerReach: 16800,
    avgWatchTimeSeconds: 16.2,
    tag: 'Найкращий',
  },
  {
    id: 'post_002',
    type: 'carousel',
    publishedAt: '2026-07-08',
    thumbnailUrl: null,
    views: 9800,
    engagement: { likes: 610, shares: 94, saves: 266, total: 970 },
    newFollowers: 29,
    er: 6.1,
    err: 8.2,
    nonFollowerReach: 6400,
    tag: null,
  },
  {
    id: 'post_003',
    type: 'reel',
    publishedAt: '2026-07-05',
    thumbnailUrl: null,
    views: 12300,
    engagement: { likes: 540, shares: 88, saves: 210, total: 838 },
    newFollowers: 34,
    er: 4.1,
    err: 6.8,
    nonFollowerReach: 9800,
    avgWatchTimeSeconds: 14.2,
    tag: null,
  },
  {
    id: 'post_004',
    type: 'static',
    publishedAt: '2026-07-02',
    thumbnailUrl: null,
    views: 4200,
    engagement: { likes: 188, shares: 18, saves: 36, total: 242 },
    newFollowers: 6,
    er: 2.8,
    err: 4.4,
    nonFollowerReach: 2100,
    tag: 'Найгірший',
  },
  {
    id: 'post_005',
    type: 'reel',
    publishedAt: '2026-06-28',
    thumbnailUrl: null,
    views: 17600,
    engagement: { likes: 720, shares: 126, saves: 244, total: 1090 },
    newFollowers: 41,
    er: 5.2,
    err: 7.1,
    nonFollowerReach: 13900,
    avgWatchTimeSeconds: 15.5,
    tag: null,
  },
  {
    id: 'post_006',
    type: 'carousel',
    publishedAt: '2026-06-24',
    thumbnailUrl: null,
    views: 8600,
    engagement: { likes: 490, shares: 71, saves: 198, total: 759 },
    newFollowers: 22,
    er: 5.6,
    err: 7.8,
    nonFollowerReach: 5200,
    tag: null,
  },
]

export function getSmmMonthData(month) {
  const stats = monthStats[month] || monthStats['Липень 2026']
  const goalProgress = Math.round((stats.goalCurrent / stats.goalTarget) * 100)
  const status = statusForStats(stats)

  return {
    month,
    source: 'Meta Business Suite',
    status,
    signals: [
      {
        label: 'Приріст підписників',
        value: formatSigned(stats.netFollowers),
        detail: 'за вибраний місяць',
        tone: stats.netFollowers >= 450 ? 'green' : 'yellow',
      },
      {
        label: 'ER',
        value: `${formatDecimal(stats.er)}%`,
        detail: 'середній ER за місяць',
        tone: stats.er >= 5 ? 'green' : stats.er >= 4 ? 'yellow' : 'red',
      },
      {
        label: 'Перегляди рілз',
        value: `${goalProgress}%`,
        detail: `${formatNumber(stats.goalCurrent)} / ${formatNumber(stats.goalTarget)} до цілі`,
        tone: goalProgress >= 85 ? 'green' : goalProgress >= 65 ? 'yellow' : 'red',
      },
    ],
    kpis: {
      followers: {
        label: 'Підписники',
        value: stats.followers,
        delta: stats.netFollowers,
        detail: `${stats.newFollowers} нових · ${stats.unfollows} відписок`,
      },
      averageReelViews: {
        label: 'Середні перегляди рілз',
        value: stats.avgReelViews,
        deltaPercent: stats.reelViewsDelta,
        detail: 'до минулого місяця',
      },
      shares: {
        label: 'Шери за місяць',
        value: stats.shares,
        deltaPercent: stats.sharesDelta,
        detail: 'до минулого місяця',
      },
      goalProgress: {
        label: 'Прогрес до цілі місяця',
        value: goalProgress,
        current: stats.goalCurrent,
        target: stats.goalTarget,
        detail: `${formatNumber(stats.goalCurrent)} / ${formatNumber(stats.goalTarget)} сер. переглядів рілз`,
      },
    },
    trends: [
      {
        key: 'followers',
        title: 'Підписники',
        metricLabel: 'Приріст за тиждень',
        unit: '',
        periodLabel: 'Останні 12 тижнів',
        data: weeklyTrends.followers.map((value, index) => ({
          week: `W${index + 1}`,
          value,
        })),
      },
      {
        key: 'reelViews',
        title: 'Перегляди рілз',
        metricLabel: 'Середні перегляди',
        unit: '',
        periodLabel: 'Останні 12 тижнів',
        data: weeklyTrends.reelViews.map((value, index) => ({
          week: `W${index + 1}`,
          value,
        })),
      },
      {
        key: 'er',
        title: 'Engagement rate',
        metricLabel: 'ER',
        unit: '%',
        periodLabel: 'Останні 12 тижнів',
        data: weeklyTrends.er.map((value, index) => ({
          week: `W${index + 1}`,
          value,
        })),
      },
    ],
    monthlyBreakdown: buildMonthlyBreakdown(month),
    contentTypeBreakdown,
    posts: posts.map((post) => ({
      ...post,
      benchmark: post.type === 'reel' ? getViewsBenchmark(post.views) : null,
    })),
  }
}

export function buildSmmInsightsPayload(data) {
  if (!data) return null

  return {
    month: data.month,
    kpis: data.kpis,
    signals: data.signals,
    trends: data.trends,
    monthlyBreakdown: data.monthlyBreakdown,
    contentTypeBreakdown: data.contentTypeBreakdown,
    topPosts: data.posts
      .filter((post) => post.tag === 'Найкращий')
      .map(compactPostForAi),
    weakestPosts: data.posts
      .filter((post) => post.tag === 'Найгірший')
      .map(compactPostForAi),
    latestPosts: data.posts.slice(0, 6).map(compactPostForAi),
  }
}

export function monthToIsoMonth(month) {
  const index = MONTHS.indexOf(month)
  if (index === -1) return ''
  return `2026-${String(index + 1).padStart(2, '0')}`
}

export function formatNumber(value) {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value)
}

export function formatDecimal(value) {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value)
}

function buildMonthlyBreakdown(selectedMonth) {
  const selectedIndex = MONTHS.indexOf(selectedMonth)
  const endIndex = selectedIndex >= 0 ? selectedIndex : MONTHS.indexOf('Липень 2026')

  return MONTHS.slice(Math.max(0, endIndex - 5), endIndex + 1)
    .map((month) => {
      const stats = monthStats[month]
      if (!stats) return null

      return {
        month: month.split(' ')[0],
        posts: stats.posts,
        netFollowers: stats.netFollowers,
        er: stats.er,
      }
    })
    .filter(Boolean)
}

function statusForStats(stats) {
  if (stats.statusTone === 'green') {
    return {
      tone: 'green',
      title: 'Є що подивитись',
      description:
        'Рілз перевищують темп місяця, а ER тримається вище робочої норми.',
    }
  }

  if (stats.statusTone === 'red') {
    return {
      tone: 'red',
      title: 'Потрібна увага',
      description:
        'Ключові метрики просіли нижче темпу, варто переглянути форматний мікс.',
    }
  }

  return {
    tone: 'yellow',
    title: 'Все ок',
    description:
      'Зростання стабільне, але перегляди рілз ще не дотягують до цілі місяця.',
  }
}

function compactPostForAi(post) {
  return {
    id: post.id,
    type: post.type,
    publishedAt: post.publishedAt,
    views: post.views,
    benchmark: post.benchmark,
    engagement: post.engagement,
    newFollowers: post.newFollowers,
    er: post.er,
    err: post.err,
    nonFollowerReach: post.nonFollowerReach,
    avgWatchTimeSeconds: post.avgWatchTimeSeconds,
    tag: post.tag,
  }
}

function formatSigned(value) {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${formatNumber(value)}`
}
