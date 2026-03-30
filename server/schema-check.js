import { getDb, all } from './db.js'
await getDb()

// Check round_matches schema
const matchSample = all('SELECT * FROM round_matches LIMIT 3')
console.log('MATCH SAMPLE:', JSON.stringify(matchSample, null, 2))

// Check rounds schema
const roundSample = all('SELECT * FROM rounds LIMIT 3')
console.log('ROUND SAMPLE:', JSON.stringify(roundSample, null, 2))

// Get table info
const matchCols = all("PRAGMA table_info(round_matches)")
console.log('MATCH COLS:', JSON.stringify(matchCols))

const roundCols = all("PRAGMA table_info(rounds)")
console.log('ROUND COLS:', JSON.stringify(roundCols))

const playerCols = all("PRAGMA table_info(players)")
console.log('PLAYER COLS:', JSON.stringify(playerCols))
