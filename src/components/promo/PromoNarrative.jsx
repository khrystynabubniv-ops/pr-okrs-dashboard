import { MessageSquare } from 'lucide-react'
import {
  campaignMetrics,
  campaignMonthWord,
  commentsLabel,
  creativeMetrics,
  formatMoney,
  formatInt,
  pluralUk,
} from '../../lib/promo'
import { AiBadge, CodeBadge, CreativePreview, Panel, TypeTag } from './PromoParts'

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
                <p>{item.text}</p>
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

function CreativeCard({ creative, campaign, currency, onOpen }) {
  const metrics = creativeMetrics(creative, campaign.type, currency)

  return (
    <article className="pr-creative">
      <CreativePreview
        creative={creative}
        onClick={() => onOpen(creative, campaign)}
        ariaLabel={`Прев’ю: ${creative.name}`}
      />
      <div>
        <h4 className="pr-creative-name">{creative.name}</h4>
        <p className="pr-creative-share">
          {formatMoney(creative.spend, currency)} · {Math.round(creative.sharePct)}% бюджету
        </p>
      </div>
      <div className="pr-creative-metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={`pr-comment-chip${creative.commentsCount ? ' has' : ''}`}
        onClick={() => onOpen(creative, campaign, { focusComments: true })}
      >
        <MessageSquare />
        {commentsLabel(creative.commentsCount)}
      </button>
    </article>
  )
}

export function PromoCampaigns({ report, onOpen }) {
  const { currency } = report

  return (
    <Panel title="Креативи по кампаніях" aside={<span className="pr-panel-note">клік по прев’ю відкриває деталі</span>}>
      <div className="pr-campaigns">
        {report.campaigns.map((campaign) => (
          <div className="pr-campaign" key={campaign.id}>
            <div className="pr-campaign-head">
              <TypeTag type={campaign.type} />
              <h3>
                {campaign.title}
                {campaign.type !== 'other' ? ` · ${campaignMonthWord(report.month)}` : ''}
              </h3>
              <p className="pr-campaign-name">{campaign.name}</p>
              <div className="pr-campaign-metrics">
                {campaignMetrics(campaign, currency).map((metric) => (
                  <div key={metric.label}>
                    <span>{metric.label}</span>
                    <strong>{metric.value}</strong>
                  </div>
                ))}
              </div>
              <p className="pr-campaign-count">
                {formatInt(campaign.creatives.length)}{' '}
                {pluralUk(campaign.creatives.length, 'креатив', 'креативи', 'креативів')}
              </p>
            </div>
            <div className="pr-creatives">
              {campaign.creatives.map((creative) => (
                <CreativeCard
                  key={creative.adId}
                  creative={creative}
                  campaign={campaign}
                  currency={currency}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}
