export function ProgressBar({ value }) {
  const percent = Math.max(0, Math.min(100, Number(value || 0)))

  return (
    <div className="flex min-w-36 items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-tag bg-line">
        <div
          className="h-full rounded-tag bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="mono w-10 text-right text-xs font-semibold text-muted">
        {percent}%
      </span>
    </div>
  )
}
