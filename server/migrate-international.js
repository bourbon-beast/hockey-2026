// Adds is_international and needs_visa columns to players table
// Usage: npm run migrate:international

import { getDb, run } from './db.js'

async function migrate() {
  await getDb()

  const columns = [
    { name: 'is_international', type: 'INTEGER DEFAULT 0' },
    { name: 'needs_visa',       type: 'INTEGER DEFAULT 0' },
  ]

  for (const col of columns) {
    try {
      run(`ALTER TABLE players ADD COLUMN ${col.name} ${col.type}`)
      console.log(`Added ${col.name}`)
    } catch (e) {
      console.log(`${col.name} already exists`)
    }
  }

  console.log('Migration complete.')
}

migrate().catch(console.error)
