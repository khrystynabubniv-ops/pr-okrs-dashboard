import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Megaphone, RefreshCw } from 'lucide-react'
import { CreativeModal } from '../components/promo/CreativeModal'
import { PromoAnalysis } from '../components/promo/PromoAnalysis'
import { PromoDynamics, PromoKpis } from '../components/promo/PromoMetrics'
import { PromoCampaigns, PromoDid, PromoKey } from '../components/promo/PromoNarrative'
import { apiRequest } from '../lib/api'
import {
  PROMO_README_URL,
  PROMO_TYPE_FILTERS,
  findCreative,
  formatDayMonth,
  formatTime,
  formatUpdatedAt,
  promoAnalysisPath,
  promoMonthKey,
  promoReportPath,
} from '../lib/promo'
import { useAsyncData } from '../hooks/useAsyncData'
import './EventReports.css'
import './Promo.css'

const ANALYSIS_POLL_MS = 6000

export function PromoPage({ selectedMonth }) {
  const monthKey = promoMonthKey(selectedMonth)
  const [type, setType] = useState('all')
  const [selected, setSelected] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [rerunning, setRerunning] = useState(false)
  const [analysisError, setAnalysisError] = useState('')

  const report = useAsyncData(
    () => (monthKey ? apiRequest(promoReportPath(monthKey, type)) : Promise.resolve(null)),
    [monthKey, type],
    { keepPreviousData: true },
  )
  const data = report.data && report.data.month === monthKey ? report.data : null
  const isLoading = report.loading && !data
  const isSwitching = report.loading && Boolean(data)

  // Analysis is read from the DB; it only starts loading once the report (and its sync) is in.
  const analysisState = useAsyncData(
    () =>
      data
        ? apiRequest(promoAnalysisPath(monthKey, type), { forceRefresh: true })
        : Promise.resolve(null),
    [monthKey, type, Boolean(data)],
    { keepPreviousData: true },
  )
  const analysisPayload = analysisState.data
  // Ignore a payload left over from another type/month while the new one is loading.
  const analysis =
    analysisPayload?.analysis?.type === type && analysisPayload.analysis.month === monthKey
      ? analysisPayload.analysis
      : null
  const serverAnalysing = Boolean(analysisPayload?.running) && !rerunning
  const analysisRunning = rerunning || serverAnalysing
  const retryAnalysis = analysisState.retry

  // While the server is analysing, poll until the saved result shows up.
  useEffect(() => {
    if (!serverAnalysing) return undefined

    const timer = window.setTimeout(() => retryAnalysis({ background: true }), ANALYSIS_POLL_MS)
    return () => window.clearTimeout(timer)
  }, [serverAnalysing, analysisPayload, retryAnalysis])

  async function handleSync() {
    setSyncing(true)
    setSyncError('')

    try {
      const payload = await apiRequest(
        `/api/promo/sync?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`,
        { method: 'POST' },
      )
      report.setData(payload)
      analysisState.retry({ background: true })
    } catch (error) {
      setSyncError(error.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleRunAnalysis() {
    setRerunning(true)
    setAnalysisError('')

    try {
      const payload = await apiRequest(
        `/api/promo/analysis/run?month=${encodeURIComponent(monthKey)}&type=${encodeURIComponent(type)}`,
        { method: 'POST' },
      )
      analysisState.setData(payload)
    } catch (error) {
      setAnalysisError(error.message)
      analysisState.retry({ background: true })
    } finally {
      setRerunning(false)
    }
  }

  function handleCountChange(adId, count) {
    report.setData((current) => {
      if (!current) return current

      return {
        ...current,
        campaigns: current.campaigns.map((campaign) => ({
          ...campaign,
          creatives: campaign.creatives.map((creative) =>
            creative.adId === adId && creative.commentsCount !== count
              ? { ...creative, commentsCount: count }
              : creative,
          ),
        })),
      }
    })
  }

  const found = selected && data ? findCreative(data, selected.adId) : null
  const isEmpty = data && data.counts.campaigns === 0
  const updatedText = data
    ? data.staleReason
      ? `Дані Meta станом на ${formatDayMonth(data.asOf)} · ${formatTime(data.asOf)}`
      : `Дані Meta оновлено ${formatUpdatedAt(data.asOf)}`
    : ''

  return (
    <div className="event-reports-viewport">
      <div className="event-reports-page pr-page">
        <header className="er-page-header pr-header">
          <h1>Promo Results</h1>
          <div className="er-segmented er-segmented-compact" role="group" aria-label="Тип кампанії">
            {PROMO_TYPE_FILTERS.map((option) => (
              <button
                type="button"
                key={option.key}
                className={type === option.key ? 'is-active' : ''}
                aria-pressed={type === option.key}
                onClick={() => setType(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="pr-status">
          <span>{updatedText}</span>
          <button
            type="button"
            className="er-button er-button-ghost pr-small-button"
            onClick={handleSync}
            disabled={syncing || !monthKey}
          >
            <RefreshCw className={`er-button-icon${syncing ? ' pr-spin' : ''}`} />
            Оновити
          </button>
        </div>
        {syncError ? <p className="er-form-error pr-sync-error">{syncError}</p> : null}
        {report.error && data ? (
          <p className="er-form-error pr-sync-error">{report.error.message}</p>
        ) : null}

        {data?.staleReason ? (
          <div className="pr-banner" role="alert">
            <AlertTriangle />
            <div>
              <strong>
                {/токен|token/i.test(data.staleReason) ? 'Токен Meta не працює' : 'Не вдалося оновити дані Meta'}
                {' — '}показуємо дані станом на {formatDayMonth(data.asOf)}
              </strong>
              <p>{data.staleReason}</p>
            </div>
            <a className="er-button er-button-ghost pr-small-button" href={PROMO_README_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="er-button-icon" />
              Перепідключити Meta
            </a>
          </div>
        ) : null}

        {!monthKey ? (
          <div className="er-empty-state">
            <Megaphone className="er-empty-icon" />
            <h2>Немає кампаній за обраний період</h2>
            <p>Оберіть місяць у шапці.</p>
          </div>
        ) : null}

        {monthKey && isLoading ? (
          <div className="er-loading-state">
            <RefreshCw className="er-loading-icon" />
            Тягнемо дані з Meta Ads…
          </div>
        ) : null}

        {monthKey && report.error && !data && !report.loading ? (
          <div className="er-error-state">
            <div>
              <h2>Не вдалося завантажити дані Promo</h2>
              <p>{report.error.message || 'Перевірте API і спробуйте ще раз.'}</p>
            </div>
            <button type="button" className="er-button er-button-ghost" onClick={() => report.retry()}>
              <RefreshCw className="er-button-icon" />
              Повторити
            </button>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="er-empty-state">
            <Megaphone className="er-empty-icon" />
            <h2>Немає кампаній за обраний період</h2>
            <p>{type === 'all' ? 'У Meta Ads немає показів за цей місяць.' : 'Для цього типу кампаній за місяць немає даних.'}</p>
            {type !== 'all' ? (
              <button type="button" className="er-button er-button-ghost" onClick={() => setType('all')}>
                Скинути фільтр типу
              </button>
            ) : null}
          </div>
        ) : null}

        {data && !isEmpty ? (
          <div className={`pr-stack${isSwitching ? ' pr-switching' : ''}`}>
            <PromoKpis report={data} />
            <PromoDynamics report={data} />
            <PromoDid report={data} />
            <PromoKey report={data} analysis={analysis} />
            <PromoCampaigns
              report={data}
              onOpen={(creative, _campaign, options) =>
                setSelected({ adId: creative.adId, focusComments: Boolean(options?.focusComments) })
              }
            />
            <PromoAnalysis
              report={data}
              analysis={analysis}
              running={analysisRunning}
              canRun={data.counts.campaigns > 0}
              error={analysisError}
              onRun={handleRunAnalysis}
              onOpen={(creative) => setSelected({ adId: creative.adId, focusComments: false })}
            />
          </div>
        ) : null}

        {found ? (
          <CreativeModal
            key={found.creative.adId}
            creative={found.creative}
            campaign={found.campaign}
            report={data}
            focusComments={selected.focusComments}
            onClose={() => setSelected(null)}
            onCountChange={handleCountChange}
          />
        ) : null}
      </div>
    </div>
  )
}
