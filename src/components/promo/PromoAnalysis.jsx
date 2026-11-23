import { RefreshCw } from 'lucide-react'
import { CREATIVE_LABELS, findCreative, formatAnalysisDate } from '../../lib/promo'
import { AiBadge, Panel, PlatformIcon } from './PromoParts'

function ExampleButton({ example, report, onOpen }) {
  const platform = example.platform || 'meta'
  const found = findCreative(report, platform, example.ad_id)
  if (!found) return null

  const { creative, context } = found
  const label = CREATIVE_LABELS[creative.label]?.text

  return (
    <button type="button" className="pr-example" onClick={() => onOpen(creative)}>
      <span className="pr-example-thumb">
        {creative.thumbnailUrl ? (
          <img src={creative.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : null}
      </span>
      <span className="pr-example-name">
        {creative.name}
        <small>
          <PlatformIcon platform={platform} /> {context.title}
          {label ? ` · ${label}` : ''}
        </small>
      </span>
      <span className="pr-example-metric">{example.metric}</span>
    </button>
  )
}

function Finding({ finding, report, onOpen }) {
  return (
    <article className="pr-finding">
      <span className="pr-kind">{finding.kind === 'text' ? 'Текст' : 'Візуал'}</span>
      <h4>{finding.title}</h4>
      <div className="pr-examples">
        {finding.examples.map((example) => (
          <ExampleButton key={`${example.platform || 'meta'}:${example.ad_id}`} example={example} report={report} onOpen={onOpen} />
        ))}
      </div>
      <p>
        <b>Висновок:</b> {finding.conclusion}
      </p>
    </article>
  )
}

function Column({ title, tone, findings, report, onOpen }) {
  return (
    <div className="pr-analysis-col">
      <h3 className="pr-analysis-col-head">
        <i className={`pr-dot pr-dot-${tone}`} />
        {title}
      </h3>
      {findings.length ? (
        findings.map((finding) => (
          <Finding key={finding.title} finding={finding} report={report} onOpen={onOpen} />
        ))
      ) : (
        <p className="pr-quiet">Висновків немає</p>
      )}
    </div>
  )
}

function RecCard({ title, items }) {
  if (!items?.length) return null

  return (
    <div className="pr-rec">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function PromoAnalysis({ report, analysis, running, canRun, onRun, onOpen, error }) {
  const ok = analysis?.status === 'ok'
  const result = ok ? analysis.result : null
  const recs = result?.recs || {}
  const simpleRecs = Boolean(recs.repeat?.length || recs.dont_repeat?.length)

  const aside = (
    <div className="pr-analysis-meta">
      {analysis ? (
        <span className="pr-panel-note">
          {analysis.status === 'failed' ? 'останній запуск не вдався' : 'аналіз від'}{' '}
          {formatAnalysisDate(analysis.createdAt)}
          {ok ? ' · збережено' : ''}
        </span>
      ) : null}
      <button
        type="button"
        className="er-button er-button-ghost pr-small-button"
        onClick={onRun}
        disabled={running || !canRun}
        title={canRun ? undefined : 'Немає даних для аналізу'}
      >
        <RefreshCw className={`er-button-icon${running ? ' pr-spin' : ''}`} />
        Перезапустити аналіз
      </button>
    </div>
  )

  return (
    <Panel title="Що працює / що ні" badge={<AiBadge>AI-аналіз</AiBadge>} aside={aside}>
      {running ? (
        <p className="pr-running">
          <RefreshCw className="er-loading-icon" />
          Аналізуємо візуали й тексти креативів…
        </p>
      ) : null}
      {error ? <p className="er-form-error">{error}</p> : null}
      {ok && analysis.outdated && !running ? (
        <p className="pr-quiet pr-outdated">Дані Meta змінились після аналізу. Перезапустіть його, щоб оновити висновки.</p>
      ) : null}

      {result ? (
        <>
          <div className="pr-analysis">
            <Column title="Що працює" tone="good" findings={result.works || []} report={report} onOpen={onOpen} />
            <Column title="Що не працює" tone="warn" findings={result.fails || []} report={report} onOpen={onOpen} />
          </div>
          <div className="pr-recs">
            {simpleRecs ? (
              <>
                <RecCard title="Повторюємо" items={recs.repeat} />
                <RecCard title="Не повторюємо" items={recs.dont_repeat} />
              </>
            ) : (
              <>
                <RecCard title="Що закладати в ТЗ" items={recs.brief} />
                <RecCard title="Масштабувати · зупинити · перетестувати" items={recs.scale_stop_retest} />
              </>
            )}
            <RecCard title="Як міряти далі" items={recs.measure} />
          </div>
        </>
      ) : !running ? (
        <p className="pr-quiet">Для цього типу кампаній за обраний місяць висновків ще немає</p>
      ) : null}
    </Panel>
  )
}
