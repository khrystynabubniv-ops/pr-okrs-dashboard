import { InfoTooltip } from '../InfoTooltip'
import { formatDecimal, formatNumber } from '../../lib/smmData'

export function ContentTypeBreakdown({ items = [] }) {
  return (
    <section className="panel min-w-0">
      <div className="border-b border-line2 px-5 py-4">
        <h2 className="text-base font-semibold text-ink">Розбивка по типу контенту</h2>
      </div>
      <div className="ui-table-shell border-0">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Формат</th>
              <th className="text-right">Пости</th>
              <th className="text-right">Сер. перегляди</th>
              <th>
                <span className="inline-flex items-center gap-1">
                  Сер. ER
                  <InfoTooltip text="ER = Σ(лайки + коментарі + шери + збереження + нові підписки) / підписники на початок місяця × 100. Пробні рілз рахуються окремим рядком і не впливають на ER звичайних Reels." />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.format}>
                <td>
                  <p className="font-semibold text-ink">{item.format}</p>
                  <p className="mt-1 text-xs text-ink3">{item.note}</p>
                </td>
                <td className="mono whitespace-nowrap text-right font-semibold text-ink">
                  {item.posts}
                </td>
                <td className="mono whitespace-nowrap text-right font-semibold text-ink">
                  {formatNumber(item.avgViews)}
                </td>
                <td className="min-w-44">
                  {item.er === null || item.er === undefined ? (
                    <span className="mono text-sm text-ink3">—</span>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${Math.min(100, (item.er / 3) * 100)}%` }}
                        />
                      </div>
                      <span className="mono w-12 text-right font-semibold text-ink">
                        {formatDecimal(item.er)}%
                      </span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
