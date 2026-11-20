import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  PROMO_TYPES,
  formatCompactNumber,
  formatDelta,
  formatInt,
  formatMoney,
  formatPercent,
  formatUnitMoney,
} from '../../lib/promo'
import { CodeBadge, Panel, TypeTag } from './PromoParts'

const NO_ASHBY_HINT = 'Інтеграції з Ashby ще немає'

function kpiTiles(report) {
  const { kpis, currency, type } = report
  const previous = kpis.previousMonth
  const deltas = kpis.deltas || {}

  const tiles = [
    { label: 'Витрачено', value: formatMoney(kpis.spend, currency), delta: formatDelta(deltas.spend, previous) },
    {
      label: 'Покази',
      value: formatCompactNumber(kpis.impressions),
      delta: formatDelta(deltas.impressions, previous),
    },
    { label: 'Кліки', value: formatInt(kpis.clicks), delta: formatDelta(deltas.clicks, previous) },
    {
      label: 'CTR',
      value: formatPercent(kpis.ctr),
      delta: formatDelta(deltas.ctr, previous, { kind: 'points' }),
    },
    {
      label: 'Ціна кліку',
      value: formatUnitMoney(kpis.cpc, currency),
      delta: formatDelta(deltas.cpc, previous, { inverse: true }),
    },
  ]

  if (type === 'vac') {
    tiles.push({ label: 'Заявки в Ashby', value: '—', hint: NO_ASHBY_HINT })
  } else if (type === 'aw') {
    tiles.push({
      label: 'Охоплення',
      value: formatCompactNumber(kpis.reach),
      delta: formatDelta(deltas.reach, previous),
    })
  } else {
    tiles.push({
      label: 'Нові підписники',
      value: kpis.follows ? `+${formatInt(kpis.follows)}` : '—',
      delta: kpis.follows ? formatDelta(deltas.follows, previous) : null,
      hint: kpis.follows ? '' : 'Немає кампаній на підписку',
    })
  }

  return tiles
}

export function PromoKpis({ report }) {
  return (
    <Panel title="Ключові метрики" badge={<CodeBadge />}>
      <div className="pr-kpi-grid">
        {kpiTiles(report).map((tile) => (
          <div className="er-detail-metric pr-kpi" key={tile.label} title={tile.hint || undefined}>
            <span>{tile.label}</span>
            <strong>{tile.value}</strong>
            {tile.delta ? (
              <em className={`pr-delta pr-delta-${tile.delta.tone}`}>{tile.delta.text}</em>
            ) : (
              <em className="pr-delta pr-delta-none">{tile.hint || 'немає даних за попередній місяць'}</em>
            )}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function WeekTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) return null

  const rows = payload.filter((item) => item.value > 0)
  const total = rows.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="pr-chart-tooltip">
      <strong>{label}</strong>
      <span className="pr-chart-tooltip-total">{formatMoney(total, currency)}</span>
      {rows.map((item) => (
        <div key={item.dataKey}>
          <i style={{ background: item.color }} />
          {PROMO_TYPES[item.dataKey]?.label}
          <b>{formatMoney(item.value, currency)}</b>
        </div>
      ))}
    </div>
  )
}

function typeResult(row, currency) {
  if (row.type === 'subs') {
    return row.follows ? `+${formatInt(row.follows)} · ${formatUnitMoney(row.cpf, currency)}/підп.` : '—'
  }
  if (row.type === 'aw') return `охоплення ${formatCompactNumber(row.reach)}`
  return '—'
}

export function PromoDynamics({ report }) {
  const { weeks, byType, currency } = report
  const data = weeks.labels.map((week, index) => ({
    week,
    ...Object.fromEntries(Object.keys(PROMO_TYPES).map((type) => [type, weeks.series[type][index]])),
  }))

  return (
    <Panel
      title="Динаміка"
      aside={<span className="pr-panel-note">витрати по тижнях за типом кампанії</span>}
    >
      <div className="pr-legend">
        {weeks.types.map((type) => (
          <span key={type}>
            <i style={{ background: PROMO_TYPES[type].color }} />
            {PROMO_TYPES[type].label}
          </span>
        ))}
      </div>
      <div className="pr-chart" role="img" aria-label="Витрати по тижнях за типом кампанії">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="32%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              tickFormatter={(value) => formatMoney(value, currency)}
            />
            <Tooltip cursor={{ fill: 'var(--hover-soft)' }} content={<WeekTooltip currency={currency} />} />
            {weeks.types.map((type, index) => (
              <Bar
                key={type}
                dataKey={type}
                stackId="spend"
                fill={PROMO_TYPES[type].color}
                radius={index === weeks.types.length - 1 ? [5, 5, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="pr-table-shell">
        <table className="er-table pr-table pr-table-types">
          <thead>
            <tr>
              <th>Тип</th>
              <th className="er-align-right">Кампаній</th>
              <th className="er-align-right">Витрачено</th>
              <th className="er-align-right">Кліки</th>
              <th className="er-align-right">CTR</th>
              <th className="er-align-right">Ціна кліку</th>
              <th className="er-align-right">Результат</th>
            </tr>
          </thead>
          <tbody>
            {byType.map((row) => (
              <tr key={row.type}>
                <td data-label="Тип">
                  <TypeTag type={row.type} plural />
                </td>
                <td className="er-align-right er-metric-cell" data-label="Кампаній">
                  {row.campaigns}
                </td>
                <td className="er-align-right er-metric-cell" data-label="Витрачено">
                  {formatMoney(row.spend, currency)}
                </td>
                <td className="er-align-right er-metric-cell" data-label="Кліки">
                  {formatInt(row.clicks)}
                </td>
                <td className="er-align-right er-metric-cell" data-label="CTR">
                  {formatPercent(row.ctr)}
                </td>
                <td className="er-align-right er-metric-cell" data-label="Ціна кліку">
                  {formatUnitMoney(row.cpc, currency)}
                </td>
                <td className="er-align-right er-metric-cell" data-label="Результат">
                  {typeResult(row, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pr-hint">
        Тип кампанії визначається за назвою: <code>UNI | Вакансія | Назва | 11.2026</code>. Другий сегмент —
        Вакансія, Підписники або Awareness; кампанії без такого шаблону потрапляють у «Не розпізнано».
      </p>
    </Panel>
  )
}
