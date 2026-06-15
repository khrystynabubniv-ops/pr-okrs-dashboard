import { useEffect, useMemo, useState } from 'react'
import {
  Code2,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { InfoTooltip } from '../components/InfoTooltip'
import { apiRequest } from '../lib/api'
import {
  buildReportFacts,
  compute,
  defaultDateMode,
  formatCompact,
  formatEur,
  formatPercent,
  formatReportDateRange,
  formatUsd,
  formatUsdUnit,
  formatWhole,
  normalizeReportInput,
} from '../lib/eventReports'
import './EventReports.css'

const TYPE_LABELS = {
  event: 'Івент',
  partnership: 'Партнерство',
  launch: 'Лонч',
}

const emptyCampaign = () => ({
  name: '',
  ctype: 'Clicks',
  spendEur: '',
  result: '',
  clicks: '',
  impressions: '',
  reach: '',
})

const emptyResource = () => ({
  name: '',
  url: '',
})

const initialForm = (type = 'event') => {
  const today = new Date().toISOString().slice(0, 10)

  return {
    type,
    dateMode: defaultDateMode(type),
    name: '',
    date: today,
    dateStart: today,
    dateEnd: today,
    description: '',
    goalText: '',

    leadsGoogle: '',
    leadsMeta: '',
    confirmed: '',
    attended: '',
    teamCount: '',
    promoSpendUsd: '',
    orgSpendUsd: '',
    mediaMentions: '',
    channels: '',
    engagement: '',
    feedback: '',
    notes: '',

    partnershipCost: '',
    episodes: '',
    views: '',
    clicks: '',
    hireEnabled: false,
    hireCount: '',

    promoEnabled: false,
    campaigns: [emptyCampaign()],
    reachTotal: '',
    reachUniverse: '',
    reachClevel: '',
    reachMedia: '',
    linkClicks: '',
    productResultType: '',
    productResultValue: '',
    productResultNote: '',
    tgEnabled: false,
    tgChannels: '',
    tgCost: '',
    tgReach: '',
    tgPosts: '',
    tgChannelList: '',
    otherSpendUsd: '',
    budgetOverride: '',
    resources: [emptyResource()],
  }
}

export function EventReportsPage() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)

  useEffect(() => {
    let active = true

    async function loadReports() {
      try {
        const payload = await apiRequest('/api/event-reports')
        if (active) {
          setReports(Array.isArray(payload) ? payload : [])
          setError(null)
        }
      } catch (requestError) {
        if (active) setError(requestError)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadReports()

    return () => {
      active = false
    }
  }, [])

  async function refreshReports() {
    setLoading(true)
    setError(null)

    try {
      const payload = await apiRequest('/api/event-reports')
      setReports(Array.isArray(payload) ? payload : [])
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }

  function handleCreated(report) {
    setReports((current) => [report, ...current.filter((item) => item.id !== report.id)])
    setShowForm(false)
    setSelectedReport(report)
  }

  return (
    <div className="event-reports-viewport">
      <div className="event-reports-page">
        <header className="er-page-header">
          <div>
            <p className="er-eyebrow">Comms Tool</p>
            <h1>Звіти по івентах</h1>
            <p className="er-subtitle">
              Форма для івентів, партнерств і лончів: метрики рахуються кодом,
              а AI допомагає сформулювати executive summary та інсайти.
            </p>
          </div>
          <button
            type="button"
            className="er-button er-button-primary"
            onClick={() => setShowForm(true)}
          >
            <Plus className="er-button-icon" />
            Створити звіт
          </button>
        </header>

        {loading ? <ReportsLoading /> : null}
        {error && !loading ? <ReportsError error={error} onRetry={refreshReports} /> : null}
        {!loading && !error && reports.length ? (
          <ReportsTable reports={reports} onSelect={setSelectedReport} />
        ) : null}
        {!loading && !error && !reports.length ? (
          <ReportsEmpty onCreate={() => setShowForm(true)} />
        ) : null}

        {showForm ? (
          <ReportForm
            onClose={() => setShowForm(false)}
            onCreated={handleCreated}
          />
        ) : null}

        {selectedReport ? (
          <ReportDetail
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
          />
        ) : null}
      </div>
    </div>
  )
}

function ReportsTable({ reports, onSelect }) {
  return (
    <div className="er-table-shell">
      <table className="er-table">
        <thead>
          <tr>
            <th>Назва</th>
            <th>Тип</th>
            <th>Дата / період</th>
            <th className="er-align-right">Витрати</th>
            <th className="er-align-right">Основна метрика</th>
            <th className="er-align-right">Додаткова метрика</th>
            <th className="er-align-right">Результат</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const normalized = normalizeReportInput(report)
            const metrics = compute(normalized)
            const cells = tableMetricCells(normalized, metrics)

            return (
              <tr
                key={report.id}
                tabIndex={0}
                onClick={() => onSelect(report)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(report)
                }}
              >
                <td>
                  <span className="er-table-title">{normalized.name || 'Без назви'}</span>
                </td>
                <td>
                  <ReportTypeTag type={normalized.type} />
                </td>
                <td className="er-muted">{formatReportDateRange(normalized)}</td>
                {cells.map((cell, index) => (
                  <td className="er-align-right er-metric-cell" key={`${cell}-${index}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function tableMetricCells(report, metrics) {
  if (report.type === 'partnership') {
    return [
      formatUsd(metrics.totalBudget),
      `CPV ${formatUsdUnit(metrics.cpv)}`,
      report.hireEnabled ? `Наймів ${formatWhole(metrics.hireCount)}` : 'Наймів —',
      `Випусків ${formatWhole(metrics.episodes)}`,
    ]
  }

  if (report.type === 'launch') {
    return [
      formatUsd(metrics.totalBudget),
      `CPC ${formatUsdUnit(metrics.cpc)}`,
      `CPV ${formatUsdUnit(metrics.cpv)}`,
      `Охоплення ${formatCompact(metrics.reachTotal)}`,
    ]
  }

  return [
    formatUsd(metrics.totalBudget),
    `CPA ${formatUsdUnit(metrics.cpa)}`,
    `CPL ${formatUsdUnit(metrics.cpl)}`,
    `Прийшло ${formatWhole(metrics.attended)}`,
  ]
}

function ReportsEmpty({ onCreate }) {
  return (
    <div className="er-empty-state">
      <FileText className="er-empty-icon" />
      <h2>Звітів ще немає</h2>
      <p>Натисни „Створити звіт&quot;, щоб додати перший.</p>
      <button type="button" className="er-button er-button-primary" onClick={onCreate}>
        <Plus className="er-button-icon" />
        Створити звіт
      </button>
    </div>
  )
}

function ReportsLoading() {
  return (
    <div className="er-loading-state">
      <RefreshCw className="er-loading-icon" />
      Завантаження звітів...
    </div>
  )
}

function ReportsError({ error, onRetry }) {
  return (
    <div className="er-error-state">
      <div>
        <h2>Не вдалося завантажити звіти</h2>
        <p>{error?.message || 'Перевірте API і спробуйте ще раз.'}</p>
      </div>
      <button type="button" className="er-button er-button-ghost" onClick={onRetry}>
        <RefreshCw className="er-button-icon" />
        Повторити
      </button>
    </div>
  )
}

function ReportForm({ onClose, onCreated }) {
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const normalized = useMemo(() => normalizeReportInput(form), [form])
  const metrics = useMemo(() => compute(normalized), [normalized])

  function updateField(name, value) {
    setForm((current) => ({ ...current, [name]: value }))
  }

  function selectType(type) {
    setForm((current) => ({
      ...current,
      type,
      dateMode: defaultDateMode(type),
      budgetOverride: type === 'launch' ? current.budgetOverride : '',
    }))
  }

  function updateCampaign(index, name, value) {
    setForm((current) => ({
      ...current,
      campaigns: current.campaigns.map((campaign, campaignIndex) =>
        campaignIndex === index ? { ...campaign, [name]: value } : campaign,
      ),
    }))
  }

  function addCampaign() {
    setForm((current) => ({
      ...current,
      campaigns: [...current.campaigns, emptyCampaign()],
    }))
  }

  function removeCampaign(index) {
    setForm((current) => ({
      ...current,
      campaigns: current.campaigns.filter((_, campaignIndex) => campaignIndex !== index),
    }))
  }

  function updateResource(index, name, value) {
    setForm((current) => ({
      ...current,
      resources: current.resources.map((resource, resourceIndex) =>
        resourceIndex === index ? { ...resource, [name]: value } : resource,
      ),
    }))
  }

  function addResource() {
    setForm((current) => ({
      ...current,
      resources: [...current.resources, emptyResource()],
    }))
  }

  function removeResource(index) {
    setForm((current) => ({
      ...current,
      resources: current.resources.filter((_, resourceIndex) => resourceIndex !== index),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.name.trim() || submitting) return

    setSubmitting(true)
    setError(null)

    const reportInput = normalizeReportInput(form)
    const reportMetrics = compute(reportInput)
    const facts = buildReportFacts(reportInput, reportMetrics)
    let aiPayload

    try {
      aiPayload = await apiRequest('/api/event-reports/generate', {
        method: 'POST',
        body: JSON.stringify({ facts }),
      })
    } catch {
      aiPayload = { summary: '', insights: [], planFact: '' }
    }

    try {
      const created = await apiRequest('/api/event-reports', {
        method: 'POST',
        body: JSON.stringify({
          ...reportInput,
          aiSummary: aiPayload.summary || '',
          aiInsights: Array.isArray(aiPayload.insights) ? aiPayload.insights : [],
          aiPlanFact: aiPayload.planFact || '',
        }),
      })
      onCreated(created)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setSubmitting(false)
    }
  }

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget && !submitting) onClose()
  }

  return (
    <div className="er-modal-overlay" onMouseDown={handleOverlayClick}>
      <form className="er-modal er-form-modal" onSubmit={handleSubmit}>
        <div className="er-modal-head">
          <h2>Створити звіт</h2>
          <button
            type="button"
            className="er-close-button"
            onClick={onClose}
            aria-label="Закрити"
            disabled={submitting}
          >
            <X className="er-close-icon" />
          </button>
        </div>

        <div className="er-modal-body">
          <TypeSegmented value={form.type} onChange={selectType} />

          <FormSection title="Основне">
            <div className="er-form-grid er-form-grid-2">
              <Field label="Назва">
                <input
                  className="er-input"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder={
                    form.type === 'launch' ? 'Лонч продукту' : 'Universe Hiring Day'
                  }
                  required
                />
              </Field>
              <DateFields form={form} updateField={updateField} />
              <Field label="Опис" full>
                <textarea
                  className="er-input"
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value)}
                />
              </Field>
              <Field label="Ціль" full>
                <textarea
                  className="er-input"
                  value={form.goalText}
                  onChange={(event) => updateField('goalText', event.target.value)}
                />
              </Field>
            </div>
          </FormSection>

          {form.type === 'event' ? (
            <>
              <CampaignSection
                campaigns={form.campaigns}
                metrics={metrics}
                onAdd={addCampaign}
                onRemove={removeCampaign}
                onUpdate={updateCampaign}
              />
              <EventFields form={form} updateField={updateField} />
            </>
          ) : null}

          {form.type === 'partnership' ? (
            <PartnershipFields form={form} updateField={updateField} />
          ) : null}

          {form.type === 'launch' ? (
            <LaunchFields
              form={form}
              metrics={metrics}
              updateField={updateField}
              updateCampaign={updateCampaign}
              addCampaign={addCampaign}
              removeCampaign={removeCampaign}
              updateResource={updateResource}
              addResource={addResource}
              removeResource={removeResource}
            />
          ) : null}

          <MetricsPreview report={normalized} metrics={metrics} />

          {error ? <p className="er-form-error">{error.message}</p> : null}
        </div>

        <div className="er-modal-foot">
          <button
            type="button"
            className="er-button er-button-ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Скасувати
          </button>
          <button
            type="submit"
            className="er-button er-button-primary"
            disabled={!form.name.trim() || submitting}
          >
            {submitting ? <span className="er-spinner" /> : <Sparkles className="er-button-icon" />}
            {submitting ? 'Генерую звіт...' : 'Згенерувати звіт'}
          </button>
        </div>
      </form>
    </div>
  )
}

function TypeSegmented({ value, onChange }) {
  return (
    <div className="er-segmented" aria-label="Тип звіту">
      {Object.entries(TYPE_LABELS).map(([type, label]) => (
        <button
          type="button"
          className={value === type ? 'is-active' : ''}
          onClick={() => onChange(type)}
          key={type}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function DateFields({ form, updateField }) {
  return (
    <>
      <div className="er-date-mode">
        <span>Дата або період</span>
        <div className="er-segmented er-segmented-compact" aria-label="Дата або період">
          <button
            type="button"
            className={form.dateMode === 'single' ? 'is-active' : ''}
            onClick={() => updateField('dateMode', 'single')}
          >
            Дата
          </button>
          <button
            type="button"
            className={form.dateMode === 'period' ? 'is-active' : ''}
            onClick={() => updateField('dateMode', 'period')}
          >
            Період
          </button>
        </div>
      </div>
      {form.dateMode === 'period' ? (
        <>
          <Field label="Початок">
            <input
              className="er-input"
              type="date"
              value={form.dateStart}
              onChange={(event) => updateField('dateStart', event.target.value)}
            />
          </Field>
          <Field label="Кінець">
            <input
              className="er-input"
              type="date"
              value={form.dateEnd}
              onChange={(event) => updateField('dateEnd', event.target.value)}
            />
          </Field>
        </>
      ) : (
        <Field label="Дата">
          <input
            className="er-input"
            type="date"
            value={form.date}
            onChange={(event) => updateField('date', event.target.value)}
          />
        </Field>
      )}
    </>
  )
}

function EventFields({ form, updateField }) {
  return (
    <>
      <FormSection title="Заявки та воронка">
        <div className="er-form-grid er-form-grid-3">
          <Field label="Ліди Google">
            <NumberInput
              value={form.leadsGoogle}
              onChange={(value) => updateField('leadsGoogle', value)}
            />
          </Field>
          <Field label="Ліди Meta">
            <NumberInput
              value={form.leadsMeta}
              onChange={(value) => updateField('leadsMeta', value)}
            />
          </Field>
          <Field label="Підтверджень">
            <NumberInput
              value={form.confirmed}
              onChange={(value) => updateField('confirmed', value)}
            />
          </Field>
          <Field label="Прийшло на івент">
            <NumberInput
              value={form.attended}
              onChange={(value) => updateField('attended', value)}
            />
          </Field>
          <Field label="З них команда">
            <NumberInput
              value={form.teamCount}
              onChange={(value) => updateField('teamCount', value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Бюджет (USD)">
        <div className="er-form-grid er-form-grid-2">
          <Field label="Витрати на промо ($)">
            <NumberInput
              value={form.promoSpendUsd}
              onChange={(value) => updateField('promoSpendUsd', value)}
            />
          </Field>
          <Field label="Організаційні витрати ($)">
            <NumberInput
              value={form.orgSpendUsd}
              onChange={(value) => updateField('orgSpendUsd', value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Медіа та появи">
        <div className="er-form-grid er-form-grid-3">
          <Field label="Згадки в медіа">
            <NumberInput
              value={form.mediaMentions}
              onChange={(value) => updateField('mediaMentions', value)}
            />
          </Field>
          <Field label="Канали залучення" full>
            <input
              className="er-input"
              value={form.channels}
              onChange={(event) => updateField('channels', event.target.value)}
              placeholder="Де були появи"
            />
          </Field>
          <Field label="Залученість" full>
            <input
              className="er-input"
              value={form.engagement}
              onChange={(event) => updateField('engagement', event.target.value)}
              placeholder="Коментарі, реакції, обговорення"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Якісні результати">
        <div className="er-form-grid er-form-grid-2">
          <Field label="Фідбек аудиторії">
            <textarea
              className="er-input"
              value={form.feedback}
              onChange={(event) => updateField('feedback', event.target.value)}
            />
          </Field>
          <Field label="Нотатки/ретро">
            <textarea
              className="er-input"
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
            />
          </Field>
        </div>
      </FormSection>
    </>
  )
}

function PartnershipFields({ form, updateField }) {
  return (
    <FormSection title="Результати партнерства">
      <div className="er-form-grid er-form-grid-2">
        <Field label="Вартість партнерства ($)">
          <NumberInput
            value={form.partnershipCost}
            onChange={(value) => updateField('partnershipCost', value)}
          />
        </Field>
        <Field label="Кількість випусків із партнерством">
          <NumberInput
            value={form.episodes}
            onChange={(value) => updateField('episodes', value)}
          />
        </Field>
        <Field label="Перегляди">
          <NumberInput
            value={form.views}
            onChange={(value) => updateField('views', value)}
          />
        </Field>
        <Field label="Кліки на лінк">
          <NumberInput
            value={form.clicks}
            onChange={(value) => updateField('clicks', value)}
          />
        </Field>
        <Field label="Згадки в медіа">
          <NumberInput
            value={form.mediaMentions}
            onChange={(value) => updateField('mediaMentions', value)}
          />
        </Field>
      </div>
      <DisclosureToggle
        checked={form.hireEnabled}
        label="Чи є найм?"
        onChange={(checked) => updateField('hireEnabled', checked)}
      />
      {form.hireEnabled ? (
        <div className="er-form-grid er-form-grid-2 er-disclosure-body">
          <Field label="Кількість наймів">
            <NumberInput
              value={form.hireCount}
              onChange={(value) => updateField('hireCount', value)}
            />
          </Field>
        </div>
      ) : null}
    </FormSection>
  )
}

function LaunchFields({
  form,
  metrics,
  updateField,
  updateCampaign,
  addCampaign,
  removeCampaign,
  updateResource,
  addResource,
  removeResource,
}) {
  const hasBudgetOverride =
    form.budgetOverride !== '' &&
    form.budgetOverride !== null &&
    form.budgetOverride !== undefined

  return (
    <>
      <FormSection title="Промо">
        <DisclosureToggle
          checked={form.promoEnabled}
          label="Чи були промо-кампанії?"
          onChange={(checked) => updateField('promoEnabled', checked)}
        />
        {form.promoEnabled ? (
          <div className="er-disclosure-body">
            <CampaignSection
              campaigns={form.campaigns}
              metrics={metrics}
              onAdd={addCampaign}
              onRemove={removeCampaign}
              onUpdate={updateCampaign}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Результати">
        <div className="er-form-grid er-form-grid-3">
          <Field
            label="Загальне охоплення"
            info="Автоматична сума охоплень із соцмереж Universe, соцмереж C-level, медіа та платних ТГ-каналів."
          >
            <input
              className="er-input er-number-input er-readonly-input"
              value={numberInputValue(metrics.reachTotal)}
              readOnly
              aria-readonly="true"
            />
          </Field>
          <Field label="Згадки в медіа">
            <NumberInput
              value={form.mediaMentions}
              onChange={(value) => updateField('mediaMentions', value)}
            />
          </Field>
          <Field label="Охоплення медіа">
            <NumberInput
              value={form.reachMedia}
              onChange={(value) => updateField('reachMedia', value)}
            />
          </Field>
          <Field label="Охоплення соцмереж Universe">
            <NumberInput
              value={form.reachUniverse}
              onChange={(value) => updateField('reachUniverse', value)}
            />
          </Field>
          <Field label="Охоплення соцмереж C-level">
            <NumberInput
              value={form.reachClevel}
              onChange={(value) => updateField('reachClevel', value)}
            />
          </Field>
          <Field label="Кліки на посилання">
            <NumberInput
              value={form.linkClicks}
              onChange={(value) => updateField('linkClicks', value)}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Результат для продукту">
        <div className="er-form-grid er-form-grid-3">
          <Field label="Тип">
            <input
              className="er-input"
              value={form.productResultType}
              onChange={(event) => updateField('productResultType', event.target.value)}
              placeholder="реєстрації / завантаження / тріали"
            />
          </Field>
          <Field label="Значення">
            <NumberInput
              value={form.productResultValue}
              onChange={(value) => updateField('productResultValue', value)}
            />
          </Field>
          <Field label="Коментар">
            <input
              className="er-input"
              value={form.productResultNote}
              onChange={(event) => updateField('productResultNote', event.target.value)}
              placeholder="який саме"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Платні ТГ-блогери">
        <DisclosureToggle
          checked={form.tgEnabled}
          label="Платні блогери в ТГ-каналах"
          onChange={(checked) => updateField('tgEnabled', checked)}
        />
        {form.tgEnabled ? (
          <div className="er-form-grid er-form-grid-2 er-disclosure-body">
            <Field label="Кількість публікацій">
              <NumberInput
                value={form.tgPosts}
                onChange={(value) => updateField('tgPosts', value)}
              />
            </Field>
            <Field label="Сумарна вартість ($)">
              <NumberInput
                value={form.tgCost}
                onChange={(value) => updateField('tgCost', value)}
              />
            </Field>
            <Field label="Сумарне охоплення / перегляди">
              <NumberInput
                value={form.tgReach}
                onChange={(value) => updateField('tgReach', value)}
              />
            </Field>
            <Field label="Список каналів" full>
              <textarea
                className="er-input"
                value={form.tgChannelList}
                onChange={(event) => updateField('tgChannelList', event.target.value)}
              />
            </Field>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Загальний бюджет витрат">
        <div className="er-form-grid er-form-grid-2">
          <Field label="Інші витрати ($)">
            <NumberInput
              value={form.otherSpendUsd}
              onChange={(value) => updateField('otherSpendUsd', value)}
            />
          </Field>
          <Field label="Бюджет ($)">
            <input
              className="er-input er-number-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={hasBudgetOverride ? form.budgetOverride : numberInputValue(metrics.budgetAuto)}
              onChange={(event) => updateField('budgetOverride', event.target.value)}
            />
          </Field>
        </div>
        {hasBudgetOverride ? (
          <div className="er-budget-hint">
            <span>авто-сума: {formatUsd(metrics.budgetAuto)}</span>
            <button
              type="button"
              className="er-link-button"
              onClick={() => updateField('budgetOverride', '')}
            >
              <RotateCcw className="er-link-icon" />
              авто
            </button>
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Ресурси, що вийшли з новиною">
        <ResourcesEditor
          resources={form.resources}
          onAdd={addResource}
          onRemove={removeResource}
          onUpdate={updateResource}
        />
      </FormSection>
    </>
  )
}

function CampaignSection({ campaigns, metrics, onAdd, onRemove, onUpdate }) {
  return (
    <section className="er-form-section">
      <div className="er-section-heading-row">
        <h3>Промо-кампанії (Meta)</h3>
        <span className="er-mini-badge">CPC · CTR авто</span>
      </div>
      {campaigns.map((campaign, index) => {
        const campaignMetrics = metrics.campaigns[index] || {
          cpc: 0,
          cpa: 0,
          ctr: 0,
        }

        return (
          <div className="er-campaign-card" key={`campaign-${index}`}>
            <div className="er-campaign-grid">
              <Field label="Назва">
                <input
                  className="er-input"
                  value={campaign.name}
                  onChange={(event) => onUpdate(index, 'name', event.target.value)}
                />
              </Field>
              <Field label="Тип">
                <select
                  className="er-input"
                  value={campaign.ctype}
                  onChange={(event) => onUpdate(index, 'ctype', event.target.value)}
                >
                  <option value="Clicks">Clicks</option>
                  <option value="Leads">Leads</option>
                </select>
              </Field>
              <Field label="Spend €">
                <NumberInput
                  value={campaign.spendEur}
                  onChange={(value) => onUpdate(index, 'spendEur', value)}
                />
              </Field>
              <Field label="Result">
                <NumberInput
                  value={campaign.result}
                  onChange={(value) => onUpdate(index, 'result', value)}
                />
              </Field>
              <Field label="Clicks">
                <NumberInput
                  value={campaign.clicks}
                  onChange={(value) => onUpdate(index, 'clicks', value)}
                />
              </Field>
              <Field label="Impressions">
                <NumberInput
                  value={campaign.impressions}
                  onChange={(value) => onUpdate(index, 'impressions', value)}
                />
              </Field>
            </div>
            <div className="er-campaign-meta">
              <span>CPC {formatEur(campaignMetrics.cpc)}</span>
              <span>CTR {formatPercent(campaignMetrics.ctr)}</span>
              <span>CPA {formatEur(campaignMetrics.cpa)}</span>
              {campaigns.length > 1 ? (
                <button
                  type="button"
                  className="er-remove-campaign"
                  onClick={() => onRemove(index)}
                >
                  <Trash2 className="er-trash-icon" />
                  Видалити
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
      <button type="button" className="er-link-button" onClick={onAdd}>
        <Plus className="er-link-icon" />
        Додати кампанію
      </button>
    </section>
  )
}

function ResourcesEditor({ resources, onAdd, onRemove, onUpdate }) {
  return (
    <div className="er-resource-editor">
      {resources.map((resource, index) => (
        <div className="er-resource-row" key={`resource-${index}`}>
          <Field label="Назва">
            <input
              className="er-input"
              value={resource.name}
              onChange={(event) => onUpdate(index, 'name', event.target.value)}
            />
          </Field>
          <Field label="Посилання">
            <input
              className="er-input"
              value={resource.url}
              onChange={(event) => onUpdate(index, 'url', event.target.value)}
              placeholder="https://"
            />
          </Field>
          {resources.length > 1 ? (
            <button
              type="button"
              className="er-icon-button er-resource-remove"
              onClick={() => onRemove(index)}
              aria-label="Видалити ресурс"
            >
              <Trash2 className="er-trash-icon" />
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="er-link-button" onClick={onAdd}>
        <Plus className="er-link-icon" />
        Додати ресурс
      </button>
    </div>
  )
}

function ReportDetail({ report, onClose }) {
  const normalized = useMemo(() => normalizeReportInput(report), [report])
  const metrics = useMemo(() => compute(normalized), [normalized])
  const insights = Array.isArray(report.aiInsights) ? report.aiInsights : []

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) onClose()
  }

  return (
    <div className="er-modal-overlay" onMouseDown={handleOverlayClick}>
      <div className="er-modal er-detail-modal">
        <div className="er-modal-head">
          <div className="er-detail-title-group">
            <div className="er-detail-meta">
              <ReportTypeTag type={normalized.type} />
              <span>{formatReportDateRange(normalized)}</span>
            </div>
            <h2>{normalized.name || 'Без назви'}</h2>
          </div>
          <button
            type="button"
            className="er-close-button"
            onClick={onClose}
            aria-label="Закрити"
          >
            <X className="er-close-icon" />
          </button>
        </div>

        <div className="er-modal-body er-detail-body">
          <section className="er-detail-section">
            <div className="er-detail-section-head">
              <h3>Метрики</h3>
              <CodeBadge />
            </div>
            <div className="er-detail-metric-grid">
              {detailMetricItems(normalized, metrics).map((item) => (
                <DetailMetric
                  label={item.label}
                  value={item.value}
                  tone={item.tone}
                  key={item.label}
                />
              ))}
            </div>
          </section>

          <section className="er-ai-panel">
            <div className="er-detail-section-head">
              <h3>Executive summary</h3>
              <AiBadge />
            </div>
            {report.aiSummary ? (
              <p className="er-ai-summary">{report.aiSummary}</p>
            ) : (
              <p className="er-ai-placeholder">
                AI-текст не згенерувався. Метрики збережені, можна повторити генерацію
                пізніше.
              </p>
            )}
            <div className="er-ai-grid">
              <div>
                <h4>Інсайти</h4>
                {insights.length ? (
                  <ul>
                    {insights.map((insight) => (
                      <li key={insight}>{insight}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="er-ai-placeholder">Інсайти поки порожні.</p>
                )}
              </div>
              <div>
                <h4>{normalized.type === 'launch' ? 'Результат vs ціль' : 'Розбір'}</h4>
                <p className={report.aiPlanFact ? '' : 'er-ai-placeholder'}>
                  {report.aiPlanFact || 'Короткий розбір поки порожній.'}
                </p>
              </div>
            </div>
          </section>

          {normalized.campaigns.length ? (
            <section className="er-detail-section">
              <div className="er-detail-section-head">
                <h3>Промо-кампанії</h3>
                <span className="er-mini-badge">€ · auto</span>
              </div>
              <CampaignsTable campaigns={metrics.campaigns} />
            </section>
          ) : null}

          {normalized.type === 'launch' ? (
            <LaunchDetailBlocks report={normalized} metrics={metrics} />
          ) : null}

          <section className="er-detail-info-grid">
            <InfoCard title="Опис" text={normalized.description} />
            <InfoCard title="Ціль" text={normalized.goalText} />
            {infoCardsForType(normalized, metrics).map((item) => (
              <InfoCard title={item.title} text={item.text} key={item.title} />
            ))}
          </section>
        </div>
      </div>
    </div>
  )
}

function detailMetricItems(report, metrics) {
  if (report.type === 'partnership') {
    return [
      { label: 'Вартість', value: formatUsd(metrics.totalBudget) },
      { label: 'CPV', value: formatUsdUnit(metrics.cpv) },
      { label: 'CPC', value: formatUsdUnit(metrics.cpc) },
      { label: 'Наймів', value: report.hireEnabled ? formatWhole(metrics.hireCount) : '—' },
      { label: 'Випусків', value: formatWhole(metrics.episodes) },
      { label: 'Перегляди', value: formatCompact(metrics.views) },
      { label: 'Кліки', value: formatWhole(metrics.clicks) },
      {
        label: 'Вартість за найм',
        value: metrics.hireCount ? formatUsdUnit(metrics.costPerHire) : '—',
      },
    ]
  }

  if (report.type === 'launch') {
    return [
      { label: 'Бюджет', value: formatUsd(metrics.totalBudget) },
      { label: 'CPC', value: formatUsdUnit(metrics.cpc) },
      { label: 'CPV', value: formatUsdUnit(metrics.cpv) },
      { label: 'Охоплення', value: formatCompact(metrics.reachTotal) },
      { label: 'Universe соц.', value: formatCompact(metrics.reachUniverse) },
      { label: 'C-level соц.', value: formatCompact(metrics.reachClevel) },
      { label: 'Медіа охопл.', value: formatCompact(metrics.reachMedia) },
      { label: 'ТГ охопл.', value: formatCompact(metrics.tgReach) },
      { label: 'Кліки', value: formatWhole(metrics.clicks) },
      { label: 'Згадки', value: formatWhole(metrics.mediaMentions) },
    ]
  }

  return [
    { label: 'Бюджет', value: formatUsd(metrics.totalBudget) },
    { label: 'Funnel', value: formatWhole(metrics.funnel) },
    { label: 'Прийшло', value: formatWhole(metrics.attended) },
    { label: 'Без команди', value: formatWhole(metrics.attendedNoTeam) },
    { label: 'CPA', value: formatUsdUnit(metrics.cpa) },
    { label: 'CPL', value: formatUsdUnit(metrics.cpl) },
    { label: 'CPL без команди', value: formatUsdUnit(metrics.cplNoTeam) },
    { label: 'Згадки', value: formatWhole(metrics.mediaMentions) },
  ]
}

function infoCardsForType(report) {
  if (report.type === 'partnership') {
    return [
      { title: 'Медіа', text: `${formatWhole(report.mediaMentions)} згадок` },
    ]
  }

  if (report.type === 'launch') {
    return [
      {
        title: 'Результат для продукту',
        text: [
          report.productResultType,
          report.productResultValue ? formatWhole(report.productResultValue) : '',
          report.productResultNote,
        ].filter(Boolean).join(' · '),
      },
    ]
  }

  return [
    { title: 'Медіа', text: `${formatWhole(report.mediaMentions)} згадок` },
    { title: 'Канали залучення', text: report.channels },
    { title: 'Залученість', text: report.engagement },
    { title: 'Фідбек', text: report.feedback },
    { title: 'Нотатки/ретро', text: report.notes },
  ]
}

function LaunchDetailBlocks({ report, metrics }) {
  return (
    <>
      <section className="er-detail-section">
        <div className="er-detail-section-head">
          <h3>Бюджет лончу</h3>
          <CodeBadge />
        </div>
        <div className="er-detail-info-grid">
          <InfoCard title="Авто-сума" text={formatUsd(metrics.budgetAuto)} />
          <InfoCard title="Ефективний бюджет" text={formatUsd(metrics.effectiveBudget)} />
          <InfoCard title="Промо у $" text={formatUsd(metrics.campaignSpendUsd)} />
          <InfoCard title="Інші витрати" text={formatUsd(metrics.otherSpendUsd)} />
        </div>
      </section>

      {report.tgEnabled ? (
        <section className="er-detail-section">
          <div className="er-detail-section-head">
            <h3>Платні ТГ-блогери</h3>
          </div>
          <div className="er-detail-info-grid">
            <InfoCard title="Публікацій" text={formatWhole(report.tgPosts)} />
            <InfoCard title="Вартість" text={formatUsd(report.tgCost)} />
            <InfoCard title="Охоплення / перегляди" text={formatCompact(report.tgReach)} />
            <InfoCard title="Список каналів" text={report.tgChannelList} />
          </div>
        </section>
      ) : null}

      {report.resources.length ? (
        <section className="er-detail-section">
          <div className="er-detail-section-head">
            <h3>Ресурси з новиною</h3>
          </div>
          <ul className="er-resource-list">
            {report.resources.map((resource) => (
              <li key={`${resource.name}-${resource.url}`}>
                {resource.url ? (
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    <span>{resource.name || resource.url}</span>
                    <ExternalLink className="er-link-icon" />
                  </a>
                ) : (
                  <span>{resource.name}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function MetricsPreview({ report, metrics }) {
  const items = previewMetricItems(report, metrics)

  return (
    <section className="er-preview">
      <div className="er-preview-head">
        <h3>Live-прев&apos;ю метрик</h3>
        <CodeBadge />
      </div>
      <div className="er-preview-grid">
        {items.map(([label, value]) => (
          <div className="er-preview-item" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  )
}

function previewMetricItems(report, metrics) {
  if (report.type === 'partnership') {
    return [
      ['Вартість', formatUsd(metrics.totalBudget)],
      ['CPV', formatUsdUnit(metrics.cpv)],
      ['CPC', formatUsdUnit(metrics.cpc)],
      ['Наймів', report.hireEnabled ? formatWhole(metrics.hireCount) : '—'],
    ]
  }

  if (report.type === 'launch') {
    return [
      ['Бюджет', formatUsd(metrics.totalBudget)],
      ['CPC', formatUsdUnit(metrics.cpc)],
      ['CPV', formatUsdUnit(metrics.cpv)],
      ['Охоплення', formatCompact(metrics.reachTotal)],
    ]
  }

  return [
    ['Бюджет', formatUsd(metrics.totalBudget)],
    ['CPA', formatUsdUnit(metrics.cpa)],
    ['CPL', formatUsdUnit(metrics.cpl)],
    ['CPL без команди', formatUsdUnit(metrics.cplNoTeam)],
  ]
}

function CampaignsTable({ campaigns }) {
  if (!campaigns.length) {
    return <p className="er-muted">Кампанії не додані.</p>
  }

  return (
    <div className="er-campaign-table-wrap">
      <table className="er-campaign-table">
        <thead>
          <tr>
            <th>Назва</th>
            <th>Тип</th>
            <th className="er-align-right">Spend</th>
            <th className="er-align-right">Result</th>
            <th className="er-align-right">Clicks</th>
            <th className="er-align-right">CTR</th>
            <th className="er-align-right">CPC</th>
            <th className="er-align-right">CPA</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign, index) => (
            <tr key={`${campaign.name || 'campaign'}-${index}`}>
              <td>{campaign.name || 'Без назви'}</td>
              <td>{campaign.ctype}</td>
              <td className="er-align-right er-metric-cell">
                {formatEur(campaign.spendEur)}
              </td>
              <td className="er-align-right er-metric-cell">
                {formatWhole(campaign.result)}
              </td>
              <td className="er-align-right er-metric-cell">
                {formatWhole(campaign.clicks)}
              </td>
              <td className="er-align-right er-metric-cell">
                {formatPercent(campaign.ctr)}
              </td>
              <td className="er-align-right er-metric-cell">
                {formatEur(campaign.cpc)}
              </td>
              <td className="er-align-right er-metric-cell">
                {formatEur(campaign.cpa)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DisclosureToggle({ checked, label, onChange }) {
  return (
    <label className="er-checkbox-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  )
}

function FormSection({ title, children }) {
  return (
    <section className="er-form-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children, full = false, info = '' }) {
  return (
    <label className={`er-field ${full ? 'er-field-full' : ''}`}>
      <span className="er-field-label">
        <span>{label}</span>
        <InfoTooltip text={info} />
      </span>
      {children}
    </label>
  )
}

function NumberInput({ value, onChange }) {
  return (
    <input
      className="er-input er-number-input"
      type="number"
      inputMode="decimal"
      min="0"
      step="any"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

function DetailMetric({ label, value, tone }) {
  return (
    <div className={`er-detail-metric ${tone ? `er-detail-metric-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InfoCard({ title, text }) {
  return (
    <div className="er-info-card">
      <h4>{title}</h4>
      <p>{text || '—'}</p>
    </div>
  )
}

function ReportTypeTag({ type }) {
  return (
    <span className={`er-type-tag er-type-${type}`}>
      {TYPE_LABELS[type] || TYPE_LABELS.event}
    </span>
  )
}

function CodeBadge() {
  return (
    <span className="er-code-badge">
      <Code2 className="er-badge-icon" />
      Розраховано кодом
    </span>
  )
}

function AiBadge() {
  return (
    <span className="er-ai-badge">
      <Sparkles className="er-badge-icon" />
      Згенеровано AI
    </span>
  )
}

function numberInputValue(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return ''
  return Number.isInteger(number)
    ? String(number)
    : String(Math.round(number * 100) / 100)
}
