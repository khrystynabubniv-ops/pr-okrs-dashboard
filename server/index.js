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

const DIRECTIONS = [
  'Employer Brand',
  'SMM',
  'PR',
  'Personal Brands',
  'Brand Design',
]

let focusDatabaseId = process.env.NOTION_FOCUS_DB || ''
let focusDatabasePromise = null
const dataSourceCache = new Map()

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
  const value = Number(propertyText(property))
  return Number.isNaN(value) ? 0 : value
}

function propertyDate(property) {
  if (!property) return ''
  if (property.type === 'date') return property.date?.start || ''
  return propertyText(property)
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
  const metricType =
    propertyText(getProperty(properties, ['MetricType', 'Metric Type', 'Тип метрики'])) ||
    'Кількісна'
  const target = propertyNumber(
    getProperty(properties, [
      'AnnualTarget',
      'Annual Target',
      'Річна ціль',
      'Ціль 100%',
      'Target',
    ]),
  )
  const currentValue =
    propertyText(getProperty(properties, ['CurrentStatus', 'Current Status'])) ||
    propertyNumber(
      getProperty(properties, [
        'CurrentValue',
        'Current Value',
        'Поточне значення',
        'Current',
      ]),
    )
  const values = parseJsonProperty(
    getProperty(properties, ['MetricValues', 'Metric Values', 'Значення метрик']),
    {},
  )

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
    owner: propertyText(getProperty(properties, ['Owner', 'Власник'])),
    values,
  }
}

function normalizeFocus(page) {
  const properties = page.properties || {}

  return {
    id: page.id,
    month: propertyText(getProperty(properties, ['Month', 'Місяць'])),
    direction: propertyText(getProperty(properties, ['Direction', 'Напрямок'])),
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
  const rawDate = propertyDate(getProperty(properties, ['Date', 'Дата', 'Event Date']))
  const date = rawDate ? new Date(rawDate) : null

  return {
    id: page.id,
    title:
      propertyText(getProperty(properties, ['Name', 'Назва', 'Event', 'Title'])) ||
      'Без назви',
    type: propertyText(getProperty(properties, ['Type', 'Тип'])),
    date:
      date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString('uk-UA', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
        : rawDate,
    rawDate,
    role: propertyText(getProperty(properties, ['Role', 'Роль'])) || 'Visitor',
    goal: propertyText(getProperty(properties, ['Goal', 'Ціль'])),
    contacts: propertyNumber(
      getProperty(properties, [
        'Contacts',
        'Кількість контактів',
        'Contact count',
        'Контакти',
      ]),
    ),
    audience: propertyText(getProperty(properties, ['Audience', 'Аудиторія'])),
  }
}

function eventMatchesMonth(event, monthLabel) {
  const index = MONTHS.indexOf(monthLabel)
  if (index < 0 || !event.rawDate) return true

  const date = new Date(event.rawDate)
  if (Number.isNaN(date.getTime())) return true

  return date.getFullYear() === 2026 && date.getMonth() === index
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

  if (!process.env.NOTION_PARENT_PAGE_ID) {
    throw createHttpError(
      503,
      'NOTION_FOCUS_DB не налаштований. Додайте ID Monthly Focus database або NOTION_PARENT_PAGE_ID для автоматичного створення.',
    )
  }

  if (!focusDatabasePromise) {
    focusDatabasePromise = createFocusDatabase()
  }

  focusDatabaseId = await focusDatabasePromise
  return focusDatabaseId
}

async function createFocusDatabase() {
  const notion = getNotion()
  const database = await notion.databases.create({
    parent: { type: 'page_id', page_id: process.env.NOTION_PARENT_PAGE_ID },
    title: [{ type: 'text', text: { content: 'Comms Tool Monthly Focus' } }],
    initial_data_source: {
      properties: {
        Name: { title: {} },
        Month: {
          select: { options: MONTHS.map((name) => ({ name, color: 'blue' })) },
        },
        Direction: {
          select: { options: DIRECTIONS.map((name) => ({ name, color: 'gray' })) },
        },
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
      Name: titleProperty(goal.title),
      Direction: selectProperty(goal.direction),
      MetricType: selectProperty(goal.metricType),
      AnnualTarget: numberProperty(goal.target),
      QualitativeCriterion: richTextProperty(goal.criterion),
      MeasurementPeriod: selectProperty(goal.measurementPeriod),
      DataSource: richTextProperty(goal.dataSource),
      AMEC: selectProperty(goal.framework),
      Owner: richTextProperty(goal.owner),
      CurrentValue: numberProperty(0),
      CurrentStatus: richTextProperty(''),
      MetricValues: richTextProperty('{}'),
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

  const properties = {
    MetricValues: richTextProperty(JSON.stringify(values)),
  }

  if (isNumeric) {
    properties.CurrentValue = numberProperty(numericValue)
  } else {
    properties.CurrentStatus = richTextProperty(value)
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
    return month ? entry.month === month : true
  })

  response.json({ entries, focusDatabaseId: databaseId })
}))

app.post('/api/notion/monthly-focus', asyncHandler(async (request, response) => {
  const notion = getNotion()
  const databaseId = await getFocusDatabaseId()
  const body = request.body
  const pages = await queryAllDatabase(databaseId)
  const existing = pages
    .map(normalizeFocus)
    .find((entry) => entry.month === body.month && entry.direction === body.direction)

  const properties = {
    Name: titleProperty(`${body.month} · ${body.direction}`),
    Month: selectProperty(body.month),
    Direction: selectProperty(body.direction),
    Done: richTextProperty(body.done),
    NotDone: richTextProperty(body.notDone),
    Pains: richTextProperty(body.pains),
    NextPriorities: richTextProperty(body.nextPriorities),
    LinkedGoals: richTextProperty(JSON.stringify(body.linkedGoalIds || [])),
    MetricValues: richTextProperty(JSON.stringify(body.metricValues || {})),
  }

  const page = existing
    ? await notion.pages.update({ page_id: existing.id, properties })
    : await notion.pages.create({
        parent: await dataSourceParent(databaseId),
        properties,
      })

  response.json({ entry: normalizeFocus(page), focusDatabaseId: databaseId })
}))

app.get('/api/notion/events', asyncHandler(async (request, response) => {
  const databaseId = getDatabaseId('NOTION_EVENTS_DB', 'Events')
  const month = request.query.month
  const pages = await queryAllDatabase(databaseId)
  const events = pages.map(normalizeEvent).filter((event) => {
    return month ? eventMatchesMonth(event, month) : true
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
    const target = Number(goal.target || 0)
    const current = Number(goal.currentValue || 0)
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
      ? focus.map((entry) => `- ${entry.direction}: ${entry.done || 'немає нотаток'}`).join('\n')
      : '- Дані Monthly Focus ще не заповнені.',
    `- Івенти: ${events.length} активностей, ${totalContacts} контактів.`,
    `- Медіа кавередж: ${mentions || 'даних немає'}.`,
    '',
    'Що не виконано:',
    focus.length
      ? focus
          .map((entry) => `- ${entry.direction}: ${entry.notDone || 'немає блокерів'}`)
          .join('\n')
      : '- Потрібно додати статуси команд.',
    '',
    'Болі команди:',
    focus.length
      ? focus.map((entry) => `- ${entry.direction}: ${entry.pains || 'не зазначено'}`).join('\n')
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
