import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKUP_TABLES, getPool, isDatabaseConfigured } from './index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..', '..')
const backupsDir = path.join(projectRoot, 'backups')

if (!isDatabaseConfigured()) {
  console.error('DATABASE_URL is not configured; cannot create a database backup.')
  process.exit(1)
}

const pool = getPool()

try {
  await fs.mkdir(backupsDir, { recursive: true })

  const backup = {
    createdAt: new Date().toISOString(),
    tables: {},
  }

  for (const table of BACKUP_TABLES) {
    const result = await pool.query(`select * from ${table} order by 1 asc`)
    backup.tables[table] = result.rows
  }

  const stamp = backup.createdAt.replace(/[:.]/g, '-')
  const filePath = path.join(backupsDir, `comms-tool-db-${stamp}.json`)
  await fs.writeFile(filePath, `${JSON.stringify(backup, null, 2)}\n`)
  console.log(`Backup written: ${filePath}`)
} finally {
  await pool.end()
}
