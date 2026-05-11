import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Save } from 'lucide-react'
import { DIRECTIONS } from '../constants'
import { DirectionBadge } from '../components/Badge'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest } from '../lib/api'

const emptyFocus = {
  id: null,
  done: '',
  notDone: '',
  pains: '',
  nextPriorities: '',
  linkedGoalIds: [],
  metricValues: {},
}

export function MonthlyFocusPage({ selectedMonth }) {
  const [direction, setDirection] = useState(DIRECTIONS[0])
  const [form, setForm] = useState(emptyFocus)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mutationError, setMutationError] = useState(null)

  const goalsQuery = useAsyncData(() => apiRequest('/api/notion/kpi-goals'), [])
  const focusQuery = useAsyncData(
    () =>
      apiRequest(
        `/api/notion/monthly-focus?month=${encodeURIComponent(selectedMonth)}`,
      ),
    [selectedMonth],
  )

  const goals = useMemo(() => goalsQuery.data?.goals || [], [goalsQuery.data])
  const entries = useMemo(() => focusQuery.data?.entries || [], [focusQuery.data])

  const directionGoals = useMemo(
    () => goals.filter((goal) => goal.direction === direction),
    [direction, goals],
  )

  useEffect(() => {
    const entry = entries.find((item) => item.direction === direction)
    // The form mirrors the selected Notion record when month or direction changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(entry || emptyFocus)
    setSaved(false)
  }, [direction, entries, selectedMonth])

  function toggleGoal(goalId) {
    const linkedGoalIds = form.linkedGoalIds.includes(goalId)
      ? form.linkedGoalIds.filter((id) => id !== goalId)
      : [...form.linkedGoalIds, goalId]

    setForm({ ...form, linkedGoalIds })
  }

  function updateMetric(goalId, value) {
    setForm({
      ...form,
      metricValues: {
        ...form.metricValues,
        [goalId]: value,
      },
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setMutationError(null)

    try {
      await apiRequest('/api/notion/monthly-focus', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          month: selectedMonth,
          direction,
        }),
      })
      setSaved(true)
      await focusQuery.retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  const loading = goalsQuery.loading || focusQuery.loading
  const error = goalsQuery.error || focusQuery.error

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {DIRECTIONS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setDirection(item)}
            className={`shrink-0 rounded-md border px-3 py-2 text-sm font-medium transition ${
              direction === item
                ? 'border-[#4361ee] bg-blue-50 text-[#4361ee]'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : null}
      {error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            goalsQuery.retry()
            focusQuery.retry()
          }}
        />
      ) : null}
      {mutationError ? <ErrorState error={mutationError} /> : null}

      {!loading && !error ? (
        <form
          onSubmit={handleSave}
          className="rounded-lg border border-slate-200 bg-white px-5 py-5"
        >
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-950">
                  {selectedMonth}
                </h2>
                <DirectionBadge direction={direction} />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Місячний фокус команди з прив'язкою до активних цілей.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {saved ? (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Збережено
                </span>
              ) : null}
              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Зберегти
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <div className="space-y-4">
              <label className="field">
                <span>Що виконано за місяць</span>
                <textarea
                  value={form.done}
                  onChange={(event) => setForm({ ...form, done: event.target.value })}
                  rows="6"
                />
              </label>
              <label className="field">
                <span>Що НЕ виконано + причина</span>
                <textarea
                  value={form.notDone}
                  onChange={(event) =>
                    setForm({ ...form, notDone: event.target.value })
                  }
                  rows="4"
                />
              </label>
              <label className="field">
                <span>Ключові болі місяця — для борду</span>
                <textarea
                  value={form.pains}
                  onChange={(event) => setForm({ ...form, pains: event.target.value })}
                  rows="3"
                  placeholder="До 3 пунктів"
                />
              </label>
              <label className="field">
                <span>Пріоритети на наступний місяць</span>
                <textarea
                  value={form.nextPriorities}
                  onChange={(event) =>
                    setForm({ ...form, nextPriorities: event.target.value })
                  }
                  rows="4"
                />
              </label>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 px-4 py-4">
                <h3 className="text-sm font-semibold text-slate-950">
                  Прив'язка до цілей
                </h3>
                <div className="mt-3 space-y-2">
                  {directionGoals.length ? (
                    directionGoals.map((goal) => (
                      <label
                        key={goal.id}
                        className="flex items-start gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={form.linkedGoalIds.includes(goal.id)}
                          onChange={() => toggleGoal(goal.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#4361ee] focus:ring-[#4361ee]"
                        />
                        <span>
                          <span className="font-medium text-slate-950">
                            {goal.title}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {goal.metricType} · {goal.owner || 'Без власника'}
                          </span>
                        </span>
                      </label>
                    ))
                  ) : (
                    <EmptyState
                      title="Немає цілей цього напрямку"
                      text="Додайте KPI ціль на сторінці Goals & Metrics."
                    />
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 px-4 py-4">
                <h3 className="text-sm font-semibold text-slate-950">
                  Оновлення метрик
                </h3>
                <div className="mt-3 space-y-3">
                  {directionGoals.length ? (
                    directionGoals.map((goal) => (
                      <label key={goal.id} className="field">
                        <span>{goal.title}</span>
                        <input
                          type={goal.metricType === 'Якісна' ? 'text' : 'number'}
                          value={form.metricValues[goal.id] || ''}
                          onChange={(event) => updateMetric(goal.id, event.target.value)}
                          placeholder={goal.metricType === 'Якісна' ? 'Так / Ні' : '0'}
                        />
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">
                      Метрики з'являться після створення цілей.
                    </p>
                  )}
                </div>
              </section>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  )
}
