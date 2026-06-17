import 'dotenv/config'
import { createSign, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { Client as NotionClient } from '@notionhq/client'
import cors from 'cors'
import express from 'express'
import {
  attachUser,
  authStatus,
  registerAuthRoutes,
  requireAuth,
  requirePageAuth,
} from './auth.js'
import {
  createBoardReport,
  createCompetitorCoverage,
  createStoredEventReport,
  deleteCompetitorCoverage,
  getDatabaseStatus,
  insertStoredKpiGoal,
  isDatabaseConfigured,
  listCompetitorCoverage,
  listStoredEventReports,
  listStoredKpiGoals,
  listStoredMonthlyFocusEntries,
  saveStoredMonthlyFocusEntry,
  updateBoardReportNotionPage,
  updateStoredKpiGoalValue,
  upsertStoredKpiGoalFromExternal,
} from './db/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const EVENT_REPORTS_FILE =
  process.env.EVENT_REPORTS_FILE || path.join(__dirname, 'data', 'event-reports.json')

const app = express()
const port = process.env.PORT || 3001

const MONTHS = [
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

const MONTH_PROPERTY_NAMES = {
  'Січень 2026': 'Січень',
  'Лютий 2026': 'Лютий',
  'Березень 2026': 'Березень',
  'Квітень 2026': 'Квітень',
  'Травень 2026': 'Травень',
  'Червень 2026': 'Червень',
  'Липень 2026': 'Липень',
  'Серпень 2026': 'Серпень',
  'Вересень 2026': 'Вересень',
  'Жовтень 2026': 'Жовтень',
  'Листопад 2026': 'Листопад',
  'Грудень 2026': 'Грудень',
}

const MOCK_COVERAGE_MONTH = 'Травень 2026'
const EVENTS_AWARENESS_SPREADSHEET_ID =
  process.env.EVENTS_AWARENESS_SPREADSHEET_ID ||
  '1StHTeMTN0m3WFaOmxucsR2njnmKv04_R7CqG-_ZjDhE'
const EVENTS_AWARENESS_SHEETS = ['Students', 'Middle+']
const KPI_SPREADSHEET_INPUT =
  process.env.KPI_SPREADSHEET_ID || '1-wWo9W9gL4jYqpsZNrtZnb85XL5sLkAI4GKEqiMkEnI'
const KPI_SPREADSHEET_ID =
  parseGoogleSpreadsheetId(KPI_SPREADSHEET_INPUT) || '1-wWo9W9gL4jYqpsZNrtZnb85XL5sLkAI4GKEqiMkEnI'
const KPI_SHEET_GID = process.env.KPI_SHEET_GID || parseGoogleSheetGid(KPI_SPREADSHEET_INPUT) || '0'
const KPI_SHEET_NAME = process.env.KPI_SHEET_NAME || ''
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly'
const LOOQME_MEDIA_COLOR = '#6678ff'
const LOOQME_SOCIAL_COLOR = '#2dd68f'
const LOOQME_SENTIMENT_COLORS = {
  positive: '#10b981',
  neutral: '#64748b',
  negative: '#ef4444',
}
const LOOQME_COVERAGE_CACHE_TTL_MS = 10 * 60 * 1000
const MAILCHIMP_REPORTS_CACHE_TTL_MS = 10 * 60 * 1000

const FOCUS_TEAMS = ['EB', 'PR', 'Brand Design', 'Operations', 'SMM']

let focusDatabaseId = process.env.NOTION_FOCUS_DB || ''
let focusDatabasePromise = null
const dataSourceCache = new Map()
const dataSourceSchemaCache = new Map()
const looqmeCoverageCache = new Map()
const mailchimpReportsCache = new Map()
let googleTokenCache = null

app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(attachUser)
registerAuthRoutes(app)

function getNotion() {
  if (!process.env.NOTION_TOKEN) {
    throw createHttpError(
      503,
      'NOTION_TOKEN не налаштований. Додайте токен у Railway Variables або локальний .env.',
    )
  }

  return new NotionClient({ auth: process.env.NOTION_TOKEN })
}

function createHttpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}

function getDatabaseId(name, label) {
  const value = process.env[name]

  if (!value) {
    throw createHttpError(
      503,
      `${name} не налаштований. Додайте ID бази ${label} у .env або Railway Variables.`,
    )
  }

  return value
}

function getProperty(properties, names) {
  return names.map((name) => properties[name]).find(Boolean)
}

function propertyText(property) {
  if (!property) return ''

  if (property.type === 'title') {
    return property.title.map((part) => part.plain_text).join('')
  }

  if (property.type === 'rich_text') {
    return property.rich_text.map((part) => part.plain_text).join('')
  }

  if (property.type === 'select') return property.select?.name || ''
  if (property.type === 'multi_select') {
    return property.multi_select.map((item) => item.name).join(', ')
  }
  if (property.type === 'people') {
    return property.people
      .map((person) => person.name || person.person?.email || person.id)
      .join(', ')
  }
  if (property.type === 'number') return property.number ?? ''
  if (property.type === 'date') return property.date?.start || ''
  if (property.type === 'checkbox') return property.checkbox ? 'Так' : 'Ні'
  if (property.type === 'status') return property.status?.name || ''
  if (property.type === 'formula') return formulaValue(property.formula)
  if (property.type === 'rollup') return rollupValue(property.rollup)

  return ''
}

function propertyNumber(property) {
  if (!property) return 0
  if (property.type === 'number') return property.number || 0
  const value = parseMetricNumber(propertyText(property))
  return Number.isNaN(value) ? 0 : value
}

function parseMetricNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value || '').trim()
  if (!text) return 0

  const match = text.match(/-?\d[\d\s\u00a0.,]*(?:[.,]\d+)?/)
  if (!match) return 0

  const normalized = normalizeNumericText(match[0])
  const number = Number(normalized)
  return Number.isNaN(number) ? 0 : number
}

function parsePercentMetricNumber(value) {
  const text = String(value || '').trim()
  const percentMatches = [...text.matchAll(/(-?\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*%/g)]

  if (percentMatches.length) {
    return parseMetricNumber(percentMatches[percentMatches.length - 1][1])
  }

  return parseMetricNumber(value)
}

function normalizeNumericText(value) {
  let text = String(value || '').replace(/[\s\u00a0]/g, '')

  if (text.includes(',') && text.includes('.')) {
    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')
    const decimalSeparator = lastComma > lastDot ? ',' : '.'
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ','

    return text
      .replaceAll(thousandsSeparator, '')
      .replace(decimalSeparator, '.')
  }

  const separator = text.includes(',') ? ',' : text.includes('.') ? '.' : null
  if (!separator) return text

  const parts = text.split(separator)
  const fractional = parts.at(-1) || ''
  const looksLikeThousands =
    parts.length > 2 || (parts.length === 2 && fractional.length === 3 && parts[0].length <= 3)

  return looksLikeThousands ? parts.join('') : text.replace(separator, '.')
}

function propertyDate(property) {
  if (!property) return ''
  if (property.type === 'date') return property.date?.start || ''
  return propertyText(property)
}

function propertyMultiSelect(property) {
  if (!property) return []
  if (property.type === 'multi_select') {
    return property.multi_select.map((item) => item.name)
  }

  const text = propertyText(property)
  return text
    ? text
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

function propertyPeopleOptions(property) {
  if (!property || property.type !== 'people') return []

  return property.people
    .map((person) => ({
      id: person.id,
      label: person.name || person.person?.email || person.id,
    }))
    .filter((person) => person.id && person.label)
}

function propertyCheckbox(property) {
  if (!property) return false
  if (property.type === 'checkbox') return Boolean(property.checkbox)

  return ['так', 'yes', 'done', 'true', 'виконано'].includes(
    String(propertyText(property)).trim().toLowerCase(),
  )
}

function formulaValue(formula) {
  if (formula.type === 'number') return formula.number ?? ''
  if (formula.type === 'string') return formula.string || ''
  if (formula.type === 'boolean') return formula.boolean ? 'Так' : 'Ні'
  if (formula.type === 'date') return formula.date?.start || ''
  return ''
}

function rollupValue(rollup) {
  if (rollup.type === 'number') return rollup.number ?? ''
  if (rollup.type === 'array') return rollup.array.map(propertyText).join(', ')
  return ''
}

function titleProperty(value) {
  return {
    title: [{ type: 'text', text: { content: String(value || '').slice(0, 2000) } }],
  }
}

function richTextProperty(value) {
  const text = String(value || '')
  const chunks = text.match(/[\s\S]{1,1900}/g) || ['']

  return {
    rich_text: chunks.slice(0, 10).map((chunk) => ({
      type: 'text',
      text: { content: chunk },
    })),
  }
}

function selectProperty(value) {
  return value ? { select: { name: String(value) } } : { select: null }
}

function statusProperty(value) {
  return value ? { status: { name: String(value) } } : { status: null }
}

function multiSelectProperty(values) {
  const items = (Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  return { multi_select: items.map((name) => ({ name })) }
}

function checkboxProperty(value) {
  return { checkbox: Boolean(value) }
}

function numberProperty(value) {
  const number = Number(value)
  return { number: Number.isNaN(number) ? 0 : number }
}

function parseJsonProperty(property, fallback = {}) {
  try {
    const text = propertyText(property)
    return text ? JSON.parse(text) : fallback
  } catch {
    return fallback
  }
}

async function queryAllDatabase(databaseId) {
  const notion = getNotion()
  const dataSourceId = await resolveDataSourceId(databaseId)
  const results = []
  let cursor

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      start_cursor: cursor,
      result_type: 'page',
    })
    results.push(...response.results)
    cursor = response.has_more ? response.next_cursor : undefined
  } while (cursor)

  return results
}

async function resolveDataSourceId(databaseId) {
  if (dataSourceCache.has(databaseId)) {
    return dataSourceCache.get(databaseId)
  }

  const notion = getNotion()

  try {
    const database = await notion.databases.retrieve({ database_id: databaseId })
    const dataSourceId = database.data_sources?.[0]?.id || databaseId
    dataSourceCache.set(databaseId, dataSourceId)
    return dataSourceId
  } catch (databaseError) {
    try {
      await notion.dataSources.retrieve({ data_source_id: databaseId })
      dataSourceCache.set(databaseId, databaseId)
      return databaseId
    } catch {
      throw databaseError
    }
  }
}

async function getDataSourceSchema(databaseId) {
  if (dataSourceSchemaCache.has(databaseId)) {
    return dataSourceSchemaCache.get(databaseId)
  }

  const notion = getNotion()
  const dataSourceId = await resolveDataSourceId(databaseId)
  const dataSource = await notion.dataSources.retrieve({
    data_source_id: dataSourceId,
  })
  const schema = dataSource.properties || {}
  dataSourceSchemaCache.set(databaseId, schema)
  return schema
}

async function dataSourceParent(databaseId) {
  return { data_source_id: await resolveDataSourceId(databaseId) }
}

function normalizeGoal(page) {
  const properties = page.properties || {}
  const title = propertyText(
    getProperty(properties, ['Name', 'Ціль', 'Goal', 'Назва', 'Title']),
  )
  const direction = propertyText(
    getProperty(properties, ['Direction', 'Напрямок', 'Team', 'Команда']),
  )
  const targetText = propertyText(
    getProperty(properties, [
      'AnnualTarget',
      'Annual Target',
      'Річна ціль',
      'Ціль 100%',
      'Target',
    ]),
  )
  const target = propertyNumber(
    getProperty(properties, [
      'AnnualTarget',
      'Annual Target',
      'Річна ціль',
      'Ціль 100%',
      'Target',
    ]),
  )
  const explicitMetricType = propertyText(
    getProperty(properties, ['MetricType', 'Metric Type', 'Тип метрики']),
  )
  const monthlyValues = Object.fromEntries(
    Object.entries(MONTH_PROPERTY_NAMES).map(([month, propertyName]) => [
      month,
      propertyText(properties[propertyName]),
    ]),
  )
  const jsonValues = parseJsonProperty(
    getProperty(properties, ['MetricValues', 'Metric Values', 'Значення метрик']),
    {},
  )
  const values = { ...monthlyValues, ...jsonValues }
  const explicitCurrentValue =
    propertyText(getProperty(properties, ['CurrentStatus', 'Current Status'])) ||
    propertyNumber(
      getProperty(properties, [
        'CurrentValue',
        'Current Value',
        'Поточне значення',
        'Current',
      ]),
    )
  const currentValue =
    explicitCurrentValue ||
    (explicitMetricType === 'Накопичувальна'
      ? sumMonthlyValues(values)
      : latestMonthlyValue(values))
  const inferredMetricType = inferMetricType(targetText, currentValue, values)
  const metricType = shouldUseInferredMetricType(
    explicitMetricType,
    targetText,
    inferredMetricType,
  )
    ? inferredMetricType
    : explicitMetricType

  return {
    id: page.id,
    source: 'notion',
    title: title || 'Без назви',
    direction: direction || 'Employer Brand',
    metricType,
    target,
    currentValue,
    criterion: propertyText(
      getProperty(properties, ['QualitativeCriterion', 'Критерій виконання']),
    ),
    measurementPeriod: propertyText(
      getProperty(properties, ['MeasurementPeriod', 'Період заміру']),
    ),
    dataSource: propertyText(getProperty(properties, ['DataSource', 'Джерело даних'])),
    framework: propertyText(getProperty(properties, ['AMEC', 'AMEC Framework'])),
    owner: propertyText(getProperty(properties, ['Owner', 'Власник', 'Менеджер'])),
    values,
  }
}

function inferMetricType(targetText, currentValue, values = {}) {
  const value = String(targetText || '').trim().toLowerCase()
  const samples = [targetText, currentValue, ...Object.values(values)]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (samples.includes('%')) return 'Відсоткова'
  if (
    ['так', 'ні', 'yes', 'no', 'done', 'true', 'false', 'виконано', '✅'].some(
      (token) => samples.includes(token),
    )
  ) {
    return 'Якісна'
  }
  if (!value || value === '-' || value === '—') return 'Якісна'
  return 'Кількісна'
}

function shouldUseInferredMetricType(explicitMetricType, targetText, inferredMetricType) {
  if (!explicitMetricType) return true
  if (explicitMetricType !== 'Кількісна' || inferredMetricType !== 'Якісна') {
    return false
  }

  const target = String(targetText || '').trim()
  return !target || target === '-' || target === '—'
}

function latestMonthlyValue(values) {
  const latest = [...MONTHS]
    .reverse()
    .map((month) => values[month])
    .find(isFilledMetricValue)

  return latest || 0
}

function sumMonthlyValues(values) {
  return MONTHS.reduce(
    (sum, month) =>
      sum + (isFilledMetricValue(values[month]) ? parseMetricNumber(values[month]) : 0),
    0,
  )
}

function buildKpiGoalCalculation({ title, targetText, values, measurementPeriod }) {
  const type = inferKpiCalculationType({ title, targetText, values, measurementPeriod })
  const filledValues = filledMonthlyValues(values)
  const target = parseMetricNumber(targetText)

  if (type === 'averagePercent') {
    const valuesOnly = filledValues.map(({ value }) => parsePercentMetricNumber(value))
    const current = averageMetricValues(valuesOnly)
    const progress = target && current !== null ? clampPercent(Math.round((current / target) * 100)) : null

    return {
      type,
      label: 'Середній %',
      metricType: 'Відсоткова',
      target,
      currentValue: current ?? 0,
      displayCurrentValue: current === null ? 'Немає даних' : `${formatPercentNumber(current)} середнє`,
      displayTarget: target ? `${formatPercentNumber(target)}` : targetText || 'Ціль',
      progress,
      progressLabel: progress === null ? 'Немає даних' : `${progress}%`,
      progressMode: progress === null ? 'none' : 'bar',
      statusLabel: progress === null ? 'Ще немає даних' : progress >= 100 ? 'Виконано' : 'В процесі',
      statusTone: progress === null ? 'muted' : progress >= 100 ? 'success' : 'warning',
      explanation: 'Рахуємо середній відсоток за всі заповнені місяці поточного року.',
    }
  }

  if (type === 'cumulative') {
    const current = sumMonthlyValues(values)
    const progress = target ? clampPercent(Math.round((current / target) * 100)) : null

    return {
      type,
      label: 'Річна сума',
      metricType: 'Накопичувальна',
      target,
      currentValue: current,
      displayCurrentValue: `${formatGoalNumber(current)} за рік`,
      displayTarget: target ? formatGoalNumber(target) : 'Потрібна річна ціль',
      progress,
      progressLabel: progress === null ? 'Без річної цілі' : `${progress}%`,
      progressMode: progress === null ? 'none' : 'bar',
      statusLabel: progress === null ? 'Додайте ціль' : progress >= 100 ? 'Виконано' : 'В процесі',
      statusTone: progress === null ? 'danger' : progress >= 100 ? 'success' : 'warning',
      explanation: 'Сумуємо всі заповнені місяці, а не показуємо останній місяць.',
    }
  }

  if (type === 'monthlyPercent') {
    const valuesOnly = filledValues.map(({ value }) => parsePercentMetricNumber(value))
    const current = valuesOnly.length
      ? Math.round(valuesOnly.reduce((sum, value) => sum + value, 0) / valuesOnly.length)
      : 0
    const progress = target ? clampPercent(Math.round((current / target) * 100)) : null

    return {
      type,
      label: '100% щомісяця',
      metricType: 'Відсоткова',
      target: target || 100,
      currentValue: current,
      displayCurrentValue: valuesOnly.length ? `${current}% середнє` : 'Немає даних',
      displayTarget: `${target || 100}%`,
      progress,
      progressLabel: progress === null ? 'Немає даних' : `${progress}%`,
      progressMode: progress === null ? 'none' : 'bar',
      statusLabel: progress === null ? 'Ще немає даних' : progress >= 100 ? 'Виконано' : 'В процесі',
      statusTone: progress === null ? 'muted' : progress >= 100 ? 'success' : 'warning',
      explanation: 'Рахуємо середнє тільки по заповнених місяцях.',
    }
  }

  if (type === 'snapshot') {
    const latest = latestMonthlyValue(values)
    const latestText = isFilledMetricValue(latest) ? formatPercentLike(latest) : ''

    return {
      type,
      label: 'Річний замір',
      metricType: 'Річний замір',
      target,
      currentValue: latest,
      displayCurrentValue: latestText
        ? `Очікує фінального заміру · останній ${latestText}`
        : 'Очікує фінального заміру',
      displayTarget: targetText || 'Річна ціль',
      progress: null,
      progressLabel: 'Без прогрес-бару',
      progressMode: 'none',
      statusLabel: latestText && target && parsePercentMetricNumber(latest) >= target ? 'Виконано' : 'Очікує заміру',
      statusTone: latestText && target && parsePercentMetricNumber(latest) >= target ? 'success' : 'muted',
      explanation: 'Разовий річний замір не має щомісячного progress-bar.',
    }
  }

  if (type === 'growth') {
    return {
      type,
      label: 'Ріст від старту',
      metricType: 'Ріст від старту',
      target,
      currentValue: latestMonthlyValue(values),
      displayCurrentValue: 'Потрібен baseline',
      displayTarget: targetText || '+20-30%',
      progress: null,
      progressLabel: 'Не рахуємо до сетапу',
      progressMode: 'none',
      statusLabel: 'Потрібен сетап',
      statusTone: 'danger',
      explanation: 'Для росту треба знати стартове значення і правило: % росту або процентні пункти.',
    }
  }

  if (type === 'guardrail') {
    const composite = parseCompositeMonthlyValues(values)
    const clicks = composite.reduce((sum, item) => sum + (item.primary || 0), 0)
    const guardrailValues = composite
      .map((item) => item.guardrail)
      .filter((value) => value !== null)
    const maxGuardrail = guardrailValues.length ? Math.max(...guardrailValues) : null
    const limit = parseCpcLimit(`${title} ${targetText}`)
    const isHealthy = maxGuardrail !== null && limit !== null ? maxGuardrail <= limit : false

    return {
      type,
      label: 'Кількість + ліміт',
      metricType: 'Обмеження',
      target: limit || target,
      currentValue: maxGuardrail ?? latestMonthlyValue(values),
      displayCurrentValue: clicks
        ? `${formatGoalNumber(clicks)} кліків; CPC max ${formatGoalMoney(maxGuardrail)}`
        : formatGoalMoney(maxGuardrail),
      displayTarget: limit ? `CPC ≤ ${formatGoalMoney(limit)}` : targetText || 'Ліміт',
      progress: null,
      progressLabel: 'Без прогрес-бару',
      progressMode: 'none',
      statusLabel: limit ? (isHealthy ? 'В нормі' : 'Поза лімітом') : 'Додайте ліміт',
      statusTone: limit ? (isHealthy ? 'success' : 'danger') : 'danger',
      explanation: 'Кліки сумуються окремо, CPC перевіряється як обмеження.',
    }
  }

  const inferredMetricType = inferMetricType(targetText, latestMonthlyValue(values), values)
  const metricType = inferredMetricType || 'Кількісна'
  const currentValue =
    metricType === 'Накопичувальна' ? sumMonthlyValues(values) : latestMonthlyValue(values)

  return {
    type: 'default',
    label: metricType,
    metricType,
    target,
    currentValue,
    displayCurrentValue: '',
    displayTarget: '',
    progress: null,
    progressLabel: '',
    progressMode: 'bar',
    statusLabel: '',
    statusTone: 'muted',
    explanation: '',
  }
}

