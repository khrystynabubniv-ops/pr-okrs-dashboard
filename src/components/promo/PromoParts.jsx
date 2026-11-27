import { useState } from 'react'
import { ChevronRight, Code2, ImageOff, Play, Sparkles } from 'lucide-react'
import {
  CREATIVE_LABELS,
  KIND_LABELS,
  PLATFORM_LABELS,
  PROMO_TYPES,
  formatDuration,
} from '../../lib/promo'

export function CodeBadge() {
  return (
    <span className="er-code-badge">
      <Code2 className="er-badge-icon" />
      Розраховано кодом
    </span>
  )
}

export function AiBadge({ children = 'Згенеровано AI' }) {
  return (
    <span className="er-ai-badge">
      <Sparkles className="er-badge-icon" />
      {children}
    </span>
  )
}

// White card with a titled strip on top (same look as the Event Reports sections).
export function Panel({ title, badge, aside, children, className = '' }) {
  return (
    <section className={`pr-panel ${className}`}>
      <header className="pr-panel-head">
        <div className="pr-panel-title">
          <h2>{title}</h2>
          {badge}
        </div>
        {aside ? <div className="pr-panel-aside">{aside}</div> : null}
      </header>
      <div className="pr-panel-body">{children}</div>
    </section>
  )
}

// Panel whose body is hidden until the header is clicked. The caller owns `open`, so it can open it
// itself (e.g. when editing starts). `aside` sits next to the toggle and does not toggle the panel.
export function CollapsiblePanel({ title, badge, aside, children, open, onToggle, className = '' }) {
  return (
    <section className={`pr-panel pr-panel-collapsible${open ? ' is-open' : ''} ${className}`}>
      <header className="pr-panel-head">
        <button type="button" className="pr-panel-toggle" aria-expanded={open} onClick={onToggle}>
          <ChevronRight className="pr-panel-chevron" aria-hidden="true" />
          <span className="pr-panel-title">
            <span className="pr-panel-title-text">{title}</span>
            {badge}
          </span>
        </button>
        {aside ? <div className="pr-panel-aside">{aside}</div> : null}
      </header>
      {open ? <div className="pr-panel-body">{children}</div> : null}
    </section>
  )
}

export function TypeTag({ type, plural = false }) {
  const config = PROMO_TYPES[type] || PROMO_TYPES.other
  return <span className={config.tagClass}>{plural ? config.label : config.singular}</span>
}

export function LabelPill({ label }) {
  const config = CREATIVE_LABELS[label]
  if (!config) return null
  return <span className={`pr-pill pr-pill-${config.tone}`}>{config.text}</span>
}

// Square preview. Meta thumbnail URLs expire, so a broken image falls back to a placeholder.
export function CreativePreview({ creative, label = true, large = false, onClick, ariaLabel }) {
  const [failed, setFailed] = useState(false)
  const showImage = creative.thumbnailUrl && !failed
  const content = (
    <>
      {showImage ? (
        <img
          src={creative.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="pr-preview-empty">
          <ImageOff />
          {creative.platform === 'linkedin' ? KIND_LABELS[creative.kind] || 'Оголошення' : 'Немає прев’ю'}
        </span>
      )}
      {label && creative.label ? (
        <span className="pr-preview-label">
          <LabelPill label={creative.label} />
        </span>
      ) : null}
      {creative.kind === 'video' ? (
        <>
          <span className="pr-preview-play" aria-hidden="true">
            <Play />
          </span>
          {creative.durationSec ? (
            <span className="pr-preview-duration">{formatDuration(creative.durationSec)}</span>
          ) : null}
        </>
      ) : null}
    </>
  )
  const className = `pr-preview${large ? ' pr-preview-large' : ''}`

  if (!onClick) return <div className={className}>{content}</div>

  return (
    <button type="button" className={className} onClick={onClick} aria-label={ariaLabel}>
      {content}
    </button>
  )
}

export function PlatformIcon({ platform }) {
  return (
    <span className={`pr-platform-icon pr-platform-${platform}`} aria-hidden="true">
      {platform === 'linkedin' ? 'in' : 'M'}
    </span>
  )
}

export function PlatformBadge({ platform }) {
  return (
    <span className="pr-platform-badge">
      <PlatformIcon platform={platform} />
      {PLATFORM_LABELS[platform]}
    </span>
  )
}

export function Metric({ label, value, tone }) {
  return (
    <div className={`er-detail-metric${tone ? ` er-detail-metric-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
