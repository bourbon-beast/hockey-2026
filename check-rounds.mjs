import { createClient } from '@libsql/client'

const turso = createClient({
  url: 'libsql://hockey-2026-stevegwaters.aws-ap-northeast-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI3ODEzMjQsImlkIjoiMDE5Y2MyMDAtMTQwMS03NDEzLTk1MGEtNGM0ZDE1NjNmYzY4IiwicmlkIjoiZDhhZjBkMTctYTRiZi00OWU4LWIzN2MtNzNmZTRlNDJmYzY0In0.xz3DBz8A4wiNE5bg4OxSBbqjrEDiFIGLYFtuxfLQQjrOwabY9Qy1Cf972LgVOzMlmTMQgqtrULjTl3g_DVIgAA'
})

const r = await turso.execute('SELECT id, round_number, round_type, name, round_date FROM rounds ORDER BY id')
console.log('ROUNDS:')
r.rows.forEach(row => console.log(JSON.stringify(row)))

const schema = await turso.execute("PRAGMA table_info(rounds)")
console.log('\nROUNDS SCHEMA:')
schema.rows.forEach(row => console.log(JSON.stringify(row)))
