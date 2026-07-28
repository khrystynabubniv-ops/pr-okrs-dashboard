import { formatDecimal, formatNumber } from '../../lib/smmData'

export function MonthlyBreakdownTable({ rows = [] }) {
  return (
    <section className="panel h-full min-w-0">
      <div className="border-b border-line2 px-5 py-4">
        <h2 className="text-base font-semibold text-ink">По місяцях</h2>
        <p className="mt-1 text-sm text-ink3">Останні 6 місяців</p>
      </div>
      <div className="ui-table-shell border-0">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Місяць</th>
              <th className="text-right">Пости</th>
              <th
                className="text-right"
                title="Нові підписки мінус відписки за місяць з Meta follows_and_unfollows."
              >
                Net приріст
              </th>
              <th className="text-right">ER</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="whitespace-nowrap font-semibold text-ink">
                  {row.month}
                </td>
                <td className="mono text-right font-semibold text-ink">
                  {row.posts}
                </td>
                <td
                  className={`mono text-right font-semibold ${
                    row.netFollowers < 0 ? 'text-neg' : 'text-pos'
                  }`}
                  title={
                    row.newFollowers !== null &&
                    row.newFollowers !== undefined &&
                    row.unfollows !== null &&
                    row.unfollows !== undefined
                      ? `${formatNumber(row.newFollowers)} нових · ${formatNumber(row.unfollows)} відписок`
                      : undefined
                  }
                >
                  {row.netFollowers === null || row.netFollowers === undefined
                    ? '—'
                    : `${row.netFollowers > 0 ? '+' : ''}${formatNumber(row.netFollowers)}`}
                </td>
                <td className="mono text-right font-semibold text-ink">
                  {row.er === null || row.er === undefined ? '—' : `${formatDecimal(row.er)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
