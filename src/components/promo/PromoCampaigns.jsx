import {
  campaignMetrics,
  campaignMonthWord,
  formatInt,
  pluralUk,
} from '../../lib/promo'
import { CreativeCard, MetricTiles } from './PromoCreatives'
import { Panel, PlatformBadge, TypeTag } from './PromoParts'

// "Інші кампанії": everything that is not a vacancy (subscribers, awareness, unrecognized).
export function PromoCampaigns({ report, onOpen }) {
  const { currency } = report

  return (
    <Panel
      title="Інші кампанії"
      aside={<span className="pr-panel-note">клік по прев’ю відкриває деталі</span>}
    >
      <div className="pr-campaigns">
        {report.otherCampaigns.map((campaign) => (
          <div className="pr-campaign" key={`${campaign.platform}:${campaign.id}`}>
            <div className="pr-campaign-head">
              <div className="pr-tag-row">
                <TypeTag type={campaign.type} />
                {campaign.platform === 'linkedin' ? <PlatformBadge platform="linkedin" /> : null}
              </div>
              <h3>
                {campaign.title}
                {campaign.type !== 'other' ? ` · ${campaignMonthWord(report.month)}` : ''}
              </h3>
              <p className="pr-campaign-name">{campaign.name}</p>
              <MetricTiles metrics={campaignMetrics(campaign, currency)} />
              {campaign.type === 'other' ? (
                <p className="pr-rename-hint">
                  Перейменуйте кампанію за шаблоном <code>UNI | Вакансія | Назва | ММ.РРРР</code>
                  {campaign.platform === 'linkedin' ? ' (у LinkedIn Campaign Manager)' : ''}, щоб вона потрапила у свій тип.
                </p>
              ) : null}
              <p className="pr-campaign-count">
                {formatInt(campaign.creatives.length)}{' '}
                {pluralUk(campaign.creatives.length, 'креатив', 'креативи', 'креативів')}
              </p>
            </div>
            <div className="pr-creatives">
              {campaign.creatives.map((creative) => (
                <CreativeCard
                  key={`${creative.platform}:${creative.adId}`}
                  creative={creative}
                  type={campaign.type}
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
