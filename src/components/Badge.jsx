import { DIRECTION_STYLES } from '../constants'

export function DirectionBadge({ direction }) {
  const style = DIRECTION_STYLES[direction] || {
    badge: 'bg-surface-2 text-muted ring-line',
    dot: 'bg-muted',
  }

  return (
    <span
      className={`ui-tag gap-1.5 ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {direction || 'Без напрямку'}
    </span>
  )
}
