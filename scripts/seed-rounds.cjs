#!/usr/bin/env node
// seed-rounds.js — Pre-create all 2026 season rounds with dates
// Usage: node scripts/seed-rounds.js
//
// Skips rounds that already exist (matched by round_number).
// Creates empty round_matches rows for all 6 teams per round.

const { createClient } = require('../functions/node_modules/@libsql/client')

// Pass credentials as env vars:
//   $env:TURSO_URL="libsql://..."; $env:TURSO_TOKEN="ey..."; node scripts/seed-rounds.js
// Or inline:
//   TURSO_URL="..." TURSO_TOKEN="..." node scripts/seed-rounds.js
const TURSO_URL   = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌  Set TURSO_URL and TURSO_TOKEN as environment variables before running.')
  console.error('    PowerShell example:')
  console.error('      $env:TURSO_URL="libsql://your-db.turso.io"')
  console.error('      $env:TURSO_TOKEN="eyJ..."')
  console.error('      node scripts/seed-rounds.js')
  process.exit(1)
}

const db = createClient({ url: TURSO_URL.trim(), authToken: TURSO_TOKEN.trim() })

// All 2026 season rounds — round_date is the Saturday (or actual date for mid-week)
// name only set for the oddly-numbered PL mid-week/early rounds
const ROUNDS = [
  { round_number: 19, round_date: '2026-03-29', name: 'Rd 19' },
  { round_number: 20, round_date: '2026-04-02', name: 'Rd 20' },
  { round_number:  1, round_date: '2026-04-11' },
  { round_number:  2, round_date: '2026-04-18' },
  { round_number:  3, round_date: '2026-04-25' },
  { round_number:  4, round_date: '2026-05-02' },
  { round_number:  5, round_date: '2026-05-09' },
  { round_number:  6, round_date: '2026-05-16' },
  { round_number:  7, round_date: '2026-05-23' },
  { round_number:  8, round_date: '2026-05-30' },
  { round_number: 21, round_date: '2026-06-04', name: 'Rd 21' },
  { round_number:  9, round_date: '2026-06-13' },
  { round_number: 10, round_date: '2026-06-20' },
  { round_number: 11, round_date: '2026-06-27' },
  { round_number: 12, round_date: '2026-07-11' },
  { round_number: 13, round_date: '2026-07-18' },
  { round_number: 22, round_date: '2026-07-21', name: 'Rd 22' },
  { round_number: 14, round_date: '2026-07-25' },
  { round_number: 15, round_date: '2026-08-01' },
  { round_number: 16, round_date: '2026-08-08' },
  { round_number: 17, round_date: '2026-08-15' },
  { round_number: 18, round_date: '2026-08-22' },
]

const TEAMS = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']

async function main() {
  console.log('🏑  Seeding 2026 season rounds...\n')

  const existing = await db.execute({ sql: 'SELECT round_number FROM rounds WHERE round_type = ?', args: ['season'] })
  const existingNumbers = new Set(existing.rows.map(r => Number(r.round_number)))

  const now = new Date().toISOString()
  let created = 0
  let skipped = 0

  for (const r of ROUNDS) {
    if (existingNumbers.has(r.round_number)) {
      console.log(`  ⏭️  Round ${r.round_number} already exists — skipping`)
      skipped++
      continue
    }

    const result = await db.execute({
      sql: `INSERT INTO rounds (round_number, name, round_type, round_date, created_at, updated_at)
            VALUES (?, ?, 'season', ?, ?, ?)`,
      args: [r.round_number, r.name || null, r.round_date, now, now]
    })

    const roundId = Number(result.lastInsertRowid)

    for (const teamId of TEAMS) {
      await db.execute({
        sql: `INSERT INTO round_matches (round_id, team_id, match_date, time, arrive_at, venue, opponent, top_colour, socks_colour)
              VALUES (?, ?, '', '', '', '', '', 'blue', 'yellow')`,
        args: [roundId, teamId]
      })
    }

    const label = r.name ? `${r.name} (Round ${r.round_number})` : `Round ${r.round_number}`
    console.log(`  ✅  Created ${label} — ${r.round_date} — db id ${roundId}`)
    created++
  }

  console.log(`\n✨  Done — ${created} created, ${skipped} skipped`)
  process.exit(0)
}

main().catch(err => {
  console.error('❌  Error:', err.message)
  process.exit(1)
})
