import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  ImagePlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { InfoTooltip } from '../components/InfoTooltip'
import { API_REFRESH_INTERVAL_MS, apiRequest } from '../lib/api'
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
  internship: 'Стажування',
}

const CHANNEL_TAG_OPTIONS = [
  'SMM + промо',
  'Медіа (DOU, Cases, BlogUni)',
  'Telegram-канали',
  'Email-розсилки',
  'Комʼюніті UGEN',
  'Соцмережі Genesis',
  'Особисті сторінки команди',
  'Карʼєрні центри ЗВО',
  'Ярмарки вакансій',
  'Happy Monday',
]

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

const emptyBusiness = () => ({
  name: '',
  hireGoal: '',
  hiresActual: '',
})

const emptySource = () => ({
  name: '',
  applications: '',
})

const emptyCreative = () => ({
  name: '',
  kind: '',
  result: '',
  cpa: '',
  cpc: '',
  ctr: '',
})

const emptyFunnelStage = () => ({
  stage: '',
  count: '',
})

const emptyDisqualifyReason = () => ({
  reason: '',
  count: '',
})

const INTERNSHIP_BLOCK_META = [
  { key: 'basic', number: '01', title: 'Основне' },
  { key: 'channels', number: '02', title: 'Канали залучення' },
  { key: 'siteAnalytics', number: '03', title: 'Аналітика сайту' },
  { key: 'campaigns', number: '04', title: 'Промо-кампанії' },
  { key: 'funnel', number: '05', title: 'Воронка найму' },
  { key: 'budget', number: '06', title: 'Бюджет' },
  { key: 'results', number: '07', title: 'Результати та найми' },
  { key: 'feedback', number: '08', title: 'Фідбек учасників' },
  { key: 'retro', number: '09', title: 'Висновки та ретро' },
]

const BLOCK_DROPZONE_CONTENT = {
  channels: {
    title: 'Скріншот плану промо або таблиці каналів',
    subtitle:
      'AI розпізнає перелік каналів, Telegram-канали, розсилки та кількість заявок по джерелах',
    formats: 'PNG · JPG · XLSX · CSV',
  },
  siteAnalytics: {
    title: 'Скріншот дешборду GA4',
    subtitle: 'AI зчитає візити, частку каналів і порівняння з попереднім періодом',
    formats: 'PNG · JPG · CSV',
  },
  campaigns: {
    title: 'Скріншот з Ads Manager',
    subtitle:
      'AI розпізнає таблицю кампаній і створить рядки — spend, result, reach, impressions; CPA, CPM і CTR порахує сам',
    formats: 'PNG · JPG · XLSX · CSV',
  },
  funnel: {
    title: 'Скріншот воронки з Recruitee або Ashby',
    subtitle:
      'AI розпізнає етапи та кількості з пайплайну, порахує конверсії між етапами і Applied → Hired',
    formats: 'PNG · JPG · CSV',
  },
  budget: {
    title: 'Скріншот або експорт витрат',
    subtitle: 'AI зчитає суми, звірить із блоком промо-кампаній і підсвітить розбіжності',
    formats: 'PNG · JPG · XLSX · CSV',
  },
  results: {
    title: 'Скріншот офферів з ATS',
    subtitle: 'AI зчитає наймів по бізнесах і порахує CPA, CPL та CPH від загального бюджету',
    formats: 'PNG · JPG · CSV',
  },
  feedback: {
    title: 'Скріншоти відповідей із форми',
    subtitle: 'AI зведе відповіді у короткий переказ і підсвітить повторювані болі',
    formats: 'PNG · JPG · CSV',
  },
}

const INTERNSHIP_BLOCK_ACCEPT =
  'image/png,image/jpeg,image/webp,.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MAX_INTERNSHIP_BLOCK_FILE_BYTES = 8 * 1024 * 1024

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function internshipBlockStatus(blockKey, form) {
  switch (blockKey) {
    case 'basic':
      return form.name.trim() ? 'done' : 'empty'
    case 'channels':
      return form.internChannelTags.length ||
        form.internTgChannelList.trim() ||
        form.internEmailLists.trim() ||
        form.internSources.some((source) => source.name.trim())
        ? 'done'
        : 'empty'
    case 'siteAnalytics':
      return form.siteVisits || form.geo.trim() ? 'done' : 'empty'
    case 'campaigns':
      return form.campaigns.some((campaign) => campaign.name.trim()) ||
        form.internCreatives.some((creative) => creative.name.trim())
        ? 'done'
        : 'empty'
    case 'funnel':
      return form.internFunnelStages.some((stage) => stage.stage.trim()) ? 'done' : 'empty'
    case 'budget':
      return form.promoSpendUsd || form.orgSpendUsd || form.otherSpendUsd ? 'done' : 'empty'
    case 'results':
      return form.participantsCount || form.internBusinesses.some((business) => business.hiresActual)
        ? 'done'
        : 'empty'
    case 'feedback':
      return form.formsReceived || form.formsSent || form.keyQuotes.trim() ? 'done' : 'empty'
    case 'retro':
      return form.whatWorked.trim() || form.whatDidntWork.trim() || form.nextSteps.trim()
        ? 'done'
        : 'empty'
    default:
      return 'empty'
  }
}

