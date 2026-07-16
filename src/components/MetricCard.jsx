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
    default: 'border-line bg-surface-2',
    accent: 'border-line bg-accent-soft',
    green: 'border-line bg-good-soft',
    orange: 'border-line bg-warn-soft',
    violet: 'border-line bg-tag-alt-bg',
    rose: 'border-line bg-warn-soft',
  }

  return (
    <div className={`rounded-card border p-3.5 ${tones[tone] || tones.default}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {label}
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="mono text-2xl font-bold leading-none text-ink">{value}</p>
        {unit ? (
          <p className="text-sm font-semibold leading-5 text-muted">{unit}</p>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm leading-5 text-muted">{detail}</p> : null}
    </div>
  )
}