function inferKpiCalculationType({ title, targetText, values, measurementPeriod }) {
  const haystack = normalizeCell(`${title} ${targetText} ${measurementPeriod}`)
  const filled = filledMonthlyValues(values)
  const target = parseMetricNumber(targetText)

  if (
    haystack.includes('20 30') ||
    haystack.includes('+20') ||
    haystack.includes('рост') ||
    haystack.includes('ріст')
  ) {
    return 'growth'
  }

  if (
    haystack.includes('dou') ||
    haystack.includes('опитуван') ||
    haystack.includes('раз на рік')
  ) {
    return 'snapshot'
  }

  if (String(targetText || '').includes('%') && target > 0 && target <= 100) {
    const hasOnlyPercentValues = filled.every(({ value }) => String(value).includes('%') || parseMetricNumber(value) <= 100)
    const hasExplicitPercentValues = filled.some(({ value }) => String(value).includes('%'))
    if (target < 100 && haystack.includes('впізнаван')) return 'snapshot'
    if (target < 100 && hasExplicitPercentValues) return 'averagePercent'
    if (target >= 100 && hasOnlyPercentValues) return 'monthlyPercent'
    if (hasOnlyPercentValues) return 'monthlyPercent'
  }

  if (haystack.includes('cpc') || haystack.includes('цпц') || hasCompositeMonthlyValue(values)) {
    return 'guardrail'
  }

  if (target > 1) return 'cumulative'

  return 'default'
}

function filledMonthlyValues(values) {
  return MONTHS.map((month) => ({ month, value: values[month] })).filter(({ value }) =>
    isFilledMetricValue(value),
  )
}

function hasCompositeMonthlyValue(values) {
  return filledMonthlyValues(values).some(({ value }) => /[;|/]/.test(String(value)))
}

function parseCompositeMonthlyValues(values) {
  return filledMonthlyValues(values)
    .map(({ value }) => {
      const numbers = extractMetricNumbers(value)
      return {
        primary: numbers.find((number) => Math.abs(number) >= 1) ?? null,
        guardrail: numbers.find((number) => Math.abs(number) < 1) ?? null,
      }
    })
    .filter((item) => item.primary !== null || item.guardrail !== null)
}

function parseCpcLimit(value) {
  const match = String(value || '').match(/(?:cpc|цпц)[^0-9]*(\d+(?:[.,]\d+)?)/i)
  if (!match) return null

  const parsed = Number(match[1].replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function extractMetricNumbers(value) {
  return [
    ...String(value || '').matchAll(
      /-?\d+(?:[\s\u00a0]?\d{3})*(?:[.,]\d+)?|-?\d+(?:[.,]\d+)?/g,
    ),
  ]
    .map((match) => Number(normalizeNumericText(match[0])))
    .filter((number) => Number.isFinite(number))
}

function averageMetricValues(values) {
  const numbers = values.filter((value) => Number.isFinite(value))
  if (!numbers.length) return null
  const average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return Number(average.toFixed(1))
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value))
}

function formatPercentNumber(value) {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 }).format(value || 0) + '%'
}

function formatPercentLike(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (text.includes('%')) return text
  return `${parsePercentMetricNumber(text)}%`
}

function formatGoalNumber(value) {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(value || 0)
}

function formatGoalMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(Number(value))
}

function isFilledMetricValue(value) {
  const text = String(value ?? '').trim()
  return Boolean(text && text !== '-' && text !== '—' && !text.startsWith('#'))
}

function shouldReadKpiFromGoogleSheet() {
  const source = String(process.env.KPI_SOURCE || '').trim().toLowerCase()
  return source !== 'notion'
}

function parseGoogleSpreadsheetId(value) {
  const text = cleanEnvValue(value)
  return text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || text
}

function parseGoogleSheetGid(value) {
  return cleanEnvValue(value).match(/[?&#]gid=(\d+)/)?.[1] || ''
}

function cleanEnvValue(value) {
  let text = String(value || '').trim()
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1)
  }

  return text
}

async function getGoogleSheetKpiPayload() {
  const rows = await readGoogleSheetRows(KPI_SPREADSHEET_ID, {
    gid: KPI_SHEET_GID,
    sheetName: KPI_SHEET_NAME,
  })
  const goals = normalizeKpiSheetRows(rows)
  const ownerOptions = uniqueOptionNames(goals.map((goal) => goal.owner))

  return { goals, ownerOptions }
}

function normalizeKpiSheetRows(rows) {
  let currentDirection = ''

  return rows
    .slice(1)
    .map((row, index) => {
      const rowNumber = index + 2
      const title = cleanSheetCell(row[1])
      if (!title) return null

      const direction = cleanSheetCell(row[0])
      if (direction) currentDirection = normalizeKpiDirection(direction)

      const values = Object.fromEntries(
        MONTHS.map((month, monthIndex) => [month, cleanSheetCell(row[monthIndex + 2])]),
      )
      const targetText = cleanSheetCell(row[14])
      const calculation = buildKpiGoalCalculation({
        title,
        targetText,
        values,
        measurementPeriod: cleanSheetCell(row[29]),
      })

      return {
        id: `sheet-row-${rowNumber}`,
        sourceRow: rowNumber,
        source: 'google-sheet',
        title,
        direction: currentDirection || 'Employer Brand',
        metricType: calculation.metricType,
        calculationType: calculation.type,
        calculationLabel: calculation.label,
        target: calculation.target,
        currentValue: calculation.currentValue,
        displayCurrentValue: calculation.displayCurrentValue,
        displayTarget: calculation.displayTarget,
        progress: calculation.progress,
        progressLabel: calculation.progressLabel,
        progressMode: calculation.progressMode,
        statusLabel: calculation.statusLabel,
        statusTone: calculation.statusTone,
        explanation: calculation.explanation,
        criterion: calculation.metricType === 'Якісна' ? targetText : '',
        measurementPeriod: cleanSheetCell(row[29]),
        dataSource: cleanSheetCell(row[28]),
        framework: cleanSheetCell(row[30]),
        owner: cleanSheetCell(row[27]),
        values,
      }
    })
    .filter(Boolean)
}

function normalizeKpiDirection(value) {
  const text = cleanSheetCell(value)
  const normalized = normalizeCell(text)

  if (normalized === 'eb' || normalized.includes('employer brand')) return 'Employer Brand'
  if (normalized.includes('smm')) return 'SMM'
  if (normalized === 'pr') return 'PR'
  if (normalized.includes('personal brand')) return 'Personal Brands'
  if (normalized.includes('brand design')) return 'Brand Design'

  return text
}

function cleanSheetCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

async function createGoogleSheetGoal(goal) {
  const sheetTitle = await resolveGoogleSheetTitle(KPI_SPREADSHEET_ID, {
    gid: KPI_SHEET_GID,
    sheetName: KPI_SHEET_NAME,
  })
  const row = Array(31).fill('')
  row[0] = goal.direction || ''
  row[1] = goal.title || ''
  row[14] = goal.metricType === 'Якісна' ? goal.criterion || '' : goal.target || ''
  row[27] = goal.owner || ''
  row[28] = goal.dataSource || ''
  row[29] = goal.measurementPeriod || ''
  row[30] = goal.framework || ''

  const range = `${quoteSheetName(sheetTitle)}!A:AE`
  const response = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${KPI_SPREADSHEET_ID}/values/${encodeURIComponent(
      range,
    )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    },
  )

  if (!response.ok) {
    throw createHttpError(502, 'Не вдалося створити KPI у Google Sheet.', await response.text())
  }

  return response.json()
}

async function updateGoogleSheetGoalValue(goalId, { month, value }) {
  const rowNumber = parseGoogleSheetGoalRow(goalId)
  const monthIndex = MONTHS.indexOf(month)

  if (!rowNumber || monthIndex === -1) {
    throw createHttpError(400, 'Не вдалося визначити рядок або місяць для оновлення KPI.')
  }

  const sheetTitle = await resolveGoogleSheetTitle(KPI_SPREADSHEET_ID, {
    gid: KPI_SHEET_GID,
    sheetName: KPI_SHEET_NAME,
  })
  const column = columnLetter(monthIndex + 3)
  const range = `${quoteSheetName(sheetTitle)}!${column}${rowNumber}`
  const response = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${KPI_SPREADSHEET_ID}/values/${encodeURIComponent(
      range,
    )}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values: [[value]],
      }),
    },
  )

  if (!response.ok) {
    throw createHttpError(502, 'Не вдалося оновити KPI у Google Sheet.', await response.text())
  }

  await response.json()
  const { goals } = await getGoogleSheetKpiPayload()
  return goals.find((goal) => goal.id === goalId) || null
}

function parseGoogleSheetGoalRow(goalId) {
  const match = String(goalId || '').match(/^sheet-row-(\d+)$/)
  return match ? Number(match[1]) : null
}

function columnLetter(columnNumber) {
  let number = columnNumber
  let letter = ''

  while (number > 0) {
    const remainder = (number - 1) % 26
    letter = String.fromCharCode(65 + remainder) + letter
    number = Math.floor((number - 1) / 26)
  }

  return letter
}

async function readGoogleSheetRows(spreadsheetId, { gid, sheetName } = {}) {
  if (hasGoogleServiceAccountCredentials()) {
    try {
      const title = await resolveGoogleSheetTitle(spreadsheetId, { gid, sheetName })
      const range = `${quoteSheetName(title)}!A:AE`
      const response = await googleSheetsFetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          range,
        )}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      )

      if (!response.ok) {
        throw createHttpError(502, 'Не вдалося прочитати KPI з Google Sheets API.', await response.text())
      }

      const payload = await response.json()
      return payload.values || []
    } catch (error) {
      if (!gid) throw error
    }

    try {
      return await fetchAuthenticatedGoogleSheetCsvByGid(spreadsheetId, gid)
    } catch {
      // Fall through to the public CSV export below. This covers sheets that are
      // intentionally published/viewable by link and XLSX files opened in Sheets.
    }
  }

  return fetchPublicGoogleSheetCsvByGid(spreadsheetId, gid)
}

async function resolveGoogleSheetTitle(spreadsheetId, { gid, sheetName } = {}) {
  if (sheetName) return sheetName

  if (!hasGoogleServiceAccountCredentials()) return String(gid || '0')

  const response = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`,
  )

  if (!response.ok) {
    throw createHttpError(502, 'Не вдалося прочитати metadata Google Sheet.', await response.text())
  }

  const payload = await response.json()
  const selected =
    payload.sheets?.find((sheet) => String(sheet.properties?.sheetId) === String(gid || '0')) ||
    payload.sheets?.[0]

  if (!selected?.properties?.title) {
    throw createHttpError(404, 'Не знайшов аркуш KPI у Google Sheet.')
  }

  return selected.properties.title
}

async function fetchPublicGoogleSheetCsvByGid(spreadsheetId, gid = '0') {
  const urls = [
    googleSheetCsvExportUrl(spreadsheetId, gid, true),
    googleSheetCsvExportUrl(spreadsheetId, gid, false),
  ]

  for (const url of urls) {
    const response = await fetch(url)
    const body = await response.text()

    if (response.ok && !body.trimStart().startsWith('<!DOCTYPE html>')) {
      return parseCsvRows(body)
    }
  }

  throw createHttpError(
    502,
    'Не вдалося прочитати KPI Google Sheet. Перевірте доступ для service account або public view.',
  )
}

async function fetchAuthenticatedGoogleSheetCsvByGid(spreadsheetId, gid = '0') {
  const response = await googleSheetsFetch(googleSheetCsvExportUrl(spreadsheetId, gid, true), {
    headers: { Accept: 'text/csv' },
  })
  const body = await response.text()

  if (!response.ok || body.trimStart().startsWith('<!DOCTYPE html>')) {
    throw createHttpError(
      502,
      'Не вдалося прочитати authenticated KPI CSV export з Google Sheet.',
      body.slice(0, 500),
    )
  }

  return parseCsvRows(body)
}

function googleSheetCsvExportUrl(spreadsheetId, gid, useExportEndpoint) {
  if (useExportEndpoint) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${encodeURIComponent(
      gid || '0',
    )}`
  }

  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
    gid || '0',
  )}`
}

function hasGoogleServiceAccountCredentials() {
  return Boolean(getGoogleServiceAccountCredentials())
}

function getGoogleServiceAccountCredentials() {
  const rawJson =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_CREDENTIALS_JSON || ''

  if (rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson)
      if (parsed.client_email && parsed.private_key) {
        return {
          email: parsed.client_email,
          privateKey: parsed.private_key,
        }
      }
    } catch {
      return null
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)

  return email && privateKey ? { email, privateKey } : null
}

function normalizePrivateKey(value) {
  let key = String(value || '').trim()
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1)
  }

  return key.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()
}

async function googleSheetsFetch(url, options = {}) {
  const accessToken = await getGoogleAccessToken()
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function getGoogleAccessToken() {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now() + 60_000) {
    return googleTokenCache.accessToken
  }

  const credentials = getGoogleServiceAccountCredentials()
  if (!credentials) {
    throw createHttpError(503, 'Не налаштований Google service account для KPI Google Sheet.')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlJson({ alg: 'RS256', typ: 'JWT' })
  const payload = base64UrlJson({
    iss: credentials.email,
    scope: GOOGLE_SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  })
  const unsignedJwt = `${header}.${payload}`
  const signature = createSign('RSA-SHA256')
    .update(unsignedJwt)
    .sign(credentials.privateKey)
    .toString('base64url')
  const assertion = `${unsignedJwt}.${signature}`

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    throw createHttpError(502, 'Google OAuth token error.', await response.text())
  }

  const token = await response.json()
  googleTokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
  }

  return googleTokenCache.accessToken
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function quoteSheetName(title) {
  return `'${String(title).replaceAll("'", "''")}'`
}

function normalizeFocus(page) {
  const properties = page.properties || {}
  const rawMetric = propertyText(
    getProperty(properties, ['Metric', 'Метрика успіху', 'Criteria', 'Критерій']),
  )
  const metricMatch = rawMetric.match(/^\[(.+?)]\s*(.*)$/)
  const months = propertyMultiSelect(getProperty(properties, ['Month', 'Місяць']))
  const fallbackMonth = propertyText(getProperty(properties, ['Month', 'Місяць']))
  const ownerProperty = getProperty(properties, [
    'Owner',
    'Власник',
    'Менеджер',
    'Person',
    'Відповідальний',
  ])
  const ownerPeople = propertyPeopleOptions(ownerProperty)
  const team = propertyText(
    getProperty(properties, ['Team', 'Direction', 'Напрямок', 'Команда']),
  )
  const title =
    propertyText(getProperty(properties, ['Name', 'Назва', 'Title'])) ||
    `${fallbackMonth || months[0] || 'Місяць'} · ${team || 'Команда'}`
  const rawStatus = propertyText(getProperty(properties, ['Status', 'Статус']))
  const achievedFallback = propertyCheckbox(
    getProperty(properties, ['Goal achieved', 'Виконано', 'Achieved', 'Done?']),
  )
  const status = normalizeFocusStatus(rawStatus, achievedFallback)
  const achieved = status === 'Виконано'
  const comment = propertyText(
    getProperty(properties, ['Comment', 'Коментар', 'Notes', 'Нотатки']),
  )

  return {
    id: page.id,
    title,
    name: title,
    month: months[0] || fallbackMonth,
    months: months.length ? months : fallbackMonth ? [fallbackMonth] : [],
    team,
    direction: team,
    owner: propertyText(ownerProperty),
    ownerId: ownerPeople[0]?.id || '',
    ownerIds: ownerPeople.map((person) => person.id),
    metricType:
      propertyText(getProperty(properties, ['MetricType', 'Тип метрики'])) ||
      metricMatch?.[1] ||
      '',
    metric: metricMatch?.[2] || rawMetric,
    status,
    achieved,
    comment,
    person: propertyText(getProperty(properties, ['Person', 'Відповідальний'])),
    done: propertyText(getProperty(properties, ['Done', 'Що виконано'])),
    notDone: propertyText(getProperty(properties, ['NotDone', 'Що НЕ виконано'])),
    pains: propertyText(getProperty(properties, ['Pains', 'Болі'])),
    nextPriorities: propertyText(
      getProperty(properties, ['NextPriorities', 'Пріоритети']),
    ),
    linkedGoalIds: parseJsonProperty(getProperty(properties, ['LinkedGoals']), []),
    metricValues: parseJsonProperty(getProperty(properties, ['MetricValues']), {}),
  }
}

function normalizeFocusStatus(status, achievedFallback = false) {
  const text = String(status || '').trim().toLowerCase()

  if (!text) return achievedFallback ? 'Виконано' : 'Не виконано'

  if (
    ['не виконано', 'невиконано', 'not done', 'not completed', 'no', 'ні'].some(
      (token) => text.includes(token),
    )
  ) {
    return 'Не виконано'
  }

  return ['виконано', 'done', 'completed', 'complete', 'yes', 'так', 'true'].some(
    (token) => text.includes(token),
  )
    ? 'Виконано'
    : 'Не виконано'
}

function normalizeActivityEvent(page) {
  const properties = page.properties || {}
  const rawDate = propertyDate(
    getProperty(properties, ['Event date', 'Event Date', 'Date', 'Дата', 'Таймінг']),
  )
  const date = rawDate ? new Date(rawDate) : null
  const type = propertyText(
    getProperty(properties, ['EB Activity Type', 'Type', 'Тип', 'Тип івенту ']),
  )

  return {
    id: page.id,
    title:
      propertyText(
        getProperty(properties, [
          'Name',
          'Назва',
          'Назва події ',
          'Event',
          'Title',
        ]),
      ) ||
      'Без назви',
    type,
    date:
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : rawDate,
    rawDate,
    role:
      propertyText(getProperty(properties, ['EB Role', 'Role', 'Роль', 'Хто ми тут?'])) ||
      'Visitor',
    goal: propertyText(getProperty(properties, ['EB Goal', 'Goal', 'Ціль', 'Ціль '])),
    contacts: propertyNumber(
      getProperty(properties, [
        'Lead count',
        'Contacts',
        'Кількість контактів',
        'Contact count',
        'Контакти',
        'Кількість рекрутерів',
      ]),
    ),
    audience: propertyText(
      getProperty(properties, ['EB Audience', 'Audience', 'Аудиторія', 'Цільова аудиторія']),
    ),
    location: propertyText(getProperty(properties, ['EB Location', 'Location'])),
    owner: propertyText(getProperty(properties, ['Owner', 'Власник'])),
    status: propertyText(getProperty(properties, ['Status', 'Статус'])),
    recruiterCount: propertyText(
      getProperty(properties, ['Рекрутер (кількість)', 'Кількість рекрутерів']),
    ),
    applyCount: propertyNumber(getProperty(properties, ['Apply count'])),
    selectCount: propertyNumber(getProperty(properties, ['Select count'])),
    hireCount: propertyNumber(getProperty(properties, ['Hire count'])),
    metricsEnabled: propertyCheckbox(getProperty(properties, ['Метрики'])),
    source: 'activities',
    url: page.url,
  }
}

function normalizeCalendarEvent(page) {
  const properties = page.properties || {}
  const rawDate = propertyDate(
    getProperty(properties, ['Таймінг', 'Date', 'Дата', 'Event Date']),
  )
  const date = rawDate ? new Date(rawDate) : null

  return {
    id: page.id,
    title:
      propertyText(
        getProperty(properties, [
          'Назва події ',
          'Назва події',
          'Name',
          'Назва',
          'Event',
          'Title',
        ]),
      ) || 'Без назви',
    type: propertyText(
      getProperty(properties, ['Тип івенту ', 'Тип івенту', 'Type', 'Тип']),
    ),
    date:
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : rawDate,
    rawDate,
    role: propertyText(getProperty(properties, ['Хто ми тут?', 'Role', 'Роль'])),
    goal: propertyText(getProperty(properties, ['Ціль ', 'Ціль', 'Goal'])),
    contacts: 0,
    recruiterCount: propertyText(
      getProperty(properties, ['Кількість рекрутерів', 'Рекрутер (кількість)']),
    ),
    audience: propertyText(
      getProperty(properties, ['Цільова аудиторія', 'Audience', 'Аудиторія']),
    ),
    location: propertyText(getProperty(properties, ['Локація', 'Location'])),
    status: propertyText(getProperty(properties, ['Статус', 'Status'])),
    source: 'calendar',
    url: page.url,
  }
}

