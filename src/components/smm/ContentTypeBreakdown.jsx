import { formatDecimal, formatNumber } from '../../lib/smmData'

export function ContentTypeBreakdown({ items = [] }) {
  return (
    <section className="panel min-w-0">
      <div className="border-b border-line2 px-5 py-4">
        <h2 className="text-base font-semibold text-ink">Розбивка по типу контенту</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line2 text-xs font-semibold uppercase tracking-[0.08em] text-ink3">
              <th className="px-5 py-3">Формат</th>
              <th className="px-3 py-3 text-right">Пости</th>
              <th className="px-3 py-3 text-right">Сер. перегляди</th>
              <th className="px-5 py-3">ER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line2">
            {items.map((item) => (
              <tr key={item.format}>
                <td className="px-5 py-4">
                  <p className="font-semibold text-ink">{item.format}</p>
                  <p className="mt-1 text-xs text-ink3">{item.note}</p>
                </td>
                <td className="mono whitespace-nowrap px-3 py-4 text-right font-semibold text-ink">
                  {item.posts}
                </td>
                <td className="mono whitespace-nowrap px-3 py-4 text-right font-semibold text-ink">
                  {formatNumber(item.avgViews)}
                </td>
                <td className="min-w-44 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-line2">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, (item.er / 6) * 100)}%` }}
                      />
                    </div>
                    <span className="mono w-12 text-right font-semibold text-ink">
                      {formatDecimal(item.er)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
