import { useMemo, useState } from 'react'
import { AlertTriangle, LayoutGrid, PlugZap, Table2, TrendingDown, TrendingUp } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { InstagramIcon } from '../components/icons/InstagramIcon'
import { MonthSelector } from '../components/MonthSelector'
import { AiInsightsCard } from '../components/smm/AiInsightsCard'
import { ConclusionsNotes } from '../components/smm/ConclusionsNotes'
import { ContentTypeBreakdown } from '../components/smm/ContentTypeBreakdown'
import { MonthlyBreakdownTable } from '../components/smm/MonthlyBreakdownTable'
import { PostCard } from '../components/smm/PostCard'
import { PostsTable } from '../components/smm/PostsTable'
import { SmmSourceIndicator, StatusHero } from '../components/smm/StatusHero'
import { TrendChart } from '../components/smm/TrendChart'
import { useSmmData } from '../hooks/useSmmData'
import {
  buildSmmInsightsPayload,
  formatNumber,
  monthToIsoMonth,
} from '../lib/smmData'

const anchors = [
  { href: '#glance', label: 'Огляд' },
  { href: '#trends', label: 'Тренди' },
  { href: '#formats', label: 'Формати' },
  { href: '#posts', label: 'Пости' },
  { href: '#conclusions', label: 'Висновки' },
]

const REEL_POST_VIEW_TARGET = 15000