function eventMatchesMonth(event, monthLabel) {
  const index = MONTHS.indexOf(monthLabel)
  if (index < 0 || !event.rawDate) return false

  const date = new Date(event.rawDate)
  if (Number.isNaN(date.getTime())) return false

  return date.getFullYear() === 2026 && date.getMonth() === index
}

function mergeCalendarEventsWithActivities(calendarEvents, activityEvents) {
  const matchedActivityIds = new Set()

  const mergedCalendarEvents = calendarEvents.map((event) => {
    const activity = findMatchingActivity(
      event,
      activityEvents.filter((candidate) => !matchedActivityIds.has(candidate.id)),
    )

    if (!activity) {
      return {
        ...event,
        role: event.role || 'Visitor',
        metricsMatched: false,
      }
    }

    matchedActivityIds.add(activity.id)

    return {
      ...event,
      role: activity.role || event.role || 'Visitor',
      goal: activity.goal || event.goal,
      contacts: activity.contacts || 0,
      audience: activity.audience || event.audience,
      location: activity.location || event.location,
      applyCount: activity.applyCount || 0,
      selectCount: activity.selectCount || 0,
      hireCount: activity.hireCount || 0,
      metricsEnabled: activity.metricsEnabled,
      metricsMatched: true,
      metricsSourceId: activity.id,
      metricsSourceTitle: activity.title,
      metricsSourceUrl: activity.url,
    }
  })

  const activityOnlyEvents = activityEvents
    .filter((activity) => !matchedActivityIds.has(activity.id))
    .filter(isActivityEventLike)
    .map((activity) => ({
      ...activity,
      role: activity.role || 'Visitor',
      metricsMatched: true,
      metricsSourceId: activity.id,
      metricsSourceTitle: activity.title,
      metricsSourceUrl: activity.url,
    }))

  return [...mergedCalendarEvents, ...activityOnlyEvents]
}

function isActivityEventLike(activity) {
  const haystack = normalizeCell(
    [
      activity.title,
      activity.type,
      activity.goal,
      activity.audience,
      activity.location,
    ].join(' '),
  )

  return Boolean(
    /event|ivent|івент|ивент|конферен|conference|мітап|митап|meetup|webinar|вебінар|вебинар|хакатон|hackathon|ярмарк|fair|career|expo|open day|campus|університет|университет/.test(
      haystack,
    ) ||
      Number(activity.contacts || 0) ||
      Number(activity.applyCount || 0) ||
      Number(activity.selectCount || 0) ||
      Number(activity.hireCount || 0),
  )
}

function findMatchingActivity(calendarEvent, activityEvents) {
  const sameDateActivities = activityEvents.filter(
    (activity) => activity.rawDate && activity.rawDate === calendarEvent.rawDate,
  )

  if (!sameDateActivities.length) return null

  const scored = sameDateActivities
    .map((activity) => ({
      activity,
      score: titleSimilarity(calendarEvent.title, activity.title),
    }))
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best) return null

  if (sameDateActivities.length === 1 && best.score >= 0.2) return best.activity
  return best.score >= 0.35 ? best.activity : null
}

function titleSimilarity(left, right) {
  const leftTokens = normalizedTitleTokens(left)
  const rightTokens = normalizedTitleTokens(right)

  if (!leftTokens.length || !rightTokens.length) return 0

  const rightSet = new Set(rightTokens)
  const common = leftTokens.filter((token) => rightSet.has(token)).length
  return common / Math.min(leftTokens.length, rightTokens.length)
}

function normalizedTitleTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\beb[:\s-]*/g, ' ')
    .replace(/\bcareer\b|\bbeahead\b|\bexpo\b/g, ' ')
    .replace(/кпі/g, 'kpi')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

async function fetchPublicGoogleSheetCsv(spreadsheetId, sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
    sheetName,
  )}`
  const response = await fetch(url)
  const body = await response.text()

  if (!response.ok || body.trimStart().startsWith('<!DOCTYPE html>')) {
    throw createHttpError(
      502,
      `Не вдалося прочитати аркуш ${sheetName} з Google Sheets.`,
    )
  }

  return parseCsvRows(body)
}

function parseEventAwarenessAudience(sheetName, rows) {
  if (sheetName === 'Middle+') return parseMiddleEventAwareness(rows)
  return parseStudentsEventAwareness(rows)
}

function parseStudentsEventAwareness(rows) {
  const header = rows[0] || []
  const dateIndex = findCsvColumn(header, 'дата')
  const nameIndex = findCsvColumn(header, 'назва')
  const knownIndex = findCsvColumn(header, 'чули про universe')
  const unknownIndex = findCsvColumn(header, 'не чули про universe')

  const totals = rows.slice(1).reduce(
    (acc, row) => {
      if (!normalizeCell(row[dateIndex]) && !normalizeCell(row[nameIndex])) {
        return acc
      }

      const known = parseSheetNumber(row[knownIndex])
      const unknown = parseSheetNumber(row[unknownIndex])

      if (known === null || unknown === null) return acc

      acc.known += known
      acc.unknown += unknown
      acc.eventsCount += 1
      return acc
    },
    { known: 0, unknown: 0, eventsCount: 0 },
  )
  const total = totals.known + totals.unknown

  return {
    key: 'students',
    label: 'Students',
    awareness: total ? totals.known / total : null,
    known: totals.known,
    unknown: totals.unknown,
    total,
    eventsCount: totals.eventsCount,
  }
}

function parseMiddleEventAwareness(rows) {
  const header = rows[0] || []
  const dateIndex = findCsvColumn(header, 'дата')
  const nameIndex = findCsvColumn(header, 'назва')
  const strongIndex = findCsvColumn(header, 'так добре знайомий')
  const familiarIndex = findCsvColumn(header, 'щось чув')
  const unknownIndex = findCsvColumn(header, 'чую вперше')

  const totals = rows.slice(1).reduce(
    (acc, row) => {
      if (!normalizeCell(row[dateIndex]) && !normalizeCell(row[nameIndex])) {
        return acc
      }

      const strong = parseSheetNumber(row[strongIndex])
      const familiar = parseSheetNumber(row[familiarIndex])
      const unknown = parseSheetNumber(row[unknownIndex])

      if (strong === null || familiar === null || unknown === null) return acc

      acc.known += strong + familiar
      acc.unknown += unknown
      acc.eventsCount += 1
      return acc
    },
    { known: 0, unknown: 0, eventsCount: 0 },
  )
  const total = totals.known + totals.unknown

  return {
    key: 'middle',
    label: 'Middle+',
    awareness: total ? totals.known / total : null,
    known: totals.known,
    unknown: totals.unknown,
    total,
    eventsCount: totals.eventsCount,
  }
}

function findCsvColumn(row, needle) {
  const normalizedNeedle = normalizeCell(needle)
  return row.findIndex((cell) => normalizeCell(cell).includes(normalizedNeedle))
}

function parseSheetNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null

  const normalized = String(value || '')
    .replace('%', '')
    .replace(',', '.')
    .replace(/\s/g, '')
    .trim()
  if (!normalized) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeCell(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[(),.:"'’`«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseCsvRows(csv) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const nextChar = csv[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      continue
    }

    cell += char
  }

  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }

  return rows.filter((cells) => cells.some((value) => String(value).trim()))
}

function monthTagMatches(value, selectedMonth) {
  return (
    String(value || '').trim().toLowerCase() ===
    String(selectedMonth || '').trim().toLowerCase()
  )
}

function findSchemaProperty(schema, names) {
  return names
    .map((name) => [name, schema[name]])
    .find(([, property]) => Boolean(property))
}

function schemaOptionNames(schema, names) {
  const [, property] = findSchemaProperty(schema, names) || []
  if (!property) return []

  return propertyOptionNames(property)
}

function propertyOptionNames(property) {
  if (property.type === 'select') {
    return property.select?.options?.map((option) => option.name) || []
  }

  if (property.type === 'multi_select') {
    return property.multi_select?.options?.map((option) => option.name) || []
  }

  if (property.type === 'status') {
    return property.status?.options?.map((option) => option.name) || []
  }

  return []
}

function schemaStatusOptionName(schema, names, status) {
  const [, property] = findSchemaProperty(schema, names) || []
  return statusOptionName(property, status)
}

function statusOptionName(property, status) {
  return (
    propertyOptionNames(property).find(
      (option) => normalizeFocusStatus(option) === status,
    ) || status
  )
}

function uniqueOptionNames(values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  )
}

function uniqueOwnerOptions(values) {
  const seen = new Set()

  return values
    .flatMap((value) => {
      if (!value) return []

      if (typeof value === 'object') {
        const label = String(value.label || value.name || '').trim()
        const id = String(value.id || value.value || '').trim()
        return label ? [{ id, label, value: id || label }] : []
      }

      return String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .map((label) => ({ id: '', label, value: label }))
    })
    .filter((option) => {
      const key = option.value || option.label
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function addTitleProperty(properties, schema, names, value) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  properties[name] =
    property.type === 'title' ? titleProperty(value) : richTextProperty(value)
}

function addTextProperty(properties, schema, names, value) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  if (property.type === 'title') {
    properties[name] = titleProperty(value)
  } else if (property.type === 'select') {
    properties[name] = selectProperty(value)
  } else if (property.type === 'multi_select') {
    properties[name] = multiSelectProperty(value)
  } else if (property.type === 'status') {
    properties[name] = statusProperty(value)
  } else if (property.type === 'number') {
    properties[name] = numberProperty(value)
  } else if (property.type === 'people') {
    return
  } else {
    properties[name] = richTextProperty(value)
  }
}

function addSelectProperty(properties, schema, names, value) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  if (property.type === 'multi_select') {
    properties[name] = multiSelectProperty(value)
  } else if (property.type === 'select') {
    properties[name] = selectProperty(Array.isArray(value) ? value[0] : value)
  } else if (property.type === 'status') {
    properties[name] = statusProperty(Array.isArray(value) ? value[0] : value)
  } else if (property.type === 'people') {
    return
  } else {
    properties[name] = richTextProperty(
      Array.isArray(value) ? value.join(', ') : value,
    )
  }
}

function addCheckboxProperty(properties, schema, names, value) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  if (property.type === 'checkbox') {
    properties[name] = checkboxProperty(value)
  } else if (property.type === 'select') {
    const status = value ? 'Виконано' : 'Не виконано'
    properties[name] = selectProperty(statusOptionName(property, status))
  } else if (property.type === 'status') {
    const status = value ? 'Виконано' : 'Не виконано'
    properties[name] = statusProperty(statusOptionName(property, status))
  } else {
    properties[name] = richTextProperty(value ? 'Так' : 'Ні')
  }
}

function addOwnerProperty(properties, schema, names, owner, ownerId) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  const ownerIds = Array.isArray(ownerId)
    ? ownerId
    : String(ownerId || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)

  if (property.type === 'people') {
    if (ownerIds.length) {
      properties[name] = { people: ownerIds.map((id) => ({ id })) }
    }
    return
  }

  addTextProperty(properties, schema, [name], owner)
}

function buildGoalProperties(schema, goal) {
  const properties = {}
  const targetValue = goal.metricType === 'Якісна' ? goal.criterion : goal.target

  addTitleProperty(properties, schema, ['Ціль', 'Name', 'Goal', 'Назва', 'Title'], goal.title)
  addSelectProperty(
    properties,
    schema,
    ['Напрямок', 'Direction', 'Team', 'Команда'],
    goal.direction,
  )
  addTextProperty(
    properties,
    schema,
    ['MetricType', 'Metric Type', 'Тип метрики'],
    goal.metricType,
  )
  addTextProperty(
    properties,
    schema,
    ['Річна ціль', 'AnnualTarget', 'Annual Target', 'Ціль 100%', 'Target'],
    targetValue,
  )
  addSelectProperty(
    properties,
    schema,
    ['Період заміру', 'MeasurementPeriod', 'Measurement Period'],
    goal.measurementPeriod,
  )
  addTextProperty(
    properties,
    schema,
    ['Джерело даних', 'DataSource', 'Data Source'],
    goal.dataSource,
  )
  addSelectProperty(properties, schema, ['AMEC Framework', 'AMEC'], goal.framework)
  addTextProperty(properties, schema, ['Owner', 'Власник', 'Менеджер'], goal.owner)

  return properties
}

async function getFocusDatabaseId() {
  if (focusDatabaseId) {
    try {
      await resolveDataSourceId(focusDatabaseId)
      return focusDatabaseId
    } catch (error) {
      if (!process.env.NOTION_PARENT_PAGE_ID) throw error
    }
  }

  if (!focusDatabasePromise) {
    focusDatabasePromise = createFocusDatabase()
  }

  focusDatabaseId = await focusDatabasePromise
  return focusDatabaseId
}

async function createFocusDatabase() {
  const notion = getNotion()
  const parent = process.env.NOTION_PARENT_PAGE_ID
    ? { type: 'page_id', page_id: process.env.NOTION_PARENT_PAGE_ID }
    : { type: 'workspace', workspace: true }
  const database = await notion.databases.create({
    parent,
    title: [{ type: 'text', text: { content: 'Comms Tool Monthly Focus' } }],
    initial_data_source: {
      properties: {
        Name: { title: {} },
        Month: {
          multi_select: { options: MONTHS.map((name) => ({ name, color: 'blue' })) },
        },
        Team: {
          select: { options: FOCUS_TEAMS.map((name) => ({ name, color: 'gray' })) },
        },
        Owner: { select: { options: [] } },
        Metric: { rich_text: {} },
        Status: {
          select: {
            options: [
              { name: 'Не виконано', color: 'gray' },
              { name: 'Виконано', color: 'green' },
            ],
          },
        },
        'Goal achieved': { checkbox: {} },
        Comment: { rich_text: {} },
        Done: { rich_text: {} },
        NotDone: { rich_text: {} },
        Pains: { rich_text: {} },
        NextPriorities: { rich_text: {} },
        LinkedGoals: { rich_text: {} },
        MetricValues: { rich_text: {} },
        CreatedAt: { created_time: {} },
      },
    },
  })

  console.log(`Created Monthly Focus database: ${database.id}`)
  return database.id
}

async function getExternalKpiPayload() {
  if (shouldReadKpiFromGoogleSheet()) {
    return getGoogleSheetKpiPayload()
  }

  const databaseId = getDatabaseId('NOTION_KPI_DB', 'KPI цілей')
  const [pages, schema] = await Promise.all([
    queryAllDatabase(databaseId),
    getDataSourceSchema(databaseId),
  ])
  const goals = pages.map(normalizeGoal)
  const ownerOptions = uniqueOptionNames([
    ...schemaOptionNames(schema, ['Owner', 'Власник', 'Менеджер']),
    ...goals.map((goal) => goal.owner),
  ])

  return { goals, ownerOptions }
}

async function getMergedKpiPayload() {
  const payload = await getExternalKpiPayload()
  if (!isDatabaseConfigured()) return payload

  const storedGoals = await listStoredKpiGoals()
  return mergeStoredKpiGoals(payload, storedGoals)
}

function mergeStoredKpiGoals(payload, storedGoals) {
  const goals = [...(payload.goals || [])]
  const ownerOptions = [...(payload.ownerOptions || [])]
  const indexByExternalKey = new Map(
    goals.map((goal, index) => [`${legacyKpiSource(goal)}:${goal.id}`, index]),
  )

  storedGoals.forEach((storedGoal) => {
    const normalized = normalizeStoredKpiGoal(storedGoal)
    const externalKey =
      storedGoal.externalSource && storedGoal.externalId
        ? `${storedGoal.externalSource}:${storedGoal.externalId}`
        : ''

    if (externalKey && indexByExternalKey.has(externalKey)) {
      goals[indexByExternalKey.get(externalKey)] = normalized
    } else {
      goals.push(normalized)
    }

    ownerOptions.push(normalized.owner)
  })

  return { goals, ownerOptions: uniqueOptionNames(ownerOptions) }
}

function normalizeStoredKpiGoal(goal) {
  const targetText = goal.targetText || goal.criterion || goal.target || ''
  const calculation = buildKpiGoalCalculation({
    title: goal.title,
    targetText,
    values: goal.values || {},
    measurementPeriod: goal.measurementPeriod,
  })

  return {
    ...goal,
    source: goal.source || 'app',
    metricType: goal.metricType || calculation.metricType,
    calculationType: goal.calculationType || calculation.type,
    calculationLabel: goal.calculationLabel || calculation.label,
    target: calculation.target || goal.target || 0,
    currentValue: calculation.currentValue,
    displayCurrentValue: calculation.displayCurrentValue,
    displayTarget: calculation.displayTarget,
    progress: calculation.progress,
    progressLabel: calculation.progressLabel,
    progressMode: calculation.progressMode,
    statusLabel: calculation.statusLabel,
    statusTone: calculation.statusTone,
    explanation: calculation.explanation,
    values: goal.values || {},
  }
}

function legacyKpiSource(goal = {}) {
  return goal.source || (shouldReadKpiFromGoogleSheet() ? 'google-sheet' : 'notion')
}

async function getMergedMonthlyFocusPayload(month) {
  const externalPayload = await getExternalMonthlyFocusPayload(month)
  if (!isDatabaseConfigured()) return externalPayload

  const storedEntries = await listStoredMonthlyFocusEntries()
  const entries = mergeStoredMonthlyFocusEntries(externalPayload.entries, storedEntries, month)
  const ownerOptions = uniqueOwnerOptions([
    ...(externalPayload.ownerOptions || []),
    ...entries.map((entry) => entry.owner),
  ])

  return {
    ...externalPayload,
    entries,
    ownerOptions,
  }
}

async function getExternalMonthlyFocusPayload(month) {
  const databaseId = await getFocusDatabaseId()
  const [pages, schema] = await Promise.all([
    queryAllDatabase(databaseId),
    getDataSourceSchema(databaseId),
  ])
  const entries = pages
    .map(normalizeFocus)
    .filter((entry) => {
      return month
        ? entry.months.some((item) => monthTagMatches(item, month)) ||
            monthTagMatches(entry.month, month)
        : true
    })
    .map((entry) => (month ? { ...entry, month } : entry))
  const ownerOptions = uniqueOwnerOptions([
    ...schemaOptionNames(schema, ['Owner', 'Власник', 'Менеджер']),
    ...pages.flatMap((page) =>
      propertyPeopleOptions(
        getProperty(page.properties || {}, [
          'Owner',
          'Власник',
          'Менеджер',
          'Person',
          'Відповідальний',
        ]),
      ),
    ),
    ...pages.map((page) =>
      propertyText(
        getProperty(page.properties || {}, [
          'Owner',
          'Власник',
          'Менеджер',
          'Person',
          'Відповідальний',
        ]),
      ),
    ),
  ])

  return { entries, ownerOptions, focusDatabaseId: databaseId }
}

function mergeStoredMonthlyFocusEntries(externalEntries = [], storedEntries = [], month) {
  const entries = [...externalEntries]
  const indexByExternalId = new Map(
    entries.map((entry, index) => [`notion:${entry.id}`, index]),
  )

  storedEntries.forEach((entry) => {
    const normalized = month ? { ...entry, month } : entry
    const matchesMonth = month
      ? normalized.months.some((item) => monthTagMatches(item, month)) ||
        monthTagMatches(normalized.month, month)
      : true

    if (!matchesMonth) return

    const externalKey =
      normalized.externalSource && normalized.externalId
        ? `${normalized.externalSource}:${normalized.externalId}`
        : ''

    if (externalKey && indexByExternalId.has(externalKey)) {
      entries[indexByExternalId.get(externalKey)] = normalized
    } else {
      entries.push(normalized)
    }
  })

  return entries
}

async function getManualCompetitorMentions(month) {
  if (!isDatabaseConfigured()) return []

  try {
    return await listCompetitorCoverage(month)
  } catch (error) {
    console.warn(
      'Failed to read manual competitor coverage',
      error.message || error.code || error.name,
    )
    return []
  }
}

