import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import {
  commentsLabel,
  dayWord,
  formatInt,
  formatMoney,
  formatPercent,
  formatPeriod,
  formatUnitMoney,
  pluralUk,
  vacancyCommentsPath,
} from '../../lib/promo'
import { Comments } from './PromoComments'
import { CreativeGrid, MetricTiles } from './PromoCreatives'
import { Panel, PlatformIcon, TypeTag } from './PromoParts'

const UNDEFINED_VACANCY_KEY = 'вакансію не визначено'

function PlatformBlock({ block, currency, onOpen }) {
  // A/B tests of the vacancy (cv / no cv, general / lookalike): own metrics, labels and creatives each.
  const tests = block.tests?.length > 1 ? block.tests : null
  const metrics = [
    { label: 'Spend', value: formatMoney(block.spend, currency) },
    { label: 'Clicks', value: formatInt(block.clicks) },
    { label: 'CTR', value: formatPercent(block.ctr) },
    { label: 'CPC', value: formatUnitMoney(block.cpc, currency) },
  ]

  return (
    <div className="pr-platform">
      <div className="pr-platform-side">
        <div className="pr-platform-title">
          <PlatformIcon platform={block.platform} />
          {block.label}
        </div>
        <p className="pr-platform-period">
          {formatPeriod(block.start, block.end)} · {dayWord(block.days)}
        </p>
        <p className="pr-campaign-name">
          {block.campaigns.map((name) => (
            <span key={name}>{name}</span>
          ))}
        </p>
        <MetricTiles metrics={metrics} />
      </div>
      {tests ? (
        <div className="pr-tests">
          {tests.map((test) => (
            <section className="pr-test" key={test.key}>
              <header className="pr-test-head">
                <span className="pr-test-kicker">Тест</span>
                <span className="pr-test-tag">{test.label}</span>
                <span className="pr-test-metrics">
                  <span>
                    Spend <b>{formatMoney(test.spend, currency)}</b>
                  </span>
                  <span>
                    Clicks <b>{formatInt(test.clicks)}</b>
                  </span>
                  <span>
                    CTR <b>{formatPercent(test.ctr)}</b>
                  </span>
                  <span>
                    CPC <b>{formatUnitMoney(test.cpc, currency)}</b>
                  </span>
                </span>
              </header>
              <CreativeGrid
                creatives={block.creatives.filter((creative) => test.adIds.includes(creative.adId))}
                type="vac"
                currency={currency}
                onOpen={onOpen}
              />
            </section>
          ))}
        </div>
      ) : (
        <CreativeGrid creatives={block.creatives} type="vac" currency={currency} onOpen={onOpen} />
      )}
    </div>
  )
}

function VacancyCard({ vacancy, report, onApplies, onFlushApplies, onOpen, onCommentsCount }) {
  const { currency } = report
  const platformNames = vacancy.platforms.map((block) => block.label).join(' + ')
  const [commentsOpen, setCommentsOpen] = useState(false)

  return (
    <article className="pr-vacancy">
      <header className="pr-vacancy-head">
        <div className="pr-vacancy-title">
          <TypeTag type="vac" />
          <h3>{vacancy.title}</h3>
          <p>
            {formatPeriod(vacancy.start, vacancy.end)} · {dayWord(vacancy.days)} · {platformNames}
          </p>
          <button
            type="button"
            className={`pr-comment-chip${vacancy.commentsCount ? ' has' : ''}`}
            aria-expanded={commentsOpen}
            onClick={() => setCommentsOpen((value) => !value)}
          >
            <MessageSquare />
            {commentsLabel(vacancy.commentsCount)}
          </button>
        </div>
        <div className="pr-vacancy-tiles">
          <div className="pr-vacancy-tile">
            <span>Spend</span>
            <strong>{formatMoney(vacancy.spend, currency)}</strong>
          </div>
          <div className="pr-vacancy-tile">
            <span>Clicks</span>
            <strong>{formatInt(vacancy.clicks)}</strong>
          </div>
          <div className="pr-vacancy-tile">
            <span>Days running</span>
            <strong>{formatInt(vacancy.days)}</strong>
          </div>
          <label className="pr-vacancy-tile pr-vacancy-input">
            <span>Applies</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="внести"
              aria-label={`Applies: ${vacancy.title}`}
              value={vacancy.applies ?? ''}
              onChange={(event) => onApplies(vacancy, event.target.value)}
              onBlur={() => onFlushApplies(vacancy)}
            />
          </label>
          <div className="pr-vacancy-tile">
            <span>Cost per apply</span>
            <strong>
              {vacancy.costPerApply === null ? '—' : formatUnitMoney(vacancy.costPerApply, currency)}
            </strong>
            <em>{vacancy.costPerApply === null ? 'внесіть applies' : 'усі платформи'}</em>
          </div>
        </div>
      </header>
      {commentsOpen ? (
        <div className="pr-vacancy-comments">
          <Comments
            listPath={vacancyCommentsPath(report.month, vacancy.key)}
            itemPath={(id) => vacancyCommentsPath(report.month, vacancy.key, id)}
            focus
            note="коментарі до вакансії загалом · видно всій команді EB"
            onCountChange={(count) => onCommentsCount(vacancy.key, count)}
          />
        </div>
      ) : null}
      {vacancy.key === UNDEFINED_VACANCY_KEY ? (
        <p className="pr-vacancy-hint">
          У назвах цих оголошень немає вакансії. Назвіть оголошення за шаблоном{' '}
          <code>nov26_Назва вакансії_concept1_…</code> або кампанію за шаблоном{' '}
          <code>UNI | Вакансія | Назва | ММ.РРРР</code>.
        </p>
      ) : null}
      {vacancy.platforms.map((block) => (
        <PlatformBlock key={block.platform} block={block} currency={currency} onOpen={(creative, options) => onOpen(creative, options)} />
      ))}
    </article>
  )
}

export function PromoVacancies({ report, saveState, onApplies, onFlushApplies, onOpen, onCommentsCount }) {
  const count = report.vacancies.length

  return (
    <Panel
      title="Вакансії"
      aside={
        <span className="pr-panel-note">
          {count} {pluralUk(count, 'вакансія', 'вакансії', 'вакансій')}
          {saveState ? ` · ${saveState}` : ''}
        </span>
      }
    >
      <div className="pr-vacancies">
        {report.vacancies.map((vacancy) => (
          <VacancyCard
            key={vacancy.key}
            vacancy={vacancy}
            report={report}
            onApplies={onApplies}
            onFlushApplies={onFlushApplies}
            onOpen={onOpen}
            onCommentsCount={onCommentsCount}
          />
        ))}
      </div>
    </Panel>
  )
}
