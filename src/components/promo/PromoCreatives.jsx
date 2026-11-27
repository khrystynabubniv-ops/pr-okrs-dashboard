import { useState, useSyncExternalStore } from 'react'
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
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
      <div className="pr-creative-info">
        <h4 className="pr-creative-name" title={creative.name}>
          {creative.name}
        </h4>
        <p className="pr-creative-share">
          {formatMoney(creative.spend, currency)} · {Math.round(creative.sharePct)}% of budget
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

// Creatives per row: 3 on desktop, 2 below 1100px (same breakpoint as the CSS grid).
const NARROW_QUERY = '(max-width: 1100px)'

function subscribeNarrow(callback) {
  const media = window.matchMedia(NARROW_QUERY)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

function useColumns() {
  const narrow = useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
  return narrow ? 2 : 3
}

// Shows only the first row of ads; "Показати все" reveals the rest.
export function CreativeGrid({ creatives, type, currency, onOpen }) {
  const columns = useColumns()
  const [expanded, setExpanded] = useState(false)
  const collapsible = creatives.length > columns
  const visible = collapsible && !expanded ? creatives.slice(0, columns) : creatives

  return (
    <div className="pr-creatives-col">
      <div className="pr-creatives">
        {visible.map((creative) => (
          <CreativeCard
            key={`${creative.platform}:${creative.adId}`}
            creative={creative}
            type={type}
            currency={currency}
            onOpen={onOpen}
          />
        ))}
      </div>
      {collapsible ? (
        <button type="button" className="pr-show-all" onClick={() => setExpanded((value) => !value)}>
          {expanded ? <ChevronUp /> : <ChevronDown />}
          {expanded ? 'Згорнути' : `Показати все (${creatives.length})`}
        </button>
      ) : null}
    </div>
  )
}
