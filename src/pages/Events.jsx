import { CalendarDays, Users } from 'lucide-react'
import { InfoTooltip } from '../components/InfoTooltip'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { MetricCard } from '../components/MetricCard'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'
import { eventLeadLabel, eventStatusMeta, sortEventsByDate } from '../lib/events'

const CALENDAR_EVENTS_HELP =
  'Дані з Notion Calendar Events, метрики підтягуються з Activities, якщо знайдено той самий івент.'

export function EventsPage({ selectedMonth }) {
  const { data, loading, error, retry } = useAsyncData(
    () =>
      apiRequest(`/api/notion/events?month=${encodeURIComponent(selectedMonth)}`),
    [selectedMonth],
  )

  const events = sortEventsByDate(data?.events || [])
  const ownerEvents = events.filter((event) => event.role === 'Owner')
  const totalContacts = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )

  return (
    <div className="space-y-6">
      {loading ? <LoadingState /> : null}
      {error ? <ErrorState error={error} onRetry={retry} /> : null}

      {!loading && !error ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              tooltip="Зібрані ліди з Activities."
              tone="orange"
            />
          </section>

          <section className="ui-panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h2 className="inline-flex items-center gap-2 font-display text-[19px] font-bold text-ink">
                  Календар івентів
                  <InfoTooltip text={CALENDAR_EVENTS_HELP} />
                </h2>
              </div>
              <CalendarDays className="h-5 w-5 text-accent" />
            </div>
            <div className="p-5">
              {!events.length ? (
                <EmptyState
                  title="Івентів за цей місяць немає"
                  text="Перевірте дату в полі Таймінг або доступ Notion integration до Calendar Events database."
                />
              ) : (
                <div className="ui-table-shell">
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>Назва</th>
                        <th>Тип</th>
                        <th>Дата</th>
                        <th>Роль</th>
                        <th>Ціль</th>
                        <th>Зібрані ліди</th>
                        <th>Аудиторія</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => {
                        const status = eventStatusMeta(event)
                        const leads = eventLeadLabel(event)

                        return (
                          <tr key={event.id}>
                            <td className="max-w-xs font-medium text-ink">
                              <div className="flex flex-wrap items-center gap-2">
                                <span>{event.title}</span>
                                <span
                                  className={`ui-tag ring-1 ring-inset ${status.className}`}
                                >
                                  {status.label}
                                </span>
                              </div>
                              {event.metricsMatched ? (
                                <p className="mt-1 text-xs font-normal text-good">
                                  метрики з Activities
                                </p>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap text-muted">
                              {event.type || '—'}
                            </td>
                            <td className="mono whitespace-nowrap text-muted">
                              {event.date || '—'}
                            </td>
                            <td className="whitespace-nowrap">
                              <span
                                className={`ui-tag ring-1 ring-inset ${
                                  event.role === 'Owner'
                                    ? 'bg-good-soft text-good ring-line'
                                    : 'bg-surface-2 text-muted ring-line'
                                }`}
                              >
                                {eventRoleLabel(event.role)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap text-muted">
                              {event.goal || '—'}
                            </td>
                            <td className="whitespace-nowrap text-ink">
                              <span className="inline-flex items-center gap-2">
                                <Users className="h-4 w-4 text-muted" />
                                <span className={leads.className}>{leads.text}</span>
                              </span>
                            </td>
                            <td className="text-muted">
                              {event.audience || '—'}
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

function eventRoleLabel(role) {
  return role === 'Owner' ? 'Owner' : 'Participant'
}
