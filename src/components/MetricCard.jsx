export function MetricCard({ label, value, detail, tone = 'default' }) {
  const tones = {
    default: 'border-slate-200 bg-white',
    accent: 'border-blue-200 bg-blue-50',
    green: 'border-emerald-200 bg-emerald-50',
    orange: 'border-orange-200 bg-orange-50',
    violet: 'border-violet-200 bg-violet-50',
  }

  return (
    <div className={`rounded-lg border px-4 py-4 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-sm text-slate-500">{detail}</p> : null}
    </div>
  )
}
