import { CalendarDays, Users } from 'lucide-react'
import { EVENT_TYPES } from '../constants'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { MetricCard } from '../components/MetricCard'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'
import { eventLeadLabel, eventStatusMeta } from '../lib/events'

export function EventsPage({ selectedMonth }) {
  const { data, loading, error, retry } = useAsyncData(
    () =>
      apiRequest(`/api/notion/events?month=${encodeURIComponent(selectedMonth)}`),
    [selectedMonth],
  )

  const events = data?.events || []
  const ownerEvents = events.filter((event) => event.role === 'Owner')
  const totalContacts = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )
  const breakdown = EVENT_TYPES.map((type) => ({
    type,
    count: events.filter((event) => eventMatchesType(event.type, type)).length,
  }))

  return (
    <div className="space-y-6">
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={retry} /> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Всього івентів"
              value={events.length}
              detail={selectedMonth}
              tone="accent"
            />
            <MetricCard
              label="Власних"
              value={ownerEvents.length}
              detail="роль Owner"
              tone="green"
            />
            <MetricCard
              label="Контакти"
              value={totalContacts}
              detail="зібрані ліди з Activities"
              tone="orange"
            />
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Breakdown
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {breakdown.map((item) => (
                  <div key={item.type} className="flex items-center justify-between gap-2">
                    <span className="truncate text-slate-500">{item.type}</span>
                    <span className="font-semibold text-slate-950">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Календар івентів
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Дані з Notion Calendar Events, метрики підтягуються з Activities, якщо знайдено той самий івент.
                </p>
              </div>
              <CalendarDays className="h-5 w-5 text-[#4361ee]" />
            </div>
            <div className="p-5">
              {!events.length ? (
                <EmptyState
                  title="Івентів за цей місяць немає"
                  text="Перевірте дату в полі Таймінг або доступ Notion integration до Calendar Events database."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-3 font-semibold">Назва</th>
                        <th className="px-3 py-3 font-semibold">Тип</th>
                        <th className="px-3 py-3 font-semibold">Дата</th>
                        <th className="px-3 py-3 font-semibold">Роль</th>
                        <th className="px-3 py-3 font-semibold">Ціль</th>
                        <th className="px-3 py-3 font-semibold">Рекрутери</th>
                        <th className="px-3 py-3 font-semibold">Зібрані ліди</th>
                        <th className="px-3 py-3 font-semibold">Аудиторія</th>
                        <th className="px-3 py-3 font-semibold">Метрики</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {events.map((event) => {
                        const status = eventStatusMeta(event)
                        const leads = eventLeadLabel(event)

                        return (
                          <tr key={event.id}>
                            <td className="max-w-xs px-3 py-4 font-medium text-slate-950">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{event.title}</span>
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}
                                >
                                  {status.label}
                                </span>
                              </div>
                              {event.metricsMatched ? (
                                <p className="mt-1 text-xs font-normal text-emerald-700">
                                  метрики з Activities
                                </p>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {event.type || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {event.date || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                                  event.role === 'Owner'
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                    : 'bg-slate-50 text-slate-700 ring-slate-200'
                                }`}
                              >
                                {event.role || 'Visitor'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {event.goal || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {event.recruiterCount || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-950">
                              <span className="inline-flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-400" />
                                <span className={leads.className}>{leads.text}</span>
                              </span>
                            </td>
                            <td className="px-3 py-4 text-slate-600">
                              {event.audience || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                              {event.metricsMatched ? (
                                <span>
                                  A:{event.applyCount || 0} · S:
                                  {event.selectCount || 0} · H:{event.hireCount || 0}
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}

function eventMatchesType(eventType, targetType) {
  const value = String(eventType || '').toLowerCase()
  const target = targetType.toLowerCase()

  if (target.includes('ярмар')) return value.includes('ярмарк')
  if (target.includes('партнер')) return value.includes('партнер')
  return value.includes(target)
}
