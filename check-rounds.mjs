import { createClient } from '@libsql/client'

const TURSO_URL = process.env.TURSO_URL
const TURSO_TOKEN = process.env.TURSO_TOKEN

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌  Set TURSO_URL and TURSO_TOKEN as environment variables before running.')
  process.exit(1)
}

const turso = createClient({
  url: TURSO_URL.trim(),
  authToken: TURSO_TOKEN.trim()
})

const r = await turso.execute('SELECT id, round_number, round_type, name, round_date FROM rounds ORDER BY id')
console.log('ROUNDS:')
r.rows.forEach(row => console.log(JSON.stringify(row)))

const schema = await turso.execute("PRAGMA table_info(rounds)")
console.log('\nROUNDS SCHEMA:')
schema.rows.forEach(row => console.log(JSON.stringify(row)))
