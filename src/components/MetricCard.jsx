import { InfoTooltip } from './InfoTooltip'

export function MetricCard({
  label,
  value,
  unit,
  detail,
  tooltip,
  tone = 'default',
}) {
  const tones = {
    default: 'border-line bg-white',
    accent: 'border-emerald-200 bg-soft/70',
    green: 'border-emerald-200 bg-emerald-50',
    orange: 'border-amber-200 bg-warmsoft/70',
    violet: 'border-line bg-white',
    rose: 'border-rose-200 bg-rose-50',
  }

  return (
    <div className={`rounded-[10px] border px-4 py-4 ${tones[tone] || tones.default}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink3">
          {label}
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="mono text-3xl font-semibold leading-none text-ink">{value}</p>
        {unit ? (
          <p className="text-sm font-semibold leading-5 text-ink2">{unit}</p>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm leading-5 text-ink2">{detail}</p> : null}
    </div>
  )
}
