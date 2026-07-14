import { Info } from 'lucide-react'

export function InfoTooltip({ text, label = 'Пояснення' }) {
  if (!text) return null

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-grid h-5 w-5 place-items-center rounded-full text-ink3 hover:bg-line2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-soft"
      >
        <Info className="h-4 w-4" />
      </button>
      <span className="pointer-events-none absolute right-0 top-6 z-30 hidden w-72 rounded-md border border-line bg-white px-3 py-2 text-left text-xs font-normal leading-5 text-ink2 shadow-lg group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  )
}
