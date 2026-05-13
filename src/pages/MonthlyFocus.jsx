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
      <section className="rounded-lg border border-slate-200 bg-white px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Фокуси на {selectedMonth}
            </h2>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700"
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

      <div className="flex gap-2 overflow-x-auto pb-1">
        {['Усі', ...FOCUS_TEAMS].map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => setTeamFilter(team)}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition ${
              teamFilter === team
                ? 'border-[#4361ee] bg-blue-50 text-[#4361ee]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
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
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-950">
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
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3 font-semibold">Фокус</th>
                      <th className="px-3 py-3 font-semibold">Команда</th>
                      <th className="px-3 py-3 font-semibold">Owner</th>
                      <th className="px-3 py-3 font-semibold">Критерій</th>
                      <th className="px-3 py-3 font-semibold">Статус</th>
                      <th className="px-3 py-3 font-semibold">Коментар</th>
                      <th className="px-3 py-3 font-semibold">Дії</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="max-w-sm px-3 py-4 font-medium text-slate-950">
                          {entry.title}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                          {entry.team || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                          {entry.owner || '—'}
                        </td>
                        <td className="max-w-sm px-3 py-4 text-slate-600">
                          <span className="font-medium text-slate-700">
                            {entry.metricType || 'Критерій'}
                          </span>
                          {entry.metric ? (
                            <span className="mt-1 block">{entry.metric}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <FocusStatusSelect
                            value={entry.status || statusFromAchieved(entry.achieved)}
                            disabled={updatingStatusId === entry.id}
                            onChange={(status) => handleStatusChange(entry, status)}
                          />
                        </td>
                        <td className="max-w-xs px-3 py-4 text-slate-600">
                          {entry.comment || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4">
                          <button
                            type="button"
                            onClick={() => openEditModal(entry)}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                <span className="mr-auto inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Збережено
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => setModalFocus(null)}
                className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                type="submit"
                form="monthly-focus-form"
                disabled={saving || !modalFocus.title.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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
    default: 'border-slate-200 bg-slate-50',
    green: 'border-emerald-200 bg-emerald-50',
    orange: 'border-orange-200 bg-orange-50',
  }

  return (
    <div className={`rounded-lg border px-4 py-3 ${tones[tone] || tones.default}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
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
      className={`h-9 min-w-36 rounded-full border px-3 text-sm font-medium outline-none transition focus:ring-2 focus:ring-blue-100 disabled:opacity-60 ${
        isDone
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-slate-200 bg-slate-50 text-slate-700'
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
