import 'dotenv/config'
import fs from 'node:fs/promises'
import { BACKUP_TABLES, getPool, isDatabaseConfigured } from './index.js'

const backupFile = process.env.BACKUP_FILE || process.argv[2]

if (!isDatabaseConfigured()) {
  console.error('DATABASE_URL is not configured; cannot restore a database backup.')
  process.exit(1)
}

if (!backupFile) {
  console.error('Pass BACKUP_FILE=/path/to/backup.json or npm run db:restore -- /path/to/backup.json')
  process.exit(1)
}

if (process.env.ALLOW_RESTORE !== 'true') {
  console.error('Restore is destructive. Re-run with ALLOW_RESTORE=true when you are sure.')
  process.exit(1)
}

const backup = JSON.parse(await fs.readFile(backupFile, 'utf8'))
const pool = getPool()
const client = await pool.connect()

try {
  await client.query('begin')

  for (const table of [...BACKUP_TABLES].reverse()) {
    await client.query(`truncate table ${table} cascade`)
  }

  for (const table of BACKUP_TABLES) {
    const rows = backup.tables?.[table] || []

    for (const row of rows) {
      const columns = Object.keys(row)
      const values = Object.values(row)
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')

      await client.query(
        `insert into ${table} (${columns.join(', ')}) values (${placeholders})`,
        values,
      )
    }
  }

  await client.query('commit')
  console.log(`Restore completed from: ${backupFile}`)
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  client.release()
  await pool.end()
}
