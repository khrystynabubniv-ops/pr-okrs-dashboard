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

export function sortEventsByDate(events) {
  return [...events].sort((left, right) => {
    const leftDate = parseEventDate(left)
    const rightDate = parseEventDate(right)

    if (!leftDate && !rightDate) {
      return String(left.title || '').localeCompare(String(right.title || ''), 'uk')
    }
    if (!leftDate) return 1
    if (!rightDate) return -1

    const dateDiff = leftDate - rightDate
    if (dateDiff !== 0) return dateDiff

    return String(left.title || '').localeCompare(String(right.title || ''), 'uk')
  })
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
  const status = eventStatusLabel(event)
  if (status) return isDoneEventStatus(status)

  return getEventTiming(event, today) === 'completed'
}

export function eventStatusMeta(event, today = new Date()) {
  const status = eventStatusLabel(event)
  if (isDoneEventStatus(status)) {
    return {
      label: 'Відбулося',
      className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    }
  }

  if (status) {
    return {
      label: status,
      className: eventStatusClassName(status),
    }
  }

  const timing = getEventTiming(event, today)

  if (timing === 'today') {
    return {
      label: 'Сьогодні',
      className: 'bg-blue-50 text-blue-700 ring-blue-200',
    }
  }

  if (timing === 'completed') {
    return {
      label: 'Без статусу',
      className: 'bg-slate-50 text-slate-700 ring-slate-200',
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

function eventStatusLabel(event) {
  return String(event?.status || '').trim()
}

function isDoneEventStatus(status) {
  return [
    'done',
    'completed',
    'complete',
    'виконано',
    'відбулося',
    'відбулось',
    'відбувся',
    'відбулась',
    'відбулася',
    '✅',
  ].includes(normalizeEventStatus(status))
}

function eventStatusClassName(status) {
  const normalized = normalizeEventStatus(status)

  if (
    [
      'canceled',
      'cancelled',
      'cancel',
      'not done',
      'not completed',
      'no',
      'false',
      'скасовано',
      'скасований',
      'відмінено',
      'не виконано',
      'не відбулося',
      'не відбулось',
      'ні',
    ].includes(normalized)
  ) {
    return 'bg-rose-50 text-rose-700 ring-rose-200'
  }

  if (normalized.includes('postpon') || normalized.includes('перенес')) {
    return 'bg-amber-50 text-amber-700 ring-amber-200'
  }

  if (normalized.includes('progress') || normalized.includes('процес')) {
    return 'bg-blue-50 text-blue-700 ring-blue-200'
  }

  return 'bg-slate-50 text-slate-700 ring-slate-200'
}

function normalizeEventStatus(status) {
  return String(status || '').trim().toLowerCase()
}
