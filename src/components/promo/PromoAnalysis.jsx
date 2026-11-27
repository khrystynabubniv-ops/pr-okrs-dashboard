import { RefreshCw } from 'lucide-react'
import {
  CREATIVE_LABELS,
  findCreative,
  formatAnalysisDate,
  pointsOf,
  pointsToText,
  splitLead,
  textToPoints,
} from '../../lib/promo'
import { AddButton, EditablePanel, PointsField, RemoveButton, TextField } from './PromoEditable'
import { AiBadge, PlatformIcon } from './PromoParts'

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
      <ul className="pr-points">
        {pointsOf(finding, 'conclusion').map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
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

function leadTone(lead) {
  if (lead.startsWith('МАСШТАБ') || lead.startsWith('ПОВТОР')) return 'good'
  if (lead.startsWith('ЗУПИН') || lead.startsWith('НЕ ')) return 'warn'
  return 'accent'
}

function RecItem({ text }) {
  const { lead, rest } = splitLead(text)

  return (
    <li>
      {lead ? <b className={`pr-rec-lead pr-rec-lead-${leadTone(lead)}`}>{lead}</b> : null}
      {rest}
    </li>
  )
}

function RecCard({ title, items }) {
  if (!items?.length) return null

  return (
    <div className="pr-rec">
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <RecItem key={item} text={item} />
        ))}
      </ul>
    </div>
  )
}

function RunningNotice() {
  return (
    <p className="pr-running">
      <RefreshCw className="er-loading-icon" />
      Аналізуємо візуали й тексти креативів…
    </p>
  )
}

const EMPTY_FINDING = { kind: 'visual', title: '', pointsText: '', examples: [] }

function FindingsEditor({ draft, setDraft }) {
  const columns = [
    { key: 'works', title: 'Що працює', tone: 'good' },
    { key: 'fails', title: 'Що не працює', tone: 'warn' },
  ]
  const update = (column, index, patch) =>
    setDraft({
      ...draft,
      [column]: draft[column].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    })

  return (
    <div className="pr-analysis">
      {columns.map((column) => (
        <div className="pr-analysis-col" key={column.key}>
          <h3 className="pr-analysis-col-head">
            <i className={`pr-dot pr-dot-${column.tone}`} />
            {column.title}
          </h3>
          {draft[column.key].map((finding, index) => (
            <div className="pr-editor-item" key={index}>
              <div className="pr-editor-item-head">
                <select
                  className="er-input pr-editor-kind"
                  value={finding.kind}
                  aria-label="Тип висновку"
                  onChange={(event) => update(column.key, index, { kind: event.target.value })}
                >
                  <option value="visual">Візуал</option>
                  <option value="text">Текст</option>
                </select>
                <TextField
                  label="Заголовок"
                  value={finding.title}
                  onChange={(title) => update(column.key, index, { title })}
                />
                <RemoveButton
                  label="Видалити висновок"
                  onClick={() =>
                    setDraft({ ...draft, [column.key]: draft[column.key].filter((_, itemIndex) => itemIndex !== index) })
                  }
                />
              </div>
              <PointsField
                value={finding.pointsText}
                onChange={(pointsText) => update(column.key, index, { pointsText })}
              />
              {finding.examples.length ? (
                <p className="pr-editor-hint">
                  Креативи-приклади ({finding.examples.length}) лишаються без змін.
                </p>
              ) : null}
            </div>
          ))}
          <AddButton onClick={() => setDraft({ ...draft, [column.key]: [...draft[column.key], { ...EMPTY_FINDING }] })}>
            Додати висновок
          </AddButton>
        </div>
      ))}
    </div>
  )
}

const toFindingDraft = (finding) => ({
  kind: finding.kind === 'text' ? 'text' : 'visual',
  title: finding.title,
  pointsText: pointsToText(pointsOf(finding, 'conclusion')),
  examples: finding.examples || [],
})

const fromFindingDraft = (finding) => ({
  kind: finding.kind,
  title: finding.title.trim(),
  points: textToPoints(finding.pointsText),
  examples: finding.examples,
})

