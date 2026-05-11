import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { Client as NotionClient } from '@notionhq/client'
import cors from 'cors'
import express from 'express'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

const FOCUS_TEAMS = ['EB', 'PR', 'Brand Design', 'Operations', 'SMM']

const EVENT_ACTIVITY_TYPES = [
  'Стажування',
  'Партнерка з університетом',
  'Партнерка із університетом',
  'Ярмарка вакансій',
  'Хакатон',
  'Зовнішній освітній проєкт',
  'Внутрішній івент',
  'Конференція',
]

let focusDatabaseId = process.env.NOTION_FOCUS_DB || ''
let focusDatabasePromise = null
const dataSourceCache = new Map()
const dataSourceSchemaCache = new Map()

app.use(cors())
app.use(express.json({ limit: '1mb' }))

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

  const match = text.match(/-?\d[\d\s\u00a0]*(?:[.,]\d+)?/)
  if (!match) return 0

  const normalized = match[0].replace(/[\s\u00a0]/g, '').replace(',', '.')
  const number = Number(normalized)
  return Number.isNaN(number) ? 0 : number
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
  const metricType =
    propertyText(getProperty(properties, ['MetricType', 'Metric Type', 'Тип метрики'])) ||
    inferMetricType(targetText)
  const target = propertyNumber(
    getProperty(properties, [
      'AnnualTarget',
      'Annual Target',
      'Річна ціль',
      'Ціль 100%',
      'Target',
    ]),
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
    (metricType === 'Накопичувальна'
      ? sumMonthlyValues(values)
      : latestMonthlyValue(values))

  return {
    id: page.id,
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

function inferMetricType(targetText) {
  const value = String(targetText || '').trim().toLowerCase()
  if (!value) return 'Кількісна'
  if (value.includes('%')) return 'Відсоткова'
  if (['так', 'ні', 'yes', 'no', 'done'].some((token) => value.includes(token))) {
    return 'Якісна'
  }
  return 'Кількісна'
}

function latestMonthlyValue(values) {
  const latest = [...MONTHS]
    .reverse()
    .map((month) => values[month])
    .find((value) => String(value || '').trim())

  return latest || 0
}

function sumMonthlyValues(values) {
  return MONTHS.reduce((sum, month) => sum + parseMetricNumber(values[month]), 0)
}

function normalizeFocus(page) {
  const properties = page.properties || {}
  const rawMetric = propertyText(
    getProperty(properties, ['Metric', 'Метрика успіху', 'Criteria', 'Критерій']),
  )
  const metricMatch = rawMetric.match(/^\[(.+?)]\s*(.*)$/)
  const months = propertyMultiSelect(getProperty(properties, ['Month', 'Місяць']))
  const fallbackMonth = propertyText(getProperty(properties, ['Month', 'Місяць']))
  const team = propertyText(
    getProperty(properties, ['Team', 'Direction', 'Напрямок', 'Команда']),
  )
  const title =
    propertyText(getProperty(properties, ['Name', 'Назва', 'Title'])) ||
    `${fallbackMonth || months[0] || 'Місяць'} · ${team || 'Команда'}`
  const achieved = propertyCheckbox(
    getProperty(properties, ['Goal achieved', 'Виконано', 'Achieved', 'Done?']),
  )
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
    metricType:
      propertyText(getProperty(properties, ['MetricType', 'Тип метрики'])) ||
      metricMatch?.[1] ||
      '',
    metric: metricMatch?.[2] || rawMetric,
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

function normalizeEvent(page) {
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
  }
}

function eventMatchesMonth(event, monthLabel) {
  const index = MONTHS.indexOf(monthLabel)
  if (index < 0 || !event.rawDate) return false

  const date = new Date(event.rawDate)
  if (Number.isNaN(date.getTime())) return false

  return date.getFullYear() === 2026 && date.getMonth() === index
}

function isAllowedEventType(type) {
  const value = String(type || '').trim().toLowerCase()
  if (!value) return false

  return EVENT_ACTIVITY_TYPES.some((item) => item.toLowerCase() === value)
}

function findSchemaProperty(schema, names) {
  return names
    .map((name) => [name, schema[name]])
    .find(([, property]) => Boolean(property))
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
  } else if (property.type === 'number') {
    properties[name] = numberProperty(value)
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
  } else {
    properties[name] = richTextProperty(
      Array.isArray(value) ? value.join(', ') : value,
    )
  }
}

function addCheckboxProperty(properties, schema, names, value) {
  const [name, property] = findSchemaProperty(schema, names) || []
  if (!name) return

  properties[name] =
    property.type === 'checkbox'
      ? checkboxProperty(value)
      : richTextProperty(value ? 'Так' : 'Ні')
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
        Metric: { rich_text: {} },
        'Goal achieved': { checkbox: {} },
        Comment: { rich_text: {} },
        CreatedAt: { created_time: {} },
      },
    },
  })

  console.log(`Created Monthly Focus database: ${database.id}`)
  return database.id
}

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'Comms Tool' })
})

