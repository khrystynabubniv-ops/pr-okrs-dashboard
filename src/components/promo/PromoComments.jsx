import { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { apiRequest } from '../../lib/api'
import { formatAnalysisDate, initials } from '../../lib/promo'

// Team comments under a creative or a whole vacancy. `listPath` is the collection URL,
// `itemPath(id)` the URL of one comment; `onCountChange(count)` keeps the badges in sync.
export function Comments({ listPath, itemPath, focus, onCountChange, note }) {
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

    apiRequest(listPath, { forceRefresh: true })
      .then((payload) => {
        if (!active) return
        setComments(payload.comments || [])
        countChangeRef.current((payload.comments || []).length)
      })
      .catch((requestError) => {
        if (active) setLoadError(requestError.message)
      })

    return () => {
      active = false
    }
  }, [listPath])

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
      const payload = await apiRequest(listPath, {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
      const next = [...(comments || []), payload.comment]
      setComments(next)
      setDraft('')
      onCountChange(next.length)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setPosting(false)
    }
  }

  async function remove(comment) {
    setError('')

    try {
      await apiRequest(itemPath(comment.id), { method: 'DELETE' })
      const next = comments.filter((item) => item.id !== comment.id)
      setComments(next)
      onCountChange(next.length)
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
        <span className="pr-panel-note">{note || 'видно всій команді EB · не потрапляють у Meta'}</span>
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