async function applyManualCompetitors(coverage, month) {
  const competitors = await getManualCompetitorMentions(month)
  if (!competitors.length) return coverage

  const competitorReach = competitors.reduce((sum, item) => sum + Number(item.reach || 0), 0)

  return {
    ...coverage,
    source:
      coverage.source === 'mock'
        ? 'mock+manual-competitors'
        : `${coverage.source || 'coverage'}+manual-competitors`,
    mentions: [...(coverage.mentions || []), ...competitors],
    audienceMetric: coverage.audienceMetric
      ? {
          ...coverage.audienceMetric,
          value: Number(coverage.audienceMetric.value || 0) + competitorReach,
        }
    : coverage.audienceMetric,
  }
}

function shouldUseLooqmeMock() {
  return ['1', 'true', 'yes'].includes(
    String(process.env.LOOQME_USE_MOCK || '').trim().toLowerCase(),
  )
}

async function fetchLooqmeCoverage(month) {
  const config = getLooqmeConfig()

  if (!config.token) {
    return emptyLooqmeCoveragePayload(month, 'looqme-missing-token')
  }

  if (!config.url) {
    return emptyLooqmeCoveragePayload(month, 'looqme-missing-url')
  }

  const { range, url } = buildLooqmeRequestUrl(config, month)
  const cacheKey = looqmeCoverageCacheKey(config, month, url)
  const cachedCoverage = readLooqmeCoverageCache(cacheKey)
  if (cachedCoverage) return cachedCoverage

  const response = await fetch(url, {
    method: config.method,
    headers: buildLooqmeHeaders(config),
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const body = await response.text()

  if (!response.ok) {
    throw createHttpError(
      502,
      'Looqme API не повернув дані coverage.',
      sanitizeExternalError(body),
    )
  }

  const payload = parseLooqmeResponseBody(body, response.headers.get('content-type'))
  const fullPayload = await fetchRemainingLooqmePages(payload, config)
  const coverage = normalizeLooqmeCoveragePayload(fullPayload, month, range)
  writeLooqmeCoverageCache(cacheKey, coverage)
  return coverage
}

function looqmeCoverageCacheKey(config, month, url) {
  const cacheUrl = new URL(url.toString())
  if (config.tokenQueryParam) cacheUrl.searchParams.delete(config.tokenQueryParam)

  return [
    month || '',
    config.method,
    cacheUrl.toString(),
    config.authHeader,
    config.authScheme,
    config.maxPages,
  ].join('|')
}

function readLooqmeCoverageCache(cacheKey) {
  const cached = looqmeCoverageCache.get(cacheKey)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > LOOQME_COVERAGE_CACHE_TTL_MS) {
    looqmeCoverageCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

function writeLooqmeCoverageCache(cacheKey, payload) {
  looqmeCoverageCache.set(cacheKey, {
    cachedAt: Date.now(),
    payload,
  })
}

async function fetchRemainingLooqmePages(firstPayload, config) {
  if (!firstPayload?.next || !Array.isArray(firstPayload.results)) return firstPayload

  const results = [...firstPayload.results]
  let nextUrl = firstPayload.next
  let page = 1

  while (nextUrl && page < config.maxPages) {
    const response = await fetch(nextUrl, {
      method: config.method,
      headers: buildLooqmeHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    const body = await response.text()

    if (!response.ok) {
      throw createHttpError(
        502,
        'Looqme API не повернув наступну сторінку coverage.',
        sanitizeExternalError(body),
      )
    }

    const payload = parseLooqmeResponseBody(body, response.headers.get('content-type'))
    results.push(...(payload.results || []))
    nextUrl = payload.next
    page += 1
  }

  return {
    ...firstPayload,
    next: nextUrl,
    results,
  }
}

function getLooqmeConfig() {
  const baseUrl = textValue(process.env.LOOQME_BASE_URL)
  const pathValue = textValue(process.env.LOOQME_COVERAGE_PATH)
  const explicitUrl = textValue(
    process.env.LOOQME_COVERAGE_URL || process.env.LOOQME_API_URL,
  )
  const url =
    baseUrl && pathValue
      ? new URL(pathValue, normalizeExternalUrl(baseUrl)).toString()
      : explicitUrl
        ? normalizeExternalUrl(explicitUrl)
        : ''

  return {
    url,
    token: textValue(process.env.LOOQME_TOKEN),
    method: textValue(process.env.LOOQME_METHOD || 'GET').toUpperCase(),
    authHeader: textValue(process.env.LOOQME_AUTH_HEADER || 'Authorization'),
    authScheme: textValue(process.env.LOOQME_AUTH_SCHEME || 'Token'),
    tokenQueryParam: textValue(process.env.LOOQME_TOKEN_QUERY_PARAM),
    dateFromParam: textValue(process.env.LOOQME_DATE_FROM_PARAM || 'start'),
    dateToParam: textValue(process.env.LOOQME_DATE_TO_PARAM || 'end'),
    monthParam: textValue(process.env.LOOQME_MONTH_PARAM),
    extraQuery: textValue(
      process.env.LOOQME_EXTRA_QUERY ||
        'by_created=false&ordering=desc&response_lang=uk&short_article=false&duplicates=true&limit=100',
    ),
    timeoutMs: Number(process.env.LOOQME_TIMEOUT_MS || 30000),
    maxPages: normalizeLooqmeMaxPages(process.env.LOOQME_MAX_PAGES),
  }
}

function normalizeLooqmeMaxPages(value) {
  const pages = Number(value || 5)
  return Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 5
}

function buildLooqmeRequestUrl(config, month) {
  const url = new URL(config.url)
  const range = coverageMonthDateRange(month)

  applyLooqmeExtraQuery(url, config.extraQuery)

  if (config.monthParam && month) {
    url.searchParams.set(config.monthParam, month)
  }

  if (range) {
    if (config.dateFromParam) url.searchParams.set(config.dateFromParam, range.from)
    if (config.dateToParam) url.searchParams.set(config.dateToParam, range.to)
  }

  if (config.tokenQueryParam) {
    url.searchParams.set(config.tokenQueryParam, config.token)
  }

  return { range, url }
}

function buildLooqmeHeaders(config) {
  const headers = {
    Accept: 'application/json, text/csv;q=0.9, */*;q=0.8',
  }

  if (config.authHeader && config.token) {
    headers[config.authHeader] = looqmeAuthHeaderValue(config.token, config.authScheme)
  }

  return headers
}

function looqmeAuthHeaderValue(token, scheme) {
  if (!scheme || /^\S+\s+\S+/.test(token)) return token
  return `${scheme} ${token}`
}

function applyLooqmeExtraQuery(url, extraQuery) {
  if (!extraQuery) return

  try {
    const parsed = JSON.parse(extraQuery)
    Object.entries(parsed || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    })
    return
  } catch {
    // Support simple query strings in env, for example "project_id=123&lang=uk".
  }

  new URLSearchParams(extraQuery.replace(/^\?/, '')).forEach((value, key) => {
    if (key) url.searchParams.set(key, value)
  })
}

function parseLooqmeResponseBody(body, contentType = '') {
  const text = String(body || '').trim()
  if (!text) return {}

  const format = String(process.env.LOOQME_RESPONSE_FORMAT || '').toLowerCase()
  const isCsv = format === 'csv' || String(contentType || '').includes('csv')

  if (!isCsv) {
    try {
      return JSON.parse(text)
    } catch {
      if (text.startsWith('<')) {
        throw createHttpError(502, 'Looqme API повернув HTML замість JSON/CSV.')
      }
    }
  }

  const rows = parseCsvRows(text)
  return { data: csvRowsToObjects(rows) }
}

function csvRowsToObjects(rows) {
  const header = rows[0] || []
  return rows.slice(1).map((row) =>
    header.reduce((record, label, index) => {
      const key = textValue(label) || `column_${index + 1}`
      record[key] = row[index]
      return record
    }, {}),
  )
}

function normalizeLooqmeCoveragePayload(rawPayload, month, range) {
  const source = unwrapLooqmePayload(rawPayload)
  const rows = extractLooqmeRows(source)
  const entries = rows
    .map(normalizeLooqmeEntry)
    .filter(isMeaningfulLooqmeEntry)
    .filter((entry) => looqmeEntryMatchesRange(entry, range))

  if (entries.length) {
    return aggregateLooqmeEntries(entries, source, month)
  }

  return normalizeDirectLooqmeCoverage(source, month)
}

function unwrapLooqmePayload(payload) {
  let source = payload

  for (const key of ['payload', 'response', 'result', 'data']) {
    if (
      source &&
      typeof source === 'object' &&
      !Array.isArray(source) &&
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      source = source[key]
    }
  }

  return source || {}
}

function extractLooqmeRows(source) {
  if (Array.isArray(source)) return source
  if (!source || typeof source !== 'object') return []

  for (const key of [
    'items',
    'mentions',
    'publications',
    'articles',
    'posts',
    'records',
    'results',
    'rows',
    'data',
  ]) {
    if (Array.isArray(source[key])) return source[key]
  }

  return []
}

function normalizeDirectLooqmeCoverage(source, month) {
  const payload = emptyLooqmeCoveragePayload(month, 'looqme')
  const mentions = normalizeLooqmeBrandMentions(
    source.mentionsByBrand || source.brands || source.brandMentions || [],
  )
  const mediaOutlets = normalizeLooqmeOutlets(
    source.mediaOutlets || source.outlets || source.sources || source.publications || [],
  )
  const sentiment = normalizeLooqmeSentimentList(
    source.sentiment || source.sentiments || source.tones || [],
  )
  const mentionsMetric = normalizeLooqmeMetric(source.mentionsMetric, {
    value: mentions.reduce((sum, item) => sum + Number(item.count || 0), 0),
    segments: normalizeLooqmeMetricSegments(source.mentionsByChannel),
  })
  const audienceMetric = normalizeLooqmeMetric(source.audienceMetric, {
    value:
      source.totalReach ??
      source.totalAudience ??
      source.reach ??
      source.audience?.total ??
      source.audience?.all ??
      mentions.reduce((sum, item) => sum + parseReachNumber(item.audience), 0),
    segments: normalizeLooqmeMetricSegments(source.audience?.segments),
  })
  const mediaAudience = parseReachNumber(source.audience?.media)
  const socialAudience = parseReachNumber(source.audience?.social)

  return {
    ...payload,
    mentionsMetric,
    mentions,
    mediaOutlets,
    audienceMetric,
    audience: {
      total: audienceMetric.value,
      media: mediaAudience,
      social: socialAudience,
    },
    sentiment,
  }
}

function normalizeLooqmeEntry(item, index) {
  const brand = normalizeLooqmeBrand(
    pickLooqmeValue(item, [
      'brand',
      'brands',
      'company',
      'project',
      'object',
      'topic',
      'query',
      'keyword',
      'tag',
      'tags',
      'entity',
      'бренд',
      'компанія',
      'проєкт',
      'обʼєкт',
      'объект',
      'тема',
    ]),
    item,
  )
  const title = textValue(
    pickLooqmeValue(item, ['title', 'headline', 'name', 'text', 'message', 'заголовок']),
  )
  const url = textValue(pickLooqmeValue(item, ['url', 'link', 'href', 'посилання']))
  const outlet =
    textValue(
      pickLooqmeValue(item, [
        'media',
        'outlet',
        'source',
        'sourceName',
        'publication',
        'site',
        'domain',
        'mediaName',
        'джерело',
        'медіа',
        'змі',
      ]),
    ) || outletFromUrl(url)
  const explicitCount = parseReachNumber(
    pickLooqmeValue(item, [
      'mentions',
      'count',
      'mentionCount',
      'mentionsCount',
      'articles',
      'posts',
      'total',
      'згадки',
      'згадок',
      'кількість',
    ]),
  )
  const count = explicitCount || (isLooqmePublicationLike(item) ? 1 : 0)
  const reach = pickLooqmeReach(item)
  const channel = normalizeLooqmeChannel(
    pickLooqmeValue(item, [
      'channel',
      'type',
      'mediaType',
      'sourceType',
      'network',
      'platform',
      'категорія',
      'тип',
      'канал',
    ]),
    item,
  )
  const sentiment = normalizeLooqmeSentimentValue(
    pickLooqmeValue(item, [
      'sentiment',
      'tone',
      'tonality',
      'sentimentType',
      'тональність',
      'тон',
    ]),
  )
  const date = textValue(
    pickLooqmeValue(item, [
      'date',
      'publishedAt',
      'published_at',
      'release_date',
      'publicationDate',
      'publication_date',
      'createdAt',
      'created_at',
      'datetime',
      'дата',
    ]),
  )

  return {
    brand,
    title,
    url,
    outlet,
    count,
    reach,
    channel,
    sentiment,
    date,
    index,
  }
}

function aggregateLooqmeEntries(entries, source, month) {
  const mentionSegments = aggregateLooqmeChannelSegments(entries, 'count')
  const audienceSegments = aggregateLooqmeChannelSegments(entries, 'reach')
  const mediaOutlets = aggregateLooqmeOutlets(entries)
  const sentiment = aggregateLooqmeSentiment(entries)
  const audienceTotal = entries.reduce((sum, item) => sum + Number(item.reach || 0), 0)
  const entriesTotal = entries.reduce((sum, item) => sum + Number(item.count || 0), 0)
  const mentionsTotal = Number(source.count || 0) || entriesTotal
  const mentions = aggregateLooqmeBrands(entries, mentionsTotal)
  const fallback = emptyLooqmeCoveragePayload(month, 'looqme')

  return {
    ...fallback,
    mentionsMetric: normalizeLooqmeMetric(source.mentionsMetric, {
      value: mentionsTotal,
      delta: null,
      segments: mentionSegments,
    }),
    mentions,
    mediaOutlets,
    audienceMetric: normalizeLooqmeMetric(source.audienceMetric, {
      value: audienceTotal,
      delta: null,
      segments: audienceSegments,
    }),
    audience: {
      total: audienceTotal,
      media: audienceSegments.find((item) => item.key === 'media')?.value || 0,
      social: audienceSegments.find((item) => item.key === 'social')?.value || 0,
    },
    sentiment,
  }
}

function aggregateLooqmeBrands(entries, totalCount = 0) {
  const brands = new Map()

  entries.forEach((entry) => {
    const brand = entry.brand || defaultLooqmeBrand()
    const current = brands.get(brand) || { brand, count: 0, audience: 0 }
    current.count += Number(entry.count || 0)
    current.audience += Number(entry.reach || 0)
    brands.set(brand, current)
  })

  const defaultBrand = defaultLooqmeBrand()
  const configuredBrands = [...looqmeOwnBrands(), ...looqmeCompetitorBrands()]
  const hasConfiguredCompetitor = [...brands.keys()].some(
    (brand) => !isOwnBrand(brand) && matchingConfiguredBrand(brand, configuredBrands),
  )

  if (totalCount && !hasConfiguredCompetitor) {
    const current = brands.get(defaultBrand) || { brand: defaultBrand, count: 0, audience: 0 }
    current.count = Math.max(current.count, totalCount)
    brands.set(defaultBrand, current)
  }

  return [...brands.values()].sort((left, right) => right.count - left.count)
}

function aggregateLooqmeOutlets(entries) {
  const outlets = new Map()

  entries.forEach((entry) => {
    if (!entry.outlet) return

    const current = outlets.get(entry.outlet) || {
      name: entry.outlet,
      mentions: 0,
      reach: 0,
    }
    current.mentions += Number(entry.count || 0)
    current.reach += Number(entry.reach || 0)
    outlets.set(entry.outlet, current)
  })

  return [...outlets.values()]
    .sort((left, right) => right.reach - left.reach || right.mentions - left.mentions)
    .slice(0, 12)
}

function aggregateLooqmeChannelSegments(entries, field) {
  const totals = new Map([
    ['media', { key: 'media', label: 'ЗМІ(Медіа)', value: 0, delta: null, color: LOOQME_MEDIA_COLOR }],
    ['social', { key: 'social', label: 'Соціальні мережі', value: 0, delta: null, color: LOOQME_SOCIAL_COLOR }],
  ])

  entries.forEach((entry) => {
    const key = entry.channel === 'social' ? 'social' : 'media'
    const current = totals.get(key)
    current.value += Number(entry[field] || 0)
  })

  return [...totals.values()].filter((item) => item.value)
}

function aggregateLooqmeSentiment(entries) {
  const ownEntries = entries.filter((entry) => isOwnBrand(entry.brand))
  const scopedEntries = ownEntries.length ? ownEntries : entries
  const totals = new Map()

  scopedEntries.forEach((entry) => {
    if (!entry.sentiment) return

    const current = totals.get(entry.sentiment.key) || {
      key: entry.sentiment.key,
      name: entry.sentiment.name,
      value: 0,
      color: LOOQME_SENTIMENT_COLORS[entry.sentiment.key],
    }
    current.value += Number(entry.count || 0)
    totals.set(entry.sentiment.key, current)
  })

  return [...totals.values()].sort(
    (left, right) => sentimentOrder(left.key) - sentimentOrder(right.key),
  )
}

function normalizeLooqmeBrandMentions(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      brand: normalizeLooqmeBrand(
        item.brand || item.name || item.company || item.project,
        item,
      ),
      count: Number(item.count ?? item.mentions ?? item.value ?? 0),
      audience: parseReachNumber(
        item.audience ?? item.reach ?? item.totalReach ?? item.totalAudience,
      ),
    }))
    .filter((item) => item.brand || item.count || item.audience)
}

function normalizeLooqmeOutlets(items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      name:
        item.name ||
        item.media ||
        item.outlet ||
        item.source ||
        item.title ||
        `Медіа ${index + 1}`,
      mentions: Number(item.mentions ?? item.count ?? item.articles ?? 0),
      reach: parseReachNumber(
        item.reach ??
          item.audience ??
          item.potentialAudience ??
          item.totalReach ??
          item.totalAudience ??
          item.views,
      ),
    }))
    .filter((item) => item.name || item.mentions || item.reach)
}

function normalizeLooqmeMetric(metric, fallback = {}) {
  const normalized = normalizeCoverageMetric(metric, fallback)

  return {
    ...normalized,
    segments: normalized.segments.map((segment) => ({
      ...segment,
      color: looqmeChannelColor(segment.label || segment.channel),
    })),
  }
}

function normalizeLooqmeMetricSegments(segments) {
  if (!segments) return []

  if (Array.isArray(segments)) {
    return segments.map((segment) => ({
      ...segment,
      color: segment.color || looqmeChannelColor(segment.label || segment.channel),
    }))
  }

  if (typeof segments === 'object') {
    return Object.entries(segments).map(([label, value]) => ({
      label,
      value,
      color: looqmeChannelColor(label),
    }))
  }

  return []
}

function normalizeLooqmeSentimentList(sentiment) {
  if (!sentiment) return []

  if (!Array.isArray(sentiment) && typeof sentiment === 'object') {
    return Object.entries(sentiment)
      .map(([name, value]) => {
        const normalized = normalizeLooqmeSentimentValue(name)
        return normalized
          ? {
              name: normalized.name,
              value: Number(value || 0),
              color: LOOQME_SENTIMENT_COLORS[normalized.key],
            }
          : null
      })
      .filter(Boolean)
      .filter((item) => item.value)
  }

  return (Array.isArray(sentiment) ? sentiment : [])
    .map((item) => {
      const normalized = normalizeLooqmeSentimentValue(
        item.name || item.label || item.sentiment || item.tone,
      )

      return normalized
        ? {
            name: normalized.name,
            value: Number(item.value ?? item.count ?? item.mentions ?? 0),
            color: item.color || LOOQME_SENTIMENT_COLORS[normalized.key],
          }
        : null
    })
    .filter(Boolean)
    .filter((item) => item.value)
}

function normalizeLooqmeBrand(value, item = {}) {
  const ownBrand = matchingConfiguredBrand(value, looqmeOwnBrands())
  if (ownBrand) return defaultLooqmeBrand()

  const competitor = matchingConfiguredBrand(value, looqmeCompetitorBrands())
  if (competitor) return competitor

  const inferred = inferLooqmeBrand(item)
  if (inferred) return inferred

  return defaultLooqmeBrand()
}

function inferLooqmeBrand(item) {
  const haystack = arrayText([
    item.title,
    item.headline,
    item.name,
    item.text,
    item.message,
    item.body,
    item.description,
    item.url,
    item.link,
  ])
  const ownBrand = matchingConfiguredBrand(haystack, looqmeOwnBrands())
  if (ownBrand) return defaultLooqmeBrand()

  return matchingConfiguredBrand(haystack, looqmeCompetitorBrands())
}

function matchingConfiguredBrand(value, brands) {
  const haystack = normalizeCell(arrayText(value))
  if (!haystack) return ''

  return brands.find((brand) => haystack.includes(normalizeCell(brand))) || ''
}

function looqmeOwnBrands() {
  return splitEnvList(process.env.LOOQME_OWN_BRANDS || 'Universe Group,Universe')
}

function looqmeCompetitorBrands() {
  return splitEnvList(process.env.LOOQME_COMPETITOR_BRANDS || 'Skelar,Headway')
}