app.get('/api/notion/kpi-goals', asyncHandler(async (_request, response) => {
  const databaseId = getDatabaseId('NOTION_KPI_DB', 'KPI цілей')
  const pages = await queryAllDatabase(databaseId)
  response.json({ goals: pages.map(normalizeGoal) })
}))

app.post('/api/notion/goals', asyncHandler(async (request, response) => {
  const notion = getNotion()
  const databaseId = getDatabaseId('NOTION_KPI_DB', 'KPI цілей')
  const goal = request.body

  const page = await notion.pages.create({
    parent: await dataSourceParent(databaseId),
    properties: {
      Ціль: titleProperty(goal.title),
      Напрямок: selectProperty(goal.direction),
      'Річна ціль': richTextProperty(
        goal.metricType === 'Якісна' ? goal.criterion : goal.target,
      ),
      'Період заміру': selectProperty(goal.measurementPeriod),
      'Джерело даних': richTextProperty(goal.dataSource),
      'AMEC Framework': selectProperty(goal.framework),
      Менеджер: richTextProperty(goal.owner),
    },
  })

  response.status(201).json({ goal: normalizeGoal(page) })
}))

app.patch('/api/notion/goals/:id', asyncHandler(async (request, response) => {
  const notion = getNotion()
  const { month, value } = request.body
  const page = await notion.pages.retrieve({ page_id: request.params.id })
  const goal = normalizeGoal(page)
  const values = { ...(goal.values || {}), [month]: value }
  const numericValue = Number(value)
  const isNumeric = !Number.isNaN(numericValue)
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
  const databaseId = await getFocusDatabaseId()
  const month = request.query.month
  const pages = await queryAllDatabase(databaseId)
  const entries = pages.map(normalizeFocus).filter((entry) => {
    return month ? entry.months.includes(month) || entry.month === month : true
  })

  response.json({ entries, focusDatabaseId: databaseId })
}))

