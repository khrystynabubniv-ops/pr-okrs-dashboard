import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS } from '../constants'

export function MonthSelector({ value, onChange, label = 'Місяць' }) {
  const currentIndex = Math.max(0, MONTHS.indexOf(value))
  const previousMonth = MONTHS[currentIndex - 1]
  const nextMonth = MONTHS[currentIndex + 1]

  return (
    <div className="inline-flex items-center rounded-button bg-toggle-bg p-[3px]">
      <button
        type="button"
        onClick={() => previousMonth && onChange(previousMonth)}
        disabled={!previousMonth}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink disabled:cursor-default disabled:opacity-55"
        aria-label={`Попередній ${label.toLowerCase()}`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-36 rounded-lg border-0 bg-transparent px-2 text-center text-[13px] font-semibold text-ink outline-none focus:bg-surface focus:ring-[3px] focus:ring-accent-soft"
        aria-label={label}
      >
        {MONTHS.map((month) => (
          <option key={month} value={month}>
            {month}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => nextMonth && onChange(nextMonth)}
        disabled={!nextMonth}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink disabled:cursor-default disabled:opacity-55"
        aria-label={`Наступний ${label.toLowerCase()}`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
