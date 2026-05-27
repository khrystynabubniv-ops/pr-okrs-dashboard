import 'dotenv/config'
import { createSign } from 'node:crypto'
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
const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

const FOCUS_TEAMS = ['EB', 'PR', 'Brand Design', 'Operations', 'SMM']

let focusDatabaseId = process.env.NOTION_FOCUS_DB || ''
let focusDatabasePromise = null
const dataSourceCache = new Map()
const dataSourceSchemaCache = new Map()
let googleTokenCache = null

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

  const match = text.match(/-?\d[\d\s\u00a0.,]*(?:[.,]\d+)?/)
  if (!match) return 0

  const normalized = normalizeNumericText(match[0])
  const number = Number(normalized)
  return Number.isNaN(number) ? 0 : number
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

function isFilledMetricValue(value) {
  const text = String(value ?? '').trim()
  return Boolean(text && text !== '-' && text !== '—' && !text.startsWith('#'))
}

function shouldReadKpiFromGoogleSheet() {
  const source = String(process.env.KPI_SOURCE || '').trim().toLowerCase()
  return source === 'google-sheet' || Boolean(process.env.KPI_SPREADSHEET_ID)
}

function parseGoogleSpreadsheetId(value) {
  const text = String(value || '').trim()
  return text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] || text
}

function parseGoogleSheetGid(value) {
  return String(value || '').match(/[?&#]gid=(\d+)/)?.[1] || ''
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
      const currentValue = latestMonthlyValue(values)
      const targetText = cleanSheetCell(row[14])
      const inferredMetricType = inferMetricType(targetText, currentValue, values)
      const metricType = inferredMetricType || 'Кількісна'

      return {
        id: `sheet-row-${rowNumber}`,
        sourceRow: rowNumber,
        source: 'google-sheet',
        title,
        direction: currentDirection || 'Employer Brand',
        metricType,
        target: parseMetricNumber(targetText),
        currentValue,
        criterion: metricType === 'Якісна' ? targetText : '',
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
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${encodeURIComponent(
    gid,
  )}`
  const response = await fetch(url)
  const body = await response.text()

  if (!response.ok || body.trimStart().startsWith('<!DOCTYPE html>')) {
    throw createHttpError(
      502,
      'Не вдалося прочитати KPI Google Sheet. Перевірте доступ для service account або public view.',
    )
  }

  return parseCsvRows(body)
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
  return calendarEvents.map((event) => {
    const activity = findMatchingActivity(event, activityEvents)

    if (!activity) {
      return {
        ...event,
        role: event.role || 'Visitor',
        metricsMatched: false,
      }
    }

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

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'Comms Tool' })
})

app.get('/api/notion/kpi-goals', asyncHandler(async (_request, response) => {
  if (shouldReadKpiFromGoogleSheet()) {
    response.json(await getGoogleSheetKpiPayload())
    return
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

  response.json({ goals, ownerOptions })
}))

app.post('/api/notion/goals', asyncHandler(async (request, response) => {
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

app.patch('/api/notion/goals/:id', asyncHandler(async (request, response) => {
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
  const databaseId = await getFocusDatabaseId()
  const month = request.query.month
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

  response.json({ entries, ownerOptions, focusDatabaseId: databaseId })
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

app.get('/api/looqme/coverage', (request, response) => {
  const month = request.query.month

  if (month && month !== MOCK_COVERAGE_MONTH) {
    response.json({
      month,
      source: process.env.LOOQME_TOKEN ? 'looqme-mock-token-present' : 'mock',
      mentionsMetric: {
        value: 0,
        delta: 0,
        segments: [],
      },
      mentions: [],
      mediaOutlets: [],
      audienceMetric: {
        value: 0,
        delta: 0,
        segments: [],
      },
      audience: {
        total: 0,
        media: 0,
        social: 0,
      },
      sentiment: [],
    })
    return
  }

  response.json({
    month,
    source: process.env.LOOQME_TOKEN ? 'looqme-mock-token-present' : 'mock',
    mentionsMetric: {
      value: 142,
      delta: -24,
      segments: [
        { label: 'ЗМІ(Медіа)', value: 42, delta: -24, color: '#6678ff' },
        { label: 'Соціальні мережі', value: 100, delta: -24, color: '#2dd68f' },
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
        { label: 'ЗМІ(Медіа)', value: 86800000, delta: -38, color: '#6678ff' },
        { label: 'Соціальні мережі', value: 1400000, delta: 19, color: '#2dd68f' },
      ],
    },
    audience: {
      total: 88100000,
      media: 86800000,
      social: 1400000,
    },
    sentiment: [
      { name: 'Позитив', value: 42, color: '#10b981' },
      { name: 'Нейтрал', value: 20, color: '#64748b' },
      { name: 'Негатив', value: 2, color: '#ef4444' },
    ],
  })
})

app.post('/api/generate-report', asyncHandler(async (request, response) => {
  const { month, goals = [], focus = [], events = [], coverage = {} } = request.body
  const reportData = buildBoardReportData({ month, goals, focus, events, coverage })

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

function buildBoardReportData({ month, goals, focus, events, coverage }) {
  const goalCompletion = buildGoalCompletionSummary(goals, month)
  const coverageSummary = buildCoverageReportSummary(coverage)
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
  const { focusSections, coverage, events, instagram } = reportData

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
  const segments = (source.segments || fallback.segments || [])
    .map((segment) => ({
      label: segment.label || segment.name || segment.channel || 'Канал',
      value: parseReachNumber(segment.value ?? segment.count ?? segment.reach),
      delta:
        segment.delta ??
        segment.change ??
        segment.changePercent ??
        segment.percentChange,
    }))
    .filter((segment) => segment.value || segment.label)

  return {
    value: parseReachNumber(source.value ?? source.total ?? fallback.value),
    delta:
      source.delta ??
      source.change ??
      source.changePercent ??
      source.percentChange ??
      fallback.delta,
    segments,
  }
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
