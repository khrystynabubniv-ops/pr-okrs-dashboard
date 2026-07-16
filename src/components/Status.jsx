import { AlertCircle, RefreshCw } from 'lucide-react'

export function LoadingState({ label = 'Завантаження даних...' }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-table border border-line bg-surface">
      <div className="flex items-center gap-3 text-sm text-muted">
        <RefreshCw className="h-4 w-4 animate-spin text-accent" />
        {label}
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-card border border-line bg-warn-soft px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">
            Не вдалося завантажити дані
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted">
            {error?.message ||
              'Перевірте токени, database ID та доступ інтеграції до Notion.'}
          </p>
          {error?.details ? (
            <p className="mt-1 text-xs text-warn">{error.details}</p>
          ) : null}
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="ui-button ui-button-ghost min-h-9 px-3 py-2"
          >
            <RefreshCw className="h-4 w-4" />
            Повторити
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function EmptyState({ title, text }) {
  return (
    <div className="ui-empty-state">
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
    </div>
  )
}
