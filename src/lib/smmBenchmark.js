export function getViewsBenchmark(views) {
  if (views >= 15000) return { status: 'green', label: 'Ціль виконано' }

  if (views >= 10000) {
    const shortfallPercent = Math.round((1 - views / 15000) * 100)
    return {
      status: 'yellow',
      label: `Недобрали ${shortfallPercent}%`,
      shortfallPercent,
    }
  }

  return { status: 'red', label: 'Суттєво нижче цілі' }
}
