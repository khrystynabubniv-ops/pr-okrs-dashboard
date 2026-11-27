import { RefreshCw } from 'lucide-react'
import { pluralUk, pointsOf, pointsToText, textToPoints } from '../../lib/promo'
import { AddButton, EditablePanel, PointsField, RemoveButton, TextField } from './PromoEditable'
import { AiBadge, CodeBadge, Panel } from './PromoParts'

export function PromoDid({ report }) {
  return (
    <Panel title="Що зробили за період" badge={<CodeBadge />}>
      <ol className="pr-did">
        {report.did.map((item) => (
          <li key={item.lead}>
            <b>{item.lead}</b>
            {item.text}
          </li>
        ))}
      </ol>
    </Panel>
  )
}

const EMPTY_ITEM = { title: '', pointsText: '' }

function KeyEditor({ draft, setDraft }) {
  const update = (index, patch) =>
    setDraft(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))

  return (
    <div className="pr-editor">
      {draft.map((item, index) => (
        <div className="pr-editor-item" key={index}>
          <div className="pr-editor-item-head">
            <span className="pr-key-number">{index + 1}</span>
            <TextField
              label="Заголовок"
              value={item.title}
              onChange={(title) => update(index, { title })}
            />
            <RemoveButton
              label="Видалити пункт"
              onClick={() => setDraft(draft.filter((_, itemIndex) => itemIndex !== index))}
            />
          </div>
          <PointsField value={item.pointsText} onChange={(pointsText) => update(index, { pointsText })} />
        </div>
      ))}
      <AddButton onClick={() => setDraft([...draft, { ...EMPTY_ITEM }])}>Додати пункт</AddButton>
    </div>
  )
}

// "Головне": AI takeaways, editable by the team. `edit` (saved by someone) wins over the AI text.
export function PromoKey({ report, analysis, edit, canEdit, running, onSave, onReset }) {
  const { campaigns, creatives } = report.counts
  const value = edit ? edit.content.key || [] : analysis?.status === 'ok' ? analysis.result?.key || [] : []

  return (
    <EditablePanel
      title="Головне"
      badge={<AiBadge />}
      note={
        <>
          {campaigns} {pluralUk(campaigns, 'кампанія', 'кампанії', 'кампаній')} · {creatives}{' '}
          {pluralUk(creatives, 'креатив', 'креативи', 'креативів')}
        </>
      }
      notice={
        running ? (
          <p className="pr-running">
            <RefreshCw className="er-loading-icon" />
            Аналізуємо візуали й тексти креативів…
          </p>
        ) : null
      }
      value={value}
      edit={edit}
      canEdit={canEdit}
      onSave={(content) => onSave('key', content)}
      onReset={() => onReset('key')}
      toDraft={(items) =>
        items.length
          ? items.map((item) => ({ title: item.title, pointsText: pointsToText(pointsOf(item, 'text')) }))
          : [{ ...EMPTY_ITEM }]
      }
      fromDraft={(draft) => ({
        key: draft.map((item) => ({ title: item.title.trim(), points: textToPoints(item.pointsText) })),
      })}
      editor={(draft, setDraft) => <KeyEditor draft={draft} setDraft={setDraft} />}
      view={(items) =>
        items.length ? (
          <div className="pr-key">
            {items.map((item, index) => (
              <article className="pr-key-item" key={`${index}:${item.title}`}>
                <span className="pr-key-number">{index + 1}</span>
                <div>
                  <h3>{item.title}</h3>
                  <ul className="pr-points">
                    {pointsOf(item, 'text').map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="pr-quiet">Для цього типу кампаній за обраний місяць висновків ще немає</p>
        )
      }
    />
  )
}
