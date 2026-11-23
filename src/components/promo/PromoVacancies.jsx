import {
  dayWord,
  formatInt,
  formatMoney,
  formatPercent,
  formatPeriod,
  formatUnitMoney,
  pluralUk,
} from '../../lib/promo'
import { CreativeCard, MetricTiles } from './PromoCreatives'
import { Panel, PlatformIcon, TypeTag } from './PromoParts'

const UNDEFINED_VACANCY_KEY = 'вакансію не визначено'

function PlatformBlock({ block, currency, onOpen }) {
  const metrics = [
    { label: 'Витрачено', value: formatMoney(block.spend, currency) },
    { label: 'Кліки', value: formatInt(block.clicks) },
    { label: 'CTR', value: formatPercent(block.ctr) },
    { label: 'Ціна кліку', value: formatUnitMoney(block.cpc, currency) },
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
      <div className="pr-creatives">
        {block.creatives.map((creative) => (
          <CreativeCard
            key={`${creative.platform}:${creative.adId}`}
            creative={creative}
            type="vac"
            currency={currency}
            onOpen={onOpen}
          />
        ))}
      </div>
    </div>
  )
}

function VacancyCard({ vacancy, currency, onApplies, onFlushApplies, onOpen }) {
  const platformNames = vacancy.platforms.map((block) => block.label).join(' + ')

  return (
    <article className="pr-vacancy">
      <header className="pr-vacancy-head">
        <div className="pr-vacancy-title">
          <TypeTag type="vac" />
          <h3>{vacancy.title}</h3>
          <p>
            {formatPeriod(vacancy.start, vacancy.end)} · {dayWord(vacancy.days)} · {platformNames}
          </p>
        </div>
        <div className="pr-vacancy-tiles">
          <div className="pr-vacancy-tile">
            <span>Витрачено</span>
            <strong>{formatMoney(vacancy.spend, currency)}</strong>
          </div>
          <div className="pr-vacancy-tile">
            <span>Кліки</span>
            <strong>{formatInt(vacancy.clicks)}</strong>
          </div>
          <div className="pr-vacancy-tile">
            <span>Крутилась</span>
            <strong>{dayWord(vacancy.days)}</strong>
          </div>
          <label className="pr-vacancy-tile pr-vacancy-input">
            <span>Еплаї</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="внести"
              aria-label={`Еплаї: ${vacancy.title}`}
              value={vacancy.applies ?? ''}
              onChange={(event) => onApplies(vacancy, event.target.value)}
              onBlur={() => onFlushApplies(vacancy)}
            />
          </label>
          <div className="pr-vacancy-tile">
            <span>Ціна еплаю</span>
            <strong>
              {vacancy.costPerApply === null ? '—' : formatUnitMoney(vacancy.costPerApply, currency)}
            </strong>
            <em>{vacancy.costPerApply === null ? 'внесіть еплаї' : 'усі платформи / еплаї'}</em>
          </div>
        </div>
      </header>
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

export function PromoVacancies({ report, saveState, onApplies, onFlushApplies, onOpen }) {
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
            currency={report.currency}
            onApplies={onApplies}
            onFlushApplies={onFlushApplies}
            onOpen={onOpen}
          />
        ))}
      </div>
    </Panel>
  )
}
