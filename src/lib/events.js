export function parseEventDate(event) {
  if (event.rawDate) {
    const date = new Date(event.rawDate)
    return Number.isNaN(date.getTime()) ? null : startOfDay(date)
  }

  if (!event.date) return null
  const [day, month, year] = String(event.date).split('.').map(Number)
  if (!day || !month || !year) return null

  return startOfDay(new Date(year, month - 1, day))
}

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function getEventTiming(event, today = new Date()) {
  const eventDate = parseEventDate(event)
  if (!eventDate) return 'planned'

  const currentDay = startOfDay(today)
  if (eventDate < currentDay) return 'completed'
  if (eventDate.getTime() === currentDay.getTime()) return 'today'
  return 'upcoming'
}

export function isEventCompleted(event, today = new Date()) {
  return getEventTiming(event, today) === 'completed'
}

export function eventStatusMeta(event, today = new Date()) {
  const timing = getEventTiming(event, today)

  if (timing === 'completed') {
    return {
      label: 'Відбулося',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    }
  }

  if (timing === 'today') {
    return {
      label: 'Сьогодні',
      className: 'bg-blue-50 text-blue-700 ring-blue-200',
    }
  }

  return {
    label: 'Заплановано',
    className: 'bg-slate-50 text-slate-700 ring-slate-200',
  }
}

export function eventLeadLabel(event, today = new Date()) {
  const contacts = Number(event.contacts || 0)

  if (contacts > 0) {
    return {
      text: `${contacts} лідів`,
      className: 'text-slate-700',
    }
  }

  if (!isEventCompleted(event, today)) {
    return {
      text: 'Leads is coming',
      className: 'text-blue-700',
    }
  }

  return {
    text: '0 лідів',
    className: 'text-slate-700',
  }
}

export function eventSummaryStats(events, today = new Date()) {
  const completed = events.filter((event) => isEventCompleted(event, today)).length

  return {
    completed,
    participating: events.length,
  }
}