export function SmmPage({ selectedMonth, onMonthChange }) {
  const [searchParams] = useSearchParams()
  const previewState = searchParams.get('previewState') || ''
  const { data, loading, error } = useSmmData(selectedMonth, previewState)
  const [connectionNotice, setConnectionNotice] = useState('')
  const [postFilter, setPostFilter] = useState('latest')
  const [postView, setPostView] = useState('cards')
  const monthKey = monthToIsoMonth(selectedMonth)
  const insightsPayload = useMemo(() => buildSmmInsightsPayload(data), [data])
  const insightsUnavailableReason = data?.meta?.isEmptyMonth
    ? 'Недостатньо даних для аналізу цього місяця'
    : ''
  const postTabs = useMemo(() => buildPostTabs(data?.posts || []), [data])
  const activePostTab = postTabs.find((tab) => tab.key === postFilter) || postTabs[0]

  if (loading) {
    return (
      <SmmShell
        selectedMonth={selectedMonth}
        onMonthChange={onMonthChange}
        source="Meta Business Suite"
      >
        <SmmSkeleton />
      </SmmShell>
    )
  }

  if (error) {
    return (
      <SmmShell
        selectedMonth={selectedMonth}
        onMonthChange={onMonthChange}
        source="Meta Business Suite"
      >
        <section className="panel px-6 py-8">
          <div className="flex max-w-3xl items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Live-дані Meta не завантажились
              </p>
              <p className="mt-2 text-sm leading-6 text-ink2">{error.message}</p>
              <p className="mt-2 text-sm leading-6 text-ink3">
                Demo-цифри тут більше не показуємо, щоб не плутати їх з реальними
                показниками акаунта.
              </p>
            </div>
          </div>
        </section>
      </SmmShell>
    )
  }

  if (!data) {
    return (
      <SmmShell
        selectedMonth={selectedMonth}
        onMonthChange={onMonthChange}
        source="Meta Business Suite"
      >
        <section className="panel grid min-h-96 place-items-center px-6 py-12 text-center">
          <div className="max-w-md">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-soft text-accent2">
              <InstagramIcon className="h-7 w-7" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-ink">
              Немає даних з Instagram
            </h2>
            <p className="mt-2 text-sm leading-6 text-ink2">
              Підключення Meta Business Suite ще не активне для цього workspace.
            </p>
            <button
              type="button"
              onClick={() => setConnectionNotice('Інтеграція в розробці')}
            className="ui-button ui-button-primary mt-5"
            >
              <PlugZap className="h-4 w-4" />
              Підключити Instagram
            </button>
            {connectionNotice ? (
              <p className="mt-3 text-sm font-medium text-ink3">{connectionNotice}</p>
            ) : null}
          </div>
        </section>
      </SmmShell>
    )
  }

  return (
    <SmmShell
      selectedMonth={selectedMonth}
      onMonthChange={onMonthChange}
      source={data.source}
    >
      {data.integrationError ? (
        <section className="rounded-[10px] border border-warn/30 bg-warmsoft px-4 py-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div>
              <p className="text-sm font-semibold text-ink">
                Live-дані Meta не завантажились.
              </p>
              <p className="mt-1 text-sm leading-5 text-ink2">{data.integrationError}</p>
            </div>
          </div>
        </section>
      ) : null}

      <section id="glance" className="scroll-mt-28 space-y-5">
        <StatusHero status={data.status} signals={data.signals} />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SmmKpiCard
            label={data.kpis.followers.label}
            value={formatOptionalNumber(data.kpis.followers.value)}
            delta={data.kpis.followers.delta}
            detail={data.kpis.followers.detail}
          />
          <SmmKpiCard
            label={data.kpis.averageReelViews.label}
            value={formatOptionalNumber(data.kpis.averageReelViews.value)}
            deltaPercent={data.kpis.averageReelViews.deltaPercent}
            detail={data.kpis.averageReelViews.detail}
          />
          <SmmKpiCard
            label={data.kpis.shares.label}
            value={formatOptionalNumber(data.kpis.shares.value)}
            deltaPercent={data.kpis.shares.deltaPercent}
            detail={data.kpis.shares.detail}
          />
          <SmmKpiCard
            label={data.kpis.goalProgress.label}
            value={formatOptionalPercent(data.kpis.goalProgress.value)}
            detail={data.kpis.goalProgress.detail}
            progress={data.kpis.goalProgress.value}
          />
        </div>

        <MonthlyBreakdownTable rows={data.monthlyBreakdown} />
      </section>

      <section id="trends" className="scroll-mt-28 space-y-4">
        <div>
          <p className="section-label">Drill-down</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Тренди за 12 тижнів</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {data.trends.map((trend) => (
            <TrendChart key={trend.key} trend={trend} />
          ))}
        </div>
      </section>

      <section id="formats" className="scroll-mt-28">
        <ContentTypeBreakdown items={data.contentTypeBreakdown} />
      </section>

      <section id="posts" className="scroll-mt-28 space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Content performance</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Пости</h2>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-medium text-ink3">
              {activePostTab.posts.length} з {data.posts.length} публікацій
            </p>
            <div className="inline-flex rounded-md border border-line bg-white p-1">
              <button
                type="button"
                onClick={() => setPostView('cards')}
                aria-label="Картки"
                title="Картки"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition ${
                  postView === 'cards' ? 'bg-accent text-white' : 'text-ink3 hover:text-ink'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPostView('table')}
                aria-label="Таблиця"
                title="Таблиця"
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition ${
                  postView === 'table' ? 'bg-accent text-white' : 'text-ink3 hover:text-ink'
                }`}
              >
                <Table2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {postTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setPostFilter(tab.key)}
              className={`shrink-0 rounded-md px-3 py-2 text-sm font-semibold transition ${
                activePostTab.key === tab.key
                  ? 'bg-accent text-white'
                  : 'border border-line bg-white text-ink2 hover:bg-hover-soft hover:text-ink'
              }`}
            >
              {tab.label}
              <span className="ml-2 text-xs opacity-75">{tab.posts.length}</span>
            </button>
          ))}
        </div>
        {postView === 'table' ? (
          <PostsTable posts={activePostTab.posts} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            {activePostTab.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>

      <section id="conclusions" className="scroll-mt-28 space-y-4">
        <div>
          <p className="section-label">Підсумок</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Висновки та рекомендації</h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AiInsightsCard
            monthKey={monthKey}
            monthLabel={selectedMonth}
            payload={insightsPayload}
            unavailableReason={insightsUnavailableReason}
          />
          <ConclusionsNotes monthKey={monthKey} />
        </div>
      </section>
    </SmmShell>
  )
}

function SmmShell({ selectedMonth, onMonthChange, source, children }) {
  return (
    <div className="space-y-6">
      <div className="ui-panel flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <MonthSelector value={selectedMonth} onChange={onMonthChange} />
          <nav className="flex gap-1 overflow-x-auto">
            {anchors.map((anchor) => (
              <a
                key={anchor.href}
                href={anchor.href}
                className="shrink-0 rounded-button px-3 py-2 text-sm font-semibold text-muted transition hover:bg-hover-soft hover:text-ink"
              >
                {anchor.label}
              </a>
            ))}
          </nav>
        </div>
        <SmmSourceIndicator source={source} />
      </div>
      {children}
    </div>
  )
}

function SmmKpiCard({ label, value, delta, deltaPercent, detail, progress }) {
  const hasDelta =
    (delta !== undefined && delta !== null) ||
    (deltaPercent !== undefined && deltaPercent !== null)
  const deltaValue = delta ?? deltaPercent
  const isPositive = Number(deltaValue) >= 0
  const DeltaIcon = isPositive ? TrendingUp : TrendingDown

  return (
    <article className="panel px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <p className="mono text-2xl font-bold leading-none text-ink">{value}</p>
        {hasDelta ? (
          <span
            className={`mb-0.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
              isPositive ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'
            }`}
          >
            <DeltaIcon className="h-3.5 w-3.5" />
            {formatDelta(deltaValue, deltaPercent !== undefined)}
          </span>
        ) : null}
      </div>
      {progress !== undefined ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-line2">
            <div
              className="h-full rounded-tag bg-accent"
              style={{
                width:
                  progress === null
                    ? '0%'
                    : `${Math.min(100, Number(progress || 0))}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-sm leading-5 text-muted">{detail}</p>
    </article>
  )
}

