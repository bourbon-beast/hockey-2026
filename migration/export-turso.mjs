// migration/export-turso.mjs
// Connects to Turso, discovers all tables, exports schema + data to JSON files
// Run: node migration/export-turso.mjs
// Requires env vars: TURSO_URL, TURSO_TOKEN

import { createClient } from '@libsql/client'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, 'data')

async function main() {
  const url = process.env.TURSO_URL
  const token = process.env.TURSO_TOKEN

  if (!url || !token) {
    console.error('Missing TURSO_URL or TURSO_TOKEN environment variables')
    process.exit(1)
  }

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  const client = createClient({ url: url.trim(), authToken: token.trim() })
  console.log('Connected to Turso:', url)
  console.log('')

  // 1. Get all table names
  const tablesResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  )
  const tableNames = tablesResult.rows.map(r => r.name)
  console.log(`Found ${tableNames.length} tables: ${tableNames.join(', ')}`)
  console.log('')

  const summary = {}

  for (const tableName of tableNames) {
    // 2. Get schema for each table
    const schemaResult = await client.execute(`PRAGMA table_info('${tableName}')`)
    const columns = schemaResult.rows.map(r => ({
      cid: r.cid,
      name: r.name,
      type: r.type,
      notnull: r.notnull,
      default_value: r.dflt_value,
      pk: r.pk
    }))

    // 3. Get row count
    const countResult = await client.execute(`SELECT COUNT(*) as cnt FROM '${tableName}'`)
    const rowCount = Number(countResult.rows[0].cnt)

    // 4. Get all data
    const dataResult = await client.execute(`SELECT * FROM '${tableName}'`)
    const rows = dataResult.rows.map(r => ({ ...r }))

    // 5. Write to JSON file
    const output = { table: tableName, schema: columns, rowCount, rows }
    const filePath = join(OUTPUT_DIR, `${tableName}.json`)
    writeFileSync(filePath, JSON.stringify(output, null, 2))

    summary[tableName] = { columns: columns.length, rows: rowCount }
    console.log(`  ${tableName}: ${rowCount} rows, ${columns.length} columns → ${tableName}.json`)
  }

  console.log('')
  console.log('=== Export Summary ===')
  console.log(JSON.stringify(summary, null, 2))
  console.log('')
  console.log(`All data exported to: ${OUTPUT_DIR}`)
}

main().catch(err => {
  console.error('Export failed:', err)
  process.exit(1)
})