app.post('/api/notion/monthly-focus', asyncHandler(async (request, response) => {
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

  const properties = {}
  addTitleProperty(properties, schema, ['Name', 'Назва', 'Title'], title)
  addSelectProperty(properties, schema, ['Month', 'Місяць'], body.months || body.month)
  addSelectProperty(
    properties,
    schema,
    ['Team', 'Direction', 'Напрямок', 'Команда'],
    body.team || body.direction,
  )
  addTextProperty(properties, schema, ['Metric', 'Метрика успіху', 'Criteria'], metric)
  addCheckboxProperty(
    properties,
    schema,
    ['Goal achieved', 'Виконано', 'Achieved', 'Done?'],
    body.achieved,
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
  const databaseId =
    process.env.NOTION_ACTIVITIES_DB || getDatabaseId('NOTION_EVENTS_DB', 'Events')
  const month = request.query.month
  const pages = await queryAllDatabase(databaseId)
  const events = pages.map(normalizeEvent).filter((event) => {
    const matchesMonth = month ? eventMatchesMonth(event, month) : Boolean(event.rawDate)
    return matchesMonth && isAllowedEventType(event.type)
  })

  response.json({ events })
}))

app.get('/api/looqme/coverage', (request, response) => {
  response.json({
    month: request.query.month,
    source: process.env.LOOQME_TOKEN ? 'looqme-mock-token-present' : 'mock',
    mentions: [
      { brand: 'Universe Group', count: 54 },
      { brand: 'Skelar', count: 8 },
      { brand: 'Headway', count: 2 },
    ],
    sentiment: [
      { name: 'Позитив', value: 42, color: '#10b981' },
      { name: 'Нейтрал', value: 20, color: '#64748b' },
      { name: 'Негатив', value: 2, color: '#ef4444' },
    ],
  })
})

app.post('/api/generate-report', asyncHandler(async (request, response) => {
  const { month, goals = [], focus = [], events = [], coverage = {} } = request.body

  if (!process.env.ANTHROPIC_KEY) {
    response.json({
      report: buildFallbackReport({ month, goals, focus, events, coverage }),
      source: 'mock',
    })
    return
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY })
  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
    max_tokens: 1800,
    temperature: 0.2,
    messages: [
      {
        role: 'user',
        content: [
          'Згенеруй українською структурований Board Report для Communications.',
          'Формат: Загальний прогрес (%), Що зроблено по блоках, Що не виконано, Болі команди, Плани на наступний місяць.',
          `Місяць: ${month}`,
          `KPI goals: ${JSON.stringify(goals)}`,
          `Monthly focus: ${JSON.stringify(focus)}`,
          `Events: ${JSON.stringify(events)}`,
          `Media coverage: ${JSON.stringify(coverage)}`,
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

app.post('/api/notion/board-report', asyncHandler(async (request, response) => {
  const notion = getNotion()
  const parentPageId =
    process.env.NOTION_REPORTS_PARENT_PAGE_ID || process.env.NOTION_PARENT_PAGE_ID

  if (!parentPageId) {
    throw createHttpError(
      503,
      'Для збереження Board Report додайте NOTION_REPORTS_PARENT_PAGE_ID або NOTION_PARENT_PAGE_ID.',
    )
  }

  const { month, report } = request.body
  const page = await notion.pages.create({
    parent: { type: 'page_id', page_id: parentPageId },
    properties: {
      title: titleProperty(`Board Report · ${month}`),
    },
    children: reportToBlocks(report),
  })

  response.status(201).json({ pageId: page.id })
}))

function buildFallbackReport({ month, goals, focus, events, coverage }) {
  const totalGoals = goals.length
  const completedGoals = goals.filter((goal) => {
    const target = parseMetricNumber(goal.target)
    const current = parseMetricNumber(goal.currentValue)
    if (goal.metricType === 'Якісна') {
      return ['так', 'yes', 'done', 'true', 'виконано'].includes(
        String(goal.currentValue || '').toLowerCase(),
      )
    }
    return target ? current >= target : false
  }).length
  const progress = totalGoals ? Math.round((completedGoals / totalGoals) * 100) : 0
  const totalContacts = events.reduce(
    (sum, event) => sum + Number(event.contacts || 0),
    0,
  )
  const mentions = (coverage.mentions || [])
    .map((item) => `${item.brand}: ${item.count}`)
    .join(' | ')

  return [
    `Board Report · ${month}`,
    '',
    `Загальний прогрес: ${progress}% (${completedGoals}/${totalGoals} цілей виконано).`,
    '',
    'Що зроблено по блоках:',
    focus.length
      ? focus
          .filter((entry) => entry.achieved || entry.done)
          .map(
            (entry) =>
              `- ${entry.team || entry.direction}: ${entry.title || entry.done}${
                entry.metric ? ` (${entry.metric})` : ''
              }`,
          )
          .join('\n') || '- Немає позначених виконаних фокусів.'
      : '- Дані Monthly Focus ще не заповнені.',
    `- Івенти: ${events.length} активностей, ${totalContacts} контактів.`,
    `- Медіа кавередж: ${mentions || 'даних немає'}.`,
    '',
    'Що не виконано:',
    focus.length
      ? focus
          .filter((entry) => !entry.achieved || entry.notDone)
          .map(
            (entry) =>
              `- ${entry.team || entry.direction}: ${
                entry.notDone || entry.title || 'фокус не виконано'
              }${entry.comment ? ` — ${entry.comment}` : ''}`,
          )
          .join('\n') || '- Усі фокуси позначені як виконані.'
      : '- Потрібно додати статуси команд.',
    '',
    'Болі команди:',
    focus.length
      ? focus
          .map(
            (entry) =>
              `- ${entry.team || entry.direction}: ${
                entry.pains || entry.comment || 'не зазначено'
              }`,
          )
          .join('\n')
      : '- Поки не зазначено.',
    '',
    'Плани на наступний місяць:',
    focus.length
      ? focus
          .map(
            (entry) =>
              `- ${entry.direction}: ${entry.nextPriorities || 'потрібно уточнити'}`,
          )
          .join('\n')
      : '- Синхронізувати пріоритети з власниками напрямків.',
  ].join('\n')
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
