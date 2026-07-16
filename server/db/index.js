import { createHash } from 'node:crypto'
import { Pool } from 'pg'

let pool = null

export const BACKUP_TABLES = [
  'app_users',
  'auth_oauth_accounts',
  'kpi_goals',
  'kpi_goal_values',
  'monthly_focus_entries',
  'competitor_coverage',
  'board_reports',
  'event_reports',
  'linkedin_report_data',
  'integration_sync_runs',
]

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL)
}

export function getPool() {
  if (!isDatabaseConfigured()) {
    throw new Error('DATABASE_URL is not configured')
  }

  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : undefined,
    })
  }

  return pool
}

function shouldUseSsl() {
  const value = String(process.env.DATABASE_SSL || '').trim().toLowerCase()
  if (['0', 'false', 'no', 'off'].includes(value)) return false
  return /railway|render|neon|supabase|amazonaws|google|azure/i.test(
    process.env.DATABASE_URL || '',
  )
}

export async function query(text, params = []) {
  return getPool().query(text, params)
}

export async function transaction(callback) {
  const client = await getPool().connect()

  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function getDatabaseStatus() {
  if (!isDatabaseConfigured()) {
    return { configured: false, ready: false, migrations: 0 }
  }

  try {
    const result = await query('select count(*)::int as count from schema_migrations')
    return {
      configured: true,
      ready: true,
      migrations: result.rows[0]?.count || 0,
    }
  } catch (error) {
    return {
      configured: true,
      ready: false,
      migrations: 0,
      error: error.message,
    }
  }
}

export function publicDbId(id) {
  return `db-${id}`
}

export function unwrapPublicDbId(id) {
  const text = String(id || '')
  return text.startsWith('db-') ? text.slice(3) : text
}

export async function listStoredKpiGoals() {
  if (!isDatabaseConfigured()) return []

  const result = await query(`
    select
      g.*,
      coalesce(
        jsonb_object_agg(v.month, v.value) filter (where v.month is not null),
        '{}'::jsonb
      ) as values
    from kpi_goals g
    left join kpi_goal_values v on v.goal_id = g.id
    where g.archived_at is null
    group by g.id
    order by g.created_at asc
  `)

  return result.rows.map(mapKpiGoalRow)
}

export async function insertStoredKpiGoal(goal, userId = null) {
  const result = await query(
    `
      insert into kpi_goals (
        title,
        direction,
        metric_type,
        target_text,
        target_number,
        criterion,
        measurement_period,
        data_source,
        framework,
        owner,
        source,
        created_by,
        updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'app', $11, $11)
      returning *
    `,
    [
      goal.title || 'Без назви',
      goal.direction || 'Employer Brand',
      goal.metricType || goal.metric_type || 'Кількісна',
      goalTargetText(goal),
      numericOrNull(goal.target),
      goal.criterion || '',
      goal.measurementPeriod || '',
      goal.dataSource || '',
      goal.framework || '',
      goal.owner || '',
      userId,
    ],
  )

  return mapKpiGoalRow({ ...result.rows[0], values: {} })
}

export async function upsertStoredKpiGoalFromExternal(goal, externalSource, userId = null) {
  const externalId = String(goal.id || goal.externalId || '').trim()
  if (!externalId) throw new Error('External KPI goal id is required')

  const result = await query(
    `
      insert into kpi_goals (
        external_source,
        external_id,
        title,
        direction,
        metric_type,
        calculation_type,
        calculation_label,
        target_text,
        target_number,
        criterion,
        measurement_period,
        data_source,
        framework,
        owner,
        source,
        raw,
        created_by,
        updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'external-shadow', $15, $16, $16)
      on conflict (external_source, external_id)
      do update set
        title = coalesce(excluded.title, kpi_goals.title),
        direction = coalesce(excluded.direction, kpi_goals.direction),
        metric_type = coalesce(excluded.metric_type, kpi_goals.metric_type),
        calculation_type = coalesce(excluded.calculation_type, kpi_goals.calculation_type),
        calculation_label = coalesce(excluded.calculation_label, kpi_goals.calculation_label),
        target_text = coalesce(excluded.target_text, kpi_goals.target_text),
        target_number = coalesce(excluded.target_number, kpi_goals.target_number),
        criterion = coalesce(excluded.criterion, kpi_goals.criterion),
        measurement_period = coalesce(excluded.measurement_period, kpi_goals.measurement_period),
        data_source = coalesce(excluded.data_source, kpi_goals.data_source),
        framework = coalesce(excluded.framework, kpi_goals.framework),
        owner = coalesce(excluded.owner, kpi_goals.owner),
        raw = excluded.raw,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning *
    `,
    [
      externalSource,
      externalId,
      goal.title || 'Без назви',
      goal.direction || 'Employer Brand',
      goal.metricType || 'Кількісна',
      goal.calculationType || '',
      goal.calculationLabel || '',
      goalTargetText(goal),
      numericOrNull(goal.target),
      goal.criterion || '',
      goal.measurementPeriod || '',
      goal.dataSource || '',
      goal.framework || '',
      goal.owner || '',
      JSON.stringify(goal || {}),
      userId,
    ],
  )

  await replaceStoredKpiGoalValues(result.rows[0].id, goal.values || {}, userId)
  return getStoredKpiGoalById(result.rows[0].id)
}

export async function updateStoredKpiGoalValue(publicGoalId, { month, value }, userId = null) {
  const goal = await findStoredKpiGoal(publicGoalId)
  if (!goal) return null

  await query(
    `
      insert into kpi_goal_values (goal_id, month, value, updated_by)
      values ($1, $2, $3, $4)
      on conflict (goal_id, month)
      do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
    `,
    [goal.dbId, month, String(value ?? ''), userId],
  )

  return getStoredKpiGoalById(goal.dbId)
}

export async function findStoredKpiGoal(publicGoalId) {
  const id = String(publicGoalId || '')
  if (!id) return null

  const dbId = id.startsWith('db-') ? unwrapPublicDbId(id) : null
  const result = dbId
    ? await query('select * from kpi_goals where id = $1 and archived_at is null', [dbId])
    : await query(
        `
          select *
          from kpi_goals
          where external_id = $1 and archived_at is null
          limit 1
        `,
        [id],
      )

  if (!result.rows[0]) return null
  return mapKpiGoalRow({ ...result.rows[0], values: {} })
}

async function getStoredKpiGoalById(id) {
  const result = await query(
    `
      select
        g.*,
        coalesce(
          jsonb_object_agg(v.month, v.value) filter (where v.month is not null),
          '{}'::jsonb
        ) as values
      from kpi_goals g
      left join kpi_goal_values v on v.goal_id = g.id
      where g.id = $1 and g.archived_at is null
      group by g.id
    `,
    [id],
  )

  return result.rows[0] ? mapKpiGoalRow(result.rows[0]) : null
}

async function replaceStoredKpiGoalValues(goalId, values, userId = null) {
  const entries = Object.entries(values || {}).filter(([, value]) => String(value ?? '').trim())
  if (!entries.length) return

  await transaction(async (client) => {
    for (const [month, value] of entries) {
      await client.query(
        `
          insert into kpi_goal_values (goal_id, month, value, updated_by)
          values ($1, $2, $3, $4)
          on conflict (goal_id, month)
          do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
        `,
        [goalId, month, String(value ?? ''), userId],
      )
    }
  })
}

function mapKpiGoalRow(row) {
  return {
    dbId: row.id,
    id: publicDbId(row.id),
    externalSource: row.external_source || '',
    externalId: row.external_id || '',
    source: row.source || 'app',
    title: row.title || 'Без назви',
    direction: row.direction || 'Employer Brand',
    metricType: row.metric_type || 'Кількісна',
    calculationType: row.calculation_type || '',
    calculationLabel: row.calculation_label || '',
    target: row.target_number ?? row.target_text ?? '',
    targetText: row.target_text || '',
    criterion: row.criterion || '',
    measurementPeriod: row.measurement_period || '',
    dataSource: row.data_source || '',
    framework: row.framework || '',
    owner: row.owner || '',
    values: row.values || {},
    raw: row.raw || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listStoredMonthlyFocusEntries() {
  if (!isDatabaseConfigured()) return []

  const result = await query(`
    select *
    from monthly_focus_entries
    where archived_at is null
    order by created_at asc
  `)

  return result.rows.map(mapMonthlyFocusRow)
}

export async function saveStoredMonthlyFocusEntry(entry, userId = null) {
  const publicId = String(entry.id || '')

  if (publicId.startsWith('db-')) {
    const result = await query(
      `
        update monthly_focus_entries
        set
          title = $2,
          month = $3,
          months = $4,
          team = $5,
          owner = $6,
          owner_id = $7,
          owner_ids = $8,
          metric_type = $9,
          metric = $10,
          status = $11,
          achieved = $12,
          comment = $13,
          done = $14,
          not_done = $15,
          pains = $16,
          next_priorities = $17,
          linked_goal_ids = $18,
          metric_values = $19,
          updated_by = $20,
          updated_at = now()
        where id = $1 and archived_at is null
        returning *
      `,
      monthlyFocusParams(entry, userId, unwrapPublicDbId(publicId)),
    )

    return result.rows[0] ? mapMonthlyFocusRow(result.rows[0]) : null
  }

  const result = await query(
    `
      insert into monthly_focus_entries (
        external_source,
        external_id,
        title,
        month,
        months,
        team,
        owner,
        owner_id,
        owner_ids,
        metric_type,
        metric,
        status,
        achieved,
        comment,
        done,
        not_done,
        pains,
        next_priorities,
        linked_goal_ids,
        metric_values,
        raw,
        created_by,
        updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $22)
      on conflict (external_source, external_id)
      do update set
        title = excluded.title,
        month = excluded.month,
        months = excluded.months,
        team = excluded.team,
        owner = excluded.owner,
        owner_id = excluded.owner_id,
        owner_ids = excluded.owner_ids,
        metric_type = excluded.metric_type,
        metric = excluded.metric,
        status = excluded.status,
        achieved = excluded.achieved,
        comment = excluded.comment,
        done = excluded.done,
        not_done = excluded.not_done,
        pains = excluded.pains,
        next_priorities = excluded.next_priorities,
        linked_goal_ids = excluded.linked_goal_ids,
        metric_values = excluded.metric_values,
        raw = excluded.raw,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning *
    `,
    monthlyFocusUpsertParams(entry, userId),
  )

  return mapMonthlyFocusRow(result.rows[0])
}

function monthlyFocusParams(entry, userId, id) {
  return [
    id,
    entry.title || entry.name || 'Без назви',
    entry.month || '',
    JSON.stringify(normalizeJsonArray(entry.months || entry.month)),
    entry.team || entry.direction || '',
    entry.owner || '',
    entry.ownerId || '',
    JSON.stringify(normalizeJsonArray(entry.ownerIds || entry.ownerId)),
    entry.metricType || '',
    entry.metric || '',
    entry.status || (entry.achieved ? 'Виконано' : 'Не виконано'),
    Boolean(entry.achieved),
    entry.comment || '',
    entry.done || '',
    entry.notDone || '',
    entry.pains || '',
    entry.nextPriorities || '',
    JSON.stringify(entry.linkedGoalIds || []),
    JSON.stringify(entry.metricValues || {}),
    userId,
  ]
}

function monthlyFocusUpsertParams(entry, userId) {
  const hasExternalId = entry.id && !String(entry.id).startsWith('db-')

  return [
    hasExternalId ? 'notion' : null,
    hasExternalId ? String(entry.id) : null,
    entry.title || entry.name || 'Без назви',
    entry.month || '',
    JSON.stringify(normalizeJsonArray(entry.months || entry.month)),
    entry.team || entry.direction || '',
    entry.owner || '',
    entry.ownerId || '',
    JSON.stringify(normalizeJsonArray(entry.ownerIds || entry.ownerId)),
    entry.metricType || '',
    entry.metric || '',
    entry.status || (entry.achieved ? 'Виконано' : 'Не виконано'),
    Boolean(entry.achieved),
    entry.comment || '',
    entry.done || '',
    entry.notDone || '',
    entry.pains || '',
    entry.nextPriorities || '',
    JSON.stringify(entry.linkedGoalIds || []),
    JSON.stringify(entry.metricValues || {}),
    JSON.stringify(entry || {}),
    userId,
  ]
}

function mapMonthlyFocusRow(row) {
  const months = normalizeJsonArray(row.months || row.month)

  return {
    id: publicDbId(row.id),
    dbId: row.id,
    externalSource: row.external_source || '',
    externalId: row.external_id || '',
    title: row.title || 'Без назви',
    name: row.title || 'Без назви',
    month: row.month || months[0] || '',
    months,
    team: row.team || '',
    direction: row.team || '',
    owner: row.owner || '',
    ownerId: row.owner_id || '',
    ownerIds: normalizeJsonArray(row.owner_ids),
    metricType: row.metric_type || '',
    metric: row.metric || '',
    status: row.status || (row.achieved ? 'Виконано' : 'Не виконано'),
    achieved: Boolean(row.achieved),
    comment: row.comment || '',
    done: row.done || '',
    notDone: row.not_done || '',
    pains: row.pains || '',
    nextPriorities: row.next_priorities || '',
    linkedGoalIds: normalizeJsonArray(row.linked_goal_ids),
    metricValues: row.metric_values || {},
    source: row.source || 'app',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listCompetitorCoverage(month) {
  if (!isDatabaseConfigured()) return []

  const result = await query(
    `
      select *
      from competitor_coverage
      where ($1::text is null or month = $1)
      order by brand asc, created_at asc
    `,
    [month || null],
  )

  return result.rows.map(mapCompetitorCoverageRow)
}

export async function createCompetitorCoverage(entry, userId = null) {
  const result = await query(
    `
      insert into competitor_coverage (
        month,
        brand,
        mentions,
        reach,
        sentiment,
        note,
        created_by,
        updated_by
      )
      values ($1, $2, $3, $4, $5, $6, $7, $7)
      returning *
    `,
    [
      entry.month || '',
      entry.brand || '',
      numericOrNull(entry.mentions) || 0,
      numericOrNull(entry.reach) || 0,
      entry.sentiment || '',
      entry.note || '',
      userId,
    ],
  )

  return mapCompetitorCoverageRow(result.rows[0])
}

export async function deleteCompetitorCoverage(publicId) {
  if (!isDatabaseConfigured()) return false

  const result = await query('delete from competitor_coverage where id = $1', [
    unwrapPublicDbId(publicId),
  ])

  return result.rowCount > 0
}

function mapCompetitorCoverageRow(row) {
  return {
    id: publicDbId(row.id),
    month: row.month || '',
    brand: row.brand || '',
    count: Number(row.mentions || 0),
    mentions: Number(row.mentions || 0),
    reach: Number(row.reach || 0),
    sentiment: row.sentiment || '',
    note: row.note || '',
    source: 'manual-competitor',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createBoardReport({ month, report, source, notionPageId }, userId = null) {
  if (!isDatabaseConfigured()) return null

  const result = await query(
    `
      insert into board_reports (month, report, source, notion_page_id, created_by)
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [month || '', report || '', source || 'app', notionPageId || '', userId],
  )

  return {
    id: publicDbId(result.rows[0].id),
    month: result.rows[0].month,
    notionPageId: result.rows[0].notion_page_id,
  }
}

export async function updateBoardReportNotionPage(reportId, notionPageId) {
  if (!isDatabaseConfigured() || !reportId) return null

  const result = await query(
    `
      update board_reports
      set notion_page_id = $2
      where id = $1
      returning *
    `,
    [unwrapPublicDbId(reportId), notionPageId || ''],
  )

  return result.rows[0] || null
}

let eventReportsTableReady = false

let linkedinReportTableReady = false

export async function getStoredLinkedInReportData() {
  if (!isDatabaseConfigured()) return null
  await ensureLinkedInReportTable()

  const result = await query(`
    select *
    from linkedin_report_data
    where id = 'default'
    limit 1
  `)

  return result.rows[0] ? mapLinkedInReportDataRow(result.rows[0]) : null
}

export async function saveStoredLinkedInReportData(data, userId = null) {
  await ensureLinkedInReportTable()

  const result = await query(
    `
      insert into linkedin_report_data (
        id,
        months,
        pr,
        people,
        updated_by
      )
      values ('default', $1, $2, $3, $4)
      on conflict (id)
      do update set
        months = excluded.months,
        pr = excluded.pr,
        people = excluded.people,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning *
    `,
    [
      JSON.stringify(Array.isArray(data.months) ? data.months : []),
      JSON.stringify(Array.isArray(data.pr) ? data.pr : []),
      JSON.stringify(Array.isArray(data.people) ? data.people : []),
      userId,
    ],
  )

  return mapLinkedInReportDataRow(result.rows[0])
}

async function ensureLinkedInReportTable() {
  if (linkedinReportTableReady) return

  await query(`
    create table if not exists linkedin_report_data (
      id text primary key default 'default',
      months jsonb not null default '[]'::jsonb,
      pr jsonb not null default '[]'::jsonb,
      people jsonb not null default '[]'::jsonb,
      updated_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint linkedin_report_data_singleton check (id = 'default')
    )
  `)
  await query(`
    alter table linkedin_report_data
    add column if not exists people jsonb not null default '[]'::jsonb
  `)
  linkedinReportTableReady = true
}

function mapLinkedInReportDataRow(row) {
  return {
    months: Array.isArray(row.months) ? row.months : [],
    pr: Array.isArray(row.pr) ? row.pr : [],
    people: Array.isArray(row.people) ? row.people : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listStoredEventReports() {
  if (!isDatabaseConfigured()) return []
  await ensureEventReportsTable()

  const result = await query(`
    select *
    from event_reports
    order by created_at desc
  `)

  return result.rows.map(mapEventReportRow)
}

export async function createStoredEventReport(report, userId = null) {
  await ensureEventReportsTable()

  const result = await query(
    `
      insert into event_reports (
        type,
        name,
        event_date,
        report,
        created_by
      )
      values ($1, $2, $3, $4, $5)
      returning *
    `,
    [
      report.type || 'event',
      report.name || 'Без назви',
      report.date || null,
      JSON.stringify(report || {}),
      userId,
    ],
  )

  return mapEventReportRow(result.rows[0])
}

async function ensureEventReportsTable() {
  if (eventReportsTableReady) return

  await query('create extension if not exists pgcrypto')
  await query(`
    create table if not exists event_reports (
      id uuid primary key default gen_random_uuid(),
      type text not null default 'event',
      name text not null,
      event_date date,
      report jsonb not null default '{}'::jsonb,
      created_by uuid references app_users(id) on delete set null,
      created_at timestamptz not null default now()
    )
  `)
  await query('create index if not exists idx_event_reports_created_at on event_reports(created_at desc)')
  eventReportsTableReady = true
}

function mapEventReportRow(row) {
  const report = row.report || {}
  const eventDate = row.event_date instanceof Date
    ? row.event_date.toISOString().slice(0, 10)
    : String(row.event_date || '')

  return {
    ...report,
    id: publicDbId(row.id),
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at || ''),
    type: report.type || row.type || 'event',
    name: report.name || row.name || '',
    date: report.date || eventDate,
  }
}

export async function upsertOAuthUser({ provider, providerUserId, email, name, avatarUrl }) {
  return transaction(async (client) => {
    const existing = await client.query(
      `
        select u.*
        from auth_oauth_accounts a
        join app_users u on u.id = a.user_id
        where a.provider = $1 and a.provider_user_id = $2
        limit 1
      `,
      [provider, providerUserId],
    )

    if (existing.rows[0]) {
      const updated = await client.query(
        `
          update app_users
          set email = $2, name = $3, avatar_url = $4, updated_at = now()
          where id = $1
          returning *
        `,
        [existing.rows[0].id, email, name, avatarUrl],
      )
      return mapUserRow(updated.rows[0])
    }

    const byEmail = email
      ? await client.query('select * from app_users where lower(email) = lower($1) limit 1', [
          email,
        ])
      : { rows: [] }
    const user =
      byEmail.rows[0] ||
      (
        await client.query(
          `
            insert into app_users (email, name, avatar_url)
            values ($1, $2, $3)
            returning *
          `,
          [email, name, avatarUrl],
        )
      ).rows[0]

    await client.query(
      `
        insert into auth_oauth_accounts (
          user_id,
          provider,
          provider_user_id,
          email,
          raw_profile
        )
        values ($1, $2, $3, $4, $5)
        on conflict (provider, provider_user_id)
        do update set email = excluded.email, raw_profile = excluded.raw_profile, updated_at = now()
      `,
      [
        user.id,
        provider,
        providerUserId,
        email,
        JSON.stringify({ email, name, avatarUrl }),
      ],
    )

    return mapUserRow(user)
  })
}

export async function createSession(userId, token, expiresAt) {
  const tokenHash = hashToken(token)
  await query(
    `
      insert into auth_sessions (user_id, token_hash, expires_at)
      values ($1, $2, $3)
    `,
    [userId, tokenHash, expiresAt],
  )
}

export async function findSessionUser(token) {
  if (!token || !isDatabaseConfigured()) return null

  const result = await query(
    `
      select u.*
      from auth_sessions s
      join app_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()
      limit 1
    `,
    [hashToken(token)],
  )

  return result.rows[0] ? mapUserRow(result.rows[0]) : null
}

export async function deleteSession(token) {
  if (!token || !isDatabaseConfigured()) return
  await query('delete from auth_sessions where token_hash = $1', [hashToken(token)])
}

function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email || '',
    name: row.name || row.email || '',
    avatarUrl: row.avatar_url || '',
    role: row.role || 'member',
  }
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

function goalTargetText(goal) {
  if (goal.targetText) return String(goal.targetText)
  if (goal.displayTarget && !String(goal.displayTarget).includes('Потрібна')) {
    return String(goal.displayTarget)
  }
  if (goal.metricType === 'Якісна') return String(goal.criterion || '')
  return goal.target === null || goal.target === undefined ? '' : String(goal.target)
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function normalizeJsonArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  if (typeof value === 'object') return Object.values(value).filter(Boolean)
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
