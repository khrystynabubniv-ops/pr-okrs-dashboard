import { CalendarDays, Eye, Heart, Send, UserPlus } from 'lucide-react'
import { formatDecimal, formatNumber } from '../../lib/smmData'

const typeLabels = {
  reel: 'Reel',
  carousel: 'Carousel',
  static: 'Static',
  story: 'Story',
}

const benchmarkStyles = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const tagStyles = {
  Найкращий: 'bg-soft text-accent2 ring-emerald-200',
  Найгірший: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function PostCard({ post }) {
  return (
    <article className="panel min-w-0 overflow-hidden">
      <div className="relative aspect-[16/10] overflow-hidden bg-line2 [background-image:repeating-linear-gradient(135deg,#f8faf8_0,#f8faf8_10px,#e7e6e1_10px,#e7e6e1_20px)]">
        {post.thumbnailUrl ? (
          <img
            src={post.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <span className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            {typeLabels[post.type] || post.type}
          </span>
          {post.tag ? (
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                tagStyles[post.tag] || 'bg-white text-ink ring-line'
              }`}
            >
              {post.tag}
            </span>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink3">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatPostDate(post.publishedAt)}
            </p>
            <div className="mt-3 flex items-end gap-2">
              <Eye className="mb-1 h-4 w-4 text-accent" />
              <p className="mono text-3xl font-semibold leading-none text-ink">
                {formatNumber(post.views)}
              </p>
            </div>
            <p className="mt-1 text-xs font-medium text-ink3">
              {post.type === 'reel' ? 'переглядів' : 'охоплення / переглядів'}
            </p>
          </div>
          {post.benchmark ? <BenchmarkBadge benchmark={post.benchmark} /> : null}
        </div>

        <div className="rounded-md border border-line2 bg-[#fbfcfb] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <Heart className="h-4 w-4 text-neg" />
              Взаємодії
            </p>
            <p className="mono text-lg font-semibold text-ink">
              {formatNumber(post.engagement.total)}
            </p>
          </div>
          <p className="mt-2 text-xs text-ink3">
            {formatNumber(post.engagement.likes)} лайків ·{' '}
            {formatNumber(post.engagement.shares)} шерів ·{' '}
            {formatNumber(post.engagement.saves)} збережень
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <PostStat icon={UserPlus} label="Нові підписники" value={`+${post.newFollowers}`} />
          <PostStat
            icon={Send}
            label="Непідписники"
            value={formatNumber(post.nonFollowerReach)}
          />
          <PostStat label="ER" value={`${formatDecimal(post.er)}%`} />
          <PostStat label="ERR" value={`${formatDecimal(post.err)}%`} />
          {post.type === 'reel' ? (
            <>
              <PostStat
                label="Сер. перегляд"
                value={`${formatDecimal(post.avgWatchTimeSeconds)} c`}
              />
              <PostStat label="Ціль" value="15 000" />
            </>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function BenchmarkBadge({ benchmark }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
        benchmarkStyles[benchmark.status] || benchmarkStyles.yellow
      }`}
    >
      {benchmark.label}
    </span>
  )
}

function PostStat({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-md border border-line2 bg-white px-3 py-2">
      <p className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink3">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </p>
      <p className="mono mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

function formatPostDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value || '—'

  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: 'short',
  })
}
