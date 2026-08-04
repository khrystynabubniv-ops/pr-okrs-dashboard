import { CalendarDays, ExternalLink, Eye, Heart, Info, Target, UserPlus } from 'lucide-react'
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
  const card = (
    <article className="panel min-w-0 overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/10] overflow-hidden bg-surface-2 [background-image:repeating-linear-gradient(135deg,var(--surface-2)_0,var(--surface-2)_10px,var(--line)_10px,var(--line)_20px)]">
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
          {post.variantTag ? (
            <span className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {post.variantTag}
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
              {post.permalink ? <ExternalLink className="h-3.5 w-3.5" /> : null}
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

        <div className="rounded-card border border-line bg-surface-2 px-3 py-3">
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
          <PostStat
            icon={UserPlus}
            label="Підписки з поста"
            value={
              post.newFollowers === null || post.newFollowers === undefined
                ? '—'
                : `+${post.newFollowers}`
            }
            help={
              post.newFollowersUnavailableReason ||
              'Кількість акаунтів, які почали підписку після взаємодії з цим постом.'
            }
          />
          <PostStat
            icon={Eye}
            label="Охоплення"
            value={formatNumber(post.nonFollowerReach)}
            help="Охоплені акаунти з Meta media insights. Окремий зріз тільки по непідписниках Meta не повертає для цього media endpoint."
          />
          <PostStat
            label="ER"
            value={post.er === null || post.er === undefined ? '—' : `${formatDecimal(post.er)}%`}
            help="Взаємодії (включно з новими підписками) / підписники на початок місяця поста."
          />
          <PostStat
            label="ERR"
            value={`${formatDecimal(post.err)}%`}
            help="Взаємодії (включно з новими підписками) / охоплення поста."
          />
          {post.type === 'reel' ? (
            <>
              <PostStat
                label="Сер. перегляд"
                value={`${formatDecimal(post.avgWatchTimeSeconds)} c`}
              />
              <PostStat
                icon={Target}
                label="Ціль переглядів"
                value="15 000"
                variant="goal"
              />
            </>
          ) : null}
        </div>
      </div>
    </article>
  )

  if (!post.permalink) return card

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noreferrer"
      className="block min-w-0 text-inherit no-underline"
      title="Відкрити пост в Instagram"
      aria-label="Відкрити пост в Instagram"
    >
      {card}
    </a>
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

function PostStat({ icon: Icon, label, value, variant = 'default', help }) {
  return (
    <div
      className={`min-w-0 rounded-md border px-3 py-2 ${
        variant === 'goal'
          ? 'border-accent/30 bg-soft'
          : 'border-line2 bg-white'
      }`}
    >
      <div
        className={`flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] ${
          variant === 'goal' ? 'text-accent2' : 'text-ink3'
        }`}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        <span className="truncate">{label}</span>
        {help ? (
          <span
            className="inline-grid h-4 w-4 shrink-0 place-items-center rounded-full text-ink3"
            title={help}
            aria-label={help}
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <p
        className={`mono mt-1 text-sm font-semibold ${
          variant === 'goal' ? 'text-accent2' : 'text-ink'
        }`}
      >
        {value}
      </p>
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
