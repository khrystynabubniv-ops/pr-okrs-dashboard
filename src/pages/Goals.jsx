import { useMemo, useState } from 'react'
import { Pencil, Plus, Save, Search } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
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
import {
  API_REFRESH_INTERVAL_MS,
  apiRequest,
  displayTarget,
  formatMetricValue,
  getProgress,
} from '../lib/api'

const LOCAL_GOAL_EDITS_KEY = 'goals-and-metrics.local-edits'

const FALLBACK_OWNER_OPTIONS = [
  'Employer Brand Manager',
  'Employer Brand Lead',
  'PR Manager',
  'SMM Manager',
  'Brand Designer',
]

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

export function GoalsPage({ selectedMonth = MONTHS[4] }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [form, setForm] = useState(initialGoal)
  const [editForm, setEditForm] = useState(initialGoal)
  const [isCreateModalOpen, setCreateModalOpen] = useState(false)
  const [editGoal, setEditGoal] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [mutationError, setMutationError] = useState(null)
  const [modalGoal, setModalGoal] = useState(null)
  const [localGoalEdits, setLocalGoalEdits] = useState(readLocalGoalEdits)
  const [updateForm, setUpdateForm] = useState({
    month: selectedMonth,
    value: '',
  })

  const { data, loading, error, retry } = useAsyncData(
    () => apiRequest('/api/notion/kpi-goals'),
    [],
    {
      backgroundRefresh: true,
      keepPreviousData: true,
      refreshIntervalMs: API_REFRESH_INTERVAL_MS,
    },
  )

  const directionFilter = validDirectionFilter(searchParams.get('direction'))
  const rawGoals = useMemo(() => data?.goals || [], [data])
  const goals = useMemo(
    () =>
      rawGoals.map((goal) => {
        const localEdit = localGoalEdits[goal.id]
        return localEdit
          ? { ...goal, ...localEdit, hasLocalEdit: true }
          : goal
      }),
    [localGoalEdits, rawGoals],
  )
  const ownerOptions = useMemo(
    () =>
      uniqueOptions([
        ...(data?.ownerOptions || []),
        ...goals.map((goal) => goal.owner),
        ...FALLBACK_OWNER_OPTIONS,
      ]),
    [data?.ownerOptions, goals],
  )
  const directionCounts = useMemo(() => {
    return goals.reduce(
      (counts, goal) => ({
        ...counts,
        [goal.direction]: (counts[goal.direction] || 0) + 1,
      }),
      { Усі: goals.length },
    )
  }, [goals])
  const visibleGoals = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return goals.filter((goal) => {
      const matchesDirection =
        directionFilter === 'Усі' || goal.direction === directionFilter
      const matchesSearch =
        !query ||
        `${goal.title} ${goal.owner || ''} ${goal.dataSource || ''}`
          .toLowerCase()
          .includes(query)

      return matchesDirection && matchesSearch
    })
  }, [directionFilter, goals, searchQuery])

  async function handleCreateGoal(event) {
    event.preventDefault()
    setSaving(true)
    setMutationError(null)

    try {
      await apiRequest('/api/notion/goals', {
        method: 'POST',
        body: JSON.stringify(normalizeGoalForSave(form)),
      })
      setForm(initialGoal)
      setCreateModalOpen(false)
      await retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  function handleSaveGoalDraft(event) {
    event.preventDefault()
    if (!editGoal) return

    const draft = normalizeGoalForSave(editForm)
    const nextEdits = { ...localGoalEdits, [editGoal.id]: draft }
    setLocalGoalEdits(nextEdits)
    writeLocalGoalEdits(nextEdits)
    setEditGoal(null)
  }

  function handleClearGoalDraft() {
    if (!editGoal) return

    const nextEdits = { ...localGoalEdits }
    delete nextEdits[editGoal.id]
    setLocalGoalEdits(nextEdits)
    writeLocalGoalEdits(nextEdits)
    setEditGoal(null)
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
      setUpdateForm({ month: selectedMonth, value: '' })
      await retry()
    } catch (error) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  function handleDirectionFilterChange(value) {
    const nextParams = new URLSearchParams(searchParams)
    if (value === 'Усі') {
      nextParams.delete('direction')
    } else {
      nextParams.set('direction', value)
    }
    setSearchParams(nextParams, { replace: true })
  }

  function openUpdateValueModal(goal) {
    const monthValue = goal.values?.[selectedMonth]
    setModalGoal(goal)
    setUpdateForm({
      month: selectedMonth,
      value: valueForUpdateInput(
        String(monthValue ?? '').trim() ? monthValue : goal.currentValue,
      ),
    })
  }

  function openEditGoalModal(goal) {
    setEditGoal(goal)
    setEditForm({
      ...initialGoal,
      title: goal.title || '',
      direction: goal.direction || DIRECTIONS[0],
      metricType: goal.metricType || METRIC_TYPES[0],
      target: goalNeedsTarget(goal) ? goal.target || '' : '',
      criterion: goal.criterion || '',
      measurementPeriod: goal.measurementPeriod || MEASUREMENT_PERIODS[0],
      dataSource: goal.dataSource || '',
      framework: goal.framework || AMEC_OPTIONS[0],
      owner: goal.owner || '',
    })
  }

  return (
    <div className="space-y-6">
      {mutationError ? <ErrorState error={mutationError} /> : null}

      <section className="ui-panel overflow-hidden">
        <div className="space-y-4 border-b border-line px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-display text-[19px] font-bold text-ink">Всі цілі</h2>
              <p className="mt-1 text-sm text-muted">
                Поточні значення і прогрес до річної цілі.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_auto]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Пошук по цілі"
                  className="h-10 w-full rounded-input border border-line bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-[3px] focus:ring-accent-soft"
                />
              </label>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="ui-button ui-button-primary"
              >
                <Plus className="h-4 w-4" />
                Створити ціль
              </button>
            </div>
          </div>

          <div className="ui-toggle flex-wrap">
            {['Усі', ...DIRECTIONS].map((direction) => {
              const isActive = directionFilter === direction
              return (
                <button
                  key={direction}
                  type="button"
                  onClick={() => handleDirectionFilterChange(direction)}
                  aria-pressed={isActive}
                  className="ui-toggle-button inline-flex min-h-9 items-center gap-2"
                >
                  <span>{direction}</span>
                  <span
                    className={`rounded-tag px-1.5 text-xs ${
                      isActive ? 'bg-surface text-accent-d' : 'bg-line text-muted'
                    }`}
                  >
                    {directionCounts[direction] || 0}
                  </span>
                </button>
              )
            })}
          </div>
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
            <div className="ui-table-shell">
              <table className="ui-table">
                <thead>
                  <tr>
                    <th className="whitespace-nowrap">Ціль</th>
                    <th className="whitespace-nowrap">
                      Напрямок
                    </th>
                    <th className="whitespace-nowrap">Тип</th>
                    <th className="whitespace-nowrap">
                      Ціль 100%
                    </th>
                    <th className="whitespace-nowrap">
                      Поточне значення
                    </th>
                    <th className="whitespace-nowrap">
                      Прогрес
                    </th>
                    <th className="whitespace-nowrap">
                      Дії
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGoals.map((goal) => (
                    <tr key={goal.id} className="align-middle">
                      <td className="max-w-xs font-medium text-ink">
                        {goal.title}
                        <p className="mt-1 text-xs font-normal text-muted">
                          {goal.owner || 'Без власника'} · {goal.framework || 'AMEC'}
                          {goal.hasLocalEdit ? (
                            <span className="ui-tag ml-2 bg-warn-soft text-warn ring-1 ring-inset ring-line">
                              змінено тут
                            </span>
                          ) : null}
                        </p>
                      </td>
                      <td>
                        <DirectionBadge direction={goal.direction} />
                      </td>
                      <td className="whitespace-nowrap text-muted">
                        <div className="space-y-1">
                          <span>{goal.calculationLabel || goal.metricType}</span>
                          {goal.explanation ? (
                            <p className="max-w-48 whitespace-normal text-xs leading-snug text-muted">
                              {goal.explanation}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="mono whitespace-nowrap text-muted">
                        {displayTarget(goal)}
                      </td>
                      <td className="mono whitespace-nowrap font-semibold text-ink">
                        {formatMetricValue(goal)}
                      </td>
                      <td>
                        {goal.progressMode === 'none' ? (
                          <div className="space-y-1">
                            <span className="ui-tag bg-surface-2 text-muted">
                              {goal.progressLabel || 'Без прогрес-бару'}
                            </span>
                            {goal.statusLabel ? (
                              <p
                                className={`text-xs font-medium ${
                                  goal.statusTone === 'danger'
                                    ? 'text-warn'
                                    : goal.statusTone === 'success'
                                      ? 'text-good'
                                      : 'text-muted'
                                }`}
                              >
                                {goal.statusLabel}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <ProgressBar value={getProgress(goal)} />
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEditGoalModal(goal)}
                            className="ui-button ui-button-ghost min-h-9 px-3 py-2"
                          >
                            <Pencil className="h-4 w-4" />
                            Змінити
                          </button>
                          <button
                            type="button"
                            onClick={() => openUpdateValueModal(goal)}
                            className="ui-button ui-button-ghost min-h-9 px-3 py-2"
                          >
                            Оновити значення
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {isCreateModalOpen ? (
        <Modal
          title="Нова ціль"
          size="lg"
          onClose={() => setCreateModalOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="ui-button ui-button-ghost"
              >
                Скасувати
              </button>
              <button
                type="submit"
                form="create-goal"
                disabled={saving || !isGoalFormReady(form)}
                className="ui-button ui-button-primary"
              >
                <Plus className="h-4 w-4" />
                Створити ціль
              </button>
            </>
          }
        >
          <p className="mb-5 text-sm leading-6 text-muted">
            Створення KPI-цілі з AMEC класифікацією, напрямком і власником.
          </p>
          <form id="create-goal" onSubmit={handleCreateGoal}>
            <GoalFormFields
              form={form}
              ownerOptions={ownerOptions}
              onChange={(field, value) => setForm({ ...form, [field]: value })}
            />
          </form>
        </Modal>
      ) : null}

      {editGoal ? (
        <Modal
          title={`Змінити ціль: ${editGoal.title}`}
          size="lg"
          onClose={() => setEditGoal(null)}
          footer={
            <>
              {editGoal.hasLocalEdit ? (
                <button
                  type="button"
                  onClick={handleClearGoalDraft}
                  className="ui-button ui-button-ghost mr-auto bg-warn-soft text-warn"
                >
                  Скасувати локальні зміни
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setEditGoal(null)}
                className="ui-button ui-button-ghost"
              >
                Закрити
              </button>
              <button
                type="submit"
                form="edit-goal"
                disabled={!isGoalFormReady(editForm)}
                className="ui-button ui-button-primary"
              >
                <Save className="h-4 w-4" />
                Зберегти
              </button>
            </>
          }
        >
          <p className="mb-5 rounded-card bg-accent-soft px-4 py-3 text-sm leading-6 text-ink ring-1 ring-inset ring-line">
            Зміни збережуться тільки на сторінці Goals & Metrics і не оновлять
            Dashboard.
          </p>
          <form id="edit-goal" onSubmit={handleSaveGoalDraft}>
            <GoalFormFields
              form={editForm}
              ownerOptions={ownerOptions}
              onChange={(field, value) =>
                setEditForm({ ...editForm, [field]: value })
              }
            />
          </form>
        </Modal>
      ) : null}

      {modalGoal ? (
        <Modal
          title={`Оновити значення: ${modalGoal.title}`}
          onClose={() => setModalGoal(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setModalGoal(null)}
                className="ui-button ui-button-ghost"
              >
                Скасувати
              </button>
              <button
                type="submit"
                form="update-goal-value"
                disabled={saving}
                className="ui-button ui-button-primary"
              >
                <Save className="h-4 w-4" />
                Зберегти
              </button>
            </>
          }
        >
          <div className="mb-5 rounded-card bg-accent-soft px-4 py-3 text-sm leading-6 text-ink ring-1 ring-inset ring-line">
            Зафіксуйте фактичне значення, якого ціль досягла у вибраному
            місяці. Це не приріст до попереднього періоду: якщо було 34%, а
            стало 37%, внесіть 37, не +3.
          </div>
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
              <span>Фактичне значення за місяць</span>
              <input
                value={updateForm.value}
                onChange={(event) =>
                  setUpdateForm({ ...updateForm, value: event.target.value })
                }
                inputMode={modalGoal.metricType === 'Якісна' ? 'text' : 'decimal'}
                placeholder={updateValuePlaceholder(modalGoal)}
                required
              />
            </label>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function GoalFormFields({ form, ownerOptions, onChange }) {
  const needsTarget = goalNeedsTarget(form)

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <label className="field lg:col-span-2">
        <span>Назва цілі</span>
        <input
          value={form.title}
          onChange={(event) => onChange('title', event.target.value)}
          placeholder="Наприклад, Збільшити Instagram аудиторію"
          required
        />
      </label>
      <label className="field">
        <span>Напрямок</span>
        <select
          value={form.direction}
          onChange={(event) => onChange('direction', event.target.value)}
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
          onChange={(event) => onChange('metricType', event.target.value)}
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
            onChange={(event) => onChange('target', event.target.value)}
            required
          />
        </label>
      ) : (
        <label className="field lg:col-span-2">
          <span>Критерій виконання</span>
          <input
            value={form.criterion}
            onChange={(event) => onChange('criterion', event.target.value)}
            placeholder="Що означає «виконано»"
          />
        </label>
      )}
      <label className="field">
        <span>Період заміру</span>
        <select
          value={form.measurementPeriod}
          onChange={(event) => onChange('measurementPeriod', event.target.value)}
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
          onChange={(event) => onChange('dataSource', event.target.value)}
          placeholder="Notion, GA4, Looqme..."
        />
      </label>
      <label className="field">
        <span>AMEC Framework</span>
        <select
          value={form.framework}
          onChange={(event) => onChange('framework', event.target.value)}
        >
          {AMEC_OPTIONS.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Власник</span>
        <select
          value={form.owner}
          onChange={(event) => onChange('owner', event.target.value)}
          required
        >
          <option value="" disabled>
            Оберіть власника
          </option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function validDirectionFilter(value) {
  return DIRECTIONS.includes(value) ? value : 'Усі'
}

function uniqueOptions(options) {
  return Array.from(
    new Set(
      options
        .flatMap((option) => String(option || '').split(','))
        .map((option) => option.trim())
        .filter(Boolean),
    ),
  )
}

function goalNeedsTarget(goal) {
  return goal.metricType !== 'Якісна'
}

function isGoalFormReady(goal) {
  return (
    goal.title.trim() &&
    goal.owner.trim() &&
    (goalNeedsTarget(goal) ? String(goal.target).trim() : true)
  )
}

function normalizeGoalForSave(goal) {
  const needsTarget = goalNeedsTarget(goal)

  return {
    title: goal.title.trim(),
    direction: goal.direction,
    metricType: goal.metricType,
    target: needsTarget ? Number(goal.target || 0) : null,
    criterion: needsTarget ? '' : goal.criterion.trim(),
    measurementPeriod: goal.measurementPeriod,
    dataSource: goal.dataSource.trim(),
    framework: goal.framework,
    owner: goal.owner.trim(),
  }
}

function updateValuePlaceholder(goal) {
  if (goal.metricType === 'Якісна') return 'Так / Ні або статус'
  if (goal.metricType === 'Відсоткова') return 'Наприклад, 37'
  return 'Наприклад, 1200'
}

function valueForUpdateInput(value) {
  const text = String(value ?? '').trim()
  if (!text || text === '—' || text === '-') return ''

  return text.replace(/\s*%+\s*$/, '')
}

function readLocalGoalEdits() {
  if (typeof window === 'undefined') return {}

  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_GOAL_EDITS_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeLocalGoalEdits(edits) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOCAL_GOAL_EDITS_KEY, JSON.stringify(edits))
}
