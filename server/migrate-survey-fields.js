// Adds survey response columns to the players table
// Usage: npm run migrate:survey

import { getDb, run } from './db.js'

async function migrate() {
  await getDb()

  const columns = [
    { name: 'unsure_reason',   type: 'TEXT' },
    { name: 'player_type',     type: 'TEXT' },
    { name: 'interested_in',   type: 'TEXT' },
    { name: 'previous_club',   type: 'TEXT' },
    { name: 'follow_up_ok',    type: 'INTEGER' },
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
