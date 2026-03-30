import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'squad.db')

// Initialize sql.js
const SQL = await initSqlJs()
const db = new SQL.Database()

// Create tables
db.run(`
  CREATE TABLE teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  )
`)

db.run(`
  CREATE TABLE statuses (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    sort_order INTEGER NOT NULL
  )
`)

db.run(`
  CREATE TABLE players (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    primary_team_id_2025 TEXT,
    total_games_2025 INTEGER DEFAULT 0,
    status_id TEXT NOT NULL DEFAULT 'not_heard',
    playing_preference TEXT,
    notes TEXT,
    assigned_team_id_2026 TEXT,
    is_new_registration INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`)

db.run(`
  CREATE TABLE player_team_history (
    id INTEGER PRIMARY KEY,
    player_id INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    season INTEGER NOT NULL,
    games_played INTEGER NOT NULL,
    role TEXT NOT NULL
  )
`)

// Parse CSV helper - handles Windows line endings
function parseCSV(content) {
  // Normalize line endings and remove BOM if present
  content = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  const lines = content.trim().split('\n').filter(line => line.trim())
  const headers = lines[0].split(',').map(h => h.trim())
  
  console.log('  Headers:', headers)
  console.log('  Total lines:', lines.length)
  
  const results = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = values[idx] || null
    })
    results.push(obj)
  }
  
  console.log('  Parsed rows:', results.length)
  if (results.length > 0) {
    console.log('  First row:', results[0])
  }
  
  return results
}

// Seed teams
const teams = [
  { id: 'PL', name: 'Premier League', sort_order: 1 },
  { id: 'PLR', name: 'Premier League Reserves', sort_order: 2 },
  { id: 'PB', name: 'Pennant B', sort_order: 3 },
  { id: 'PC', name: 'Pennant C', sort_order: 4 },
  { id: 'PE', name: 'Pennant E', sort_order: 5 },
  { id: 'Metro', name: 'Metro', sort_order: 6 },
]

for (const t of teams) {
  db.run('INSERT INTO teams (id, name, sort_order) VALUES (?, ?, ?)', [t.id, t.name, t.sort_order])
}
console.log(`Inserted ${teams.length} teams`)

// Seed statuses
const statuses = [
  { id: 'planning', label: 'Planning to play', color: '#22c55e', sort_order: 1 },
  { id: 'unsure', label: 'Unsure', color: '#eab308', sort_order: 2 },
  { id: 'unlikely', label: 'Unlikely to play', color: '#a855f7', sort_order: 3 },
  { id: 'not_heard', label: 'Not heard from', color: '#6b7280', sort_order: 4 },
  { id: 'not_returning', label: 'Not returning', color: '#ef4444', sort_order: 5 },
  { id: 'fill_in', label: 'Fill-in only', color: '#3b82f6', sort_order: 6 },
  { id: 'new', label: 'New / Restarting', color: '#06b6d4', sort_order: 7 },
]

for (const s of statuses) {
  db.run('INSERT INTO statuses (id, label, color, sort_order) VALUES (?, ?, ?, ?)', [s.id, s.label, s.color, s.sort_order])
}
console.log(`Inserted ${statuses.length} statuses`)

// Read data files
const dataDir = join(__dirname, 'data')

let playersData, historyData
try {
  console.log('\nParsing players.csv...')
  playersData = parseCSV(readFileSync(join(dataDir, 'players.csv'), 'utf-8'))
  
  console.log('\nParsing player_team_history.csv...')
  historyData = parseCSV(readFileSync(join(dataDir, 'player_team_history.csv'), 'utf-8'))
} catch (e) {
  console.error('Could not read data files from server/data/')
  console.error('Please copy players.csv and player_team_history.csv to server/data/')
  console.error(e)
  process.exit(1)
}

// Seed players
let playerCount = 0
for (const p of playersData) {
  if (!p.name) continue
  
  db.run(`
    INSERT INTO players (id, name, primary_team_id_2025, total_games_2025, status_id, playing_preference, notes, assigned_team_id_2026, is_new_registration, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    parseInt(p.id),
    p.name,
    p.primary_team_id_2025 || null,
    parseInt(p.total_games_2025) || 0,
    p.status_id || 'not_heard',
    p.playing_preference || null,
    p.notes || null,
    p.assigned_team_id_2026 || null,
    p.is_new_registration === 'True' ? 1 : 0,
    p.created_at || new Date().toISOString(),
    p.updated_at || new Date().toISOString()
  ])
  playerCount++
}
console.log(`\nInserted ${playerCount} players`)

// Seed player team history
let historyCount = 0
for (const h of historyData) {
  if (!h.player_id || !h.team_id) {
    console.log('  Skipping invalid row:', h)
    continue
  }
  
  db.run(`
    INSERT INTO player_team_history (id, player_id, team_id, season, games_played, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    parseInt(h.id),
    parseInt(h.player_id),
    h.team_id,
    parseInt(h.season),
    parseInt(h.games_played),
    h.role
  ])
  historyCount++
}
console.log(`Inserted ${historyCount} player team history records`)

// Save database to file
const data = db.export()
const buffer = Buffer.from(data)
writeFileSync(DB_PATH, buffer)

console.log(`\nDatabase saved to ${DB_PATH}`)
console.log('Seeding complete!')

db.close()
