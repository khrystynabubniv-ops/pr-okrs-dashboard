import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { apiRequest } from '../../lib/api'

const kindLabels = {
  insight: 'Інсайт',
  recommendation: 'Рекомендація',
  risk: 'Ризик',
}

const kindStyles = {
  insight: 'bg-soft text-accent2 ring-emerald-200',
  recommendation: 'bg-warmsoft text-amber-800 ring-amber-200',
  risk: 'bg-rose-50 text-rose-700 ring-rose-200',
}

export function AiInsightsCard({ monthKey, monthLabel, payload, unavailableReason = '' }) {
  const [insight, setInsight] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const unavailableMessage =
    unavailableReason || (!payload && monthKey ? 'Недостатньо даних для аналізу цього місяця' : '')
  const isUnavailable = Boolean(unavailableMessage)

  const generate = useCallback(async () => {
    if (!monthKey || !payload || isUnavailable) return

    setGenerating(true)
    setError(null)

    try {
      const result = await apiRequest('/api/smm/insights/generate', {
        method: 'POST',
        body: JSON.stringify({
          month: monthKey,
          data: payload,
        }),
      })
      setInsight(result)
    } catch (requestError) {
      setError(requestError)
    } finally {
      setGenerating(false)
      setLoading(false)
    }
  }, [isUnavailable, monthKey, payload])

  useEffect(() => {
    let isMounted = true

    async function loadInsight() {
      if (!monthKey || !payload || isUnavailable) {
        setLoading(false)
        setGenerating(false)
        setError(null)
        setInsight(null)
        return
      }

      setLoading(true)
      setError(null)
      setInsight(null)

      try {
        const result = await apiRequest(
          `/api/smm/insights?month=${encodeURIComponent(monthKey)}`,
        )
        if (isMounted) setInsight(result)
      } catch (requestError) {
        if (!isMounted) return

        if (requestError.status === 404) {
          await generate()
          return
        }

        setError(requestError)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadInsight()

    return () => {
      isMounted = false
    }
  }, [generate, isUnavailable, monthKey, payload])

  return (
    <section className="panel h-full min-w-0 px-5 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-ink">
            <Sparkles className="h-4 w-4 text-accent" />
            Висновки та рекомендації
          </h2>
          <p className="mt-1 text-sm text-ink3">
            Оновлено {insight?.generatedAt ? formatDateTime(insight.generatedAt) : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating || loading || isUnavailable}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-white transition hover:bg-accent2 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
          Оновити
        </button>
      </div>

      {isUnavailable ? (
        <div className="mt-5 rounded-md border border-line bg-surface-2 px-4 py-4">
          <p className="text-sm font-semibold text-ink">{unavailableMessage}</p>
          <p className="mt-1 text-sm leading-6 text-ink2">
            Після першої публікації за місяць Comms Copilot зможе сформувати висновки.
          </p>
        </div>
      ) : null}

      {!isUnavailable && (loading || generating) ? (
        <div className="mt-5 space-y-3">
          <div className="h-4 w-4/5 animate-pulse rounded bg-line2" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-line2" />
          <div className="mt-5 space-y-2">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-10 animate-pulse rounded-md bg-line2" />
            ))}
          </div>
        </div>
      ) : null}

      {!isUnavailable && !loading && !generating && error ? (
        <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-4 py-4">
          <p className="text-sm font-semibold text-rose-900">
            Не вдалося згенерувати висновки — перевірте налаштування.
          </p>
          <p className="mt-1 text-sm leading-6 text-rose-700">{error.message}</p>
        </div>
      ) : null}

      {!isUnavailable && !loading && !generating && !error && insight ? (
        <div className="mt-5">
          <p className="text-sm leading-6 text-ink2">{insight.leadParagraph}</p>
          <div className="mt-5 space-y-3">
            {(insight.insights || []).map((item, index) => (
              <div
                key={`${item.kind}-${index}`}
                className="flex items-start gap-3 border-t border-line2 pt-3 first:border-t-0 first:pt-0"
              >
                <span
                  className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                    kindStyles[item.kind] || kindStyles.insight
                  }`}
                >
                  {kindLabels[item.kind] || kindLabels.insight}
                </span>
                <p className="text-sm leading-6 text-ink2">{item.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 border-t border-line2 pt-3 text-xs font-medium text-ink3">
            На основі даних Meta Business Suite за {monthLabel}
          </p>
        </div>
      ) : null}
    </section>
  )
}

function formatDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
