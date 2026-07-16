export const MONTHS = [
  'Січень 2026',
  'Лютий 2026',
  'Березень 2026',
  'Квітень 2026',
  'Травень 2026',
  'Червень 2026',
  'Липень 2026',
  'Серпень 2026',
  'Вересень 2026',
  'Жовтень 2026',
  'Листопад 2026',
  'Грудень 2026',
]

export const DIRECTIONS = [
  'Employer Brand',
  'SMM',
  'PR',
  'Brand Design',
]

export const FOCUS_TEAMS = ['EB', 'PR', 'Brand Design', 'Operations', 'SMM']

export const DIRECTION_STYLES = {
  'Employer Brand': {
    badge: 'bg-accent-soft text-accent-d ring-line',
    dot: 'bg-accent',
    chart: 'var(--accent)',
  },
  SMM: {
    badge: 'bg-tag-alt-bg text-tag-alt-fg ring-line',
    dot: 'bg-tag-alt-fg',
    chart: 'var(--tag-alt-fg)',
  },
  PR: {
    badge: 'bg-warn-soft text-warn ring-line',
    dot: 'bg-warn',
    chart: 'var(--warn)',
  },
  'Brand Design': {
    badge: 'bg-good-soft text-good ring-line',
    dot: 'bg-good',
    chart: 'var(--good)',
  },
}

export const MAILCHIMP_PERFORMANCE_CONFIG = {
  thresholds: {
    bounceRateWarning: 2,
    weakClickRate: 6,
    unsubscribeRateWarning: 0.5,
  },
  excludedCampaignTitleTerms: ['copy', 'test', 'копія'],
}

export const METRIC_TYPES = [
  'Кількісна',
  'Відсоткова',
  'Якісна',
  'Накопичувальна',
  'Річний замір',
  'Ріст від старту',
  'Обмеження',
]

export const MEASUREMENT_PERIODS = ['щомісяця', 'щокварталу', 'раз на рік']

export const AMEC_OPTIONS = ['outcomes', 'outputs', 'out-takes', 'impact']

export const EVENT_TYPES = [
  'Конференція',
  'Хакатон',
  'Ярмарка вакансій',
  'Власний мітап',
  'Стажування',
  'Партнерка з університетом',
  'Зовнішній освітній проєкт',
  'Внутрішній івент',
]

export const CURRENT_MONTH = 'Липень 2026'