function defaultLooqmeBrand() {
  return textValue(process.env.LOOQME_DEFAULT_BRAND) || looqmeOwnBrands()[0] || 'Universe Group'
}

function normalizeLooqmeChannel(value, item = {}) {
  const text = normalizeCell(
    arrayText([
      value,
      item.source,
      item.sourceType,
      item.mediaType,
      item.platform,
      item.network,
      item.url,
      item.link,
    ]),
  )

  if (
    /social|facebook|instagram|linkedin|twitter|\bx\b|tiktok|telegram|youtube|соц|соці/.test(
      text,
    )
  ) {
    return 'social'
  }

  return 'media'
}

function normalizeLooqmeSentimentValue(value) {
  const text = normalizeCell(value)
  if (!text) return null

  if (/positive|positiv|good|plus|позитив|полож|добр/.test(text)) {
    return { key: 'positive', name: 'Позитив' }
  }

  if (/negative|negativ|bad|minus|негатив|відʼєм|отриц|поган/.test(text)) {
    return { key: 'negative', name: 'Негатив' }
  }

  if (/neutral|neutr|нейтр|неитр/.test(text)) {
    return { key: 'neutral', name: 'Нейтрал' }
  }

  return null
}

function pickLooqmeValue(item, aliases) {
  if (!item || typeof item !== 'object') return ''

  for (const alias of aliases) {
    if (item[alias] !== undefined && item[alias] !== null && item[alias] !== '') {
      return item[alias]
    }
  }

  const normalizedAliases = aliases.map(normalizeCell)
  const match = Object.entries(item).find(([key, value]) => {
    if (value === undefined || value === null || value === '') return false
    return normalizedAliases.includes(normalizeCell(key))
  })

  return match ? match[1] : ''
}

function isLooqmePublicationLike(item) {
  return Boolean(
    pickLooqmeValue(item, [
      'url',
      'link',
      'href',
      'title',
      'headline',
      'publishedAt',
      'publicationDate',
      'date',
      'посилання',
      'заголовок',
      'дата',
    ]),
  )
}

function isMeaningfulLooqmeEntry(entry) {
  return Boolean(
    entry.brand ||
      entry.title ||
      entry.url ||
      entry.outlet ||
      entry.count ||
      entry.reach ||
      entry.sentiment,
  )
}

function looqmeEntryMatchesRange(entry, range) {
  if (!range || !entry.date) return true

  const timestamp = Date.parse(entry.date)
  if (Number.isNaN(timestamp)) return true

  const fromTimestamp = Date.parse(isoDateBoundary(range.from))
  const toTimestamp = Date.parse(isoDateBoundary(range.to))
  if (Number.isNaN(fromTimestamp) || Number.isNaN(toTimestamp)) return true

  return timestamp >= fromTimestamp && timestamp <= toTimestamp
}

function pickLooqmeReach(item) {
  const candidates = [
    'average_attendance',
    'duplicates_avg_attendance',
    'views_count',
    'publication_place_subscribers_count',
    'creators_subscribers_count',
    'audience_edition',
    'reach',
    'audience',
    'potentialAudience',
    'potentialReach',
    'totalReach',
    'totalAudience',
    'views',
    'impressions',
    'visits',
    'circulation',
    'охоплення',
    'аудиторія',
    'перегляди',
  ]

  for (const key of candidates) {
    const value = pickLooqmeValue(item, [key])
    const reach = parseReachNumber(value)
    if (reach > 0) return reach
  }

  return 0
}

function isoDateBoundary(value) {
  const text = textValue(value)
  if (!text) return ''
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return text
  return `${text}Z`
}

function coverageMonthDateRange(month) {
  const text = textValue(month)
  if (!text) return null

  const year = Number(text.match(/\b(20\d{2})\b/)?.[1] || new Date().getFullYear())
  const monthIndex = MONTHS.indexOf(text)

  if (monthIndex >= 0) {
    return dateRangeForMonthIndex(year, monthIndex)
  }

  const normalized = normalizeCell(text)
  const index = [
    ['січень', 'january'],
    ['лютий', 'february'],
    ['березень', 'march'],
    ['квітень', 'april'],
    ['травень', 'may'],
    ['червень', 'june'],
    ['липень', 'july'],
    ['серпень', 'august'],
    ['вересень', 'september'],
    ['жовтень', 'october'],
    ['листопад', 'november'],
    ['грудень', 'december'],
  ].findIndex((names) => names.some((name) => normalized.includes(normalizeCell(name))))

  return index >= 0 ? dateRangeForMonthIndex(year, index) : null
}

function dateRangeForMonthIndex(year, monthIndex) {
  const from = new Date(Date.UTC(year, monthIndex, 1))
  const to = new Date(Date.UTC(year, monthIndex + 1, 0))

  return {
    from: `${formatIsoDate(from)}T00:00:00`,
    to: `${formatIsoDate(to)}T23:59:59`,
  }
}

function formatIsoDate(date) {
  return date.toISOString().slice(0, 10)
}

function emptyLooqmeCoveragePayload(month, source) {
  return {
    month,
    source,
    mentionsMetric: {
      value: 0,
      delta: null,
      segments: [],
    },
    mentions: [],
    mediaOutlets: [],
    audienceMetric: {
      value: 0,
      delta: null,
      segments: [],
    },
    audience: {
      total: 0,
      media: 0,
      social: 0,
    },
    sentiment: [],
  }
}

function mockLooqmeCoveragePayload(month) {
  if (month && month !== MOCK_COVERAGE_MONTH) {
    return emptyLooqmeCoveragePayload(month, 'mock')
  }

  return {
    month,
    source: 'mock',
    mentionsMetric: {
      value: 142,
      delta: -24,
      segments: [
        { label: 'ЗМІ(Медіа)', value: 42, delta: -24, color: LOOQME_MEDIA_COLOR },
        { label: 'Соціальні мережі', value: 100, delta: -24, color: LOOQME_SOCIAL_COLOR },
      ],
    },
    mentions: [
      { brand: 'Universe Group', count: 54, audience: 74200000 },
      { brand: 'Skelar', count: 8, audience: 9600000 },
      { brand: 'Headway', count: 2, audience: 4300000 },
    ],
    mediaOutlets: [
      { name: 'AIN.UA', mentions: 18, reach: 23600000 },
      { name: 'DOU', mentions: 14, reach: 18400000 },
      { name: 'Forbes Ukraine', mentions: 9, reach: 15200000 },
      { name: 'Vector', mentions: 11, reach: 12800000 },
      { name: 'Speka', mentions: 7, reach: 8600000 },
      { name: 'dev.ua', mentions: 5, reach: 7500000 },
    ],
    audienceMetric: {
      value: 88100000,
      delta: -37,
      segments: [
        { label: 'ЗМІ(Медіа)', value: 86800000, delta: -38, color: LOOQME_MEDIA_COLOR },
        { label: 'Соціальні мережі', value: 1400000, delta: 19, color: LOOQME_SOCIAL_COLOR },
      ],
    },
    audience: {
      total: 88100000,
      media: 86800000,
      social: 1400000,
    },
    sentiment: [
      { name: 'Позитив', value: 42, color: LOOQME_SENTIMENT_COLORS.positive },
      { name: 'Нейтрал', value: 20, color: LOOQME_SENTIMENT_COLORS.neutral },
      { name: 'Негатив', value: 2, color: LOOQME_SENTIMENT_COLORS.negative },
    ],
  }
}

function splitEnvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function arrayText(value) {
  if (Array.isArray(value)) return value.map(arrayText).filter(Boolean).join(' ')
  if (value && typeof value === 'object') {
    return Object.values(value).map(arrayText).filter(Boolean).join(' ')
  }
  return textValue(value)
}

function outletFromUrl(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function looqmeChannelColor(value) {
  return normalizeLooqmeChannel(value) === 'social' ? LOOQME_SOCIAL_COLOR : LOOQME_MEDIA_COLOR
}

function sentimentOrder(value) {
  return { negative: 0, neutral: 1, positive: 2 }[value] ?? 3
}

function normalizeExternalUrl(value) {
  const text = textValue(value)
  if (!text || /^https?:\/\//i.test(text)) return text
  return `https://${text}`
}

function sanitizeExternalError(value) {
  return cleanReportText(value, 500)
}

async function fetchMailchimpCampaignReports(month) {
  const config = getMailchimpConfig()

  if (!config.apiKey) {
    return emptyMailchimpReportsPayload(month, 'mailchimp-missing-token', true)
  }

  if (!config.url) {
    return emptyMailchimpReportsPayload(month, 'mailchimp-missing-server', true)
  }

  const previousMonth = previousMailchimpMonthLabel(month)
  const [current, previous] = await Promise.all([
    fetchMailchimpReportsForMonth(config, month),
    previousMonth
      ? fetchMailchimpReportsForMonth(config, previousMonth)
      : emptyMailchimpReportsPayload('', 'mailchimp'),
  ])
  const audienceConfig = {
    ...config,
    listId:
      config.listId ||
      inferMailchimpListId(current.campaigns) ||
      inferMailchimpListId(previous.campaigns),
  }
  const audience = await fetchMailchimpAudienceSnapshot(audienceConfig, month)

  return {
    ...current,
    current,
    previous,
    audience,
  }
}

function inferMailchimpListId(campaigns = []) {
  const campaign = campaigns.find((item) => textValue(item.listId))
  return textValue(campaign?.listId)
}

async function fetchMailchimpReportsForMonth(config, month) {
  const { url } = buildMailchimpReportsUrl(config, month)
  const cacheKey = mailchimpReportsCacheKey(config, month, url)
  const cached = readMailchimpReportsCache(cacheKey)
  if (cached) return cached

  const response = await fetch(url, {
    method: 'GET',
    headers: buildMailchimpHeaders(config),
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const body = await response.text()

  if (!response.ok) {
    throw createHttpError(
      502,
      'Mailchimp API не повернув campaign reports.',
      sanitizeExternalError(body),
    )
  }

  const payload = parseMailchimpResponseBody(body)
  const reports = await normalizeMailchimpReportsPayload(payload, month, config)
  writeMailchimpReportsCache(cacheKey, reports)
  return reports
}

function getMailchimpConfig() {
  const apiKey = textValue(
    process.env.MAILCHIMP_API_KEY || process.env.MAILCHIMP_TOKEN,
  )
  const serverPrefix = textValue(
    process.env.MAILCHIMP_SERVER_PREFIX ||
      process.env.MAILCHIMP_DC ||
      process.env.MAILCHIMP_DATA_CENTER ||
      mailchimpServerPrefixFromApiKey(apiKey),
  )
  const explicitBaseUrl = textValue(process.env.MAILCHIMP_BASE_URL)
  const url = explicitBaseUrl
    ? normalizeExternalUrl(explicitBaseUrl)
    : serverPrefix
      ? `https://${serverPrefix}.api.mailchimp.com/3.0`
      : ''

  return {
    apiKey,
    url,
    listId: textValue(
      process.env.MAILCHIMP_LIST_ID ||
        process.env.MAILCHIMP_AUDIENCE_ID ||
        process.env.MAILCHIMP_AUDIENCE_LIST_ID,
    ),
    type: textValue(process.env.MAILCHIMP_CAMPAIGN_TYPE),
    count: boundedInteger(process.env.MAILCHIMP_REPORTS_LIMIT, 100, 1, 1000),
    includeReportDetails: process.env.MAILCHIMP_FETCH_REPORT_DETAILS !== 'false',
    detailConcurrency: boundedInteger(
      process.env.MAILCHIMP_REPORT_DETAILS_CONCURRENCY,
      4,
      1,
      10,
    ),
    timeoutMs: boundedInteger(process.env.MAILCHIMP_TIMEOUT_MS, 15000, 1000, 120000),
  }
}

function mailchimpServerPrefixFromApiKey(apiKey) {
  const match = textValue(apiKey).match(/-([a-z]+\d+)$/i)
  return match?.[1] || ''
}

function buildMailchimpReportsUrl(config, month) {
  const url = new URL('reports', `${config.url.replace(/\/$/, '')}/`)
  const range = coverageMonthDateRange(month)

  url.searchParams.set('count', String(config.count))
  url.searchParams.set('offset', '0')

  if (config.type) {
    url.searchParams.set('type', config.type)
  }

  if (range) {
    url.searchParams.set('since_send_time', mailchimpIsoBoundary(range.from))
    url.searchParams.set('before_send_time', mailchimpIsoBoundary(range.to))
  }

  return { range, url }
}

function mailchimpIsoBoundary(value) {
  const text = textValue(value)
  if (!text || /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) return text
  return `${text}+00:00`
}

function buildMailchimpHeaders(config) {
  return {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`codex:${config.apiKey}`).toString('base64')}`,
  }
}

function mailchimpReportsCacheKey(config, month, url) {
  return [
    month || '',
    config.url,
    config.type,
    config.count,
    config.includeReportDetails,
    url.toString(),
  ].join('|')
}

function readMailchimpReportsCache(cacheKey) {
  const cached = mailchimpReportsCache.get(cacheKey)
  if (!cached) return null

  if (Date.now() - cached.cachedAt > MAILCHIMP_REPORTS_CACHE_TTL_MS) {
    mailchimpReportsCache.delete(cacheKey)
    return null
  }

  return cached.payload
}

function writeMailchimpReportsCache(cacheKey, payload) {
  mailchimpReportsCache.set(cacheKey, {
    cachedAt: Date.now(),
    payload,
  })
}

function parseMailchimpResponseBody(body) {
  const text = String(body || '').trim()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    throw createHttpError(502, 'Mailchimp API повернув невалідний JSON.')
  }
}

async function normalizeMailchimpReportsPayload(rawPayload, month, config) {
  const rawReports = extractMailchimpReports(rawPayload)
  const reports = await withMailchimpReportDetails(rawReports, config)
  const campaigns = reports
    .map(normalizeMailchimpReport)
    .filter((campaign) => campaign.id || campaign.title || campaign.sendTime)
    .sort((left, right) => Date.parse(right.sendTime || 0) - Date.parse(left.sendTime || 0))

  return {
    ...emptyMailchimpReportsPayload(month, 'mailchimp'),
    totalItems: Number(rawPayload?.total_items ?? campaigns.length),
    campaigns,
    metrics: aggregateMailchimpCampaignMetrics(campaigns),
  }
}

async function withMailchimpReportDetails(reports, config) {
  if (!config.includeReportDetails || !reports.length) return reports

  return mapWithConcurrency(reports, config.detailConcurrency, async (report) => {
    const campaignId = textValue(report.id || report.campaign_id)
    if (!campaignId) return report

    try {
      const detail = await fetchMailchimpReportDetail(config, campaignId)
      return mergeMailchimpReportDetail(report, detail)
    } catch {
      return report
    }
  })
}

async function fetchMailchimpReportDetail(config, campaignId) {
  const url = buildMailchimpReportDetailUrl(config, campaignId)
  return fetchMailchimpJson(config, url, 'Mailchimp API не повернув campaign report.')
}

function buildMailchimpReportDetailUrl(config, campaignId) {
  return new URL(
    `reports/${encodeURIComponent(campaignId)}`,
    `${config.url.replace(/\/$/, '')}/`,
  )
}

function mergeMailchimpReportDetail(report, detail) {
  return {
    ...report,
    ...detail,
    settings: {
      ...(report.settings || {}),
      ...(detail.settings || {}),
    },
    recipients: {
      ...(report.recipients || {}),
      ...(detail.recipients || {}),
    },
    opens: {
      ...(report.opens || {}),
      ...(detail.opens || {}),
    },
    clicks: {
      ...(report.clicks || {}),
      ...(detail.clicks || {}),
    },
    bounces: {
      ...(report.bounces || {}),
      ...(detail.bounces || {}),
    },
    forwards: {
      ...(report.forwards || {}),
      ...(detail.forwards || {}),
    },
  }
}

function extractMailchimpReports(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  for (const key of ['reports', 'campaigns', 'items', 'results', 'data']) {
    if (Array.isArray(payload[key])) return payload[key]
  }

  return []
}

function normalizeMailchimpReport(report = {}, index = 0) {
  const opens = report.opens || {}
  const clicks = report.clicks || {}
  const bounces = report.bounces || {}
  const forwards = report.forwards || {}
  const emailsSent = mailchimpNumberValue(report.emails_sent ?? report.emailsSent)
  const hardBounces = mailchimpNumberValue(bounces.hard_bounces ?? report.hard_bounces)
  const softBounces = mailchimpNumberValue(bounces.soft_bounces ?? report.soft_bounces)
  const syntaxErrors = mailchimpNumberValue(bounces.syntax_errors ?? report.syntax_errors)
  const totalBounces =
    mailchimpNumberValue(bounces.total_bounces ?? report.total_bounces) ||
    hardBounces + softBounces + syntaxErrors
  const delivered = Math.max(0, emailsSent - totalBounces)
  const uniqueOpens = mailchimpNumberValue(opens.unique_opens ?? report.unique_opens)
  const totalOpens = mailchimpNumberValue(opens.opens_total ?? report.opens_total)
  const uniqueClicks = mailchimpNumberValue(clicks.unique_clicks ?? report.unique_clicks)
  const uniqueSubscriberClicks = mailchimpNumberValue(
    clicks.unique_subscriber_clicks ?? report.unique_subscriber_clicks ?? uniqueClicks,
  )
  const totalClicks = mailchimpNumberValue(clicks.clicks_total ?? report.clicks_total)

  return {
    id: textValue(report.id || report.campaign_id || `mailchimp-${index + 1}`),
    title: textValue(
      report.campaign_title ||
        report.title ||
        report.settings?.title ||
        report.settings?.subject_line ||
        report.subject_line ||
        `Campaign ${index + 1}`,
    ),
    subject: textValue(report.subject_line || report.settings?.subject_line),
    listId: textValue(report.list_id || report.recipients?.list_id),
    listName: textValue(report.list_name || report.recipients?.list_name),
    type: textValue(report.type),
    sendTime: textValue(report.send_time || report.sent_time),
    archiveUrl: textValue(report.archive_url || report.long_archive_url),
    emailsSent,
    delivered,
    hardBounces,
    softBounces,
    syntaxErrors,
    totalBounces,
    bounceRate: normalizeMailchimpRate(
      report.bounce_rate ?? bounces.bounce_rate,
      emailsSent ? totalBounces / emailsSent : null,
    ),
    uniqueOpens,
    totalOpens,
    openRate: normalizeMailchimpRate(
      opens.open_rate ?? report.open_rate,
      delivered ? uniqueOpens / delivered : null,
    ),
    lastOpen: textValue(opens.last_open || report.last_open),
    uniqueClicks,
    uniqueSubscriberClicks,
    totalClicks,
    clickRate: normalizeMailchimpRate(
      clicks.click_rate ?? report.click_rate,
      delivered ? uniqueSubscriberClicks / delivered : null,
    ),
    clickToOpenRate: normalizeMailchimpRate(
      clicks.click_to_open_rate ?? report.click_to_open_rate,
      uniqueOpens ? uniqueSubscriberClicks / uniqueOpens : null,
    ),
    lastClick: textValue(clicks.last_click || report.last_click),
    unsubscribed: mailchimpNumberValue(
      report.unsubscribed ?? report.unsubscribes ?? report.unsubscribed_count,
    ),
    forwardsCount: mailchimpNumberValue(
      forwards.forwards_count ?? report.forwards_count,
    ),
    forwardsOpens: mailchimpNumberValue(
      forwards.forwards_opens ?? report.forwards_opens,
    ),
    abuseReports: mailchimpNumberValue(report.abuse_reports ?? report.abuseReports),
  }
}

function aggregateMailchimpCampaignMetrics(campaigns = []) {
  const totals = campaigns.reduce(
    (summary, campaign) => {
      summary.campaigns += 1
      summary.emailsSent += campaign.emailsSent
      summary.delivered += campaign.delivered
      summary.uniqueOpens += campaign.uniqueOpens
      summary.totalOpens += campaign.totalOpens
      summary.uniqueClicks += campaign.uniqueClicks
      summary.uniqueSubscriberClicks += campaign.uniqueSubscriberClicks
      summary.totalClicks += campaign.totalClicks
      summary.unsubscribed += campaign.unsubscribed
      summary.totalBounces += campaign.totalBounces
      summary.abuseReports += campaign.abuseReports
      return summary
    },
    {
      campaigns: 0,
      emailsSent: 0,
      delivered: 0,
      uniqueOpens: 0,
      totalOpens: 0,
      uniqueClicks: 0,
      uniqueSubscriberClicks: 0,
      totalClicks: 0,
      unsubscribed: 0,
      totalBounces: 0,
      abuseReports: 0,
    },
  )

  return {
    ...totals,
    openRate: totals.delivered
      ? roundMailchimpNumber((totals.uniqueOpens / totals.delivered) * 100)
      : averageMailchimpRate(campaigns, 'openRate'),
    clickRate: totals.delivered
      ? roundMailchimpNumber(
          (totals.uniqueSubscriberClicks / totals.delivered) * 100,
        )
      : averageMailchimpRate(campaigns, 'clickRate'),
    clickToOpenRate: totals.uniqueOpens
      ? roundMailchimpNumber(
          (totals.uniqueSubscriberClicks / totals.uniqueOpens) * 100,
        )
      : averageMailchimpRate(campaigns, 'clickToOpenRate'),
    unsubscribeRate: totals.delivered
      ? roundMailchimpNumber((totals.unsubscribed / totals.delivered) * 100)
      : 0,
    bounceRate: totals.emailsSent
      ? roundMailchimpNumber((totals.totalBounces / totals.emailsSent) * 100)
      : 0,
    bestOpenCampaign: bestMailchimpCampaign(campaigns, 'openRate'),
    latestCampaign: campaigns[0] || null,
  }
}

function emptyMailchimpReportsPayload(month, source, isFallback = false) {
  return {
    month,
    source,
    isFallback,
    totalItems: 0,
    campaigns: [],
    metrics: {
      campaigns: 0,
      emailsSent: 0,
      delivered: 0,
      uniqueOpens: 0,
      totalOpens: 0,
      uniqueClicks: 0,
      uniqueSubscriberClicks: 0,
      totalClicks: 0,
      openRate: 0,
      clickRate: 0,
      clickToOpenRate: 0,
      unsubscribed: 0,
      unsubscribeRate: 0,
      totalBounces: 0,
      bounceRate: 0,
      abuseReports: 0,
      bestOpenCampaign: null,
      latestCampaign: null,
    },
  }
}

async function fetchMailchimpAudienceSnapshot(config, month) {
  if (!config.listId) return emptyMailchimpAudiencePayload()

  try {
    const [list, growthHistory] = await Promise.all([
      fetchMailchimpJson(
        config,
        buildMailchimpListUrl(config),
        'Mailchimp API не повернув audience stats.',
      ),
      fetchMailchimpJson(
        config,
        buildMailchimpGrowthHistoryUrl(config),
        'Mailchimp API не повернув audience growth history.',
      ).catch(() => ({})),
    ])

    return normalizeMailchimpAudiencePayload(list, growthHistory, month, config.listId)
  } catch (error) {
    return {
      ...emptyMailchimpAudiencePayload(config.listId),
      error: error.message,
    }
  }
}

function buildMailchimpListUrl(config) {
  return new URL(
    `lists/${encodeURIComponent(config.listId)}`,
    `${config.url.replace(/\/$/, '')}/`,
  )
}

function buildMailchimpGrowthHistoryUrl(config) {
  const url = new URL(
    `lists/${encodeURIComponent(config.listId)}/growth-history`,
    `${config.url.replace(/\/$/, '')}/`,
  )
  url.searchParams.set('count', '24')
  url.searchParams.set('offset', '0')
  return url
}

async function fetchMailchimpJson(config, url, message) {
  const response = await fetch(url, {
    method: 'GET',
    headers: buildMailchimpHeaders(config),
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  const body = await response.text()

  if (!response.ok) {
    throw createHttpError(502, message, sanitizeExternalError(body))
  }

  return parseMailchimpResponseBody(body)
}

function normalizeMailchimpAudiencePayload(list, growthHistory, month, listId) {
  const stats = list.stats || {}
  const history = extractMailchimpGrowthHistory(growthHistory)
    .map(normalizeMailchimpGrowthHistoryItem)
    .filter((item) => item.monthKey)
  const currentMonthKey = mailchimpMonthKey(month)

  return {
    isConfigured: true,
    listId,
    name: textValue(list.name),
    memberCount: mailchimpNullableNumberValue(
      stats.member_count ?? list.member_count ?? list.memberCount,
    ),
    growthHistory: history,
    currentGrowth: history.find((item) => item.monthKey === currentMonthKey) || null,
  }
}

function extractMailchimpGrowthHistory(payload) {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []

  for (const key of ['history', 'growth_history', 'growthHistory', 'items', 'data']) {
    if (Array.isArray(payload[key])) return payload[key]
  }

  return []
}

function normalizeMailchimpGrowthHistoryItem(item = {}) {
  const imports = mailchimpNumberValue(item.imports)
  const optins = mailchimpNumberValue(item.optins)
  const unsubscribed = mailchimpNumberValue(
    item.unsubscribed ?? item.unsubscribes ?? item.unsubs,
  )
  const cleaned = mailchimpNumberValue(item.cleaned ?? item.cleans)
  const netNew =
    mailchimpNullableNumberValue(
      item.net_new ??
        item.netNew ??
        item.member_count_change ??
        item.memberCountChange ??
        item.growth,
    ) ?? imports + optins - unsubscribed - cleaned

  return {
    month: textValue(item.month),
    monthKey: mailchimpMonthKey(item.month),
    existing: mailchimpNullableNumberValue(item.existing),
    imports,
    optins,
    unsubscribed,
    cleaned,
    netNew,
  }
}

function emptyMailchimpAudiencePayload(listId = '') {
  return {
    isConfigured: Boolean(listId),
    listId,
    name: '',
    memberCount: null,
    growthHistory: [],
    currentGrowth: null,
  }
}

function normalizeMailchimpRate(value, fallbackRatio = null) {
  if (hasNumberLikeValue(value)) {
    const text = String(value)
    const number = parseMetricNumber(value)
    const percent = !text.includes('%') && Math.abs(number) <= 1 ? number * 100 : number
    return roundMailchimpNumber(percent)
  }

  if (typeof fallbackRatio === 'number' && Number.isFinite(fallbackRatio)) {
    return roundMailchimpNumber(fallbackRatio * 100)
  }

  return 0
}

function averageMailchimpRate(campaigns, field) {
  const values = campaigns
    .map((campaign) => Number(campaign[field] || 0))
    .filter((value) => Number.isFinite(value) && value > 0)
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0

  return roundMailchimpNumber(average)
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }

  const workers = Array.from(
    { length: Math.min(Math.max(1, limit), items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

function bestMailchimpCampaign(campaigns, field) {
  return campaigns.reduce((best, campaign) => {
    if (!best) return campaign
    return Number(campaign[field] || 0) > Number(best[field] || 0) ? campaign : best
  }, null)
}

function roundMailchimpNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.round(number * 10) / 10
}

function mailchimpNumberValue(value) {
  if (!hasNumberLikeValue(value)) return 0
  const number = typeof value === 'number' ? value : parseMetricNumber(value)
  return Number.isFinite(number) ? number : 0
}

function mailchimpNullableNumberValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = typeof value === 'number' ? value : parseMetricNumber(value)
  return Number.isFinite(number) ? number : null
}

function hasNumberLikeValue(value) {
  if (typeof value === 'number') return Number.isFinite(value)
  return /-?\d/.test(String(value || ''))
}

function previousMailchimpMonthLabel(month) {
  const range = coverageMonthDateRange(month)
  if (!range) return ''

  const current = new Date(`${range.from}Z`)
  current.setUTCMonth(current.getUTCMonth() - 1)
  return `${MONTHS[current.getUTCMonth()].split(' ')[0]} ${current.getUTCFullYear()}`
}

function mailchimpMonthKey(value) {
  const text = textValue(value)
  const isoMatch = text.match(/\b(20\d{2})-(\d{2})\b/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`

  const range = coverageMonthDateRange(text)
  return range ? range.from.slice(0, 7) : ''
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value || fallback)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.floor(number)))
}