// "Що працює / що ні": AI findings with examples, editable by the team.
export function PromoAnalysis({ report, analysis, edit, canEdit, running, canRun, onRun, onOpen, error, onSave, onReset }) {
  const ok = analysis?.status === 'ok'
  const aiResult = ok ? analysis.result : null
  const value = edit ? edit.content : { works: aiResult?.works || [], fails: aiResult?.fails || [] }
  const hasContent = Boolean(value.works?.length || value.fails?.length)

  const controls = (
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

  const notice = (
    <>
      {running ? <RunningNotice /> : null}
      {error ? <p className="er-form-error">{error}</p> : null}
      {ok && analysis.outdated && !running ? (
        <p className="pr-quiet pr-outdated">Дані Meta змінились після аналізу. Перезапустіть його, щоб оновити висновки.</p>
      ) : null}
    </>
  )

  return (
    <EditablePanel
      title="Що працює / що ні"
      badge={<AiBadge>AI-аналіз</AiBadge>}
      controls={controls}
      notice={notice}
      value={value}
      edit={edit}
      canEdit={canEdit}
      onSave={(content) => onSave('findings', content)}
      onReset={() => onReset('findings')}
      toDraft={(current) => ({
        works: (current.works || []).map(toFindingDraft),
        fails: (current.fails || []).map(toFindingDraft),
      })}
      fromDraft={(draft) => ({
        works: draft.works.map(fromFindingDraft),
        fails: draft.fails.map(fromFindingDraft),
      })}
      editor={(draft, setDraft) => <FindingsEditor draft={draft} setDraft={setDraft} />}
      view={(current) =>
        hasContent ? (
          <div className="pr-analysis">
            <Column title="Що працює" tone="good" findings={current.works || []} report={report} onOpen={onOpen} />
            <Column title="Що не працює" tone="warn" findings={current.fails || []} report={report} onOpen={onOpen} />
          </div>
        ) : !running ? (
          <p className="pr-quiet">Для цього типу кампаній за обраний місяць висновків ще немає</p>
        ) : null
      }
    />
  )
}

const REC_TEXT_GROUPS = ['brief', 'scale_stop_retest', 'repeat', 'dont_repeat', 'measure']

function RecsEditor({ draft, setDraft }) {
  const fields = [
    ...(draft.simple
      ? [
          { key: 'repeat', title: 'Повторюємо' },
          { key: 'dont_repeat', title: 'Не повторюємо' },
        ]
      : [
          { key: 'brief', title: 'Що закладати в ТЗ' },
          { key: 'scale_stop_retest', title: 'Масштабувати · зупинити · перетестувати' },
        ]),
    { key: 'measure', title: 'Як міряти далі' },
  ]

  return (
    <div className="pr-recs pr-recs-editor">
      {fields.map((field) => (
        <div className="pr-rec" key={field.key}>
          <PointsField
            label={field.title}
            value={draft[field.key]}
            onChange={(text) => setDraft({ ...draft, [field.key]: text })}
            placeholder={
              field.key === 'scale_stop_retest' ? 'МАСШТАБУВАТИ: …\nЗУПИНИТИ: …\nПЕРЕТЕСТУВАТИ: …' : undefined
            }
          />
        </div>
      ))}
    </div>
  )
}

// "Висновки": what to put into the brief, scale / stop / retest, how to measure. Editable by the team.
export function PromoRecs({ analysis, edit, canEdit, running, onSave, onReset }) {
  const aiRecs = analysis?.status === 'ok' ? analysis.result?.recs || {} : {}
  const value = edit ? edit.content.recs || {} : aiRecs
  const simple = Boolean(value.repeat?.length || value.dont_repeat?.length)
  const hasContent = REC_TEXT_GROUPS.some((group) => value[group]?.length)

  return (
    <EditablePanel
      title="Висновки та рекомендації"
      badge={<AiBadge />}
      notice={running ? <RunningNotice /> : null}
      value={value}
      edit={edit}
      canEdit={canEdit}
      onSave={(content) => onSave('recs', content)}
      onReset={() => onReset('recs')}
      toDraft={(current) => ({
        simple,
        ...Object.fromEntries(REC_TEXT_GROUPS.map((group) => [group, pointsToText(current[group])])),
      })}
      fromDraft={(draft) => ({
        recs: Object.fromEntries(
          (draft.simple
            ? ['repeat', 'dont_repeat', 'measure']
            : ['brief', 'scale_stop_retest', 'measure']
          ).map((group) => [group, textToPoints(draft[group])]),
        ),
      })}
      editor={(draft, setDraft) => <RecsEditor draft={draft} setDraft={setDraft} />}
      view={(current) =>
        hasContent ? (
          <div className="pr-recs">
            {simple ? (
              <>
                <RecCard title="Повторюємо" items={current.repeat} />
                <RecCard title="Не повторюємо" items={current.dont_repeat} />
              </>
            ) : (
              <>
                <RecCard title="Що закладати в ТЗ" items={current.brief} />
                <RecCard title="Масштабувати · зупинити · перетестувати" items={current.scale_stop_retest} />
              </>
            )}
            <RecCard title="Як міряти далі" items={current.measure} />
          </div>
        ) : !running ? (
          <p className="pr-quiet">Для цього типу кампаній за обраний місяць висновків ще немає</p>
        ) : null
      }
    />
  )
}
