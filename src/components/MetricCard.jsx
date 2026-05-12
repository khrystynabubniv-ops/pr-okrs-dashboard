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
    default: 'border-slate-200 bg-white',
    accent: 'border-blue-200 bg-blue-50',
    green: 'border-emerald-200 bg-emerald-50',
    orange: 'border-orange-200 bg-orange-50',
    violet: 'border-violet-200 bg-violet-50',
    rose: 'border-rose-200 bg-rose-50',
  }

  return (
    <div className={`rounded-lg border px-4 py-4 ${tones[tone] || tones.default}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <InfoTooltip text={tooltip} />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-3xl font-semibold leading-none text-slate-950">{value}</p>
        {unit ? (
          <p className="text-sm font-semibold leading-5 text-slate-600">{unit}</p>
        ) : null}
      </div>
      {detail ? <p className="mt-3 text-sm leading-5 text-slate-600">{detail}</p> : null}
    </div>
  )
}
