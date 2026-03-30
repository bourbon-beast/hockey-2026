#!/usr/bin/env node
// seed-unavailability.cjs — Import unavailability data from CSV into DB
// Usage: node scripts/seed-unavailability.cjs
// Env vars: TURSO_URL, TURSO_TOKEN

const { createClient } = require('../functions/node_modules/@libsql/client')

const TURSO_URL   = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌  Set TURSO_URL and TURSO_TOKEN env vars first')
  process.exit(1)
}

const db = createClient({ url: TURSO_URL.trim(), authToken: TURSO_TOKEN.trim() })

// Map round labels from CSV -> round_number in DB
const ROUND_LABEL_MAP = {
  'Rd 19':    19, 'Rd 20':   20, 'Round 1':  1,  'Round 2':  2,
  'Round 3':  3,  'Round 4':  4,  'Round 5':  5,  'Round 6':  6,
  'Round 7':  7,  'Round 8':  8,  'Rd 21':   21,  'Round 9':  9,
  'Round 10': 10, 'Round 11': 11, 'Round 12': 12, 'Round 13': 13,
  'Rd 22':    22, 'Round 14': 14, 'Round 15': 15, 'Round 16': 16,
  'Round 17': 17, 'Round 18': 18,
}

async function main() {
  console.log('🏑  Seeding player unavailability...\n')

  // Load all rounds and players from DB
  const rounds  = await db.execute({ sql: 'SELECT id, round_number FROM rounds', args: [] })
  const players = await db.execute({ sql: 'SELECT id, name FROM players', args: [] })

  const roundByNumber = Object.fromEntries(rounds.rows.map(r => [Number(r.round_number), Number(r.id)]))
  const playerByName  = Object.fromEntries(players.rows.map(p => [p.name.trim().toLowerCase(), Number(p.id)]))

  // Hardcoded unavailability extracted from CSV (deduplicated to round level)
  const unavailability = [
    { name: 'Fraser Boyle',       rounds: [19, 2, 4] },
    { name: 'Scott Richardson',   rounds: [19, 20, 3, 4] },
    { name: 'Cameron Stokoe',     rounds: [1] },
    { name: 'Luke Callander',     rounds: [2] },
    { name: 'Tim Cansdale',       rounds: [2, 3, 4] },
    { name: 'Andy Ridley',        rounds: [6, 7, 12] },
    { name: 'Bailey Slyp',        rounds: [4, 8] },
    { name: 'Brian Rankin',       rounds: [9, 10, 11] },
    { name: 'Lachlan Robinson',   rounds: [12] },
    { name: 'Hayden Mitchell',    rounds: [19] },
    { name: 'Xavier Davis',       rounds: [19] },
    { name: 'Thomas Robinson',    rounds: [19] },
    { name: 'Harrison Edwards',   rounds: [6] },
    { name: 'Keenan Trinidade',   rounds: [2] },
    { name: 'Anthony Forbes',     rounds: [3] },
    { name: 'Trent Dean',         rounds: [1, 2, 3, 4, 5, 6, 7, 8, 21, 9, 10, 11] },
  ]

  let inserted = 0
  let skipped  = 0
  let notFound = 0

  const now = new Date().toISOString()

  for (const entry of unavailability) {
    const playerId = playerByName[entry.name.trim().toLowerCase()]
    if (!playerId) {
      console.log(`  ⚠️  Player not found: "${entry.name}"`)
      notFound++
      continue
    }
    for (const roundNum of entry.rounds) {
      const roundId = roundByNumber[roundNum]
      if (!roundId) {
        console.log(`  ⚠️  Round ${roundNum} not found in DB`)
        continue
      }
      try {
        await db.execute({
          sql: 'INSERT OR IGNORE INTO player_unavailability (player_id, round_id, created_at) VALUES (?, ?, ?)',
          args: [playerId, roundId, now]
        })
        console.log(`  ✅  ${entry.name} — Round ${roundNum}`)
        inserted++
      } catch (err) {
        if (err.message.includes('UNIQUE')) {
          skipped++
        } else {
          console.error(`  ❌  ${entry.name} Round ${roundNum}: ${err.message}`)
        }
      }
    }
  }

  console.log(`\n✨  Done — ${inserted} inserted, ${skipped} already existed, ${notFound} players not found`)
  process.exit(0)
}

main().catch(err => {
  console.error('❌  Error:', err.message)
  process.exit(1)
})
