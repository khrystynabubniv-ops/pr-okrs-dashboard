import { AlertCircle, RefreshCw } from 'lucide-react'

export function LoadingState({ label = 'Завантаження даних...' }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-[10px] border border-line bg-white">
      <div className="flex items-center gap-3 text-sm text-ink3">
        <RefreshCw className="h-4 w-4 animate-spin text-accent" />
        {label}
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-rose-950">
            Не вдалося завантажити дані
          </h3>
          <p className="mt-1 text-sm leading-6 text-rose-800">
            {error?.message ||
              'Перевірте токени, database ID та доступ інтеграції до Notion.'}
          </p>
          {error?.details ? (
            <p className="mt-1 text-xs text-rose-700">{error.details}</p>
          ) : null}
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
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
    <div className="rounded-[10px] border border-dashed border-line bg-white px-6 py-10 text-center">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {text ? <p className="mt-2 text-sm text-ink3">{text}</p> : null}
    </div>
  )
}
