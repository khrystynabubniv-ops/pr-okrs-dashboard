import { pluralUk, pointsOf } from '../../lib/promo'
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

export function PromoKey({ report, analysis }) {
  const { campaigns, creatives } = report.counts
  const items = analysis?.status === 'ok' ? analysis.result?.key || [] : []

  return (
    <Panel
      title="Головне"
      badge={<AiBadge />}
      aside={
        <span className="pr-panel-note">
          {campaigns} {pluralUk(campaigns, 'кампанія', 'кампанії', 'кампаній')} · {creatives}{' '}
          {pluralUk(creatives, 'креатив', 'креативи', 'креативів')}
        </span>
      }
    >
      {items.length ? (
        <div className="pr-key">
          {items.map((item, index) => (
            <article className="pr-key-item" key={item.title}>
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
      )}
    </Panel>
  )
}
