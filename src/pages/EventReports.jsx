import { useEffect, useMemo, useState } from 'react'
import {
  Code2,
  FileText,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { apiRequest } from '../lib/api'
import {
  SENTIMENTS,
  buildReportFacts,
  compute,
  formatCompact,
  formatEur,
  formatPercent,
  formatPlanDelta,
  formatReportDate,
  formatUsd,
  formatWhole,
  normalizeReportInput,
} from '../lib/eventReports'
import './EventReports.css'

const emptyCampaign = () => ({
  name: '',
  ctype: 'Clicks',
  spendEur: '',
  result: '',
  clicks: '',
  impressions: '',
  reach: '',
})

const initialForm = () => ({
  type: 'event',
  name: '',
  date: new Date().toISOString().slice(0, 10),
  description: '',
  goalText: '',
  planAttendees: '',
  leadsGoogle: '',
  leadsMeta: '',
  confirmed: '',
  attended: '',
  teamCount: '',
  partnershipCost: '',
  partnershipClicks: '',
  partnershipLeads: '',
  partnershipViews: '',
  campaigns: [emptyCampaign()],
  promoSpendUsd: '',
  orgSpendUsd: '',
  publications: '',
  mediaMentions: '',
  totalReach: '',
  sentiment: 'Нейтральна',
  engagement: '',
  feedback: '',
  notes: '',
})

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
              Форма для івентів і партнерств: метрики рахуються кодом, а AI
              допомагає сформулювати executive summary та інсайти.
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
            <th>Подія</th>
            <th>Тип</th>
            <th>Дата</th>
            <th className="er-align-right">Бюджет</th>
            <th className="er-align-right">CPA / CPC</th>
            <th className="er-align-right">CPL</th>
            <th className="er-align-right">Учасники / Ліди</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => {
            const metrics = compute(report)
            const isPartnership = report.type === 'partnership'
            const firstMetric = isPartnership ? metrics.cpc : metrics.cpa
            const participants = isPartnership
              ? `${formatWhole(metrics.partnershipLeads)} лід.`
              : formatWhole(metrics.attended)

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
                  <span className="er-table-title">{report.name || 'Без назви'}</span>
                </td>
                <td>
                  <ReportTypeTag type={report.type} />
                </td>
                <td className="er-muted">{formatReportDate(report.date)}</td>
                <td className="er-align-right er-metric-cell">
                  {formatUsd(metrics.totalBudget)}
                </td>
                <td className="er-align-right er-metric-cell">
                  {formatUsd(firstMetric)}
                </td>
                <td className="er-align-right er-metric-cell">
                  {formatUsd(metrics.cpl)}
                </td>
                <td className="er-align-right er-metric-cell">{participants}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
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
          <div className="er-segmented" aria-label="Тип звіту">
            <button
              type="button"
              className={form.type === 'event' ? 'is-active' : ''}
              onClick={() => updateField('type', 'event')}
            >
              Івент
            </button>
            <button
              type="button"
              className={form.type === 'partnership' ? 'is-active' : ''}
              onClick={() => updateField('type', 'partnership')}
            >
              Партнерство
            </button>
          </div>

          <FormSection title="Основне">
            <div className="er-form-grid er-form-grid-2">
              <Field label="Назва">
                <input
                  className="er-input"
                  value={form.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="Universe Hiring Day"
                  required
                />
              </Field>
              <Field label="Дата">
                <input
                  className="er-input"
                  type="date"
                  value={form.date}
                  onChange={(event) => updateField('date', event.target.value)}
                />
              </Field>
              <Field label="Опис/тема/гості" full>
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
              {form.type === 'event' ? (
                <Field label="План учасників">
                  <NumberInput
                    value={form.planAttendees}
                    onChange={(value) => updateField('planAttendees', value)}
                  />
                </Field>
              ) : null}
            </div>
          </FormSection>

          <section className="er-form-section">
            <div className="er-section-heading-row">
              <h3>Промо-кампанії (Meta)</h3>
              <span className="er-mini-badge">CPC · CTR авто</span>
            </div>
            {form.campaigns.map((campaign, index) => {
              const campaignMetrics = metrics.campaigns[index] || compute({ campaigns: [campaign] }).campaigns[0]

              return (
                <div className="er-campaign-card" key={`campaign-${index}`}>
                  <div className="er-campaign-grid">
                    <Field label="Назва">
                      <input
                        className="er-input"
                        value={campaign.name}
                        onChange={(event) => updateCampaign(index, 'name', event.target.value)}
                      />
                    </Field>
                    <Field label="Тип">
                      <select
                        className="er-input"
                        value={campaign.ctype}
                        onChange={(event) => updateCampaign(index, 'ctype', event.target.value)}
                      >
                        <option value="Clicks">Clicks</option>
                        <option value="Leads">Leads</option>
                      </select>
                    </Field>
                    <Field label="Spend €">
                      <NumberInput
                        value={campaign.spendEur}
                        onChange={(value) => updateCampaign(index, 'spendEur', value)}
                      />
                    </Field>
                    <Field label="Result">
                      <NumberInput
                        value={campaign.result}
                        onChange={(value) => updateCampaign(index, 'result', value)}
                      />
                    </Field>
                    <Field label="Clicks">
                      <NumberInput
                        value={campaign.clicks}
                        onChange={(value) => updateCampaign(index, 'clicks', value)}
                      />
                    </Field>
                    <Field label="Impressions">
                      <NumberInput
                        value={campaign.impressions}
                        onChange={(value) => updateCampaign(index, 'impressions', value)}
                      />
                    </Field>
                  </div>
                  <div className="er-campaign-meta">
                    <span>CPC {formatEur(campaignMetrics.cpc)}</span>
                    <span>CTR {formatPercent(campaignMetrics.ctr)}</span>
                    <span>CPA {formatEur(campaignMetrics.cpa)}</span>
                    {form.campaigns.length > 1 ? (
                      <button
                        type="button"
                        className="er-remove-campaign"
                        onClick={() => removeCampaign(index)}
                      >
                        <Trash2 className="er-trash-icon" />
                        Видалити
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
            <button type="button" className="er-link-button" onClick={addCampaign}>
              <Plus className="er-link-icon" />
              Додати кампанію
            </button>
          </section>

          {form.type === 'event' ? (
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
          ) : (
            <FormSection title="Результати партнерства">
              <div className="er-form-grid er-form-grid-2">
                <Field label="Вартість ($)">
                  <NumberInput
                    value={form.partnershipCost}
                    onChange={(value) => updateField('partnershipCost', value)}
                  />
                </Field>
                <Field label="Перегляди">
                  <NumberInput
                    value={form.partnershipViews}
                    onChange={(value) => updateField('partnershipViews', value)}
                  />
                </Field>
                <Field label="Кліки">
                  <NumberInput
                    value={form.partnershipClicks}
                    onChange={(value) => updateField('partnershipClicks', value)}
                  />
                </Field>
                <Field label="Залучені ліди">
                  <NumberInput
                    value={form.partnershipLeads}
                    onChange={(value) => updateField('partnershipLeads', value)}
                  />
                </Field>
              </div>
            </FormSection>
          )}

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

          <FormSection title="Медіа та охоплення">
            <div className="er-form-grid er-form-grid-3">
              <Field label="Публікації">
                <NumberInput
                  value={form.publications}
                  onChange={(value) => updateField('publications', value)}
                />
              </Field>
              <Field label="Медіа прояви">
                <NumberInput
                  value={form.mediaMentions}
                  onChange={(value) => updateField('mediaMentions', value)}
                />
              </Field>
              <Field label="Загальне охоплення">
                <NumberInput
                  value={form.totalReach}
                  onChange={(value) => updateField('totalReach', value)}
                />
              </Field>
              <Field label="Тональність">
                <select
                  className="er-input"
                  value={form.sentiment}
                  onChange={(event) => updateField('sentiment', event.target.value)}
                >
                  {SENTIMENTS.map((sentiment) => (
                    <option key={sentiment} value={sentiment}>
                      {sentiment}
                    </option>
                  ))}
                </select>
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

          <MetricsPreview type={form.type} metrics={metrics} />

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

function ReportDetail({ report, onClose }) {
  const metrics = useMemo(() => compute(report), [report])
  const isPartnership = report.type === 'partnership'
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
              <ReportTypeTag type={report.type} />
              <span>{formatReportDate(report.date)}</span>
            </div>
            <h2>{report.name || 'Без назви'}</h2>
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
              {isPartnership ? (
                <>
                  <DetailMetric label="Бюджет" value={formatUsd(metrics.totalBudget)} />
                  <DetailMetric label="CPC" value={formatUsd(metrics.cpc)} />
                  <DetailMetric label="CPL" value={formatUsd(metrics.cpl)} />
                  <DetailMetric label="CPV" value={formatUsd(metrics.cpv)} />
                  <DetailMetric
                    label="Перегляди"
                    value={formatCompact(metrics.partnershipViews)}
                  />
                  <DetailMetric
                    label="Кліки"
                    value={formatWhole(metrics.partnershipClicks)}
                  />
                  <DetailMetric
                    label="Ліди"
                    value={formatWhole(metrics.partnershipLeads)}
                  />
                </>
              ) : (
                <>
                  <DetailMetric label="Бюджет" value={formatUsd(metrics.totalBudget)} />
                  <DetailMetric label="Funnel" value={formatWhole(metrics.funnel)} />
                  <DetailMetric label="Прийшло" value={formatWhole(metrics.attended)} />
                  <DetailMetric
                    label="Без команди"
                    value={formatWhole(metrics.attendedNoTeam)}
                  />
                  <DetailMetric label="CPA" value={formatUsd(metrics.cpa)} />
                  <DetailMetric label="CPL" value={formatUsd(metrics.cpl)} />
                  <DetailMetric label="CPL без команди" value={formatUsd(metrics.cplNoTeam)} />
                  <DetailMetric
                    label="План/факт"
                    value={formatPlanDelta(metrics.planDelta, metrics.planPct)}
                    tone={metrics.planDelta >= 0 ? 'good' : 'warn'}
                  />
                </>
              )}
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
                <h4>План/факт</h4>
                <p className={report.aiPlanFact ? '' : 'er-ai-placeholder'}>
                  {report.aiPlanFact || 'Короткий розбір план/факт поки порожній.'}
                </p>
              </div>
            </div>
          </section>

          <section className="er-detail-section">
            <div className="er-detail-section-head">
              <h3>Промо-кампанії</h3>
              <span className="er-mini-badge">€ · auto</span>
            </div>
            <CampaignsTable campaigns={metrics.campaigns} />
          </section>

          <section className="er-detail-info-grid">
            <InfoCard title="Опис" text={report.description} />
            <InfoCard title="Ціль" text={report.goalText} />
            <InfoCard
              title="Медіа"
              text={`${formatWhole(report.publications)} публікацій · ${formatWhole(
                report.mediaMentions,
              )} проявів · ${formatCompact(report.totalReach)} охоплення · ${
                report.sentiment || 'Нейтральна'
              }`}
            />
            <InfoCard title="Залученість" text={report.engagement} />
            <InfoCard title="Фідбек" text={report.feedback} />
            <InfoCard title="Нотатки/ретро" text={report.notes} />
          </section>
        </div>
      </div>
    </div>
  )
}

function MetricsPreview({ type, metrics }) {
  const items =
    type === 'partnership'
      ? [
          ['Бюджет', formatUsd(metrics.totalBudget)],
          ['CPC', formatUsd(metrics.cpc)],
          ['CPL', formatUsd(metrics.cpl)],
          ['Кліки', formatWhole(metrics.partnershipClicks)],
        ]
      : [
          ['Бюджет', formatUsd(metrics.totalBudget)],
          ['CPA', formatUsd(metrics.cpa)],
          ['CPL', formatUsd(metrics.cpl)],
          ['CPL без команди', formatUsd(metrics.cplNoTeam)],
        ]

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

function FormSection({ title, children }) {
  return (
    <section className="er-form-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children, full = false }) {
  return (
    <label className={`er-field ${full ? 'er-field-full' : ''}`}>
      <span>{label}</span>
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
  const isPartnership = type === 'partnership'
  return (
    <span className={`er-type-tag ${isPartnership ? 'er-type-partnership' : ''}`}>
      {isPartnership ? 'Партнерство' : 'Івент'}
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
