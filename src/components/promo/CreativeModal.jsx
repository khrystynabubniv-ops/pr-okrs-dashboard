import { useEffect } from 'react'
import { ExternalLink, X } from 'lucide-react'
import {
  PLATFORM_LABELS,
  commentsPath,
  formatCompactNumber,
  formatInt,
  formatMoney,
  formatPercent,
  formatUnitMoney,
} from '../../lib/promo'
import { Comments } from './PromoComments'
import { CreativePreview, LabelPill, Metric, TypeTag } from './PromoParts'

function fullMetrics(creative, currency) {
  const metrics = [
    { label: 'Spend', value: formatMoney(creative.spend, currency) },
    { label: 'Budget share', value: `${Math.round(creative.sharePct)}%` },
    { label: 'Impressions', value: formatCompactNumber(creative.impressions) },
    { label: 'Clicks', value: formatInt(creative.clicks) },
    { label: 'CTR', value: formatPercent(creative.ctr) },
    { label: 'CPC', value: formatUnitMoney(creative.cpc, currency) },
  ]

  if (creative.follows) {
    metrics.push(
      { label: 'Followers', value: `+${formatInt(creative.follows)}` },
      { label: 'Cost per follower', value: formatUnitMoney(creative.cpf, currency) },
    )
  }

  if (creative.kind === 'video') {
    if (creative.hookRate !== null) metrics.push({ label: 'Hook rate', value: formatPercent(creative.hookRate) })
    if (creative.holdRate !== null) metrics.push({ label: 'Hold rate', value: formatPercent(creative.holdRate) })
  }

  return metrics
}

export function CreativeModal({ creative, context, report, focusComments, onClose, onCountChange }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const text = [creative.title, creative.body].filter(Boolean).join('\n\n')
  // "AI Motion Designer · LinkedIn" for vacancies, the campaign name (+ platform) otherwise.
  const heading =
    context.type === 'vac' || context.platform === 'linkedin'
      ? `${context.title} · ${PLATFORM_LABELS[context.platform]}`
      : context.title

  return (
    <div
      className="er-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="er-modal er-detail-modal" role="dialog" aria-modal="true" aria-label={creative.name}>
        <div className="er-modal-head">
          <div className="er-detail-title-group">
            <div className="er-detail-meta">
              <TypeTag type={context.type} />
              <span>{heading}</span>
              <LabelPill label={creative.label} />
            </div>
            <h2>{creative.name}</h2>
          </div>
          <button type="button" className="er-close-button" onClick={onClose} aria-label="Закрити">
            <X className="er-close-icon" />
          </button>
        </div>

        <div className="er-modal-body er-detail-body">
          <div className="pr-modal-main">
            <CreativePreview creative={creative} label={false} large />
            <div className="pr-modal-side">
              <h3 className="pr-modal-heading">Текст оголошення</h3>
              <p className="pr-modal-text">{text || 'Текст оголошення недоступний.'}</p>
              <div className="er-detail-metric-grid pr-modal-metrics">
                {fullMetrics(creative, report.currency).map((metric) => (
                  <Metric key={metric.label} label={metric.label} value={metric.value} />
                ))}
              </div>
              {creative.adsManagerUrl ? (
                <a
                  className="er-button er-button-ghost pr-small-button"
                  href={creative.adsManagerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="er-button-icon" />
                  {context.platform === 'linkedin' ? 'Відкрити в Campaign Manager' : 'Відкрити в Ads Manager'}
                </a>
              ) : null}
            </div>
          </div>

          <Comments
            listPath={commentsPath(creative.platform, creative.adId)}
            itemPath={(id) => commentsPath(creative.platform, creative.adId, id)}
            focus={focusComments}
            onCountChange={(count) => onCountChange(creative.platform, creative.adId, count)}
          />
        </div>
      </div>
    </div>
  )
}
