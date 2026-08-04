import { InfoTooltip } from '../InfoTooltip'
import { formatDecimal, formatNumber } from '../../lib/smmData'

const typeLabels = {
  reel: 'Reel',
  carousel: 'Carousel',
  static: 'Static',
  story: 'Story',
}

const tagStyles = {
  Найкращий: 'bg-soft text-accent2 ring-emerald-200',
  Найгірший: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function PostsTable({ posts = [] }) {
  return (
    <section className="panel min-w-0">
      <div className="ui-table-shell border-0">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Допис</th>
              <th className="text-right">Перегляди</th>
              <th className="text-right">Лайки</th>
              <th className="text-right">Коменти</th>
              <th className="text-right">Шери</th>
              <th className="text-right">Збереж.</th>
              <th className="text-right">Разом</th>
              <th className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  ER
                  <InfoTooltip text="ER = взаємодії / охоплення × 100 для цього поста." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.length ? (
              posts.map((post) => (
                <tr key={post.id}>
                  <td className="max-w-xs">
                    <a
                      href={post.permalink || undefined}
                      target={post.permalink ? '_blank' : undefined}
                      rel={post.permalink ? 'noreferrer' : undefined}
                      className="line-clamp-2 text-sm font-semibold text-ink no-underline hover:underline"
                      title={post.caption || ''}
                    >
                      {post.caption || 'Без підпису'}
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-line2 px-1.5 py-0.5 text-[11px] font-semibold text-ink3">
                        {typeLabels[post.type] || post.type}
                      </span>
                      {post.tag ? (
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                            tagStyles[post.tag] || 'bg-white text-ink ring-line'
                          }`}
                        >
                          {post.tag}
                        </span>
                      ) : null}
                      {post.variantTag ? (
                        <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
                          {post.variantTag}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="mono whitespace-nowrap text-right font-semibold text-ink">
                    {formatNumber(post.views)}
                  </td>
                  <td className="mono whitespace-nowrap text-right text-ink2">
                    {formatNumber(post.engagement.likes || 0)}
                  </td>
                  <td className="mono whitespace-nowrap text-right text-ink2">
                    {formatNumber(post.engagement.comments || 0)}
                  </td>
                  <td className="mono whitespace-nowrap text-right text-ink2">
                    {formatNumber(post.engagement.shares || 0)}
                  </td>
                  <td className="mono whitespace-nowrap text-right text-ink2">
                    {formatNumber(post.engagement.saves || 0)}
                  </td>
                  <td className="mono whitespace-nowrap text-right font-semibold text-ink">
                    {formatNumber(post.engagement.total || 0)}
                  </td>
                  <td className="mono whitespace-nowrap text-right font-semibold text-ink">
                    {formatDecimal(post.er)}%
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-ink3">
                  Немає публікацій за цим фільтром.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
