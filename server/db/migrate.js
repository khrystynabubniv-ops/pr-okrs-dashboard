import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPool, isDatabaseConfigured } from './index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsDir = path.join(__dirname, 'migrations')

if (!isDatabaseConfigured()) {
  console.log('DATABASE_URL is not configured; skipping migrations.')
  process.exit(0)
}

const pool = getPool()

try {
  await runMigrations()
} catch (error) {
  if (isConnectionError(error) && !shouldRequireMigration()) {
    console.warn(`Database is not reachable; skipping migrations. ${error.message}`)
    process.exitCode = 0
  } else {
    throw error
  }
} finally {
  await pool.end()
}

async function runMigrations() {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const applied = await pool.query('select 1 from schema_migrations where id = $1', [
      file,
    ])

    if (applied.rowCount) {
      console.log(`Migration already applied: ${file}`)
      continue
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8')
    const client = await pool.connect()

    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (id) values ($1)', [file])
      await client.query('commit')
      console.log(`Applied migration: ${file}`)
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}

function shouldRequireMigration() {
  return String(process.env.DB_MIGRATE_REQUIRED || '').trim().toLowerCase() === 'true'
}

function isConnectionError(error) {
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) return true
  return Array.isArray(error.errors)
    ? error.errors.some((item) =>
        ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(item.code),
      )
    : false
}
