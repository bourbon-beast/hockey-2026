import Database from 'better-sqlite3'

const db = new Database('F:/Documents/Steve/Development/players-2026/backend/players.db', { readonly: true })

console.log('=== TABLES ===')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
tables.forEach(t => {
  console.log('\nTable:', t.name)
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all()
  cols.forEach(c => console.log('  ', c.name, c.type, c.notnull ? 'NOT NULL' : ''))
})

console.log('\n=== STATUS VALUES ===')
try {
  const statuses = db.prepare('SELECT DISTINCT status, COUNT(*) as count FROM players GROUP BY status ORDER BY count DESC').all()
  statuses.forEach(s => console.log(`  "${s.status}" — ${s.count} players`))
} catch(e) { console.log('error:', e.message) }

console.log('\n=== SAMPLE PLAYERS (3) ===')
const players = db.prepare('SELECT * FROM players LIMIT 3').all()
players.forEach(p => console.log(JSON.stringify(p)))