async function listEventReports() {
  if (isDatabaseConfigured()) return listStoredEventReports()
  return readLocalEventReports()
}

async function createEventReport(report, userId) {
  const normalized = normalizeEventReportPayload(report)
  if (!normalized.name) {
    throw createHttpError(400, 'Назва звіту обовʼязкова.')
  }

  if (isDatabaseConfigured()) {
    return createStoredEventReport(normalized, userId)
  }

  const reports = await readLocalEventReports()
  const created = {
    ...normalized,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  }

  reports.unshift(created)
  await writeLocalEventReports(reports)
  return created
}

async function readLocalEventReports() {
  try {
    const content = await readFile(EVENT_REPORTS_FILE, 'utf8')
    const reports = JSON.parse(content)
    if (!Array.isArray(reports)) return []

    return reports
      .map(normalizeStoredEventReport)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

async function writeLocalEventReports(reports) {
  await mkdir(path.dirname(EVENT_REPORTS_FILE), { recursive: true })
  await writeFile(EVENT_REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf8')
}

function normalizeStoredEventReport(report) {
  return {
    ...normalizeEventReportPayload(report),
    id: String(report.id || randomUUID()),
    createdAt: String(report.createdAt || new Date().toISOString()),
  }
}

function normalizeEventReportPayload(report = {}) {
  const type = ['event', 'partnership', 'launch'].includes(report.type) ? report.type : 'event'
  const isEvent = type === 'event'
  const isPartnership = type === 'partnership'
  const isLaunch = type === 'launch'
  const dateMode =
    report.dateMode === 'single' || report.dateMode === 'period'
      ? report.dateMode
      : eventReportDefaultDateMode(type)
  const promoEnabled = isLaunch ? booleanValue(report.promoEnabled) : isEvent
  const tgEnabled = isLaunch ? booleanValue(report.tgEnabled) : false
  const hireEnabled = isPartnership ? booleanValue(report.hireEnabled) : false
  const rawViews = report.views ?? report.partnershipViews
  const rawClicks = report.clicks ?? report.partnershipClicks
  const reachUniverse = isLaunch ? numberValue(report.reachUniverse) : 0
  const reachClevel = isLaunch ? numberValue(report.reachClevel) : 0
  const reachMedia = isLaunch ? numberValue(report.reachMedia ?? report.mediaReach) : 0
  const tgReach = tgEnabled ? numberValue(report.tgReach) : 0
  const reachPartsTotal = reachUniverse + reachClevel + reachMedia + tgReach
  const legacyReachTotal = numberValue(report.reachTotal ?? report.totalReach)
  const linkClicks = isLaunch
    ? numberValue(report.linkClicks) || numberValue(report.clicks)
    : 0

  return {
    type,
    dateMode,
    name: textValue(report.name),
    date: textValue(report.date),
    dateStart: textValue(report.dateStart),
    dateEnd: textValue(report.dateEnd),
    description: textValue(report.description),
    goalText: textValue(report.goalText),
    leadsGoogle: isEvent ? numberValue(report.leadsGoogle) : 0,
    leadsMeta: isEvent ? numberValue(report.leadsMeta) : 0,
    confirmed: isEvent ? numberValue(report.confirmed) : 0,
    attended: isEvent ? numberValue(report.attended) : 0,
    teamCount: isEvent ? numberValue(report.teamCount) : 0,
    partnershipCost: isPartnership ? numberValue(report.partnershipCost) : 0,
    episodes: isPartnership ? numberValue(report.episodes) : 0,
    views: isPartnership ? numberValue(rawViews) : 0,
    clicks: isPartnership ? numberValue(rawClicks) : 0,
    hireEnabled,
    hireCount: hireEnabled ? numberValue(report.hireCount) : 0,
    promoEnabled,
    campaigns: promoEnabled && Array.isArray(report.campaigns)
      ? report.campaigns.map(normalizeEventCampaign)
      : [],
    promoSpendUsd: isEvent ? numberValue(report.promoSpendUsd) : 0,
    orgSpendUsd: isEvent ? numberValue(report.orgSpendUsd) : 0,
    mediaMentions: numberValue(report.mediaMentions),
    channels: isEvent ? textValue(report.channels) : '',
    engagement: isEvent ? textValue(report.engagement) : '',
    reachTotal: isLaunch ? reachPartsTotal || legacyReachTotal : 0,
    reachUniverse,
    reachClevel,
    reachMedia,
    linkClicks,
    productResultType: isLaunch ? textValue(report.productResultType) : '',
    productResultValue: isLaunch ? numberValue(report.productResultValue) : 0,
    productResultNote: isLaunch ? textValue(report.productResultNote) : '',
    tgEnabled,
    tgChannels: tgEnabled ? numberValue(report.tgChannels) : 0,
    tgCost: tgEnabled ? numberValue(report.tgCost) : 0,
    tgReach,
    tgPosts: tgEnabled ? numberValue(report.tgPosts) : 0,
    tgChannelList: tgEnabled ? textValue(report.tgChannelList) : '',
    otherSpendUsd: isLaunch ? numberValue(report.otherSpendUsd) : 0,
    budgetOverride: isLaunch ? nullableNumberValue(report.budgetOverride) : null,
    resources: isLaunch && Array.isArray(report.resources)
      ? report.resources.map(normalizeEventResource).filter((resource) => resource.name || resource.url)
      : [],
    feedback: isEvent ? textValue(report.feedback) : '',
    notes: isEvent ? textValue(report.notes) : '',
    aiSummary: textValue(report.aiSummary),
    aiInsights: Array.isArray(report.aiInsights)
      ? report.aiInsights.map(textValue).filter(Boolean)
      : [],
    aiPlanFact: textValue(report.aiPlanFact),
  }
}

function eventReportDefaultDateMode(type) {
  return type === 'event' ? 'single' : 'period'
}

function normalizeEventCampaign(campaign = {}) {
  return {
    name: textValue(campaign.name),
    ctype: campaign.ctype === 'Leads' ? 'Leads' : 'Clicks',
    spendEur: numberValue(campaign.spendEur),
    result: numberValue(campaign.result),
    clicks: numberValue(campaign.clicks),
    impressions: numberValue(campaign.impressions),
    reach: numberValue(campaign.reach),
  }
}

function normalizeEventResource(resource = {}) {
  return {
    name: textValue(resource.name),
    url: normalizeExternalUrl(resource.url),
  }
}

function textValue(value) {
  return String(value || '').trim()
}

function numberValue(value) {
  if (value === '' || value === null || value === undefined) return 0
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function nullableNumberValue(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function booleanValue(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

async function generateEventReportAi(facts) {
  const preferredProvider = String(process.env.EVENT_REPORTS_AI_PROVIDER || '')
    .trim()
    .toLowerCase()
  const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY

  if (preferredProvider !== 'anthropic' && process.env.OPENROUTER_API_KEY) {
    return generateEventReportViaOpenRouter(facts)
  }

  if (anthropicKey) {
    return generateEventReportViaAnthropic(facts, anthropicKey)
  }

  throw createHttpError(
    503,
    'AI-ключ не налаштований. Додайте OPENROUTER_API_KEY або ANTHROPIC_API_KEY у змінні середовища.',
  )
}

async function generateEventReportViaAnthropic(facts, apiKey) {
  const anthropic = new Anthropic({ apiKey })
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    max_tokens: 1200,
    temperature: 0.2,
    system: eventReportAiSystemPrompt(),
    messages: [
      {
        role: 'user',
        content: eventReportAiUserPrompt(facts),
      },
    ],
  })

  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  return parseEventReportAiResponse(text)
}

async function generateEventReportViaOpenRouter(facts) {
  const apiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_BASE_URL || 'http://localhost:5173',
      'X-OpenRouter-Title': 'Comms Tool',
    },
    body: JSON.stringify({
      model:
        process.env.OPENROUTER_MODEL ||
        process.env.ANTHROPIC_MODEL ||
        'anthropic/claude-sonnet-4.6',
      max_tokens: 1200,
      temperature: 0.2,
      messages: [
        { role: 'system', content: eventReportAiSystemPrompt() },
        { role: 'user', content: eventReportAiUserPrompt(facts) },
      ],
    }),
  })

  if (!apiResponse.ok) {
    throw createHttpError(
      502,
      'OpenRouter не згенерував текст звіту.',
      await apiResponse.text(),
    )
  }

  const payload = await apiResponse.json()
  const content = payload.choices?.[0]?.message?.content || ''
  return parseEventReportAiResponse(content)
}

function eventReportAiSystemPrompt() {
  return [
    'Ти senior Communications/PR аналітик. Пиши українською, дуже стисло, business-facing і по факту.',
    'Критичне правило: не рахуй, не перераховуй і не вигадуй жодних чисел. Усі числові метрики вже пораховані кодом у facts. Використовуй числа тільки з facts або пропускай їх.',
    'Не додавай загальних фраз, води чи очевидних висновків без опори на facts.',
    'Поверни тільки валідний JSON без markdown, пояснень чи code fence.',
    'Схема відповіді: {"summary":"1-2 речення executive summary","insights":["2-3 короткі фактичні інсайти"],"planFact":"1 коротке речення про результат відносно цілі/контексту"}',
    'Якщо даних мало, чесно напиши про обмеження даних без вигаданих висновків.',
  ].join('\n')
}

function eventReportAiUserPrompt(facts) {
  return `Facts JSON, precomputed by code:\n${JSON.stringify(facts, null, 2)}`
}

function parseEventReportAiResponse(text) {
  const json = parseJsonObject(text)

  return {
    summary: textValue(json.summary),
    insights: Array.isArray(json.insights)
      ? json.insights.map(textValue).filter(Boolean).slice(0, 3)
      : [],
    planFact: textValue(json.planFact),
  }
}

function parseJsonObject(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')

    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        throw createHttpError(502, 'AI повернув невалідний JSON.')
      }
    }

    throw createHttpError(502, 'AI повернув невалідний JSON.')
  }
}

app.get('/api/health', asyncHandler(async (_request, response) => {
  response.json({
    ok: true,
    service: 'Comms Tool',
    database: await getDatabaseStatus(),
    auth: authStatus(),
    integrations: {
      notion: Boolean(process.env.NOTION_TOKEN),
      googleSheetsServiceAccount: hasGoogleServiceAccountCredentials(),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY),
      openRouter: Boolean(process.env.OPENROUTER_API_KEY),
      looqmeTokenPresent: Boolean(process.env.LOOQME_TOKEN),
      mailchimpTokenPresent: Boolean(
        process.env.MAILCHIMP_API_KEY || process.env.MAILCHIMP_TOKEN,
      ),
    },
  })
}))

app.use('/api', requireAuth)

app.get('/api/kpi-goals', asyncHandler(async (_request, response) => {
  response.json(await getMergedKpiPayload())
}))

app.get('/api/notion/kpi-goals', asyncHandler(async (_request, response) => {
  response.json(await getMergedKpiPayload())
}))

app.post('/api/notion/goals', requireAuth, asyncHandler(async (request, response) => {
  if (isDatabaseConfigured()) {
    const goal = await insertStoredKpiGoal(request.body, request.user?.id)
    response.status(201).json({ goal: normalizeStoredKpiGoal(goal) })
    return
  }

  if (shouldReadKpiFromGoogleSheet()) {
    await createGoogleSheetGoal(request.body)
    response.status(201).json({ ok: true })
    return
  }

  const notion = getNotion()
  const databaseId = getDatabaseId('NOTION_KPI_DB', 'KPI цілей')
  const goal = request.body
  const schema = await getDataSourceSchema(databaseId)
  const properties = buildGoalProperties(schema, goal)

  const page = await notion.pages.create({
    parent: await dataSourceParent(databaseId),
    properties,
  })

  response.status(201).json({ goal: normalizeGoal(page) })
}))

app.patch('/api/notion/goals/:id', requireAuth, asyncHandler(async (request, response) => {
  if (isDatabaseConfigured()) {
    let goal = await updateStoredKpiGoalValue(request.params.id, request.body, request.user?.id)

    if (!goal) {
      const externalPayload = await getExternalKpiPayload()
      const externalGoal = externalPayload.goals.find((item) => item.id === request.params.id)

      if (!externalGoal) {
        throw createHttpError(404, 'Не знайшов KPI для оновлення.')
      }

      const storedGoal = await upsertStoredKpiGoalFromExternal(
        externalGoal,
        legacyKpiSource(externalGoal),
        request.user?.id,
      )
      goal = await updateStoredKpiGoalValue(storedGoal.id, request.body, request.user?.id)
    }

    response.json({ goal: normalizeStoredKpiGoal(goal) })
    return
  }

  if (shouldReadKpiFromGoogleSheet()) {
    const goal = await updateGoogleSheetGoalValue(request.params.id, request.body)
    response.json({ goal })
    return
  }

  const notion = getNotion()
  const { month, value } = request.body
  const page = await notion.pages.retrieve({ page_id: request.params.id })
  const goal = normalizeGoal(page)
  const values = { ...(goal.values || {}), [month]: value }
  const numericValue = parseMetricNumber(value)
  const isNumeric = /-?\d/.test(String(value || ''))
  const monthProperty = MONTH_PROPERTY_NAMES[month]

  const properties = {}

  if (monthProperty && page.properties?.[monthProperty]) {
    properties[monthProperty] = richTextProperty(value)
  } else if (page.properties?.MetricValues) {
    properties.MetricValues = richTextProperty(JSON.stringify(values))
  }

  if (isNumeric && page.properties?.CurrentValue) {
    properties.CurrentValue = numberProperty(numericValue)
  } else if (!isNumeric && page.properties?.CurrentStatus) {
    properties.CurrentStatus = richTextProperty(value)
  }

  if (!Object.keys(properties).length) {
    throw createHttpError(
      400,
      'Не знайшов колонку для оновлення значення. Перевірте, що в KPI database є місячні колонки або MetricValues.',
    )
  }

  const updated = await notion.pages.update({
    page_id: request.params.id,
    properties,
  })

  response.json({ goal: normalizeGoal(updated) })
}))

