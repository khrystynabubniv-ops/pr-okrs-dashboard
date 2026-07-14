import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTHS } from '../constants'

export function MonthSelector({ value, onChange, label = 'Місяць' }) {
  const currentIndex = Math.max(0, MONTHS.indexOf(value))
  const previousMonth = MONTHS[currentIndex - 1]
  const nextMonth = MONTHS[currentIndex + 1]

  return (
    <div className="inline-flex items-center rounded-md border border-line bg-white p-1">
      <button
        type="button"
        onClick={() => previousMonth && onChange(previousMonth)}
        disabled={!previousMonth}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink2 transition hover:bg-line2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={`Попередній ${label.toLowerCase()}`}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-36 border-0 bg-transparent px-2 text-center text-sm font-semibold text-ink outline-none"
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
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink2 transition hover:bg-line2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
        aria-label={`Наступний ${label.toLowerCase()}`}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
