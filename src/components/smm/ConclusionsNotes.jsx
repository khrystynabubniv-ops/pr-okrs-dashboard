import { useState } from 'react'
import { NotebookPen, Pencil, Save } from 'lucide-react'
import { useSmmNotes } from '../../hooks/useSmmNotes'

export function ConclusionsNotes({ monthKey }) {
  const { conclusions, loading, error, save } = useSmmNotes(monthKey)
  const [key, setKey] = useState(monthKey)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  if (monthKey !== key) {
    setKey(monthKey)
    setEditing(false)
  }

  function startEdit() {
    setDraft(conclusions.join('\n'))
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      await save(
        draft
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      )
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel h-full min-w-0 px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink">
          <NotebookPen className="h-4 w-4 text-accent" />
          Мої висновки
        </h2>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            disabled={loading}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink2 transition hover:bg-hover-soft hover:text-ink disabled:opacity-60"
          >
            <Pencil className="h-4 w-4" />
            Редагувати
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Один висновок на рядок"
            rows={6}
            className="w-full rounded-md border border-line px-3 py-2 text-sm leading-6 text-ink focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent2 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              Зберегти
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink2 transition hover:bg-hover-soft hover:text-ink"
            >
              Скасувати
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="mt-4 space-y-2">
          <div className="h-4 w-4/5 animate-pulse rounded bg-line2" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-line2" />
        </div>
      ) : error ? (
        <p className="mt-4 text-sm text-neg">Не вдалося завантажити нотатки.</p>
      ) : conclusions.length ? (
        <ul className="mt-4 space-y-2 text-sm leading-6 text-ink2">
          {conclusions.map((line, index) => (
            <li key={index} className="border-t border-line2 pt-2 first:border-t-0 first:pt-0">
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink3">
          Немає записів за цей місяць. Натисніть «Редагувати», щоб додати свої висновки.
        </p>
      )}
    </section>
  )
}