app.get('/api/notion/monthly-focus', asyncHandler(async (request, response) => {
  const month = request.query.month
  response.json(await getMergedMonthlyFocusPayload(month))
}))

app.post('/api/notion/monthly-focus', requireAuth, asyncHandler(async (request, response) => {
  if (isDatabaseConfigured()) {
    const entry = await saveStoredMonthlyFocusEntry(request.body, request.user?.id)
    response.json({ entry, focusDatabaseId: 'app-db' })
    return
  }

  const notion = getNotion()
  const databaseId = await getFocusDatabaseId()
  const body = request.body
  const schema = await getDataSourceSchema(databaseId)
  const title =
    body.title ||
    body.name ||
    `${body.month || 'Місяць'} · ${body.team || body.direction || 'Команда'}`
  const metric = [body.metricType ? `[${body.metricType}]` : '', body.metric]
    .filter(Boolean)
    .join(' ')
  const status = normalizeFocusStatus(body.status, Boolean(body.achieved))
  const notionStatus = schemaStatusOptionName(schema, ['Status', 'Статус'], status)

  const properties = {}
  addTitleProperty(properties, schema, ['Name', 'Назва', 'Title'], title)
  addSelectProperty(properties, schema, ['Month', 'Місяць'], body.months || body.month)
  addSelectProperty(
    properties,
    schema,
    ['Team', 'Direction', 'Напрямок', 'Команда'],
    body.team || body.direction,
  )
  addOwnerProperty(
    properties,
    schema,
    ['Owner', 'Власник', 'Менеджер', 'Person', 'Відповідальний'],
    body.owner,
    body.ownerIds || body.ownerId,
  )
  addTextProperty(properties, schema, ['Metric', 'Метрика успіху', 'Criteria'], metric)
  addSelectProperty(properties, schema, ['Status', 'Статус'], notionStatus)
  addCheckboxProperty(
    properties,
    schema,
    ['Goal achieved', 'Виконано', 'Achieved', 'Done?'],
    status === 'Виконано',
  )
  addTextProperty(
    properties,
    schema,
    ['Comment', 'Коментар', 'Notes', 'Нотатки'],
    body.comment,
  )

  addTextProperty(properties, schema, ['Done', 'Що виконано'], body.done)
  addTextProperty(properties, schema, ['NotDone', 'Що НЕ виконано'], body.notDone)
  addTextProperty(properties, schema, ['Pains', 'Болі'], body.pains)
  addTextProperty(
    properties,
    schema,
    ['NextPriorities', 'Пріоритети'],
    body.nextPriorities,
  )
  addTextProperty(
    properties,
    schema,
    ['LinkedGoals'],
    JSON.stringify(body.linkedGoalIds || []),
  )
  addTextProperty(
    properties,
    schema,
    ['MetricValues'],
    JSON.stringify(body.metricValues || {}),
  )

  const page = body.id
    ? await notion.pages.update({ page_id: body.id, properties })
    : await notion.pages.create({
        parent: await dataSourceParent(databaseId),
        properties,
      })

  response.json({ entry: normalizeFocus(page), focusDatabaseId: databaseId })
}))

app.get('/api/notion/events', asyncHandler(async (request, response) => {
  const calendarDatabaseId = getDatabaseId('NOTION_EVENTS_DB', 'Events')
  const activitiesDatabaseId = process.env.NOTION_ACTIVITIES_DB
  const month = request.query.month

  const [calendarPages, activityPages] = await Promise.all([
    queryAllDatabase(calendarDatabaseId),
    activitiesDatabaseId ? queryAllDatabase(activitiesDatabaseId) : Promise.resolve([]),
  ])

  const calendarEvents = calendarPages.map(normalizeCalendarEvent).filter((event) => {
    const matchesMonth = month ? eventMatchesMonth(event, month) : Boolean(event.rawDate)
    return matchesMonth
  })
  const activityEvents = activityPages.map(normalizeActivityEvent).filter((event) => {
    const matchesMonth = month ? eventMatchesMonth(event, month) : Boolean(event.rawDate)
    return matchesMonth
  })
  const events = mergeCalendarEventsWithActivities(calendarEvents, activityEvents)

  response.json({ events })
}))

app.get('/api/event-awareness', asyncHandler(async (request, response) => {
  const audiences = await Promise.all(
    EVENTS_AWARENESS_SHEETS.map(async (sheetName) => {
      const rows = await fetchPublicGoogleSheetCsv(
        EVENTS_AWARENESS_SPREADSHEET_ID,
        sheetName,
      )
      return parseEventAwarenessAudience(sheetName, rows)
    }),
  )
  const totalKnown = audiences.reduce((sum, item) => sum + item.known, 0)
  const totalResponses = audiences.reduce((sum, item) => sum + item.total, 0)

  response.json({
    sourceUrl: `https://docs.google.com/spreadsheets/d/${EVENTS_AWARENESS_SPREADSHEET_ID}/edit`,
    audiences,
    overall: {
      awareness: totalResponses ? totalKnown / totalResponses : null,
      known: totalKnown,
      total: totalResponses,
    },
  })
}))

app.get('/api/looqme/coverage', asyncHandler(async (request, response) => {
  const month = request.query.month
  const coverage = shouldUseLooqmeMock()
    ? mockLooqmeCoveragePayload(month)
    : await fetchLooqmeCoverage(month)

  response.json(await applyManualCompetitors(coverage, month))
}))

app.get('/api/mailchimp/campaigns', asyncHandler(async (request, response) => {
  response.json(await fetchMailchimpCampaignReports(request.query.month))
}))

app.get('/api/coverage/competitors', asyncHandler(async (request, response) => {
  response.json({ competitors: await getManualCompetitorMentions(request.query.month) })
}))

app.post('/api/coverage/competitors', requireAuth, asyncHandler(async (request, response) => {
  if (!isDatabaseConfigured()) {
    throw createHttpError(503, 'Для ручних конкурентів потрібен DATABASE_URL.')
  }

  const competitor = await createCompetitorCoverage(request.body, request.user?.id)
  response.status(201).json({ competitor })
}))

app.delete('/api/coverage/competitors/:id', requireAuth, asyncHandler(async (request, response) => {
  const deleted = await deleteCompetitorCoverage(request.params.id)
  response.json({ ok: deleted })
}))

app.get('/api/event-reports', asyncHandler(async (_request, response) => {
  response.json(await listEventReports())
}))

app.post('/api/event-reports', requireAuth, asyncHandler(async (request, response) => {
  const report = await createEventReport(request.body, request.user?.id)
  response.status(201).json(report)
}))

app.post('/api/event-reports/generate', requireAuth, asyncHandler(async (request, response) => {
  const facts = request.body?.facts

  if (!facts || typeof facts !== 'object' || Array.isArray(facts)) {
    throw createHttpError(400, 'Передайте facts із уже порахованими метриками.')
  }

  response.json(await generateEventReportAi(facts))
}))

app.post('/api/generate-report', asyncHandler(async (request, response) => {
  const {
    month,
    goals = [],
    focus = [],
    events = [],
    coverage = {},
    mailchimp = {},
  } = request.body
  const reportData = buildBoardReportData({
    month,
    goals,
    focus,
    events,
    coverage,
    mailchimp,
  })

  if (!process.env.ANTHROPIC_KEY) {
    response.json({
      report: renderBoardReport(reportData),
      source: 'mock',
    })
    return
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    max_tokens: 2400,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          'Згенеруй українською структурований Board Report для Communications.',
          'Це короткий board-facing звіт, а не повний список задач.',
          'Обовʼязковий формат: "## {Місяць} — підсумок", markdown-таблиця з кількісними показниками, "## Що зроблено", тематичні блоки, "## {Наступний місяць} — план".',
          'У summary-таблиці покажи виконуваність команди, органічний трафік якщо є, згадки у медіа, Instagram якщо є, івенти та контакти.',
          'Якщо є Mailchimp, додай email performance: кількість кампаній, open rate, click rate, CTOR, unsubscribe/bounce health і найсильнішу кампанію.',
          'У блоці "Медіа / PR" порівняй Universe Group із конкурентами з Looqme/SMM даних: що зробили ми, що видно по конкурентах, які прояви/медіа були помітні.',
          'У блоці "Події / EB" окремо зафіксуй кількість івентів, участь/організовані події та контакти.',
          'Використовуй Monthly Focus як контекст планів на місяць: додай важливі виконані результати та коротко познач незакриті фокуси тільки якщо є змістовний коментар або це важлива прогалина.',
          'Не генеруй окремі розділи "Що не виконано" і "Болі команди". Болі поки не виводимо в репорт, але поле може існувати в даних для майбутнього борду.',
          'Не дублюй пусті значення на кшталт "не зазначено" або "потрібно уточнити". Якщо даних бракує, сформулюй один короткий пункт про прогалину.',
          `Місяць: ${month}`,
          `Пораховані метрики для репорту: ${JSON.stringify(reportData)}`,
          `KPI goals: ${JSON.stringify(goals)}`,
          `Monthly focus: ${JSON.stringify(focus)}`,
          `Events: ${JSON.stringify(events)}`,
          `Media coverage: ${JSON.stringify(coverage)}`,
          `Mailchimp campaign reports: ${JSON.stringify(mailchimp)}`,
        ].join('\n\n'),
      },
    ],
  })

  const report = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  response.json({ report, source: 'anthropic' })
}))

app.post('/api/notion/board-report', requireAuth, asyncHandler(async (request, response) => {
  const { month, report } = request.body
  const storedReport = await createBoardReport(
    { month, report, source: 'app' },
    request.user?.id,
  )
  const parentPageId =
    process.env.NOTION_REPORTS_PARENT_PAGE_ID || process.env.NOTION_PARENT_PAGE_ID

  if (!parentPageId) {
    if (storedReport) {
      response.status(201).json({ reportId: storedReport.id, pageId: null })
      return
    }

    throw createHttpError(
      503,
      'Для збереження Board Report додайте NOTION_REPORTS_PARENT_PAGE_ID або NOTION_PARENT_PAGE_ID.',
    )
  }

  const notion = getNotion()
  const page = await notion.pages.create({
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: titleProperty(`Board Report · ${month}`),
    },
    children: reportToBlocks(report),
  })

  if (storedReport) {
    await updateBoardReportNotionPage(storedReport.id, page.id)
  }

  response.status(201).json({ reportId: storedReport?.id || null, pageId: page.id })
}))

function buildBoardReportData({ month, goals, focus, events, coverage, mailchimp }) {
  const goalCompletion = buildGoalCompletionSummary(goals, month)
  const coverageSummary = buildCoverageReportSummary(coverage)
  const mailchimpSummary = buildMailchimpReportSummary(mailchimp)
  const eventSummary = buildEventReportSummary(events)
  const organicTraffic = buildGoalMetricSummary(
    goals,
    ['органіч', 'organic', 'трафік'],
    month,
  )
  const instagram = buildGoalMetricSummary(
    goals,
    ['instagram', 'інстаграм', 'ig'],
    month,
  )
  const mediaMentions = buildMediaMentionsSummary(
    goals,
    coverageSummary,
    month,
  )
  const focusSections = buildFocusSections(focus)

  const reportData = {
    month,
    monthName: reportMonthName(month),
    nextMonthName: reportNextMonthName(month),
    goalCompletion,
    organicTraffic,
    instagram,
    mediaMentions,
    coverage: coverageSummary,
    mailchimp: mailchimpSummary,
    events: eventSummary,
    focusSections,
  }

  return {
    ...reportData,
    summaryRows: buildBoardSummaryRows(reportData),
    sections: buildBoardDoneSections(reportData),
    planLines: buildNextMonthPlanLines(focus),
  }
}

function renderBoardReport(reportData) {
  const lines = [
    `## ${reportData.monthName} — підсумок`,
    '',
    '|  |  |',
    '| --- | --- |',
    ...reportData.summaryRows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    '## Що зроблено',
    '',
  ]

  const sections = reportData.sections.filter((section) => section.lines.length)
  if (sections.length) {
    sections.forEach((section, index) => {
      if (index) lines.push('')
      lines.push(`**${section.title}.**`, '')
      section.lines.forEach((line) => lines.push(`- ${line}`))
    })
  } else {
    lines.push('- Дані по фокусах, медіа та івентах ще не заповнені.')
  }

  lines.push('', `## ${reportData.nextMonthName} — план`, '')
  reportData.planLines.forEach((line) => lines.push(`- ${line}`))

  return lines.join('\n')
}

function buildBoardSummaryRows(reportData) {
  const rows = [
    [
      'Виконуваність команди',
      `**${reportData.goalCompletion.percent}%** — ${reportData.goalCompletion.completed} із ${reportData.goalCompletion.total} цілей`,
    ],
  ]

  if (reportData.organicTraffic) {
    rows.push([
      'Органічний трафік',
      formatGoalMetricForTable(reportData.organicTraffic),
    ])
  }

  rows.push(['Згадки у медіа', formatMediaMentionsForTable(reportData)])

  if (reportData.instagram) {
    rows.push(['Instagram', formatInstagramForTable(reportData.instagram)])
  }

  if (reportData.mailchimp.campaigns) {
    rows.push(['Email / Mailchimp', formatMailchimpForTable(reportData.mailchimp)])
  }

  rows.push([
    'Івенти',
    `**${reportData.events.total}** ${activityLabel(
      reportData.events.total,
    )} — організовано ${reportData.events.organized}, участь у ${reportData.events.participated}`,
  ])
  rows.push([
    'Контакти',
    `**${formatReportNumber(reportData.events.contacts)}** зібрано`,
  ])

  return rows
}

function buildBoardDoneSections(reportData) {
  const { focusSections, coverage, events, instagram, mailchimp } = reportData

  return [
    {
      title: 'Бренд / позиціонування',
      lines: focusBullets(focusSections.brand),
    },
    {
      title: 'Founders Flow',
      lines: focusBullets(focusSections.founders),
    },
    {
      title: 'Медіа / PR (тотал кавередж за місяць і тональність)',
      lines: [
        ...coverageBullets(coverage),
        ...focusBullets(focusSections.media),
      ],
    },
    {
      title: 'Події / EB',
      lines: [
        ...eventBullets(events),
        ...focusBullets(focusSections.events),
      ],
    },
    {
      title: 'Email / Mailchimp',
      lines: mailchimpBullets(mailchimp),
    },
    {
      title: 'SMM',
      lines: [
        ...smmBullets(instagram, coverage),
        ...focusBullets(focusSections.smm),
      ],
    },
    {
      title: 'Інше',
      lines: focusBullets(focusSections.other),
    },
  ]
}

function buildGoalCompletionSummary(goals, month) {
  const total = goals.length
  const completed = goals.filter((goal) => goalProgressForReport(goal, month) >= 100)
    .length

  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
  }
}

function buildGoalMetricSummary(goals, keywords, month) {
  const goal = findGoalByKeywords(goals, keywords)
  if (!goal) return null

  const current = goalValueForReport(goal, month)
  const target = parseMetricNumber(goal.target)

  return {
    title: goal.title,
    current,
    target,
    hasCurrent: hasGoalValueForReport(goal, month),
    done: target ? current >= target : false,
  }
}

function buildMediaMentionsSummary(goals, coverageSummary, month) {
  const goal = findGoalByKeywords(goals, ['медіа', 'згад', 'looqme', 'coverage'])
  const goalCurrent = goal ? goalValueForReport(goal, month) : 0
  const target = goal ? parseMetricNumber(goal.target) : 0
  const ownCurrent = coverageSummary.ownTotal
  const totalCurrent = coverageSummary.mentionsMetric.value
  const current = ownCurrent || totalCurrent || goalCurrent

  return {
    current,
    target,
    basis: ownCurrent ? 'Universe Group' : 'загалом',
    done: target ? current >= target : false,
  }
}

function buildCoverageReportSummary(coverage = {}) {
  const mentions = (coverage.mentions || []).map((item) => ({
    brand: item.brand || item.name || 'Бренд',
    count: Number(item.count ?? item.mentions ?? item.value ?? 0),
    reach: parseReachNumber(
      item.reach ?? item.audience ?? item.totalReach ?? item.totalAudience,
    ),
    note: cleanReportText(item.note || item.summary || item.topic),
  }))
  const own = mentions.filter((item) => isOwnBrand(item.brand))
  const competitors = mentions.filter((item) => !isOwnBrand(item.brand))
  const ownTotal = own.reduce((sum, item) => sum + item.count, 0)
  const competitorTotal = competitors.reduce((sum, item) => sum + item.count, 0)
  const mentionsMetric = normalizeCoverageMetric(coverage.mentionsMetric, {
    value: ownTotal + competitorTotal,
    segments: [
      {
        label: 'ЗМІ(Медіа)',
        value: coverage.mentionsByChannel?.media,
        delta: coverage.mentionsByChannel?.mediaDelta,
      },
      {
        label: 'Соціальні мережі',
        value: coverage.mentionsByChannel?.social,
        delta: coverage.mentionsByChannel?.socialDelta,
      },
    ],
  })
  const audienceMetric = normalizeCoverageMetric(coverage.audienceMetric, {
    value: coverage.totalReach ?? coverage.totalAudience ?? coverage.audience?.total,
    segments: [
      {
        label: 'ЗМІ',
        value: coverage.audience?.media,
        delta: coverage.audience?.mediaDelta,
      },
      {
        label: 'Соцмережі',
        value: coverage.audience?.social,
        delta: coverage.audience?.socialDelta,
      },
    ],
  })
  const totalReach =
    audienceMetric.value ||
    mentions.reduce((sum, item) => sum + item.reach, 0)
  const outlets = getCoverageOutlets(coverage)
  const sentiment = normalizeSentiment(coverage.sentiment)

  return {
    own,
    competitors,
    ownTotal,
    competitorTotal,
    mentionsMetric,
    audienceMetric: { ...audienceMetric, value: totalReach },
    totalReach,
    outlets,
    sentiment,
  }
}

function buildMailchimpReportSummary(mailchimp = {}) {
  const metrics = mailchimp.metrics || {}
  const campaigns = Array.isArray(mailchimp.campaigns) ? mailchimp.campaigns : []
  const bestOpenCampaign = metrics.bestOpenCampaign || bestMailchimpCampaign(
    campaigns,
    'openRate',
  )

  return {
    campaigns: Number(metrics.campaigns || campaigns.length || 0),
    emailsSent: Number(metrics.emailsSent || 0),
    delivered: Number(metrics.delivered || 0),
    openRate: normalizeMailchimpRate(metrics.openRate),
    clickRate: normalizeMailchimpRate(metrics.clickRate),
    clickToOpenRate: normalizeMailchimpRate(metrics.clickToOpenRate),
    uniqueOpens: Number(metrics.uniqueOpens || 0),
    uniqueSubscriberClicks: Number(metrics.uniqueSubscriberClicks || 0),
    unsubscribed: Number(metrics.unsubscribed || 0),
    unsubscribeRate: normalizeMailchimpRate(metrics.unsubscribeRate),
    totalBounces: Number(metrics.totalBounces || 0),
    bounceRate: normalizeMailchimpRate(metrics.bounceRate),
    abuseReports: Number(metrics.abuseReports || 0),
    bestOpenCampaign,
    latestCampaign: metrics.latestCampaign || campaigns[0] || null,
    topCampaigns: campaigns.slice(0, 5),
  }
}

function buildEventReportSummary(events = []) {
  const organizedEvents = events.filter(isOrganizedEvent)
  const participatedEvents = events.filter((event) => !isOrganizedEvent(event))

  return {
    total: events.length,
    organized: organizedEvents.length,
    participated: participatedEvents.length,
    contacts: events.reduce((sum, event) => sum + Number(event.contacts || 0), 0),
    organizedTitles: organizedEvents.map((event) => cleanReportText(event.title)),
    participatedTitles: participatedEvents.map((event) => cleanReportText(event.title)),
    titles: events.map((event) => cleanReportText(event.title)),
  }
}

