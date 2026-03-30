const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const { initializeApp } = require('firebase-admin/app')
const express = require('express')
const cors = require('cors')

initializeApp()

const tursoUrl   = defineSecret('TURSO_URL')
const tursoToken = defineSecret('TURSO_TOKEN')

const app = express()
app.use(cors({ origin: true }))
app.use(express.json())

// Set secrets into env on first request — Gen2 secrets available via .value() at request time
let secretsSet = false
let migrationsRun = false

async function runMigrations(db) {
  if (migrationsRun) return
  migrationsRun = true
  const migrations = [
    'ALTER TABLE round_selections ADD COLUMN is_unavailable INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE round_matches ADD COLUMN arrive_at TEXT',
    'ALTER TABLE rounds ADD COLUMN round_date TEXT',
    `CREATE TABLE IF NOT EXISTS player_unavailability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      round_id INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
      notes TEXT,
      created_at TEXT,
      UNIQUE(player_id, round_id)
    )`,
  ]
  for (const sql of migrations) {
    try {
      await db.run(sql)
      console.log('Migration applied:', sql.slice(0, 60))
    } catch (err) {
      // "duplicate column name" means it already exists — safe to ignore
      if (!err.message.includes('duplicate column')) {
        console.error('Migration error:', err.message)
      }
    }
  }
}

app.use((req, res, next) => {
  if (!secretsSet) {
    const url = tursoUrl.value()
    const token = tursoToken.value()
    console.log('TURSO_URL value:', JSON.stringify(url))
    console.log('TURSO_URL type:', typeof url)
    const db = require('./db')
    db.init(url, token)
    secretsSet = true
    // Run migrations async — don't block the request
    runMigrations(db).catch(err => console.error('Migration failed:', err.message))
  }
  next()
})

const playersRouter       = require('./routes/players')
const teamsRouter         = require('./routes/teams')
const roundsRouter        = require('./routes/rounds')
const statsRouter         = require('./routes/stats')
const recruitmentRouter   = require('./routes/recruitment')
const analyticsRouter     = require('./routes/analytics')
const unavailabilityRouter = require('./routes/unavailability')
const dashboardRouter      = require('./routes/dashboard')

app.use('/api/players',        playersRouter)
app.use('/api/teams',          teamsRouter)
app.use('/api/rounds',         roundsRouter)
app.use('/api/stats',          statsRouter)
app.use('/api/recruitment',    recruitmentRouter)
app.use('/api/analytics',      analyticsRouter)
app.use('/api/unavailability', unavailabilityRouter)
app.use('/api/dashboard',      dashboardRouter)

app.get('/api/statuses', async (req, res) => {
  try {
    const { all } = require('./db')
    const statuses = await all('SELECT * FROM statuses ORDER BY sort_order')
    res.json(statuses)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', project: 'hockey-2026-f521f', db: 'turso' })
})

exports.api = onRequest(
  { region: 'australia-southeast1', secrets: [tursoUrl, tursoToken] },
  app
)
