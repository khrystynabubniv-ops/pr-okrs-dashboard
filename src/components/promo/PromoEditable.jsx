import { useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { formatAnalysisDate } from '../../lib/promo'
import { CollapsiblePanel } from './PromoParts'

// Panel for an AI block that the team can edit. It starts collapsed. An edit is saved on the server
// and replaces the AI text for everyone until "Повернути AI" drops it.
//   view(value)               renders the content
//   toDraft(value) / fromDraft(draft)   convert between the content and what the editor works with
//   editor(draft, setDraft)   renders the form
//   edit                      the saved edit ({ updatedAt, updatedByName }) or null
export function EditablePanel({
  title,
  badge,
  note,
  controls,
  notice,
  value,
  edit,
  canEdit,
  onSave,
  onReset,
  view,
  toDraft,
  fromDraft,
  editor,
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const editing = draft !== null

  function startEdit() {
    setDraft(toDraft(value))
    setError('')
    setOpen(true)
  }

  function cancelEdit() {
    setDraft(null)
    setError('')
  }

  async function save() {
    setBusy(true)
    setError('')

    try {
      await onSave(fromDraft(draft))
      setDraft(null)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    if (!window.confirm('Повернути текст, згенерований AI? Правки команди в цьому блоці буде видалено.')) return

    setBusy(true)
    setError('')

    try {
      await onReset()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const aside = (
    <div className="pr-panel-tools">
      {edit && !editing ? (
        <span className="pr-panel-note pr-edited-note">
          відредаговано {edit.updatedByName ? `${edit.updatedByName} · ` : ''}
          {formatAnalysisDate(edit.updatedAt)}
        </span>
      ) : note ? (
        <span className="pr-panel-note">{note}</span>
      ) : null}
      {controls}
      {open && canEdit && !editing ? (
        <>
          {edit ? (
            <button type="button" className="er-button er-button-ghost pr-small-button" onClick={reset} disabled={busy}>
              <RotateCcw className="er-button-icon" />
              Повернути AI
            </button>
          ) : null}
          <button type="button" className="er-button er-button-ghost pr-small-button" onClick={startEdit}>
            <Pencil className="er-button-icon" />
            Редагувати
          </button>
        </>
      ) : null}
      {editing ? (
        <>
          <button type="button" className="er-button er-button-ghost pr-small-button" onClick={cancelEdit} disabled={busy}>
            Скасувати
          </button>
          <button type="button" className="er-button er-button-primary pr-small-button" onClick={save} disabled={busy}>
            {busy ? <span className="er-spinner" /> : null}
            Зберегти
          </button>
        </>
      ) : null}
    </div>
  )

  return (
    <CollapsiblePanel
      title={title}
      badge={badge}
      aside={aside}
      open={open}
      onToggle={() => setOpen((current) => !current)}
    >
      {notice}
      {error ? <p className="er-form-error pr-editor-error">{error}</p> : null}
      {editing ? (
        <>
          {editor(draft, setDraft)}
          <p className="pr-editor-hint">Зміни побачить уся команда. «Повернути AI» поверне початковий текст.</p>
        </>
      ) : (
        view(value)
      )}
    </CollapsiblePanel>
  )
}

// ---------- form pieces ----------

function textareaRows(text) {
  return Math.min(10, Math.max(3, String(text || '').split('\n').length + 1))
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <label className="pr-field">
      <span>{label}</span>
      <input
        type="text"
        className="er-input"
        value={value}
        maxLength={200}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

// One bullet per line.
export function PointsField({ label = 'Булети — кожен з нового рядка', value, onChange, placeholder }) {
  return (
    <label className="pr-field">
      <span>{label}</span>
      <textarea
        className="er-input"
        rows={textareaRows(value)}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function RemoveButton({ onClick, label = 'Видалити' }) {
  return (
    <button type="button" className="pr-editor-remove" onClick={onClick} aria-label={label} title={label}>
      <Trash2 />
    </button>
  )
}

export function AddButton({ onClick, children }) {
  return (
    <button type="button" className="er-button er-button-ghost pr-small-button pr-editor-add" onClick={onClick}>
      <Plus className="er-button-icon" />
      {children}
    </button>
  )
}