function buildFocusSections(focus = []) {
  const sections = {
    brand: [],
    founders: [],
    media: [],
    events: [],
    smm: [],
    other: [],
  }

  focus.forEach((entry) => {
    sections[focusSectionKey(entry)].push(entry)
  })

  return sections
}

function buildNextMonthPlanLines(focus = []) {
  const explicitPlans = uniqueReportLines(
    focus
      .filter((entry) => isMeaningfulReportText(entry.nextPriorities))
      .map(
        (entry) =>
          `**${focusPlanTitle(entry)}.** ${cleanReportText(entry.nextPriorities, 220)}`,
      ),
  )
  const openFocus = focus.filter(
    (entry) => !entry.achieved && !isMeaningfulReportText(entry.nextPriorities),
  )

  if (explicitPlans.length) {
    const lines = explicitPlans.slice(0, 8)
    if (openFocus.length && lines.length < 8) {
      lines.push(
        `**Незакриті фокуси.** ${formatTitleList(openFocus, 5)} — узгодити статус і наступний крок.`,
      )
    }
    return lines
  }

  if (openFocus.length) {
    return [
      `**Незакриті фокуси.** ${formatTitleList(openFocus, 7)} — перенести або закрити після синку з власниками.`,
    ]
  }

  return ['План наступного місяця ще не заповнений у Monthly Focus.']
}

function focusBullets(entries = []) {
  const doneLines = entries
    .filter((entry) => entry.achieved || isMeaningfulReportText(entry.done))
    .map(formatDoneFocusLine)
    .filter(Boolean)
  const openWithDetails = entries
    .filter(
      (entry) =>
        !entry.achieved &&
        (isMeaningfulReportText(entry.notDone) || isMeaningfulReportText(entry.comment)),
    )
    .map(formatOpenFocusLine)
    .filter(Boolean)
  const openWithoutDetails = entries.filter(
    (entry) =>
      !entry.achieved &&
      !isMeaningfulReportText(entry.notDone) &&
      !isMeaningfulReportText(entry.comment),
  )
  const lines = uniqueReportLines([
    ...doneLines.slice(0, 6),
    ...openWithDetails.slice(0, 3),
  ])

  if (!lines.length && openWithoutDetails.length) {
    lines.push(
      `У фокусі місяця: ${formatTitleList(openWithoutDetails, 4)}. Результат потребує уточнення.`,
    )
  } else if (openWithoutDetails.length && lines.length < 6) {
    lines.push(`Потребує уточнення: ${formatTitleList(openWithoutDetails, 3)}.`)
  }

  return lines
}

function coverageBullets(coverage) {
  const lines = []
  const channelLine = formatCoverageChannels(coverage.mentionsMetric)
  const audienceLine = coverage.audienceMetric.value
    ? `аудиторія джерел — ${formatReachShort(coverage.audienceMetric.value)}${formatCoverageChannels(
        coverage.audienceMetric,
        ' (',
        ')',
        formatReachShort,
      )}`
    : ''

  if (coverage.mentionsMetric.value || channelLine || audienceLine) {
    lines.push(
      [
        coverage.mentionsMetric.value
          ? `медіа / соцмережі — ${formatReportNumber(
              coverage.mentionsMetric.value,
            )} медіазгадок`
          : 'медіа / соцмережі',
        channelLine,
        audienceLine,
      ]
        .filter(Boolean)
        .join('; '),
    )
  }

  if (coverage.ownTotal || coverage.competitorTotal) {
    lines.push(
      `Universe Group: ${formatReportNumber(
        coverage.ownTotal,
      )} згадок; конкуренти: ${formatCompetitorsLine(coverage.competitors)}.`,
    )
  }

  if (coverage.sentiment.length) {
    lines.push(`Тональність: ${formatSentimentLine(coverage.sentiment)}.`)
  }

  if (coverage.outlets.length) {
    lines.push(`Ключові медіа: ${formatOutletsLine(coverage.outlets)}.`)
  }

  return lines
}

function eventBullets(events) {
  if (!events.total) return []

  const lines = [
    `івенти — ${events.total} ${activityLabel(
      events.total,
    )}: організували ${events.organized}, взяли участь у ${events.participated}.`,
    `кількість контактів, яких зібрали: ${formatReportNumber(events.contacts)}.`,
  ]

  if (events.titles.length) {
    lines.push(`Активності місяця: ${formatTextList(events.titles, 6)}.`)
  }

  return lines
}

function smmBullets(instagram, coverage) {
  const lines = []
  const socialSegment = (coverage.mentionsMetric.segments || []).find((segment) =>
    /соц|social/i.test(segment.label),
  )

  if (instagram) {
    lines.push(`Instagram: ${formatInstagramForTable(instagram)}.`)
  }

  if (socialSegment?.value) {
    lines.push(
      `Соціальні мережі в Looqme: ${formatReportNumber(
        socialSegment.value,
      )} згадок${formatDelta(socialSegment.delta)}.`,
    )
  }

  return lines
}

function mailchimpBullets(mailchimp) {
  if (!mailchimp.campaigns) return []

  const lines = [
    `Email-кампанії: ${formatReportNumber(mailchimp.campaigns)}; надіслано ${formatReportNumber(
      mailchimp.emailsSent,
    )}; open rate ${formatReportPercent(mailchimp.openRate)}, click rate ${formatReportPercent(
      mailchimp.clickRate,
    )}, CTOR ${formatReportPercent(mailchimp.clickToOpenRate)}.`,
  ]

  if (mailchimp.unsubscribed || mailchimp.totalBounces) {
    lines.push(
      `List health: unsubscribe rate ${formatReportPercent(
        mailchimp.unsubscribeRate,
      )}, bounce rate ${formatReportPercent(mailchimp.bounceRate)}.`,
    )
  }

  if (mailchimp.bestOpenCampaign?.title) {
    lines.push(
      `Найвищий open rate: ${cleanReportText(
        mailchimp.bestOpenCampaign.title,
        120,
      )} — ${formatReportPercent(mailchimp.bestOpenCampaign.openRate)}.`,
    )
  }

  const campaignLines = mailchimp.topCampaigns
    .filter((campaign) => campaign.title)
    .slice(0, 3)
    .map(
      (campaign) =>
        `${cleanReportText(campaign.title, 80)} (${formatReportPercent(
          campaign.openRate,
        )} OR / ${formatReportPercent(campaign.clickRate)} CR)`,
    )

  if (campaignLines.length) {
    lines.push(`Кампанії місяця: ${campaignLines.join('; ')}.`)
  }

  return lines
}

function formatGoalMetricForTable(metric) {
  const value = metric.hasCurrent
    ? `**${formatReportNumber(metric.current)}**`
    : '**даних немає**'
  const target = metric.target
    ? ` — ціль ${formatReportNumber(metric.target)} ${metric.done ? '✅' : '⚠️'}`
    : ''

  return `${value}${target}`
}

function formatInstagramForTable(metric) {
  const value = metric.hasCurrent
    ? `**${formatReportNumber(metric.current)}** підписників`
    : '**даних немає**'
  const target = metric.target
    ? ` → ціль ${formatReportNumber(metric.target)} за рік`
    : ''

  return `${value}${target}`
}

function formatMediaMentionsForTable(reportData) {
  const { mediaMentions, coverage } = reportData
  const target = mediaMentions.target
    ? ` — ціль ${formatReportNumber(mediaMentions.target)} ${
        mediaMentions.done ? '✅' : '⚠️'
      }`
    : ''
  const competitors = coverage.competitors.length
    ? ` · конкуренти: ${formatCompetitorsLine(coverage.competitors)}`
    : ''

  return `**${formatReportNumber(mediaMentions.current)}** медіазгадок ${
    mediaMentions.basis
  }${target}${competitors}`
}

function formatMailchimpForTable(mailchimp) {
  return `**${formatReportPercent(mailchimp.openRate)}** open rate · click rate ${formatReportPercent(
    mailchimp.clickRate,
  )} · CTOR ${formatReportPercent(mailchimp.clickToOpenRate)} · ${formatReportNumber(
    mailchimp.campaigns,
  )} кампаній / ${formatReportNumber(mailchimp.emailsSent)} sent`
}

function formatDoneFocusLine(entry) {
  const title = cleanReportText(entry.title || entry.name, 120)
  const result =
    firstMeaningfulText(entry.done, entry.comment) ||
    (entry.metric ? cleanReportText(entry.metric, 180) : '')

  if (result && result.toLowerCase() !== title.toLowerCase()) {
    return withFinalPeriod(`${title} — ${result}`)
  }

  return title ? withFinalPeriod(title) : ''
}

function formatOpenFocusLine(entry) {
  const title = cleanReportText(entry.title || entry.name, 120)
  const detail = firstMeaningfulText(entry.notDone, entry.comment)

  return title && detail ? withFinalPeriod(`${title} — ${detail}`) : ''
}

function focusSectionKey(entry) {
  const team = String(entry.team || entry.direction || '').toLowerCase()
  const text = `${entry.title || ''} ${entry.done || ''} ${entry.comment || ''} ${
    entry.metric || ''
  }`.toLowerCase()

  if (/founders?|фаундер|стартап/.test(text)) return 'founders'
  if (team.includes('smm') || /tiktok|tik tok|instagram|telegram|телеграм/.test(text)) {
    return 'smm'
  }
  if (team.includes('brand') || /бренд|айдентик|banda|позиціон|сайт|dou/.test(text)) {
    return 'brand'
  }
  if (team.includes('eb') || /івент|event|ярмарк|карʼєр|кар'єр|career|open day/.test(text)) {
    return 'events'
  }
  if (team.includes('pr') || /медіа|статт|подкаст|реліз|комунікац|лонч/.test(text)) {
    return 'media'
  }

  return 'other'
}

function goalProgressForReport(goal, month) {
  if (goal.metricType === 'Якісна') {
    return isDoneValue(latestGoalValueForReport(goal, month)) ? 100 : 0
  }

  const target = parseMetricNumber(goal.target)
  const current = goalValueForReport(goal, month)

  if (!target) return 0
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)))
}

function goalValueForReport(goal, month) {
  if (goal.metricType === 'Накопичувальна') {
    return sumGoalValuesUntilReportMonth(goal, month)
  }

  return parseMetricNumber(latestGoalValueForReport(goal, month))
}

function hasGoalValueForReport(goal, month) {
  return String(latestGoalValueForReport(goal, month) ?? '').trim() !== ''
}

function latestGoalValueForReport(goal, month) {
  const values = goal.values || {}
  const selectedIndex = MONTHS.indexOf(month)
  const monthsToCheck =
    selectedIndex >= 0 ? MONTHS.slice(0, selectedIndex + 1).reverse() : [...MONTHS].reverse()
  const foundMonth = monthsToCheck.find((item) => String(values[item] ?? '').trim())

  return foundMonth ? values[foundMonth] : goal.currentValue
}

function sumGoalValuesUntilReportMonth(goal, month) {
  const values = goal.values || {}
  const selectedIndex = MONTHS.indexOf(month)
  const monthsToCheck = selectedIndex >= 0 ? MONTHS.slice(0, selectedIndex + 1) : MONTHS

  return monthsToCheck.reduce((sum, item) => sum + parseMetricNumber(values[item]), 0)
}

function findGoalByKeywords(goals, keywords) {
  return goals.find((goal) => {
    const haystack = `${goal.title || ''} ${goal.direction || ''} ${
      goal.dataSource || ''
    }`.toLowerCase()

    return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
  })
}

function normalizeCoverageMetric(metric, fallback = {}) {
  const source = metric || fallback
  const value = parseReachNumber(source.value ?? source.total ?? fallback.value)
  const segments = normalizeCoverageMetricSegments(
    (source.segments || fallback.segments || [])
      .map((segment) => ({
        label: segment.label || segment.name || segment.channel || 'Канал',
        value: parseReachNumber(segment.value ?? segment.count ?? segment.reach),
        delta:
          segment.delta ??
          segment.change ??
          segment.changePercent ??
          segment.percentChange,
      }))
      .filter((segment) => segment.value || segment.label),
    value,
  )

  return {
    value,
    delta:
      source.delta ??
      source.change ??
      source.changePercent ??
      source.percentChange ??
      fallback.delta,
    segments,
  }
}

function normalizeCoverageMetricSegments(segments, totalValue) {
  const segmentTotal = segments.reduce(
    (sum, segment) => sum + Number(segment.value || 0),
    0,
  )

  if (!looksLikePercentSplit(segmentTotal, totalValue)) return segments

  const values = allocateTotalByWeights(
    Math.round(totalValue),
    segments.map((segment) => Number(segment.value || 0)),
  )

  return segments.map((segment, index) => ({
    ...segment,
    value: values[index],
  }))
}

function looksLikePercentSplit(segmentTotal, totalValue) {
  return (
    totalValue > 0 &&
    Math.abs(segmentTotal - 100) <= 0.5 &&
    Math.abs(segmentTotal - totalValue) > 0.5
  )
}

function allocateTotalByWeights(total, weights) {
  const weightTotal = weights.reduce((sum, value) => sum + Number(value || 0), 0)
  if (!total || !weightTotal) return weights.map(() => 0)

  const exactValues = weights.map((weight) => (Number(weight || 0) / weightTotal) * total)
  const floors = exactValues.map(Math.floor)
  const remainder = total - floors.reduce((sum, value) => sum + value, 0)
  const byRemainder = exactValues
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((left, right) => right.remainder - left.remainder)

  return floors.map((value, index) => {
    const receivesExtra = byRemainder
      .slice(0, remainder)
      .some((item) => item.index === index)
    return receivesExtra ? value + 1 : value
  })
}

function normalizeSentiment(sentiment = []) {
  return sentiment
    .map((item) => ({
      name: item.name || item.label || 'Тональність',
      value: Number(item.value ?? item.count ?? 0),
    }))
    .filter((item) => item.value)
}

function getCoverageOutlets(coverage = {}) {
  const rawOutlets =
    coverage.mediaOutlets ||
    coverage.outlets ||
    coverage.sources ||
    coverage.publications ||
    []

  return rawOutlets
    .map((item, index) => ({
      name:
        item.name ||
        item.media ||
        item.outlet ||
        item.source ||
        item.title ||
        `Медіа ${index + 1}`,
      mentions: Number(item.mentions ?? item.count ?? item.articles ?? 0),
      reach: parseReachNumber(
        item.reach ??
          item.audience ??
          item.potentialAudience ??
          item.totalReach ??
          item.totalAudience ??
          item.views,
      ),
    }))
    .filter((item) => item.name || item.mentions || item.reach)
}

function parseReachNumber(value) {
  if (typeof value === 'number') return value

  const text = String(value || '').trim().toLowerCase()
  const number = parseMetricNumber(text)
  if (!number) return 0

  if (/млн|million|\bm\b/.test(text)) return number * 1_000_000
  if (/тис|тыс|thousand|\bk\b/.test(text)) return number * 1_000

  return number
}

function isOrganizedEvent(event) {
  const role = String(event.role || '').toLowerCase()
  return /owner|organizer|host|організ|власник/.test(role)
}

function isOwnBrand(brand) {
  return String(brand || '').toLowerCase().includes('universe')
}

function isDoneValue(value) {
  return ['так', 'yes', 'done', 'true', 'виконано'].includes(
    String(value || '').trim().toLowerCase(),
  )
}

function reportMonthName(month) {
  return String(month || 'Місяць').split(' ')[0] || 'Місяць'
}

function reportNextMonthName(month) {
  const index = MONTHS.indexOf(month)
  if (index >= 0 && MONTHS[index + 1]) return reportMonthName(MONTHS[index + 1])
  return 'Наступний місяць'
}

function formatCoverageChannels(
  metric,
  prefix = '',
  suffix = '',
  formatValue = formatReportNumber,
) {
  const parts = (metric.segments || [])
    .filter((segment) => segment.value)
    .map(
      (segment) =>
        `${segment.label}: ${formatValue(segment.value)}${formatDelta(
          segment.delta,
        )}`,
    )

  return parts.length ? `${prefix}${parts.join(' · ')}${suffix}` : ''
}

function formatCompetitorsLine(competitors = []) {
  if (!competitors.length) return 'даних немає'

  return competitors
    .slice(0, 5)
    .map((item) => {
      const note = item.note ? ` (${item.note})` : ''
      return `${item.brand} — ${formatReportNumber(item.count)}${note}`
    })
    .join(', ')
}

function formatSentimentLine(sentiment = []) {
  const total = sentiment.reduce((sum, item) => sum + item.value, 0)

  return sentiment
    .map((item) => {
      const share = total ? ` / ${Math.round((item.value / total) * 100)}%` : ''
      return `${item.name}: ${formatReportNumber(item.value)}${share}`
    })
    .join(', ')
}

function formatOutletsLine(outlets = []) {
  return outlets
    .slice(0, 5)
    .map((item) => {
      const mentions = item.mentions ? `, ${item.mentions} зг.` : ''
      const reach = item.reach ? `, ${formatReachShort(item.reach)}` : ''
      return `${item.name}${mentions}${reach}`
    })
    .join('; ')
}

function formatTitleList(entries, limit) {
  return formatTextList(
    entries.map((entry) => cleanReportText(entry.title || entry.name, 80)),
    limit,
  )
}

function formatTextList(items, limit) {
  const cleanItems = items.map((item) => cleanReportText(item, 80)).filter(Boolean)
  const visibleItems = cleanItems.slice(0, limit)
  const rest = cleanItems.length - visibleItems.length

  return `${visibleItems.join('; ')}${rest > 0 ? ` та ще ${rest}` : ''}`
}

function focusPlanTitle(entry) {
  return cleanReportText(entry.title || entry.name || entry.team || 'Фокус', 70).replace(
    /[.:;]+$/,
    '',
  )
}

function firstMeaningfulText(...values) {
  const value = values.find(isMeaningfulReportText)
  return value ? cleanReportText(value, 220) : ''
}

function isMeaningfulReportText(value) {
  const text = cleanReportText(value).toLowerCase()
  return Boolean(
    text &&
      !['-', '—', 'n/a', 'na', 'не зазначено', 'потрібно уточнити'].includes(text),
  )
}

function cleanReportText(value, maxLength = 260) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()

  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function withFinalPeriod(value) {
  const text = cleanReportText(value)
  return /[.!?…]$/.test(text) ? text : `${text}.`
}

function uniqueReportLines(lines) {
  const seen = new Set()
  return lines.filter((line) => {
    const key = cleanReportText(line).toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function formatReportNumber(value) {
  return new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value || 0)
}

function formatReportPercent(value) {
  return `${new Intl.NumberFormat('uk-UA', {
    maximumFractionDigits: 1,
  }).format(Number(value || 0))}%`
}

function formatReachShort(value) {
  if (!value) return '0'
  if (Math.abs(value) >= 1_000_000) {
    return `${formatReportNumber(Number((value / 1_000_000).toFixed(1)))} млн`
  }
  if (Math.abs(value) >= 1_000) {
    return `${formatReportNumber(Number((value / 1_000).toFixed(1)))} тис.`
  }
  return formatReportNumber(value)
}

function activityLabel(value) {
  const number = Math.abs(Number(value || 0))
  const lastTwo = number % 100
  const last = number % 10

  if (lastTwo >= 11 && lastTwo <= 14) return 'активностей'
  if (last === 1) return 'активність'
  if (last >= 2 && last <= 4) return 'активності'
  return 'активностей'
}

function formatDelta(value) {
  if (value === null || value === undefined || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number) || number === 0) return ''
  return ` (${number > 0 ? '+' : ''}${number}%)`
}

function reportToBlocks(report) {
  const lines = String(report || '').split('\n')
  return lines.slice(0, 80).map((line) => ({
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: line
        ? [{ type: 'text', text: { content: line.slice(0, 1900) } }]
        : [],
    },
  }))
}

function asyncHandler(handler) {
  return async (request, response, next) => {
    try {
      await handler(request, response, next)
    } catch (error) {
      next(error)
    }
  }
}

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist')
  app.use(requirePageAuth)
  app.use(express.static(distPath))
  app.get(/^\/(?!api).*/, (_request, response) => {
    response.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use((error, _request, response, _next) => {
  void _next
  const status = error.status || error.code || 500
  const safeStatus = Number(status) >= 400 && Number(status) < 600 ? Number(status) : 500
  console.error(error)
  response.status(safeStatus).json({
    message:
      error.message ||
      'Сталася помилка під час запиту. Перевірте інтеграції і спробуйте ще раз.',
    details: error.details,
  })
})

app.listen(port, () => {
  console.log(`Comms Tool API listening on port ${port}`)
})
