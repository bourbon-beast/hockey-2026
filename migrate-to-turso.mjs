// migrate-to-turso.mjs
// Reads local squad.db (sql.js format) and pushes all data to Turso
// Run: node migrate-to-turso.mjs
// Run dry: node migrate-to-turso.mjs --dry-run

import initSqlJs from 'sql.js'
import { readFileSync } from 'fs'
import { createClient } from '@libsql/client'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

const TURSO_URL = 'libsql://hockey-2026-stevegwaters.aws-ap-northeast-1.turso.io'
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI3ODEzMjQsImlkIjoiMDE5Y2MyMDAtMTQwMS03NDEzLTk1MGEtNGM0ZDE1NjNmYzY4IiwicmlkIjoiZDhhZjBkMTctYTRiZi00OWU4LWIzN2MtNzNmZTRlNDJmYzY0In0.xz3DBz8A4wiNE5bg4OxSBbqjrEDiFIGLYFtuxfLQQjrOwabY9Qy1Cf972LgVOzMlmTMQgqtrULjTl3g_DVIgAA'

console.log(DRY_RUN ? '🔍 DRY RUN MODE — no data will be written\n' : '🚀 LIVE MODE — writing to Turso\n')

// Load local SQLite DB
const SQL = await initSqlJs()
const buffer = readFileSync(join(__dirname, 'server/squad.db'))
const localDb = new SQL.Database(buffer)

function localAll(sql, params = []) {
  const stmt = localDb.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

// Connect to Turso
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN })

// ── Create schema on Turso ────────────────────────────────────────────────────
const schema = [
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status_id TEXT,
    primary_team_id_2025 TEXT,
    assigned_team_id_2026 TEXT,
    total_games_2025 INTEGER DEFAULT 0,
    notes TEXT,
    playing_preference TEXT,
    is_new_registration INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    unsure_reason TEXT,
    player_type TEXT,
    interested_in TEXT,
    previous_club TEXT,
    follow_up_ok INTEGER,
    is_international INTEGER DEFAULT 0,
    needs_visa INTEGER DEFAULT 0,
    default_position TEXT,
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS player_team_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    role TEXT,
    games_played INTEGER DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS rounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_number INTEGER,
    name TEXT,
    round_type TEXT DEFAULT 'season',
    created_at TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS round_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    match_date TEXT,
    time TEXT,
    venue TEXT,
    opponent TEXT,
    top_colour TEXT DEFAULT 'blue',
    socks_colour TEXT DEFAULT 'yellow'
  )`,
  `CREATE TABLE IF NOT EXISTS round_selections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    player_id INTEGER NOT NULL,
    slot_number INTEGER,
    position TEXT,
    confirmed INTEGER DEFAULT 0
  )`
]

async function createSchema() {
  console.log('📐 Creating schema on Turso...')
  for (const sql of schema) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)[1]
    if (DRY_RUN) { console.log(`  [dry] would create table: ${tableName}`); continue }
    await turso.execute(sql)
    console.log(`  ✓ ${tableName}`)
  }
}

async function migrateTable(tableName, rows, buildInsert) {
  console.log(`\n📦 Migrating ${tableName} (${rows.length} rows)...`)
  if (rows.length === 0) { console.log('  (empty, skipping)'); return }
  let count = 0
  for (const row of rows) {
    const { sql, args } = buildInsert(row)
    if (DRY_RUN) { if (count < 2) console.log(`  [dry] ${sql.substring(0,80)}...`); count++; continue }
    await turso.execute({ sql, args })
    count++
  }
  console.log(`  ✓ ${count} rows inserted`)
}

// ── Run migration ─────────────────────────────────────────────────────────────
await createSchema()

// teams
const teams = localAll('SELECT * FROM teams ORDER BY sort_order')
await migrateTable('teams', teams, (r) => ({
  sql: 'INSERT OR REPLACE INTO teams (id, name, sort_order) VALUES (?, ?, ?)',
  args: [r.id, r.name, r.sort_order ?? 0]
}))

// statuses
const statuses = localAll('SELECT * FROM statuses ORDER BY sort_order')
await migrateTable('statuses', statuses, (r) => ({
  sql: 'INSERT OR REPLACE INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)',
  args: [r.id, r.label, r.color ?? null, r.sort_order ?? 0]
}))

// players
const players = localAll('SELECT * FROM players ORDER BY id')
await migrateTable('players', players, (r) => ({
  sql: `INSERT OR REPLACE INTO players
    (id, name, status_id, primary_team_id_2025, assigned_team_id_2026,
     total_games_2025, notes, playing_preference, is_new_registration, is_active,
     unsure_reason, player_type, interested_in, previous_club, follow_up_ok,
     is_international, needs_visa, default_position, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  args: [
    r.id, r.name, r.status_id ?? null, r.primary_team_id_2025 ?? null,
    r.assigned_team_id_2026 ?? null, r.total_games_2025 ?? 0, r.notes ?? null,
    r.playing_preference ?? null, r.is_new_registration ?? 0, r.is_active ?? 1,
    r.unsure_reason ?? null, r.player_type ?? null, r.interested_in ?? null,
    r.previous_club ?? null, r.follow_up_ok ?? null, r.is_international ?? 0,
    r.needs_visa ?? 0, r.default_position ?? null, r.created_at ?? null, r.updated_at ?? null
  ]
}))

// player_team_history
const history = localAll('SELECT * FROM player_team_history ORDER BY id')
await migrateTable('player_team_history', history, (r) => ({
  sql: 'INSERT OR REPLACE INTO player_team_history (id, player_id, team_id, role, games_played) VALUES (?,?,?,?,?)',
  args: [r.id, r.player_id, r.team_id, r.role ?? null, r.games_played ?? 0]
}))

// rounds
const rounds = localAll('SELECT * FROM rounds ORDER BY id')
await migrateTable('rounds', rounds, (r) => ({
  sql: 'INSERT OR REPLACE INTO rounds (id, round_number, name, round_type, created_at, updated_at) VALUES (?,?,?,?,?,?)',
  args: [r.id, r.round_number ?? null, r.name ?? null, r.round_type ?? 'season', r.created_at ?? null, r.updated_at ?? null]
}))

// round_matches
const matches = localAll('SELECT * FROM round_matches ORDER BY id')
await migrateTable('round_matches', matches, (r) => ({
  sql: `INSERT OR REPLACE INTO round_matches
    (id, round_id, team_id, match_date, time, venue, opponent, top_colour, socks_colour)
    VALUES (?,?,?,?,?,?,?,?,?)`,
  args: [r.id, r.round_id, r.team_id, r.match_date ?? '', r.time ?? '', r.venue ?? '', r.opponent ?? '', r.top_colour ?? 'blue', r.socks_colour ?? 'yellow']
}))

// round_selections
const selections = localAll('SELECT * FROM round_selections ORDER BY id')
await migrateTable('round_selections', selections, (r) => ({
  sql: `INSERT OR REPLACE INTO round_selections
    (id, round_id, team_id, player_id, slot_number, position, confirmed)
    VALUES (?,?,?,?,?,?,?)`,
  args: [r.id, r.round_id, r.team_id, r.player_id, r.slot_number ?? null, r.position ?? null, r.confirmed ?? 0]
}))

console.log('\n✅ Migration complete!')
if (DRY_RUN) console.log('   (dry run — nothing was written)')
turso.close()
