import { Info } from 'lucide-react'

export function InfoTooltip({ text, label = 'Пояснення' }) {
  if (!text) return null

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-grid h-5 w-5 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <Info className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-72 rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-slate-600 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}
