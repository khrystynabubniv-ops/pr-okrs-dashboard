import { useMemo, useState } from 'react'
import { CheckCircle2, Pencil, Plus, Save } from 'lucide-react'
import { FOCUS_TEAMS, METRIC_TYPES, MONTHS } from '../constants'
import { Modal } from '../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'

export function MonthlyFocusPage({ selectedMonth }) {
  const [teamFilter, setTeamFilter] = useState('Усі')
  const [modalFocus, setModalFocus] = useState(null)
  const [saving, setSaving] = useState(false)
  const [updatingStatusId, setUpdatingStatusId] = useState(null)
  const [saved, setSaved] = useState(false)
  const [mutationError, setMutationError] = useState(null)

  const focusQuery = useAsyncData(
    () =>
      apiRequest(
        `/api/notion/monthly-focus?month=${encodeURIComponent(selectedMonth)}`,
      ),
    [selectedMonth],
  )

  const entries = useMemo(() => focusQuery.data?.entries || [], [focusQuery.data])
  const visibleEntries = useMemo(() => {
    if (teamFilter === 'Усі') return entries
    return entries.filter((entry) => entry.team === teamFilter)
  }, [entries, teamFilter])
  const achievedCount = entries.filter((entry) => entry.achieved).length
  const ownerOptions = useMemo(
    () =>
      uniqueOptions([
        ...(focusQuery.data?.ownerOptions || []),
        ...entries.map((entry) => entry.owner),
      ]),
    [entries, focusQuery.data],
  )

  function openCreateModal() {
    setSaved(false)
    setMutationError(null)
    setModalFocus(createEmptyFocus(selectedMonth, teamFilter))
  }

  function openEditModal(entry) {
    setSaved(false)
    setMutationError(null)
    setModalFocus({
      id: entry.id,
      title: entry.title || '',
      team: entry.team || FOCUS_TEAMS[0],
      month: selectedMonth,
      metricType: entry.metricType || METRIC_TYPES[0],
      metric: entry.metric || '',
      owner: entry.owner || '',
      ownerId: entry.ownerId || '',
      status: entry.status || statusFromAchieved(entry.achieved),
      achieved: Boolean(entry.achieved),
      comment: entry.comment || '',
    })
  }

  async function handleStatusChange(entry, status) {
    setUpdatingStatusId(entry.id)
    setMutationError(null)

    try {
      await apiRequest('/api/notion/monthly-focus', {
        method: 'POST',
        body: JSON.stringify({
          ...entry,
          month: selectedMonth,
          status,
          achieved: status === 'Виконано',
        }),
      })
      await focusQuery.retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setUpdatingStatusId(null)
    }
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!modalFocus) return

    setSaving(true)
    setSaved(false)
    setMutationError(null)

    try {
      await apiRequest('/api/notion/monthly-focus', {
        method: 'POST',
        body: JSON.stringify(modalFocus),
      })
      setSaved(true)
      setModalFocus(null)
      await focusQuery.retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="ui-panel px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-[19px] font-bold text-ink">
              Фокуси на {selectedMonth}
            </h2>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="ui-button ui-button-primary"
          >
            <Plus className="h-4 w-4" />
            Додати фокус
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <FocusStat label="Усього фокусів" value={entries.length} />
          <FocusStat label="Виконано" value={achievedCount} tone="green" />
          <FocusStat
            label="Потребують уваги"
            value={Math.max(0, entries.length - achievedCount)}
            tone="orange"
          />
        </div>
      </section>

      <div className="ui-toggle max-w-full overflow-x-auto">
        {['Усі', ...FOCUS_TEAMS].map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => setTeamFilter(team)}
            aria-pressed={teamFilter === team}
            className="ui-toggle-button shrink-0"
          >
            {team}
          </button>
        ))}
      </div>

      {focusQuery.loading ? <LoadingState /> : null}
      {focusQuery.error ? (
        <ErrorState error={focusQuery.error} onRetry={focusQuery.retry} />
      ) : null}
      {mutationError ? <ErrorState error={mutationError} /> : null}

      {!focusQuery.loading && !focusQuery.error ? (
        <section className="ui-panel overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-[19px] font-bold text-ink">
              Список фокусів
            </h2>
          </div>
          <div className="p-5">
            {!visibleEntries.length ? (
              <EmptyState
                title="Фокусів за цей місяць немає"
                text="Створіть перший фокус або перевірте, що в Notion у полі Month вибраний цей місяць."
              />
            ) : (
              <div className="ui-table-shell">
                <table className="ui-table">
                  <thead>
                    <tr>
                      <th>Фокус</th>
                      <th>Команда</th>
                      <th>Owner</th>
                      <th>Критерій</th>
                      <th>Статус</th>
                      <th>Коментар</th>
                      <th>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="max-w-sm font-medium text-ink">
                          {entry.title}
                        </td>
                        <td className="whitespace-nowrap text-muted">
                          {entry.team || '—'}
                        </td>
                        <td className="whitespace-nowrap text-muted">
                          {entry.owner || '—'}
                        </td>
                        <td className="max-w-sm text-muted">
                          <span className="font-medium text-ink">
                            {entry.metricType || 'Критерій'}
                          </span>
                          {entry.metric ? (
                            <span className="mt-1 block">{entry.metric}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap">
                          <FocusStatusSelect
                            value={entry.status || statusFromAchieved(entry.achieved)}
                            disabled={updatingStatusId === entry.id}
                            onChange={(status) => handleStatusChange(entry, status)}
                          />
                        </td>
                        <td className="max-w-xs text-muted">
                          {entry.comment || '—'}
                        </td>
                        <td className="whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            className="ui-button ui-button-ghost min-h-9 px-3 py-2"
                          >
                            <Pencil className="h-4 w-4" />
                            Редагувати
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {modalFocus ? (
        <Modal
          title={modalFocus.id ? 'Редагувати фокус' : 'Новий місячний фокус'}
          onClose={() => setModalFocus(null)}
          footer={
            <>
              {saved ? (
                <span className="mr-auto inline-flex items-center gap-2 text-sm font-medium text-good">
                  <CheckCircle2 className="h-4 w-4" />
                  Збережено
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setModalFocus(null)}
                className="ui-button ui-button-ghost"
              >
                Скасувати
              </button>
              <button
                type="submit"
                form="monthly-focus-form"
                disabled={saving || !modalFocus.title.trim()}
                className="ui-button ui-button-primary"
              >
                <Save className="h-4 w-4" />
                Зберегти
              </button>
            </>
          }
        >
          <form id="monthly-focus-form" onSubmit={handleSave} className="space-y-4">
            <label className="field">
              <span>Назва фокусу</span>
              <input
                value={modalFocus.title}
                onChange={(event) =>
                  setModalFocus({ ...modalFocus, title: event.target.value })
                }
                placeholder="Наприклад, Закрити партнерку з університетом"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Команда</span>
                <select
                  value={modalFocus.team}
                  onChange={(event) =>
                    setModalFocus({ ...modalFocus, team: event.target.value })
                  }
                >
                  {FOCUS_TEAMS.map((team) => (
                    <option key={team}>{team}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Місяць</span>
                <select
                  value={modalFocus.month}
                  onChange={(event) =>
                    setModalFocus({ ...modalFocus, month: event.target.value })
                  }
                >
                  {MONTHS.map((month) => (
                    <option key={month}>{month}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)]">
              <label className="field">
                <span>Тип критерію</span>
                <select
                  value={modalFocus.metricType}
                  onChange={(event) =>
                    setModalFocus({ ...modalFocus, metricType: event.target.value })
                  }
                >
                  {METRIC_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Критерій / метрика успіху</span>
                <input
                  value={modalFocus.metric}
                  onChange={(event) =>
                    setModalFocus({ ...modalFocus, metric: event.target.value })
                  }
                  placeholder="Наприклад, 30 лідів або затверджений план"
                />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="field">
                <span>Owner</span>
                <select
                  value={modalFocus.ownerId || modalFocus.owner}
                  onChange={(event) => {
                    const option = ownerOptions.find(
                      (owner) => owner.value === event.target.value,
                    )
                    setModalFocus({
                      ...modalFocus,
                      owner: option?.label || event.target.value,
                      ownerId: option?.id || '',
                    })
                  }}
                >
                  <option value="">Без owner</option>
                  {ownerOptions.map((owner) => (
                    <option key={owner.value} value={owner.value}>
                      {owner.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Статус</span>
                <select
                  value={modalFocus.status || statusFromAchieved(modalFocus.achieved)}
                  onChange={(event) =>
                    setModalFocus({
                      ...modalFocus,
                      status: event.target.value,
                      achieved: event.target.value === 'Виконано',
                    })
                  }
                >
                  {FOCUS_STATUS_OPTIONS.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Нотатки / причина, якщо не виконано</span>
              <textarea
                value={modalFocus.comment}
                onChange={(event) =>
                  setModalFocus({ ...modalFocus, comment: event.target.value })
                }
                rows="4"
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function createEmptyFocus(selectedMonth, teamFilter) {
  return {
    id: null,
    title: '',
    team: teamFilter !== 'Усі' ? teamFilter : FOCUS_TEAMS[0],
    month: selectedMonth,
    metricType: METRIC_TYPES[0],
    metric: '',
    owner: '',
    ownerId: '',
    status: 'Не виконано',
    achieved: false,
    comment: '',
  }
}

function FocusStat({ label, value, tone = 'default' }) {
  const tones = {
    default: 'border-line bg-surface-2',
    green: 'border-line bg-good-soft',
    orange: 'border-line bg-warn-soft',
  }

  return (
    <div className={`rounded-card border p-3.5 ${tones[tone] || tones.default}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <p className="mono mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  )
}

const FOCUS_STATUS_OPTIONS = ['Не виконано', 'Виконано']

function FocusStatusSelect({ value, disabled, onChange }) {
  const isDone = value === 'Виконано'

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={`h-9 min-w-36 rounded-tag border px-3 text-sm font-medium outline-none transition focus:border-accent focus:ring-[3px] focus:ring-accent-soft disabled:opacity-55 ${
        isDone
          ? 'border-line bg-good-soft text-good'
          : 'border-line bg-surface-2 text-muted'
      }`}
    >
      {FOCUS_STATUS_OPTIONS.map((status) => (
        <option key={status}>{status}</option>
      ))}
    </select>
  )
}

function statusFromAchieved(achieved) {
  return achieved ? 'Виконано' : 'Не виконано'
}

function uniqueOptions(options) {
  const seen = new Set()

  return options
    .flatMap((option) => {
      if (!option) return []
      if (typeof option === 'object') {
        const label = String(option.label || option.name || '').trim()
        const id = String(option.id || option.value || '').trim()
        if (!label) return []
        return [{ id, label, value: id || label }]
      }

      return String(option)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((label) => ({ id: '', label, value: label }))
    })
    .filter((option) => {
      const key = option.value || option.label
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
