import { MessageSquare } from 'lucide-react'
import { commentsLabel, creativeMetrics, formatMoney } from '../../lib/promo'
import { CreativePreview } from './PromoParts'

// One ad: preview with label, name, budget share, clicks/CTR/CPC and a comments link.
// `type` is the campaign type (subs shows followers instead of clicks).
export function CreativeCard({ creative, type, currency, onOpen }) {
  const metrics = creativeMetrics(creative, type, currency)

  return (
    <article className="pr-creative">
      <CreativePreview
        creative={creative}
        onClick={() => onOpen(creative)}
        ariaLabel={`Прев’ю: ${creative.name}`}
      />
      <div>
        <h4 className="pr-creative-name">{creative.name}</h4>
        <p className="pr-creative-share">
          {formatMoney(creative.spend, currency)} · {Math.round(creative.sharePct)}% бюджету
        </p>
      </div>
      <div className="pr-creative-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`pr-comment-chip${creative.commentsCount ? ' has' : ''}`}
        onClick={() => onOpen(creative, { focusComments: true })}
      >
        <MessageSquare />
        {commentsLabel(creative.commentsCount)}
      </button>
    </article>
  )
}

export function MetricTiles({ metrics }) {
  return (
    <div className="pr-campaign-metrics">
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
        </div>
      ))}
    </div>
  )
}
