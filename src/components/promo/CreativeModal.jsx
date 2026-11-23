import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Trash2, X } from 'lucide-react'
import { apiRequest } from '../../lib/api'
import {
  PLATFORM_LABELS,
  commentsPath,
  formatAnalysisDate,
  formatCompactNumber,
  formatInt,
  formatMoney,
  formatPercent,
  formatUnitMoney,
  initials,
} from '../../lib/promo'
import { CreativePreview, LabelPill, Metric, TypeTag } from './PromoParts'

function fullMetrics(creative, currency) {
  const metrics = [
    { label: 'Витрачено', value: formatMoney(creative.spend, currency) },
    { label: 'Частка бюджету', value: `${Math.round(creative.sharePct)}%` },
    { label: 'Покази', value: formatCompactNumber(creative.impressions) },
    { label: 'Кліки', value: formatInt(creative.clicks) },
    { label: 'CTR', value: formatPercent(creative.ctr) },
    { label: 'Ціна кліку', value: formatUnitMoney(creative.cpc, currency) },
  ]

  if (creative.follows) {
    metrics.push(
      { label: 'Підписники', value: `+${formatInt(creative.follows)}` },
      { label: 'Ціна підписника', value: formatUnitMoney(creative.cpf, currency) },
    )
  }

  if (creative.kind === 'video') {
    if (creative.hookRate !== null) metrics.push({ label: 'Hook rate', value: formatPercent(creative.hookRate) })
    if (creative.holdRate !== null) metrics.push({ label: 'Hold rate', value: formatPercent(creative.holdRate) })
  }

  return metrics
}

function Comments({ platform, adId, focus, onCountChange }) {
  const [comments, setComments] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const sectionRef = useRef(null)
  const textareaRef = useRef(null)
  // The parent passes a fresh callback on every render; keep it out of the effect deps.
  const countChangeRef = useRef(onCountChange)

  useEffect(() => {
    countChangeRef.current = onCountChange
  })

  useEffect(() => {
    let active = true

    apiRequest(commentsPath(platform, adId), { forceRefresh: true })
      .then((payload) => {
        if (!active) return
        setComments(payload.comments || [])
        countChangeRef.current(platform, adId, (payload.comments || []).length)
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message)
      })

    return () => {
      active = false
    }
  }, [platform, adId])

  useEffect(() => {
    if (focus && comments) {
      sectionRef.current?.scrollIntoView({ block: 'nearest' })
      textareaRef.current?.focus()
    }
  }, [focus, comments])

  async function submit() {
    const text = draft.trim()
    if (!text || posting) return

    setPosting(true)
    setError('')

    try {
      const payload = await apiRequest(commentsPath(platform, adId), {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
      const next = [...(comments || []), payload.comment]
      setComments(next)
      setDraft('')
      onCountChange(platform, adId, next.length)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPosting(false)
    }
  }

  async function remove(comment) {
    setError('')

    try {
      await apiRequest(commentsPath(platform, adId, comment.id), {
        method: 'DELETE',
      })
      const next = comments.filter((item) => item.id !== comment.id)
      setComments(next)
      onCountChange(platform, adId, next.length)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <section className="pr-comments" ref={sectionRef}>
      <div className="er-detail-section-head">
        <h3>Коментарі команди{comments?.length ? ` · ${comments.length}` : ''}</h3>
        <span className="pr-panel-note">видно всій команді EB · не потрапляють у Meta</span>
      </div>

      {loadError ? <p className="er-form-error">{loadError}</p> : null}
      {comments === null && !loadError ? <p className="pr-quiet">Завантажуємо коментарі…</p> : null}

      {comments?.length ? (
        <ul className="pr-comment-list">
          {comments.map((comment) => (
            <li className="pr-comment" key={comment.id}>
              <span className="pr-avatar">{initials(comment.authorName)}</span>
              <div>
                <div className="pr-comment-head">
                  <strong>{comment.authorName}</strong>
                  <span>{formatAnalysisDate(comment.createdAt)}</span>
                  {comment.mine ? (
                    <button
                      type="button"
                      className="pr-comment-delete"
                      onClick={() => remove(comment)}
                      aria-label="Видалити коментар"
                    >
                      <Trash2 />
                    </button>
                  ) : null}
                </div>
                <p className="pr-comment-text">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="pr-comment-new">
        <textarea
          ref={textareaRef}
          className="er-input"
          rows={3}
          value={draft}
          maxLength={2000}
          placeholder="Додайте коментар для команди…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {error ? <p className="er-form-error">{error}</p> : null}
        <button
          type="button"
          className="er-button er-button-primary"
          onClick={submit}
          disabled={posting || !draft.trim()}
          title="⌘/Ctrl + Enter"
        >
          {posting ? <span className="er-spinner" /> : null}
          Додати коментар
        </button>
      </div>
    </section>
  )
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
            platform={creative.platform}
            adId={creative.adId}
            focus={focusComments}
            onCountChange={onCountChange}
          />
        </div>
      </div>
    </div>
  )
}
