export function ProgressBar({ value }) {
  const percent = Math.max(0, Math.min(100, Number(value || 0)))

  return (
    <div className="flex min-w-36 items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#4361ee] transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-medium text-slate-600">
        {percent}%
      </span>
    </div>
  )
}
