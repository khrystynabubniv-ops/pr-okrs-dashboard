import { formatDecimal, formatNumber } from '../../lib/smmData'

export function MonthlyBreakdownTable({ rows = [] }) {
  return (
    <section className="panel h-full min-w-0">
      <div className="border-b border-line2 px-5 py-4">
        <h2 className="text-base font-semibold text-ink">По місяцях</h2>
        <p className="mt-1 text-sm text-ink3">Останні 6 місяців</p>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line2 text-xs font-semibold uppercase tracking-[0.08em] text-ink3">
              <th className="px-5 py-3">Місяць</th>
              <th className="px-3 py-3 text-right">Пости</th>
              <th className="px-3 py-3 text-right">Net</th>
              <th className="px-5 py-3 text-right">ER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line2">
            {rows.map((row) => (
              <tr key={row.month}>
                <td className="whitespace-nowrap px-5 py-4 font-semibold text-ink">
                  {row.month}
                </td>
                <td className="mono px-3 py-4 text-right font-semibold text-ink">
                  {row.posts}
                </td>
                <td className="mono px-3 py-4 text-right font-semibold text-pos">
                  +{formatNumber(row.netFollowers)}
                </td>
                <td className="mono px-5 py-4 text-right font-semibold text-ink">
                  {formatDecimal(row.er)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