function SmmSkeleton() {
  return (
    <div className="space-y-5">
      <div className="panel flex min-h-40 items-center px-5 py-5">
        <div className="w-full animate-pulse space-y-4">
          <div className="h-4 w-40 rounded bg-line2" />
          <div className="h-7 w-72 max-w-full rounded bg-line2" />
          <div className="h-4 w-96 max-w-full rounded bg-line2" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="h-32 animate-pulse rounded-[10px] bg-line2/70" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
        <div className="h-72 animate-pulse rounded-[10px] bg-line2/70" />
        <div className="h-72 animate-pulse rounded-[10px] bg-line2/70" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-44 animate-pulse rounded-[10px] bg-line2/70" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-96 animate-pulse rounded-[10px] bg-line2/70" />
        ))}
      </div>
    </div>
  )
}

function formatDelta(value, isPercent) {
  const number = Number(value || 0)
  const prefix = number > 0 ? '+' : ''
  return `${prefix}${number}${isPercent ? '%' : ''}`
}

function formatOptionalNumber(value) {
  return value === null || value === undefined ? '—' : formatNumber(value)
}

function formatOptionalPercent(value) {
  return value === null || value === undefined ? '—' : `${value}%`
}

function buildPostTabs(posts) {
  const regularPosts = sortPostsByDateDesc(
    posts.filter((post) => post.variantTag !== 'Пробний'),
  )
  const trialPosts = sortPostsByDateDesc(
    posts.filter((post) => post.variantTag === 'Пробний'),
  )
  const sortedByViews = [...regularPosts].sort(
    (left, right) => Number(right.views || 0) - Number(left.views || 0),
  )
  const belowTargetPosts = regularPosts.filter(
    (post) => post.type === 'reel' && Number(post.views || 0) < REEL_POST_VIEW_TARGET,
  )

  return [
    { key: 'latest', label: 'Останні', posts: regularPosts },
    { key: 'top', label: 'Топ за переглядами', posts: sortedByViews.slice(0, 6) },
    { key: 'below', label: 'Reels нижче цілі', posts: belowTargetPosts },
    { key: 'trial', label: 'Пробні', posts: trialPosts },
  ]
}

function sortPostsByDateDesc(posts) {
  return [...posts].sort((left, right) => {
    const leftTime = Date.parse(left.publishedAt || '')
    const rightTime = Date.parse(right.publishedAt || '')

    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime
    }

    return Number(right.views || 0) - Number(left.views || 0)
  })
}
