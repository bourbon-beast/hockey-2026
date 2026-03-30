import { getDb, run } from './db.js'
await getDb()

try {
  run(`ALTER TABLE round_matches ADD COLUMN top_colour TEXT DEFAULT 'blue'`)
  console.log('Added top_colour')
} catch (e) {
  console.log('top_colour already exists:', e.message)
}

try {
  run(`ALTER TABLE round_matches ADD COLUMN socks_colour TEXT DEFAULT 'yellow'`)
  console.log('Added socks_colour')
} catch (e) {
  console.log('socks_colour already exists:', e.message)
}

console.log('Done.')
