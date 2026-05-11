import { useMemo, useState } from 'react'
import { Plus, Save, SlidersHorizontal } from 'lucide-react'
import {
  AMEC_OPTIONS,
  DIRECTIONS,
  MEASUREMENT_PERIODS,
  METRIC_TYPES,
  MONTHS,
} from '../constants'
import { DirectionBadge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { ProgressBar } from '../components/ProgressBar'
import { EmptyState, ErrorState, LoadingState } from '../components/Status'
import { useAsyncData } from '../hooks/useAsyncData'
import { apiRequest, displayTarget, formatMetricValue, getProgress } from '../lib/api'

const initialGoal = {
  title: '',
  direction: DIRECTIONS[0],
  metricType: METRIC_TYPES[0],
  target: '',
  criterion: '',
  measurementPeriod: MEASUREMENT_PERIODS[0],
  dataSource: '',
  framework: AMEC_OPTIONS[0],
  owner: '',
}

export function GoalsPage() {
  const [form, setForm] = useState(initialGoal)
  const [directionFilter, setDirectionFilter] = useState('Усі')
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState(null)
  const [modalGoal, setModalGoal] = useState(null)
  const [updateForm, setUpdateForm] = useState({
    month: MONTHS[4],
    value: '',
  })

  const { data, loading, error, retry } = useAsyncData(
    () => apiRequest('/api/notion/kpi-goals'),
    [],
  )

  const goals = useMemo(() => data?.goals || [], [data])
  const visibleGoals = useMemo(() => {
    if (directionFilter === 'Усі') return goals
    return goals.filter((goal) => goal.direction === directionFilter)
  }, [directionFilter, goals])

  const needsTarget = form.metricType !== 'Якісна'

  async function handleCreateGoal(event) {
    event.preventDefault()
    setSaving(true)
    setMutationError(null)

    try {
      await apiRequest('/api/notion/goals', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          target: needsTarget ? Number(form.target || 0) : null,
        }),
      })
      setForm(initialGoal)
      await retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateValue(event) {
    event.preventDefault()
    if (!modalGoal) return

    setSaving(true)
    setMutationError(null)
    try {
      await apiRequest(`/api/notion/goals/${modalGoal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          month: updateForm.month,
          value: updateForm.value,
        }),
      })
      setModalGoal(null)
      setUpdateForm({ month: MONTHS[4], value: '' })
      await retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreateGoal}
        className="rounded-lg border border-slate-200 bg-white px-5 py-5"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Нова ціль
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Створення KPI-цілі з AMEC класифікацією та власником.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving || !form.title.trim()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Створити ціль
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <label className="field lg:col-span-2">
            <span>Назва цілі</span>
            <input
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="Наприклад, Збільшити Instagram аудиторію"
              required
            />
          </label>
          <label className="field">
            <span>Напрямок</span>
            <select
              value={form.direction}
              onChange={(event) =>
                setForm({ ...form, direction: event.target.value })
              }
            >
              {DIRECTIONS.map((direction) => (
                <option key={direction}>{direction}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Тип метрики</span>
            <select
              value={form.metricType}
              onChange={(event) =>
                setForm({ ...form, metricType: event.target.value })
              }
            >
              {METRIC_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
          {needsTarget ? (
            <label className="field">
              <span>Річна ціль</span>
              <input
                type="number"
                min="0"
                value={form.target}
                onChange={(event) =>
                  setForm({ ...form, target: event.target.value })
                }
                required
              />
            </label>
          ) : (
            <label className="field lg:col-span-2">
              <span>Критерій виконання</span>
              <input
                value={form.criterion}
                onChange={(event) =>
                  setForm({ ...form, criterion: event.target.value })
                }
                placeholder="Що означає «виконано»"
                required
              />
            </label>
          )}
          <label className="field">
            <span>Період заміру</span>
            <select
              value={form.measurementPeriod}
              onChange={(event) =>
                setForm({ ...form, measurementPeriod: event.target.value })
              }
            >
              {MEASUREMENT_PERIODS.map((period) => (
                <option key={period}>{period}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Джерело даних</span>
            <input
              value={form.dataSource}
              onChange={(event) =>
                setForm({ ...form, dataSource: event.target.value })
              }
              placeholder="Notion, GA4, Looqme..."
            />
          </label>
          <label className="field">
            <span>AMEC Framework</span>
            <select
              value={form.framework}
              onChange={(event) =>
                setForm({ ...form, framework: event.target.value })
              }
            >
              {AMEC_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Власник</span>
            <input
              value={form.owner}
              onChange={(event) => setForm({ ...form, owner: event.target.value })}
              required
            />
          </label>
        </div>
      </form>

      {mutationError ? <ErrorState error={mutationError} /> : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Всі цілі</h2>
            <p className="mt-1 text-sm text-slate-500">
              Поточні значення і прогрес до річної цілі.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <SlidersHorizontal className="h-4 w-4" />
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#4361ee] focus:ring-2 focus:ring-blue-100"
            >
              <option>Усі</option>
              {DIRECTIONS.map((direction) => (
                <option key={direction}>{direction}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="p-5">
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState error={error} onRetry={retry} /> : null}
          {!loading && !error && !visibleGoals.length ? (
            <EmptyState
              title="Цілей поки немає"
              text="Створіть першу ціль або перевірте доступ Notion integration до KPI database."
            />
          ) : null}
          {!loading && !error && visibleGoals.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">Ціль</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">
                      Напрямок
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">Тип</th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">
                      Ціль 100%
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">
                      Поточне значення
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">
                      Прогрес
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleGoals.map((goal) => (
                    <tr key={goal.id} className="align-middle">
                      <td className="max-w-xs px-3 py-4 font-medium text-slate-950">
                        {goal.title}
                        <p className="mt-1 text-xs font-normal text-slate-500">
                          {goal.owner || 'Без власника'} · {goal.framework || 'AMEC'}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <DirectionBadge direction={goal.direction} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                        {goal.metricType}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-600">
                        {displayTarget(goal)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-slate-950">
                        {formatMetricValue(goal)}
                      </td>
                      <td className="px-3 py-4">
                        <ProgressBar value={getProgress(goal)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-4">
                        <button
                          type="button"
                          onClick={() => {
                            setModalGoal(goal)
                            setUpdateForm({
                              month: MONTHS[4],
                              value: goal.currentValue || '',
                            })
                          }}
                          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Оновити значення
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {modalGoal ? (
        <Modal
          title={`Оновити значення: ${modalGoal.title}`}
          onClose={() => setModalGoal(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setModalGoal(null)}
                className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Скасувати
              </button>
              <button
                type="submit"
                form="update-goal-value"
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[#4361ee] px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Зберегти
              </button>
            </>
          }
        >
          <form id="update-goal-value" onSubmit={handleUpdateValue} className="space-y-4">
            <label className="field">
              <span>Місяць</span>
              <select
                value={updateForm.month}
                onChange={(event) =>
                  setUpdateForm({ ...updateForm, month: event.target.value })
                }
              >
                {MONTHS.map((month) => (
                  <option key={month}>{month}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Нове значення</span>
              <input
                type={modalGoal.metricType === 'Якісна' ? 'text' : 'number'}
                value={updateForm.value}
                onChange={(event) =>
                  setUpdateForm({ ...updateForm, value: event.target.value })
                }
                placeholder={modalGoal.metricType === 'Якісна' ? 'Так / Ні' : '0'}
                required
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}
