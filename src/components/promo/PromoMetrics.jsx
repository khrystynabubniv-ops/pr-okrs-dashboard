import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  PLATFORM_LABELS,
  PROMO_TYPES,
  appliesWord,
  vacancyChartModel,
  formatCompactNumber,
  formatDelta,
  formatInt,
  formatMoney,
  formatPercent,
  formatUnitMoney,
} from '../../lib/promo'
import { CodeBadge, Panel, PlatformIcon, TypeTag } from './PromoParts'

// Platforms shown under a tile: the ones with data, plus LinkedIn (as 0) when it is connected
// and the filter can contain vacancies, so a missing LinkedIn is visible rather than silent.
function splitPlatforms(report) {
  const present = report.kpis.byPlatform || {}
  const linkedinExpected =
    (report.type === 'all' || report.type === 'vac') && report.linkedin?.status !== 'not_configured'
  const platforms = ['meta', 'linkedin'].filter(
    (platform) => present[platform] || (platform === 'linkedin' && linkedinExpected),
  )

  return platforms.length > 1 || (platforms.length === 1 && platforms[0] === 'linkedin') ? platforms : []
}

function kpiTiles(report) {
  const { kpis, currency, type } = report
  const previous = kpis.previousMonth
  const deltas = kpis.deltas || {}
  const platforms = splitPlatforms(report)
  const split = (format, key) =>
    platforms.map((platform) => {
      const data = kpis.byPlatform?.[platform]
      return { platform, text: data ? format(data[key]) : '—' }
    })

  const tiles = [
    {
      label: 'Витрачено',
      value: formatMoney(kpis.spend, currency),
      delta: formatDelta(deltas.spend, previous),
      split: split((value) => formatMoney(value, currency), 'spend'),
    },
    {
      label: 'Покази',
      value: formatCompactNumber(kpis.impressions),
      delta: formatDelta(deltas.impressions, previous),
      split: split(formatCompactNumber, 'impressions'),
    },
    {
      label: 'Кліки',
      value: formatInt(kpis.clicks),
      delta: formatDelta(deltas.clicks, previous),
      split: split(formatInt, 'clicks'),
    },
    {
      label: 'CTR',
      value: formatPercent(kpis.ctr),
      delta: formatDelta(deltas.ctr, previous, { kind: 'points' }),
      split: split(formatPercent, 'ctr'),
    },
    {
      label: 'Ціна кліку',
      value: formatUnitMoney(kpis.cpc, currency),
      delta: formatDelta(deltas.cpc, previous, { inverse: true }),
      split: split((value) => formatUnitMoney(value, currency), 'cpc'),
    },
  ]

  if (type === 'vac') {
    const missing = kpis.vacanciesMissingApplies
    tiles.push({
      label: 'Еплаї',
      value: kpis.vacanciesCount && missing < kpis.vacanciesCount ? formatInt(kpis.applies) : '—',
      hint: missing
        ? `не внесено для ${missing} ${missing === 1 ? 'вакансії' : 'вакансій'}`
        : 'вносяться вручну по вакансіях',
    })
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
            {tile.split?.length ? (
              <div className="pr-kpi-split">
                {tile.split.map((item) => (
                  <span key={item.platform}>
                    <PlatformIcon platform={item.platform} />
                    {PLATFORM_LABELS[item.platform]}
                    <b>{item.text}</b>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  )
}

function WeekTooltip({ active, payload, label, currency, names }) {
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
          {names[item.dataKey]}
          <b>{formatMoney(item.value, currency)}</b>
        </div>
      ))}
    </div>
  )
}

function typeResult(row, currency) {
  if (row.type === 'vac') {
    return row.applies ? `${appliesWord(row.applies)} · ${row.platforms.join(' + ')}` : '—'
  }
  if (row.type === 'subs') {
    return row.follows ? `+${formatInt(row.follows)} · ${formatUnitMoney(row.cpf, currency)}/підп.` : '—'
  }
  if (row.type === 'aw') return `охоплення ${formatCompactNumber(row.reach)}`
  return '—'
}

export function PromoDynamics({ report }) {
  const { weeks, byType, currency } = report
  const perVacancy = report.type === 'vac' && weeks.vacancies?.order.length > 0

  // Per vacancy ("Вакансії" filter) or per campaign type (everything else).
  const model = perVacancy
    ? vacancyChartModel(weeks)
    : {
        bars: weeks.types.map((type) => ({
          dataKey: type,
          label: PROMO_TYPES[type].label,
          color: PROMO_TYPES[type].color,
        })),
        data: weeks.labels.map((week, index) => ({
          week,
          ...Object.fromEntries(Object.keys(PROMO_TYPES).map((type) => [type, weeks.series[type][index]])),
        })),
      }
  const names = Object.fromEntries(model.bars.map((bar) => [bar.dataKey, bar.label]))

  return (
    <Panel
      title="Динаміка"
      aside={
        <span className="pr-panel-note">
          {perVacancy ? 'витрати по тижнях за вакансіями' : 'витрати по тижнях за типом кампанії'}
        </span>
      }
    >
      <div className="pr-legend">
        {model.bars.map((bar) => (
          <span key={bar.dataKey}>
            <i style={{ background: bar.color }} />
            {bar.label}
          </span>
        ))}
      </div>
      <div className="pr-chart" role="img" aria-label="Витрати по тижнях">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={model.data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="32%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted)' }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={52}
              tick={{ fontSize: 12, fill: 'var(--muted)' }}
              tickFormatter={(value) => formatMoney(value, currency)}
            />
            <Tooltip
              cursor={{ fill: 'var(--hover-soft)' }}
              content={<WeekTooltip currency={currency} names={names} />}
            />
            {model.bars.map((bar, index) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                stackId="spend"
                fill={bar.color}
                radius={index === model.bars.length - 1 ? [5, 5, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="pr-table-shell">
        {perVacancy ? <VacancyTable report={report} /> : <TypeTable byType={byType} currency={currency} />}
      </div>
      <p className="pr-hint">
        Тип кампанії визначається за назвою: <code>UNI | Вакансія | Назва | 11.2026</code>. Другий сегмент —
        Вакансія, Підписники або Awareness; кампанії без такого шаблону потрапляють у «Не розпізнано».
      </p>
    </Panel>
  )
}

function VacancyTable({ report }) {
  const { currency, vacancies } = report

  return (
    <table className="er-table pr-table pr-table-types">
      <thead>
        <tr>
          <th>Вакансія</th>
          <th>Платформи</th>
          <th className="er-align-right">Витрачено</th>
          <th className="er-align-right">Кліки</th>
          <th className="er-align-right">CTR</th>
          <th className="er-align-right">Ціна кліку</th>
          <th className="er-align-right">Еплаї</th>
        </tr>
      </thead>
      <tbody>
        {[...vacancies]
          .sort((a, b) => b.spend - a.spend)
          .map((vacancy) => (
            <tr key={vacancy.key}>
              <td data-label="Вакансія">
                <span className="er-table-title">{vacancy.title}</span>
              </td>
              <td data-label="Платформи" className="er-muted">
                {vacancy.platforms.map((block) => block.label).join(' + ')}
              </td>
              <td className="er-align-right er-metric-cell" data-label="Витрачено">
                {formatMoney(vacancy.spend, currency)}
              </td>
              <td className="er-align-right er-metric-cell" data-label="Кліки">
                {formatInt(vacancy.clicks)}
              </td>
              <td className="er-align-right er-metric-cell" data-label="CTR">
                {formatPercent(vacancy.ctr)}
              </td>
              <td className="er-align-right er-metric-cell" data-label="Ціна кліку">
                {formatUnitMoney(vacancy.cpc, currency)}
              </td>
              <td className="er-align-right er-metric-cell" data-label="Еплаї">
                {vacancy.applies === null ? '—' : formatInt(vacancy.applies)}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  )
}

function TypeTable({ byType, currency }) {
  return (
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
  )
}
