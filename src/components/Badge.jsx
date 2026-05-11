import { DIRECTION_STYLES } from '../constants'

export function DirectionBadge({ direction }) {
  const style = DIRECTION_STYLES[direction] || {
    badge: 'bg-slate-50 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {direction || 'Без напрямку'}
    </span>
  )
}