function createListField(setForm, key) {
  return {
    update: (index, name, value) =>
      setForm((current) => ({
        ...current,
        [key]: current[key].map((item, itemIndex) =>
          itemIndex === index ? { ...item, [name]: value } : item,
        ),
      })),
    add: (emptyItem) =>
      setForm((current) => ({ ...current, [key]: [...current[key], emptyItem] })),
    remove: (index) =>
      setForm((current) => ({
        ...current,
        [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
      })),
  }
}

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

    internBusinesses: [emptyBusiness()],
    internChannelTags: [],
    internTgChannelList: '',
    internEmailLists: '',
    internTopChannels: ['', '', '', '', ''],
    internSources: [emptySource()],
    siteVisits: '',
    smmSharePct: '',
    prevPeriodVisits: '',
    geo: '',
    internCreatives: [emptyCreative()],
    internFunnelSource: '',
    internFunnelLink: '',
    internFunnelStages: [emptyFunnelStage()],
    sourcesOfHire: '',
    internDisqualify: [emptyDisqualifyReason()],
    currency: 'USD',
    participantsCount: '',
    formsReceived: '',
    formsSent: '',
    keyQuotes: '',
    whatWorked: '',
    whatDidntWork: '',
    audienceNotes: '',
    nextSteps: '',
    goalsStatus: '',
    cohortComparison: '',
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

    async function loadReports(options = {}) {
      if (!options.background) setLoading(true)

      try {
        const payload = await apiRequest('/api/event-reports', {
          forceRefresh: Boolean(options.background),
        })
        if (active) {
          setReports(Array.isArray(payload) ? payload : [])
          setError(null)
        }
      } catch (requestError) {
        if (active && !options.background) setError(requestError)
      } finally {
        if (active && !options.background) setLoading(false)
      }
    }

    loadReports()
    const interval = window.setInterval(() => {
      void loadReports({ background: true })
    }, API_REFRESH_INTERVAL_MS)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  async function refreshReports() {
    setLoading(true)
    setError(null)

    try {
      const payload = await apiRequest('/api/event-reports', { forceRefresh: true })
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
              Форма для івентів, партнерств, лончів і стажувань: метрики рахуються кодом,
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

  if (report.type === 'internship') {
    return [
      formatUsd(metrics.totalBudget),
      `CPA ${formatUsdUnit(metrics.cpa)}`,
      metrics.hiresTotal ? `CPH ${formatUsdUnit(metrics.cph)}` : `Заявок ${formatWhole(metrics.applications)}`,
      metrics.hiresTotal ? `Наймів ${formatWhole(metrics.hiresTotal)}` : 'Наймів —',
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

  const businessField = createListField(setForm, 'internBusinesses')
  const sourceField = createListField(setForm, 'internSources')
  const creativeField = createListField(setForm, 'internCreatives')
  const funnelField = createListField(setForm, 'internFunnelStages')
  const disqualifyField = createListField(setForm, 'internDisqualify')

  function toggleChannelTag(tag) {
    setForm((current) => ({
      ...current,
      internChannelTags: current.internChannelTags.includes(tag)
        ? current.internChannelTags.filter((item) => item !== tag)
        : [...current.internChannelTags, tag],
    }))
  }

  function updateTopChannel(index, value) {
    setForm((current) => ({
      ...current,
      internTopChannels: current.internTopChannels.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      ),
    }))
  }

  const [internBlockUi, setInternBlockUi] = useState(() => ({
    basic: { open: true },
    channels: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    siteAnalytics: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    campaigns: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    funnel: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    budget: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    results: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    feedback: { open: false, mode: 'auto', fileName: '', busy: false, error: '' },
    retro: { open: false, busy: false, error: '' },
  }))

  function toggleInternBlock(blockKey) {
    setInternBlockUi((current) => ({
      ...current,
      [blockKey]: { ...current[blockKey], open: !current[blockKey].open },
    }))
  }

  function setInternBlockMode(blockKey, mode) {
    setInternBlockUi((current) => ({
      ...current,
      [blockKey]: { ...current[blockKey], mode, error: '' },
    }))
  }

  function applyParsedInternshipBlock(blockKey, parsed) {
    setForm((current) => {
      switch (blockKey) {
        case 'channels':
          return {
            ...current,
            internChannelTags: parsed.channelTags?.length
              ? parsed.channelTags
              : current.internChannelTags,
            internTgChannelList: parsed.tgChannelList || current.internTgChannelList,
            internEmailLists: parsed.emailLists || current.internEmailLists,
            internTopChannels: parsed.topChannels?.length
              ? [...parsed.topChannels, '', '', '', '', ''].slice(0, 5)
              : current.internTopChannels,
            internSources: parsed.sources?.length ? parsed.sources : current.internSources,
          }
        case 'siteAnalytics':
          return {
            ...current,
            siteVisits: parsed.siteVisits || current.siteVisits,
            smmSharePct: parsed.smmSharePct || current.smmSharePct,
            prevPeriodVisits: parsed.prevPeriodVisits || current.prevPeriodVisits,
            geo: parsed.geo || current.geo,
          }
        case 'campaigns':
          return {
            ...current,
            campaigns: parsed.campaigns?.length
              ? parsed.campaigns.map((campaign) => ({ ...emptyCampaign(), ...campaign }))
              : current.campaigns,
            internCreatives: parsed.creatives?.length
              ? parsed.creatives.map((creative) => ({ ...emptyCreative(), ...creative }))
              : current.internCreatives,
          }
        case 'funnel':
          return {
            ...current,
            internFunnelSource: parsed.funnelSource || current.internFunnelSource,
            internFunnelLink: parsed.funnelLink || current.internFunnelLink,
            internFunnelStages: parsed.stages?.length
              ? parsed.stages.map((stage) => ({ ...emptyFunnelStage(), ...stage }))
              : current.internFunnelStages,
            sourcesOfHire: parsed.sourcesOfHire || current.sourcesOfHire,
            internDisqualify: parsed.disqualify?.length
              ? parsed.disqualify.map((reason) => ({ ...emptyDisqualifyReason(), ...reason }))
              : current.internDisqualify,
          }
        case 'budget':
          return {
            ...current,
            promoSpendUsd: parsed.promoSpendUsd || current.promoSpendUsd,
            orgSpendUsd: parsed.orgSpendUsd || current.orgSpendUsd,
            otherSpendUsd: parsed.otherSpendUsd || current.otherSpendUsd,
            currency: parsed.currency || current.currency,
          }
        case 'results': {
          const parsedBusinesses = Array.isArray(parsed.businesses) ? parsed.businesses : []
          const merged = current.internBusinesses.map((business) => {
            const match = parsedBusinesses.find(
              (item) =>
                item.name &&
                business.name &&
                item.name.toLowerCase() === business.name.toLowerCase(),
            )
            return match ? { ...business, hiresActual: match.hiresActual } : business
          })
          const newOnes = parsedBusinesses
            .filter(
              (item) =>
                item.name &&
                !current.internBusinesses.some(
                  (business) => business.name.toLowerCase() === item.name.toLowerCase(),
                ),
            )
            .map((item) => ({ name: item.name, hireGoal: '', hiresActual: item.hiresActual }))

          return {
            ...current,
            participantsCount: parsed.participantsCount || current.participantsCount,
            internBusinesses: [...merged, ...newOnes],
          }
        }
        case 'feedback':
          return {
            ...current,
            formsReceived: parsed.formsReceived || current.formsReceived,
            formsSent: parsed.formsSent || current.formsSent,
            keyQuotes: parsed.keyQuotes || current.keyQuotes,
          }
        default:
          return current
      }
    })
  }

  async function handleInternBlockUpload(blockKey, file) {
    if (file.size > MAX_INTERNSHIP_BLOCK_FILE_BYTES) {
      setInternBlockUi((current) => ({
        ...current,
        [blockKey]: { ...current[blockKey], error: 'Файл завеликий. Максимум 8MB.' },
      }))
      return
    }

    setInternBlockUi((current) => ({
      ...current,
      [blockKey]: { ...current[blockKey], busy: true, error: '' },
    }))

    try {
      const dataBase64 = await readFileAsBase64(file)
      const parsed = await apiRequest('/api/event-reports/parse-block', {
        method: 'POST',
        body: JSON.stringify({
          blockKey,
          fileName: file.name,
          mimeType: file.type,
          dataBase64,
        }),
      })

      applyParsedInternshipBlock(blockKey, parsed)
      setInternBlockUi((current) => ({
        ...current,
        [blockKey]: {
          ...current[blockKey],
          mode: 'manual',
          fileName: file.name,
          busy: false,
          error: '',
        },
      }))
    } catch (requestError) {
      setInternBlockUi((current) => ({
        ...current,
        [blockKey]: {
          ...current[blockKey],
          busy: false,
          error: requestError?.message || 'Не вдалося розпізнати файл.',
        },
      }))
    }
  }

  async function handleGenerateInternshipRetro() {
    setInternBlockUi((current) => ({
      ...current,
      retro: { ...current.retro, busy: true, error: '' },
    }))

    try {
      const reportInput = normalizeReportInput(form)
      const reportMetrics = compute(reportInput)
      const facts = buildReportFacts(reportInput, reportMetrics)
      const parsed = await apiRequest('/api/event-reports/generate-retro', {
        method: 'POST',
        body: JSON.stringify({ facts }),
      })

      setForm((current) => ({
        ...current,
        whatWorked: parsed.whatWorked || current.whatWorked,
        whatDidntWork: parsed.whatDidntWork || current.whatDidntWork,
        audienceNotes: parsed.audienceNotes || current.audienceNotes,
        nextSteps: parsed.nextSteps || current.nextSteps,
        goalsStatus: parsed.goalsStatus || current.goalsStatus,
        cohortComparison: parsed.cohortComparison || current.cohortComparison,
      }))
      setInternBlockUi((current) => ({ ...current, retro: { ...current.retro, busy: false } }))
    } catch (requestError) {
      setInternBlockUi((current) => ({
        ...current,
        retro: {
          ...current.retro,
          busy: false,
          error: requestError?.message || 'Не вдалося згенерувати.',
        },
      }))
    }
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

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !submitting) onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, submitting])

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

          {form.type !== 'internship' ? (
            <FormSection title="Основне">
              <div className="er-form-grid er-form-grid-2">
                <Field label="Назва">
                  <input
                    className="er-input"
                    value={form.name}
                    onChange={(event) => updateField('name', event.target.value)}
                    placeholder={form.type === 'launch' ? 'Лонч продукту' : 'Universe Hiring Day'}
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
          ) : null}

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

          {form.type === 'internship' ? (
            <InternshipFields
              form={form}
              metrics={metrics}
              updateField={updateField}
              addCampaign={addCampaign}
              removeCampaign={removeCampaign}
              updateCampaign={updateCampaign}
              businessField={businessField}
              sourceField={sourceField}
              creativeField={creativeField}
              funnelField={funnelField}
              disqualifyField={disqualifyField}
              updateTopChannel={updateTopChannel}
              toggleChannelTag={toggleChannelTag}
              blockUi={internBlockUi}
              onToggleBlock={toggleInternBlock}
              onSetBlockMode={setInternBlockMode}
              onUploadBlock={handleInternBlockUpload}
              onGenerateRetro={handleGenerateInternshipRetro}
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

function InternshipFields({
  form,
  metrics,
  updateField,
  addCampaign,
  removeCampaign,
  updateCampaign,
  businessField,
  sourceField,
  creativeField,
  funnelField,
  disqualifyField,
  updateTopChannel,
  toggleChannelTag,
  blockUi,
  onToggleBlock,
  onSetBlockMode,
  onUploadBlock,
  onGenerateRetro,
}) {
  return (
    <div className="er-blk-stack">
      <p className="er-blk-intro">
        Прикріпіть скріншот — AI розпізнає дані і заповнить блок. Або заповніть поля вручну.
      </p>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[0]}
        status={internshipBlockStatus('basic', form)}
        open={blockUi.basic.open}
        onToggle={() => onToggleBlock('basic')}
      >
        <div className="er-form-grid er-form-grid-2">
          <Field label="Назва">
            <input
              className="er-input"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="Creative Marketing Internship 6.0"
            />
          </Field>
          <DateFields form={form} updateField={updateField} />
          <Field label="Опис" full>
            <textarea
              className="er-input"
              value={form.description}
              onChange={(event) => updateField('description', event.target.value)}
              placeholder="Коротко: для кого стажування і що входить"
            />
          </Field>
        </div>

        <h4 className="er-subheading">Бізнеси-замовники та цілі по наймах</h4>
        <div className="er-list-editor">
          {form.internBusinesses.map((business, index) => (
            <div className="er-list-row er-list-row-3" key={`business-${index}`}>
              <Field label="Бізнес">
                <input
                  className="er-input"
                  value={business.name}
                  onChange={(event) => businessField.update(index, 'name', event.target.value)}
                />
              </Field>
              <Field label="Ціль наймів">
                <NumberInput
                  value={business.hireGoal}
                  onChange={(value) => businessField.update(index, 'hireGoal', value)}
                />
              </Field>
              <Field label="Фактично найнято">
                <NumberInput
                  value={business.hiresActual}
                  onChange={(value) => businessField.update(index, 'hiresActual', value)}
                />
              </Field>
              {form.internBusinesses.length > 1 ? (
                <button
                  type="button"
                  className="er-icon-button er-resource-remove"
                  onClick={() => businessField.remove(index)}
                  aria-label="Видалити бізнес"
                >
                  <Trash2 className="er-trash-icon" />
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            className="er-link-button"
            onClick={() => businessField.add(emptyBusiness())}
          >
            <Plus className="er-link-icon" />
            Додати бізнес
          </button>
        </div>
        <div className="er-form-grid er-form-grid-2">
          <Field label="Загальна ціль по наймах" info="Сума цілей по всіх бізнесах-замовниках">
            <input
              className="er-input er-number-input er-readonly-input"
              value={numberInputValue(metrics.hireGoalTotal)}
              readOnly
              aria-readonly="true"
            />
          </Field>
          <Field label="Головна ціль" full>
            <textarea
              className="er-input"
              value={form.goalText}
              onChange={(event) => updateField('goalText', event.target.value)}
            />
          </Field>
        </div>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[1]}
        status={internshipBlockStatus('channels', form)}
        open={blockUi.channels.open}
        onToggle={() => onToggleBlock('channels')}
        fileName={blockUi.channels.mode === 'manual' ? blockUi.channels.fileName : ''}
      >
        <BlockAutoOrManual blockKey="channels" ui={blockUi.channels} onSetMode={onSetBlockMode} onUploadFile={onUploadBlock}>
          <div className="er-chip-row">
            {CHANNEL_TAG_OPTIONS.map((tag) => (
              <button
                type="button"
                key={tag}
                className={`er-chip ${form.internChannelTags.includes(tag) ? 'is-active' : ''}`}
                onClick={() => toggleChannelTag(tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="er-form-grid er-form-grid-2">
            <Field label="Список Telegram-каналів" full>
              <input
                className="er-input"
                value={form.internTgChannelList}
                onChange={(event) => updateField('internTgChannelList', event.target.value)}
                placeholder="@ugen_ua, @univwork, @internsgo…"
              />
            </Field>
            <Field label="Email-розсилки" full>
              <input
                className="er-input"
                value={form.internEmailLists}
                onChange={(event) => updateField('internEmailLists', event.target.value)}
                placeholder="Genesis Academy, бази рекрутерів, карʼєрні центри…"
              />
            </Field>
          </div>
          <h4 className="er-subheading">ТОП-5 каналів за результатом</h4>
          <div className="er-form-grid er-form-grid-3">
            {form.internTopChannels.map((channel, index) => (
              <Field label={`#${index + 1}`} key={`top-channel-${index}`}>
                <input
                  className="er-input"
                  value={channel}
                  onChange={(event) => updateTopChannel(index, event.target.value)}
                />
              </Field>
            ))}
          </div>
          <h4 className="er-subheading">Заявки по джерелах</h4>
          <div className="er-list-editor">
            {form.internSources.map((source, index) => (
              <div className="er-list-row er-list-row-2" key={`source-${index}`}>
                <Field label="Джерело">
                  <input
                    className="er-input"
                    value={source.name}
                    onChange={(event) => sourceField.update(index, 'name', event.target.value)}
                  />
                </Field>
                <Field label="Заявок">
                  <NumberInput
                    value={source.applications}
                    onChange={(value) => sourceField.update(index, 'applications', value)}
                  />
                </Field>
                {form.internSources.length > 1 ? (
                  <button
                    type="button"
                    className="er-icon-button er-resource-remove"
                    onClick={() => sourceField.remove(index)}
                    aria-label="Видалити джерело"
                  >
                    <Trash2 className="er-trash-icon" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="er-link-button"
              onClick={() => sourceField.add(emptySource())}
            >
              <Plus className="er-link-icon" />
              Додати джерело
            </button>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[2]}
        status={internshipBlockStatus('siteAnalytics', form)}
        open={blockUi.siteAnalytics.open}
        onToggle={() => onToggleBlock('siteAnalytics')}
        fileName={blockUi.siteAnalytics.mode === 'manual' ? blockUi.siteAnalytics.fileName : ''}
      >
        <BlockAutoOrManual
          blockKey="siteAnalytics"
          ui={blockUi.siteAnalytics}
          onSetMode={onSetBlockMode}
          onUploadFile={onUploadBlock}
        >
          <div className="er-form-grid er-form-grid-3">
            <Field label="Візитів на сайт">
              <NumberInput
                value={form.siteVisits}
                onChange={(value) => updateField('siteVisits', value)}
              />
            </Field>
            <Field label="Частка SMM, %">
              <NumberInput
                value={form.smmSharePct}
                onChange={(value) => updateField('smmSharePct', value)}
              />
            </Field>
            <Field label="Візитів у попередньому потоці">
              <NumberInput
                value={form.prevPeriodVisits}
                onChange={(value) => updateField('prevPeriodVisits', value)}
              />
            </Field>
            <Field
              label="Зміна до попереднього потоку"
              info="Відношення візитів цього потоку до попереднього"
            >
              <input
                className="er-input er-readonly-input"
                value={formatPercent(metrics.siteVisitChangePct, 0)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Гео">
              <input
                className="er-input"
                value={form.geo}
                onChange={(event) => updateField('geo', event.target.value)}
              />
            </Field>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[3]}
        status={internshipBlockStatus('campaigns', form)}
        open={blockUi.campaigns.open}
        onToggle={() => onToggleBlock('campaigns')}
        fileName={blockUi.campaigns.mode === 'manual' ? blockUi.campaigns.fileName : ''}
      >
        <BlockAutoOrManual
          blockKey="campaigns"
          ui={blockUi.campaigns}
          onSetMode={onSetBlockMode}
          onUploadFile={onUploadBlock}
        >
          <CampaignSection
            campaigns={form.campaigns}
            metrics={metrics}
            onAdd={addCampaign}
            onRemove={removeCampaign}
            onUpdate={updateCampaign}
          />
          <h4 className="er-subheading">Креативи</h4>
          <div className="er-list-editor">
            {form.internCreatives.map((creative, index) => (
              <div className="er-list-row er-list-row-6" key={`creative-${index}`}>
                <Field label="Назва">
                  <input
                    className="er-input"
                    value={creative.name}
                    onChange={(event) => creativeField.update(index, 'name', event.target.value)}
                  />
                </Field>
                <Field label="Тип">
                  <input
                    className="er-input"
                    value={creative.kind}
                    onChange={(event) => creativeField.update(index, 'kind', event.target.value)}
                    placeholder="Static / Video"
                  />
                </Field>
                <Field label="Result">
                  <NumberInput
                    value={creative.result}
                    onChange={(value) => creativeField.update(index, 'result', value)}
                  />
                </Field>
                <Field label="CPA">
                  <NumberInput
                    value={creative.cpa}
                    onChange={(value) => creativeField.update(index, 'cpa', value)}
                  />
                </Field>
                <Field label="CPC">
                  <NumberInput
                    value={creative.cpc}
                    onChange={(value) => creativeField.update(index, 'cpc', value)}
                  />
                </Field>
                <Field label="CTR %">
                  <NumberInput
                    value={creative.ctr}
                    onChange={(value) => creativeField.update(index, 'ctr', value)}
                  />
                </Field>
                {form.internCreatives.length > 1 ? (
                  <button
                    type="button"
                    className="er-icon-button er-resource-remove"
                    onClick={() => creativeField.remove(index)}
                    aria-label="Видалити креатив"
                  >
                    <Trash2 className="er-trash-icon" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="er-link-button"
              onClick={() => creativeField.add(emptyCreative())}
            >
              <Plus className="er-link-icon" />
              Додати креатив
            </button>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[4]}
        status={internshipBlockStatus('funnel', form)}
        open={blockUi.funnel.open}
        onToggle={() => onToggleBlock('funnel')}
        fileName={blockUi.funnel.mode === 'manual' ? blockUi.funnel.fileName : ''}
      >
        <BlockAutoOrManual blockKey="funnel" ui={blockUi.funnel} onSetMode={onSetBlockMode} onUploadFile={onUploadBlock}>
          <div className="er-form-grid er-form-grid-2">
            <Field label="Джерело даних">
              <input
                className="er-input"
                value={form.internFunnelSource}
                onChange={(event) => updateField('internFunnelSource', event.target.value)}
                placeholder="Recruitee, Ashby…"
              />
            </Field>
            <Field label="Посилання на пайплайн">
              <input
                className="er-input"
                value={form.internFunnelLink}
                onChange={(event) => updateField('internFunnelLink', event.target.value)}
                placeholder="https://"
              />
            </Field>
          </div>
          <h4 className="er-subheading">Етапи</h4>
          <div className="er-list-editor">
            {form.internFunnelStages.map((stage, index) => (
              <div className="er-list-row er-list-row-2" key={`stage-${index}`}>
                <Field label="Етап">
                  <input
                    className="er-input"
                    value={stage.stage}
                    onChange={(event) => funnelField.update(index, 'stage', event.target.value)}
                    placeholder="Applied, Test Task sent…"
                  />
                </Field>
                <Field label="Кількість">
                  <NumberInput
                    value={stage.count}
                    onChange={(value) => funnelField.update(index, 'count', value)}
                  />
                </Field>
                {form.internFunnelStages.length > 1 ? (
                  <button
                    type="button"
                    className="er-icon-button er-resource-remove"
                    onClick={() => funnelField.remove(index)}
                    aria-label="Видалити етап"
                  >
                    <Trash2 className="er-trash-icon" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="er-link-button"
              onClick={() => funnelField.add(emptyFunnelStage())}
            >
              <Plus className="er-link-icon" />
              Додати етап
            </button>
          </div>
          <div className="er-form-grid er-form-grid-2">
            <Field
              label="Конверсія перший → останній етап"
              info="Останній етап / перший етап × 100"
            >
              <input
                className="er-input er-readonly-input"
                value={formatPercent(metrics.conversionOverall)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Sources of Hire">
              <input
                className="er-input"
                value={form.sourcesOfHire}
                onChange={(event) => updateField('sourcesOfHire', event.target.value)}
              />
            </Field>
          </div>
          <h4 className="er-subheading">Причини дискваліфікації</h4>
          <div className="er-list-editor">
            {form.internDisqualify.map((reason, index) => (
              <div className="er-list-row er-list-row-2" key={`disqualify-${index}`}>
                <Field label="Причина">
                  <input
                    className="er-input"
                    value={reason.reason}
                    onChange={(event) =>
                      disqualifyField.update(index, 'reason', event.target.value)
                    }
                  />
                </Field>
                <Field label="Кандидатів">
                  <NumberInput
                    value={reason.count}
                    onChange={(value) => disqualifyField.update(index, 'count', value)}
                  />
                </Field>
                {form.internDisqualify.length > 1 ? (
                  <button
                    type="button"
                    className="er-icon-button er-resource-remove"
                    onClick={() => disqualifyField.remove(index)}
                    aria-label="Видалити причину"
                  >
                    <Trash2 className="er-trash-icon" />
                  </button>
                ) : null}
              </div>
            ))}
            <button
              type="button"
              className="er-link-button"
              onClick={() => disqualifyField.add(emptyDisqualifyReason())}
            >
              <Plus className="er-link-icon" />
              Додати причину
            </button>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[5]}
        status={internshipBlockStatus('budget', form)}
        open={blockUi.budget.open}
        onToggle={() => onToggleBlock('budget')}
        fileName={blockUi.budget.mode === 'manual' ? blockUi.budget.fileName : ''}
      >
        <BlockAutoOrManual blockKey="budget" ui={blockUi.budget} onSetMode={onSetBlockMode} onUploadFile={onUploadBlock}>
          <div className="er-form-grid er-form-grid-3">
            <Field label="Витрати на промотування ($)">
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
            <Field label="Інші витрати ($)">
              <NumberInput
                value={form.otherSpendUsd}
                onChange={(value) => updateField('otherSpendUsd', value)}
              />
            </Field>
            <Field
              label="Загальний бюджет"
              info="Сума витрат на промотування, організаційних та інших"
            >
              <input
                className="er-input er-number-input er-readonly-input"
                value={numberInputValue(metrics.totalBudget)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Валюта">
              <input
                className="er-input"
                value={form.currency}
                onChange={(event) => updateField('currency', event.target.value)}
              />
            </Field>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[6]}
        status={internshipBlockStatus('results', form)}
        open={blockUi.results.open}
        onToggle={() => onToggleBlock('results')}
        fileName={blockUi.results.mode === 'manual' ? blockUi.results.fileName : ''}
      >
        <BlockAutoOrManual blockKey="results" ui={blockUi.results} onSetMode={onSetBlockMode} onUploadFile={onUploadBlock}>
          <div className="er-form-grid er-form-grid-3">
            <Field label="Заявок" info="Береться з першого етапу воронки найму">
              <input
                className="er-input er-number-input er-readonly-input"
                value={numberInputValue(metrics.applications)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Учасників стажування">
              <NumberInput
                value={form.participantsCount}
                onChange={(value) => updateField('participantsCount', value)}
              />
            </Field>
            <Field label="Наймів усього">
              <input
                className="er-input er-number-input er-readonly-input"
                value={numberInputValue(metrics.hiresTotal)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="CPA · за заявку" info="Загальний бюджет / кількість заявок">
              <input
                className="er-input er-readonly-input"
                value={formatUsdUnit(metrics.cpa)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="CPL · за учасника" info="Загальний бюджет / кількість учасників">
              <input
                className="er-input er-readonly-input"
                value={formatUsdUnit(metrics.cpl)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="CPH · за найм" info="Загальний бюджет / кількість наймів">
              <input
                className="er-input er-readonly-input"
                value={metrics.hiresTotal ? formatUsdUnit(metrics.cph) : '—'}
                readOnly
                aria-readonly="true"
              />
            </Field>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[7]}
        status={internshipBlockStatus('feedback', form)}
        open={blockUi.feedback.open}
        onToggle={() => onToggleBlock('feedback')}
        fileName={blockUi.feedback.mode === 'manual' ? blockUi.feedback.fileName : ''}
      >
        <BlockAutoOrManual
          blockKey="feedback"
          ui={blockUi.feedback}
          onSetMode={onSetBlockMode}
          onUploadFile={onUploadBlock}
        >
          <div className="er-form-grid er-form-grid-3">
            <Field label="Форм отримано">
              <NumberInput
                value={form.formsReceived}
                onChange={(value) => updateField('formsReceived', value)}
              />
            </Field>
            <Field label="Розіслано форм">
              <NumberInput
                value={form.formsSent}
                onChange={(value) => updateField('formsSent', value)}
              />
            </Field>
            <Field label="Response rate" info="Форм отримано / розіслано × 100">
              <input
                className="er-input er-readonly-input"
                value={formatPercent(metrics.responseRate)}
                readOnly
                aria-readonly="true"
              />
            </Field>
            <Field label="Ключові цитати" full>
              <textarea
                className="er-input"
                value={form.keyQuotes}
                onChange={(event) => updateField('keyQuotes', event.target.value)}
                placeholder="2–3 цитати учасників"
              />
            </Field>
          </div>
        </BlockAutoOrManual>
      </InternshipBlock>

      <InternshipBlock
        meta={INTERNSHIP_BLOCK_META[8]}
        status={internshipBlockStatus('retro', form)}
        open={blockUi.retro.open}
        onToggle={() => onToggleBlock('retro')}
      >
        <div className="er-retro-gen">
          <button
            type="button"
            className="er-button er-button-ghost"
            onClick={onGenerateRetro}
            disabled={blockUi.retro.busy}
          >
            {blockUi.retro.busy ? (
              <span className="er-spinner" />
            ) : (
              <Sparkles className="er-button-icon" />
            )}
            {blockUi.retro.busy ? 'Генерую…' : 'Згенерувати з блоків 01–08'}
          </button>
          <p className="er-mini">
            AI сформулює що працювало, що ні, розбір аудиторії та наступні кроки — на основі
            заповнених блоків.
          </p>
          {blockUi.retro.error ? <p className="er-form-error">{blockUi.retro.error}</p> : null}
        </div>
        <div className="er-form-grid er-form-grid-2 er-retro-fields">
          <Field label="Що працювало">
            <textarea
              className="er-input"
              value={form.whatWorked}
              onChange={(event) => updateField('whatWorked', event.target.value)}
              placeholder="Канали, креативи, формати, механіки"
            />
          </Field>
          <Field label="Що не працювало">
            <textarea
              className="er-input"
              value={form.whatDidntWork}
              onChange={(event) => updateField('whatDidntWork', event.target.value)}
              placeholder="Ботлнеки воронки, аудиторія, плейсменти"
            />
          </Field>
          <Field label="Аудиторія промо">
            <textarea
              className="er-input"
              value={form.audienceNotes}
              onChange={(event) => updateField('audienceNotes', event.target.value)}
              placeholder="Вік, гендер, плейсменти — що показали дані"
            />
          </Field>
          <Field label="Наступні кроки">
            <textarea
              className="er-input"
              value={form.nextSteps}
              onChange={(event) => updateField('nextSteps', event.target.value)}
              placeholder="Що змінюємо у наступному потоці"
            />
          </Field>
          <Field label="Статус цілей">
            <input
              className="er-input"
              value={form.goalsStatus}
              onChange={(event) => updateField('goalsStatus', event.target.value)}
            />
          </Field>
          <Field label="Порівняння з потоком">
            <input
              className="er-input"
              value={form.cohortComparison}
              onChange={(event) => updateField('cohortComparison', event.target.value)}
            />
          </Field>
        </div>
      </InternshipBlock>
    </div>
  )
}

function InternshipBlock({ meta, status, open, onToggle, fileName, children }) {
  return (
    <div className={`er-blk ${open ? 'on' : ''}`}>
      <div
        className="er-blk-h"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') onToggle()
        }}
      >
        <span className="er-chev">
          <ChevronRight />
        </span>
        <span className="er-blk-n">{meta.number}</span>
        <span className="er-blk-t">{meta.title}</span>
        {fileName ? (
          <span className="er-blk-file">
            <FileText className="er-blk-file-icon" />
            {fileName}
          </span>
        ) : null}
        <span className={`er-blk-st ${status === 'done' ? 'done' : ''}`}>
          {status === 'done' ? 'заповнено' : 'порожньо'}
        </span>
      </div>
      {open ? <div className="er-blk-body">{children}</div> : null}
    </div>
  )
}

function BlockAutoOrManual({ blockKey, ui, onSetMode, onUploadFile, children }) {
  if (ui.mode !== 'manual') {
    return (
      <>
        <ScreenshotDropzone
          content={BLOCK_DROPZONE_CONTENT[blockKey]}
          busy={ui.busy}
          error={ui.error}
          onFile={(file) => onUploadFile(blockKey, file)}
        />
        <div className="er-or">
          <span>або</span>
        </div>
        <div className="er-manual">
          <button
            type="button"
            className="er-button er-button-ghost"
            onClick={() => onSetMode(blockKey, 'manual')}
          >
            Заповнити вручну
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {ui.fileName ? (
        <div className="er-attached">
          <Sparkles className="er-badge-icon" />
          <span>Розпізнано AI · поля нижче заповнені автоматично, можна відкоригувати</span>
          <button
            type="button"
            className="er-link-button"
            onClick={() => onSetMode(blockKey, 'auto')}
          >
            Прикріпити скріншот замість цього
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="er-link-button er-back-to-auto"
          onClick={() => onSetMode(blockKey, 'auto')}
        >
          <RotateCcw className="er-link-icon" />
          Прикріпити скріншот замість цього
        </button>
      )}
      {children}
    </>
  )
}

function ScreenshotDropzone({ content, busy, error, onFile }) {
  const inputRef = useRef(null)

  function handleChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFile(file)
  }

  return (
    <div>
      <button
        type="button"
        className="er-hero-drop"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <span className="er-hd-ic">
          {busy ? <span className="er-spinner-dark" /> : <ImagePlus className="er-drop-icon" />}
        </span>
        <span className="er-hd-t">{busy ? 'Розпізнаю…' : content.title}</span>
        <span className="er-hd-s">{content.subtitle}</span>
        <span className="er-hd-f">{content.formats}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={INTERNSHIP_BLOCK_ACCEPT}
        className="er-hidden-input"
        onChange={handleChange}
      />
      {error ? <p className="er-form-error">{error}</p> : null}
    </div>
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

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

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

          {normalized.type === 'internship' ? (
            <InternshipDetailBlocks report={normalized} metrics={metrics} />
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

  if (report.type === 'internship') {
    return [
      { label: 'Бюджет', value: formatUsd(metrics.totalBudget) },
      { label: 'Заявок', value: formatWhole(metrics.applications) },
      { label: 'Учасників', value: formatWhole(metrics.participantsCount) },
      {
        label: 'Наймів',
        value: metrics.hiresTotal ? formatWhole(metrics.hiresTotal) : '—',
        tone: metrics.hiresTotal ? 'good' : undefined,
      },
      { label: 'CPA', value: formatUsdUnit(metrics.cpa) },
      { label: 'CPL', value: formatUsdUnit(metrics.cpl) },
      {
        label: 'CPH',
        value: metrics.hiresTotal ? formatUsdUnit(metrics.cph) : '—',
      },
      { label: 'Візитів на сайт', value: formatWhole(report.siteVisits) },
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

  if (report.type === 'internship') {
    return [
      { title: 'Канали залучення', text: report.internChannelTags.join(', ') },
      { title: 'Sources of Hire', text: report.sourcesOfHire },
      { title: 'Що працювало', text: report.whatWorked },
      { title: 'Що не працювало', text: report.whatDidntWork },
      { title: 'Аудиторія промо', text: report.audienceNotes },
      { title: 'Наступні кроки', text: report.nextSteps },
      { title: 'Статус цілей', text: report.goalsStatus },
      { title: 'Фідбек учасників', text: report.keyQuotes },
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

function InternshipDetailBlocks({ report, metrics }) {
  return (
    <>
      {report.internBusinesses.length ? (
        <section className="er-detail-section">
          <div className="er-detail-section-head">
            <h3>Найми по бізнесах</h3>
            <CodeBadge />
          </div>
          <div className="er-detail-info-grid">
            {report.internBusinesses.map((business, index) => (
              <InfoCard
                title={business.name || 'Без назви'}
                text={`Ціль ${formatWhole(business.hireGoal)} · Найнято ${formatWhole(business.hiresActual)}`}
                key={`business-detail-${index}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {metrics.funnel.length ? (
        <section className="er-detail-section">
          <div className="er-detail-section-head">
            <h3>Воронка найму</h3>
            <span className="er-mini-badge">Конверсія авто</span>
          </div>
          <FunnelChart funnel={metrics.funnel} />
          <p className="er-muted er-funnel-foot">
            Конверсія {report.internFunnelStages[0]?.stage || 'перший етап'} →{' '}
            {report.internFunnelStages[report.internFunnelStages.length - 1]?.stage ||
              'останній етап'}
            : {formatPercent(metrics.conversionOverall)}
          </p>
        </section>
      ) : null}

      {report.internCreatives.some((creative) => creative.name) ? (
        <section className="er-detail-section">
          <div className="er-detail-section-head">
            <h3>Креативи</h3>
            <span className="er-mini-badge">Прикріплено вручну</span>
          </div>
          <CreativesTable creatives={report.internCreatives} />
        </section>
      ) : null}
    </>
  )
}

function FunnelChart({ funnel }) {
  return (
    <div className="er-funnel">
      {funnel.map((stage, index) => (
        <div className="er-funnel-row" key={`${stage.stage}-${index}`}>
          <span className="er-funnel-label">{stage.stage || `Етап ${index + 1}`}</span>
          <div className="er-funnel-track">
            <span
              className="er-funnel-fill"
              style={{ width: `${Math.min(stage.widthPct, 100)}%` }}
            />
          </div>
          <span className="er-funnel-count">{formatWhole(stage.count)}</span>
          <span className="er-funnel-conv">
            {stage.convPct === null || stage.convPct === undefined
              ? '—'
              : formatPercent(stage.convPct)}
          </span>
        </div>
      ))}
    </div>
  )
}

function CreativesTable({ creatives }) {
  return (
    <div className="er-campaign-table-wrap">
      <table className="er-campaign-table">
        <thead>
          <tr>
            <th>Назва</th>
            <th>Тип</th>
            <th className="er-align-right">Result</th>
            <th className="er-align-right">CPA</th>
            <th className="er-align-right">CPC</th>
            <th className="er-align-right">CTR</th>
          </tr>
        </thead>
        <tbody>
          {creatives.map((creative, index) => (
            <tr key={`${creative.name || 'creative'}-${index}`}>
              <td>{creative.name || 'Без назви'}</td>
              <td>{creative.kind || '—'}</td>
              <td className="er-align-right er-metric-cell">{formatWhole(creative.result)}</td>
              <td className="er-align-right er-metric-cell">{formatUsdUnit(creative.cpa)}</td>
              <td className="er-align-right er-metric-cell">{formatUsdUnit(creative.cpc)}</td>
              <td className="er-align-right er-metric-cell">{formatPercent(creative.ctr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  if (report.type === 'internship') {
    return [
      ['Бюджет', formatUsd(metrics.totalBudget)],
      ['CPA', formatUsdUnit(metrics.cpa)],
      ['CPL', formatUsdUnit(metrics.cpl)],
      ['CPH', metrics.hiresTotal ? formatUsdUnit(metrics.cph) : '—'],
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
