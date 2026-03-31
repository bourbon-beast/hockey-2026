import express from 'express'
import cors from 'cors'
import { getDb, all, get, run, saveDb } from './db.js'

const app = express()

const allowedOrigins = [
  'https://hockey-2026-f521f.web.app',
  'https://hockey-2026-f521f.firebaseapp.com',
  'http://localhost:5173',
  'http://localhost:3000',
]

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}))
app.use(express.json())

// Log all requests
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`, req.body || '')
  next()
})

// Initialize DB before starting server
await getDb()

// ── Schema migrations (safe, idempotent) ─────────────────────────────
const rmCols = all("PRAGMA table_info(round_matches)").map(c => c.name)
const rmNeeded = [
  { name: 'match_date',   def: 'TEXT' },
  { name: 'time',         def: 'TEXT' },
  { name: 'venue',        def: 'TEXT' },
  { name: 'opponent',     def: 'TEXT' },
  { name: 'top_colour',   def: 'TEXT' },
  { name: 'socks_colour', def: 'TEXT' },
]
for (const col of rmNeeded) {
  if (!rmCols.includes(col.name)) {
    run(`ALTER TABLE round_matches ADD COLUMN ${col.name} ${col.def}`)
    console.log(`Migration: added round_matches.${col.name}`)
  }
}

// Players table migrations
const plCols = all("PRAGMA table_info(players)").map(c => c.name)
if (!plCols.includes('is_active')) {
  run(`ALTER TABLE players ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`)
  console.log('Migration: added players.is_active')
}

// player_unavailability table — master unavailability records per player
const tables = all("SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name)
if (!tables.includes('player_unavailability')) {
  run(`
    CREATE TABLE player_unavailability (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      from_date TEXT,
      to_date   TEXT,
      from_round INTEGER,
      to_round   INTEGER,
      notes     TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  console.log('Migration: created player_unavailability table')
}

// round_selections — add is_unavailable flag (player asked, said no for this round)
const rsCols = all("PRAGMA table_info(round_selections)").map(c => c.name)
if (!rsCols.includes('is_unavailable')) {
  run(`ALTER TABLE round_selections ADD COLUMN is_unavailable INTEGER NOT NULL DEFAULT 0`)
  console.log('Migration: added round_selections.is_unavailable')
}

// Get all teams
app.get('/api/teams', (req, res) => {
  const teams = all('SELECT * FROM teams ORDER BY sort_order')
  res.json(teams)
})

// Get all statuses
app.get('/api/statuses', (req, res) => {
  const statuses = all('SELECT * FROM statuses ORDER BY sort_order')
  res.json(statuses)
})

// Get all players — active only by default; pass ?include_inactive=true to get all
app.get('/api/players', (req, res) => {
  const includeInactive = req.query.include_inactive === 'true'
  const whereClause = includeInactive ? '' : 'WHERE p.is_active = 1 OR p.is_active IS NULL'
  const players = all(`
    SELECT p.*,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND r.round_type = 'season') AS total_season_games,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'PL'  AND r.round_type = 'season') AS games_PL,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'PLR' AND r.round_type = 'season') AS games_PLR,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'PB'  AND r.round_type = 'season') AS games_PB,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'PC'  AND r.round_type = 'season') AS games_PC,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'PE'  AND r.round_type = 'season') AS games_PE,
      (SELECT COUNT(*) FROM round_selections rs JOIN rounds r ON rs.round_id = r.id
        WHERE rs.player_id = p.id AND rs.team_id = 'Metro' AND r.round_type = 'season') AS games_Metro
    FROM players p
    ${whereClause}
    ORDER BY p.name
  `)
  res.json(players)
})

// Get single player with history
app.get('/api/players/:id', (req, res) => {
  const player = get('SELECT * FROM players WHERE id = ?', [req.params.id])
  if (!player) return res.status(404).json({ error: 'Not found' })
  
  const history = all(`
    SELECT * FROM player_team_history 
    WHERE player_id = ? 
    ORDER BY games_played DESC
  `, [req.params.id])
  
  // Get 2026 games from round selections (season games only)
  const games2026 = all(`
    SELECT rs.team_id, COUNT(*) as games
    FROM round_selections rs
    JOIN rounds r ON rs.round_id = r.id
    WHERE rs.player_id = ? AND r.round_type = 'season'
    GROUP BY rs.team_id
  `, [req.params.id])
  
  res.json({ ...player, history, games2026 })
})

// Create a new player (new recruit)
app.post('/api/players', (req, res) => {
  const { name, status_id = 'not_heard', assigned_team_id_2026 = null, notes = null, playing_preference = null } = req.body
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
  const now = new Date().toISOString()
  run(`
    INSERT INTO players (name, status_id, assigned_team_id_2026, notes, playing_preference, is_new_registration, total_games_2025, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `, [name.trim(), status_id, assigned_team_id_2026, notes, playing_preference, status_id === 'new' ? 1 : 0, now, now])
  const player = get('SELECT * FROM players ORDER BY id DESC LIMIT 1')
  res.json(player)
})

// Update player
app.patch('/api/players/:id', (req, res) => {
  try {
    const { name, is_active, status_id, assigned_team_id_2026, notes, is_new_registration,
            playing_preference, unsure_reason, player_type, interested_in, previous_club,
            follow_up_ok, is_international, needs_visa } = req.body
    const updates = []
    const params = []

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' })
      updates.push('name = ?')
      params.push(name.trim())
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?')
      params.push(is_active ? 1 : 0)
    }
    if (status_id !== undefined) {
      updates.push('status_id = ?')
      params.push(status_id)
    }
    if (assigned_team_id_2026 !== undefined) {
      updates.push('assigned_team_id_2026 = ?')
      params.push(assigned_team_id_2026)
    }
    if (notes !== undefined) {
      updates.push('notes = ?')
      params.push(notes)
    }
    if (is_new_registration !== undefined) {
      updates.push('is_new_registration = ?')
      params.push(is_new_registration ? 1 : 0)
    }
    if (playing_preference !== undefined) {
      updates.push('playing_preference = ?')
      params.push(playing_preference || null)
    }
    if (unsure_reason !== undefined) {
      updates.push('unsure_reason = ?')
      params.push(unsure_reason || null)
    }
    if (player_type !== undefined) {
      updates.push('player_type = ?')
      params.push(player_type || null)
    }
    if (interested_in !== undefined) {
      updates.push('interested_in = ?')
      params.push(interested_in || null)
    }
    if (previous_club !== undefined) {
      updates.push('previous_club = ?')
      params.push(previous_club || null)
    }
    if (follow_up_ok !== undefined) {
      updates.push('follow_up_ok = ?')
      params.push(follow_up_ok === null ? null : (follow_up_ok ? 1 : 0))
    }
    if (is_international !== undefined) {
      updates.push('is_international = ?')
      params.push(is_international ? 1 : 0)
    }
    if (needs_visa !== undefined) {
      updates.push('needs_visa = ?')
      params.push(needs_visa ? 1 : 0)
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(new Date().toISOString())
      params.push(req.params.id)
      run(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    const player = get('SELECT * FROM players WHERE id = ?', [req.params.id])
    res.json(player)
  } catch (err) {
    console.error('PATCH /api/players error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Get players for a team view
app.get('/api/teams/:id/players', (req, res) => {
  const teamId = req.params.id
  
  const mainSquad = all(`
    SELECT p.*, pth.games_played as games_for_team
    FROM players p
    JOIN player_team_history pth ON p.id = pth.player_id
    WHERE pth.team_id = ? AND pth.role = 'main_squad'
    ORDER BY pth.games_played DESC
  `, [teamId])
  
  const fillIns = all(`
    SELECT p.*, pth.games_played as games_for_team
    FROM players p
    JOIN player_team_history pth ON p.id = pth.player_id
    WHERE pth.team_id = ? AND pth.role = 'fill_in'
    ORDER BY pth.games_played DESC
  `, [teamId])
  
  const squad2026 = all(`
    SELECT * FROM players 
    WHERE assigned_team_id_2026 = ?
    ORDER BY name
  `, [teamId])
  
  res.json({ mainSquad, fillIns, squad2026 })
})

// Dashboard stats
app.get('/api/stats', (req, res) => {
  const totalPlayers = get('SELECT COUNT(*) as count FROM players').count
  const assigned2026 = get('SELECT COUNT(*) as count FROM players WHERE assigned_team_id_2026 IS NOT NULL').count
  
  const byStatus = all(`
    SELECT s.id as status_id, s.label, s.color, COUNT(p.id) as count
    FROM statuses s
    LEFT JOIN players p ON p.status_id = s.id
    GROUP BY s.id
    ORDER BY s.sort_order
  `)
  
  // Per-team aggregate counts
  const byTeam = all(`
    SELECT 
      t.id as team_id,
      t.name as team_name,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' THEN p.id END) as main_squad,
      COUNT(DISTINCT CASE WHEN pth.role = 'fill_in'    THEN p.id END) as fill_ins,
      COUNT(DISTINCT CASE WHEN p.assigned_team_id_2026 = t.id THEN p.id END) as assigned_2026,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'planning'      THEN p.id END) as s_planning,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'unsure'        THEN p.id END) as s_unsure,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'unlikely'      THEN p.id END) as s_unlikely,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'not_heard'     THEN p.id END) as s_not_heard,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'not_returning' THEN p.id END) as s_not_returning,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'fill_in'       THEN p.id END) as s_fill_in,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'new'           THEN p.id END) as s_new
    FROM teams t
    LEFT JOIN player_team_history pth ON pth.team_id = t.id
    LEFT JOIN players p ON p.id = pth.player_id
    WHERE t.id != 'NEW'
    GROUP BY t.id
    ORDER BY t.sort_order
  `)
  
  // New registrations — players with status 'new'
  const newRegistrations = all(`
    SELECT id, name, status_id, assigned_team_id_2026, playing_preference
    FROM players
    WHERE status_id = 'new'
    ORDER BY name
  `)

  res.json({ totalPlayers, assigned2026, byStatus, byTeam, newRegistrations })
})

// Recruitment data — new registrations + internationals
app.get('/api/recruitment', (req, res) => {
  const newPlayers = all(`
    SELECT id, name, status_id, assigned_team_id_2026, playing_preference,
           player_type, interested_in, previous_club, follow_up_ok,
           is_international, needs_visa, notes, created_at
    FROM players
    WHERE status_id = 'new'
    ORDER BY name
  `)

  const internationals = all(`
    SELECT id, name, status_id, assigned_team_id_2026, primary_team_id_2025,
           total_games_2025, is_international, needs_visa, notes
    FROM players
    WHERE is_international = 1
    ORDER BY assigned_team_id_2026, name
  `)

  // Per-team international counts (for the warning indicator)
  const intlByTeam = all(`
    SELECT assigned_team_id_2026 as team_id, COUNT(*) as count
    FROM players
    WHERE is_international = 1 AND assigned_team_id_2026 IS NOT NULL
    GROUP BY assigned_team_id_2026
  `)

  res.json({ newPlayers, internationals, intlByTeam })
})

// ============ ANALYTICS API ============
app.get('/api/analytics', (req, res) => {
  const TEAM_ORDER = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']
  const TARGET_MIN = 13
  const TARGET_MAX = 15

  // Overall status counts
  const overall = get(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status_id = 'planning'      THEN 1 ELSE 0 END) as planning,
      SUM(CASE WHEN status_id = 'fill_in'       THEN 1 ELSE 0 END) as fill_in,
      SUM(CASE WHEN status_id = 'unsure'        THEN 1 ELSE 0 END) as unsure,
      SUM(CASE WHEN status_id = 'unlikely'      THEN 1 ELSE 0 END) as unlikely,
      SUM(CASE WHEN status_id = 'not_heard'     THEN 1 ELSE 0 END) as not_heard,
      SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning,
      SUM(CASE WHEN status_id = 'new'           THEN 1 ELSE 0 END) as new_reg
    FROM players
  `)

  // Per-team summary by 2025 primary team
  const teamRows = all(`
    SELECT
      primary_team_id_2025 as team,
      COUNT(*) as total_2025,
      SUM(CASE WHEN status_id = 'planning'                                                       THEN 1 ELSE 0 END) as planning,
      SUM(CASE WHEN status_id = 'fill_in'                                                        THEN 1 ELSE 0 END) as fill_in,
      SUM(CASE WHEN status_id = 'unsure'                                                         THEN 1 ELSE 0 END) as unsure,
      SUM(CASE WHEN status_id = 'unlikely'                                                       THEN 1 ELSE 0 END) as unlikely,
      SUM(CASE WHEN status_id = 'not_heard'                                                      THEN 1 ELSE 0 END) as not_heard,
      SUM(CASE WHEN status_id = 'not_returning'                                                  THEN 1 ELSE 0 END) as not_returning,
      SUM(CASE WHEN status_id IN ('planning','fill_in','unsure')                                 THEN 1 ELSE 0 END) as engaged,
      SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') AND total_games_2025 >= 6       THEN 1 ELSE 0 END) as core_engaged,
      SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') AND total_games_2025 BETWEEN 1 AND 5 THEN 1 ELSE 0 END) as casual_engaged
    FROM players
    WHERE status_id != 'new' AND primary_team_id_2025 IS NOT NULL
    GROUP BY primary_team_id_2025
  `)

  // Per-team bracket breakdown
  const bracketRows = all(`
    SELECT
      primary_team_id_2025 as team,
      CASE
        WHEN total_games_2025 = 0   THEN '0 games'
        WHEN total_games_2025 <= 5  THEN '1–5 games'
        WHEN total_games_2025 <= 10 THEN '6–10 games'
        WHEN total_games_2025 <= 15 THEN '11–15 games'
        ELSE '16+ games'
      END as bracket,
      MIN(total_games_2025) as min_g,
      COUNT(*) as total,
      SUM(CASE WHEN status_id = 'planning'      THEN 1 ELSE 0 END) as planning,
      SUM(CASE WHEN status_id = 'fill_in'       THEN 1 ELSE 0 END) as fill_in,
      SUM(CASE WHEN status_id = 'unsure'        THEN 1 ELSE 0 END) as unsure,
      SUM(CASE WHEN status_id = 'unlikely'      THEN 1 ELSE 0 END) as unlikely,
      SUM(CASE WHEN status_id = 'not_heard'     THEN 1 ELSE 0 END) as not_heard,
      SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning
    FROM players
    WHERE status_id != 'new' AND primary_team_id_2025 IS NOT NULL
    GROUP BY primary_team_id_2025, bracket
    ORDER BY primary_team_id_2025, min_g
  `)

  // 2026 assignments per team
  const assigned2026Rows = all(`
    SELECT assigned_team_id_2026 as team, COUNT(*) as assigned
    FROM players
    WHERE assigned_team_id_2026 IS NOT NULL AND status_id != 'new'
    GROUP BY assigned_team_id_2026
  `)

  // Games distribution for histogram
  const gamesDist = all(`
    SELECT total_games_2025 as games, COUNT(*) as count
    FROM players
    WHERE total_games_2025 > 0 AND status_id != 'new'
    GROUP BY total_games_2025
    ORDER BY total_games_2025
  `)

  const assignedMap = {}
  assigned2026Rows.forEach(r => { assignedMap[r.team] = r.assigned })

  const teams = TEAM_ORDER.map(teamId => {
    const row = teamRows.find(r => r.team === teamId) || { team: teamId }
    const assigned = assignedMap[teamId] || 0
    const gap = TARGET_MIN - assigned
    const brackets = bracketRows
      .filter(r => r.team === teamId)
      .sort((a, b) => a.min_g - b.min_g)
    return { ...row, team: teamId, assigned, gap, brackets }
  })

  res.json({ overall, teams, gamesDist, targetMin: TARGET_MIN, targetMax: TARGET_MAX })
})

// ============ ROUNDS API ============

// Get all rounds - separated by type
app.get('/api/rounds', (req, res) => {
  const rounds = all(`
    SELECT * FROM rounds 
    ORDER BY 
      round_type DESC,
      CASE WHEN round_type = 'season' THEN round_number ELSE id END
  `)
  res.json(rounds)
})

// Create a new round
app.post('/api/rounds', (req, res) => {
  try {
    const { round_number, name, round_type = 'season', copy_from_round_id } = req.body
    const now = new Date().toISOString()
    
    run(`
      INSERT INTO rounds (round_number, name, round_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `, [round_number || null, name || null, round_type, now, now])
    
    const round = get('SELECT * FROM rounds ORDER BY id DESC LIMIT 1')
    
    const teams = all('SELECT id FROM teams WHERE id != ?', ['NEW'])
    
    if (copy_from_round_id) {
      const prevMatches = all('SELECT * FROM round_matches WHERE round_id = ?', [copy_from_round_id])
      const prevSelections = all('SELECT * FROM round_selections WHERE round_id = ?', [copy_from_round_id])
      
      teams.forEach(t => {
        const prevMatch = prevMatches.find(m => m.team_id === t.id) || {}
        run(`
          INSERT INTO round_matches (round_id, team_id, match_date, time, venue, opponent)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [round.id, t.id, '', prevMatch.time || '', prevMatch.venue || '', ''])
      })
      
      prevSelections.forEach(s => {
        run(`
          INSERT INTO round_selections (round_id, team_id, player_id, slot_number, position, confirmed)
          VALUES (?, ?, ?, ?, ?, 0)
        `, [round.id, s.team_id, s.player_id, s.slot_number, s.position || null])
      })
    } else {
      teams.forEach(t => {
        run(`
          INSERT INTO round_matches (round_id, team_id, match_date, time, venue, opponent)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [round.id, t.id, '', '', '', ''])
      })
    }
    
    res.json(round)
  } catch (err) {
    console.error('POST /api/rounds error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// Get single round with all data including bench players
app.get('/api/rounds/:id', (req, res) => {
  const round = get('SELECT * FROM rounds WHERE id = ?', [req.params.id])
  if (!round) return res.status(404).json({ error: 'Not found' })
  
  const matches = all('SELECT * FROM round_matches WHERE round_id = ?', [round.id])
  
  const selections = all(`
    SELECT rs.*, p.name, p.status_id, p.primary_team_id_2025, p.default_position
    FROM round_selections rs
    JOIN players p ON rs.player_id = p.id
    WHERE rs.round_id = ?
    ORDER BY rs.team_id, rs.slot_number
  `, [round.id])

  // Players auto-unavailable from master list for this round's number/date
  // Included only if NOT already in round_selections for that team
  const autoUnavailable = all(`
    SELECT DISTINCT p.id as player_id, p.name, p.status_id, p.primary_team_id_2025,
      pu.id as unavailability_id, pu.from_date, pu.to_date, pu.from_round, pu.to_round, pu.notes
    FROM player_unavailability pu
    JOIN players p ON pu.player_id = p.id
    WHERE (
      (pu.from_round IS NOT NULL AND pu.to_round IS NOT NULL
        AND ? BETWEEN pu.from_round AND pu.to_round)
      OR
      (pu.from_date IS NOT NULL AND pu.to_date IS NOT NULL
        AND (SELECT rm.match_date FROM round_matches rm WHERE rm.round_id = ? LIMIT 1)
            BETWEEN pu.from_date AND pu.to_date)
    )
  `, [round.round_number || -1, round.id])
  
  const selectedPlayerIds = selections.map(s => s.player_id)
  
  let bench = []
  if (selectedPlayerIds.length > 0) {
    const placeholders = selectedPlayerIds.map(() => '?').join(',')
    bench = all(`
      SELECT 
        rs.team_id,
        p.id as player_id,
        p.name,
        p.status_id,
        p.primary_team_id_2025,
        COUNT(*) as games_2026
      FROM round_selections rs
      JOIN players p ON rs.player_id = p.id
      WHERE rs.player_id NOT IN (${placeholders})
      GROUP BY rs.team_id, p.id
      ORDER BY rs.team_id, games_2026 DESC
    `, selectedPlayerIds)
  } else {
    bench = all(`
      SELECT 
        rs.team_id,
        p.id as player_id,
        p.name,
        p.status_id,
        p.primary_team_id_2025,
        COUNT(*) as games_2026
      FROM round_selections rs
      JOIN players p ON rs.player_id = p.id
      GROUP BY rs.team_id, p.id
      ORDER BY rs.team_id, games_2026 DESC
    `)
  }
  
  res.json({ ...round, matches, selections, bench, autoUnavailable })
})

// Update round info
app.patch('/api/rounds/:id', (req, res) => {
  const { round_number, name } = req.body
  const updates = []
  const params = []
  
  if (round_number !== undefined) {
    updates.push('round_number = ?')
    params.push(round_number)
  }
  if (name !== undefined) {
    updates.push('name = ?')
    params.push(name)
  }
  
  if (updates.length > 0) {
    updates.push('updated_at = ?')
    params.push(new Date().toISOString())
    params.push(req.params.id)
    run(`UPDATE rounds SET ${updates.join(', ')} WHERE id = ?`, params)
  }
  
  const round = get('SELECT * FROM rounds WHERE id = ?', [req.params.id])
  res.json(round)
})

// Delete a round — cascades to matches and selections
app.delete('/api/rounds/:id', (req, res) => {
  const { id } = req.params
  run('DELETE FROM round_selections WHERE round_id = ?', [id])
  run('DELETE FROM round_matches WHERE round_id = ?', [id])
  run('DELETE FROM rounds WHERE id = ?', [id])
  res.json({ success: true })
})

// Update match details for a team in a round
app.patch('/api/rounds/:roundId/matches/:teamId', (req, res) => {
  const { match_date, time, venue, opponent, top_colour, socks_colour } = req.body
  const { roundId, teamId } = req.params
  
  run(`
    UPDATE round_matches 
    SET match_date = ?, time = ?, venue = ?, opponent = ?, top_colour = ?, socks_colour = ?
    WHERE round_id = ? AND team_id = ?
  `, [match_date || '', time || '', venue || '', opponent || '',
      top_colour || 'blue', socks_colour || 'yellow',
      roundId, teamId])
  
  const match = get('SELECT * FROM round_matches WHERE round_id = ? AND team_id = ?', [roundId, teamId])
  res.json(match)
})

// Add player to round selection
app.post('/api/rounds/:roundId/selections', (req, res) => {
  const { team_id, player_id, slot_number } = req.body
  const { roundId } = req.params
  
  // Players CAN appear in multiple teams per round (fill-ins etc) — no uniqueness check
  const slotFilled = get('SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?', [roundId, team_id, slot_number])
  if (slotFilled) {
    run('DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?', [roundId, team_id, slot_number])
  }
  
  run(`
    INSERT INTO round_selections (round_id, team_id, player_id, slot_number)
    VALUES (?, ?, ?, ?)
  `, [roundId, team_id, player_id, slot_number])
  
  res.json({ success: true })
})

// Remove player from a specific team slot (not all teams)
app.delete('/api/rounds/:roundId/selections/:teamId/:playerId', (req, res) => {
  const { roundId, teamId, playerId } = req.params
  run('DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?', [roundId, teamId, playerId])
  res.json({ success: true })
})

// Move player between teams/slots (drag and drop)
// Handles: move to empty slot, swap with existing player
app.patch('/api/rounds/:roundId/selections/:playerId/move', (req, res) => {
  const { roundId, playerId } = req.params
  const { target_team_id, target_slot } = req.body

  // Get the dragged player's current selection
  const dragged = get(
    'SELECT * FROM round_selections WHERE round_id = ? AND player_id = ?',
    [roundId, playerId]
  )
  if (!dragged) return res.status(404).json({ error: 'Selection not found' })

  // Check if target slot is occupied
  const occupant = get(
    'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?',
    [roundId, target_team_id, target_slot]
  )

  if (occupant) {
    // Swap: move occupant to dragged player's old slot/team
    run(
      'UPDATE round_selections SET team_id = ?, slot_number = ? WHERE round_id = ? AND player_id = ?',
      [dragged.team_id, dragged.slot_number, roundId, occupant.player_id]
    )
  }

  // Move dragged player to target
  run(
    'UPDATE round_selections SET team_id = ?, slot_number = ? WHERE round_id = ? AND player_id = ?',
    [target_team_id, target_slot, roundId, playerId]
  )

  res.json({ success: true })
})

// Insert player into a position, pushing others down (insert behaviour)
// Works within a team and cross-team
app.patch('/api/rounds/:roundId/selections/:playerId/insert', (req, res) => {
  const { roundId, playerId } = req.params
  const { from_team_id, target_team_id, target_player_id, insert_after } = req.body

  // Grab the dragged player's current row so we can preserve confirmed/position
  const dragged = get(
    'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
    [roundId, from_team_id, playerId]
  )
  if (!dragged) return res.status(404).json({ error: 'Selection not found' })

  // Remove dragged player from source
  run(
    'DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
    [roundId, from_team_id, playerId]
  )

  // Re-fetch target team after removal (handles same-team drags)
  const remaining = all(
    'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? ORDER BY slot_number ASC',
    [roundId, target_team_id]
  )

  // Find where to insert — by target player ID, or append if dropping on empty area
  let insertIndex = remaining.length // default: append
  if (target_player_id) {
    const idx = remaining.findIndex(s => Number(s.player_id) === Number(target_player_id))
    if (idx !== -1) insertIndex = insert_after ? idx + 1 : idx
  }

  // Splice player in at the right position
  remaining.splice(insertIndex, 0, { player_id: Number(playerId), _isNew: true })

  // Write all slots back as 1..N
  // Two-pass to avoid UNIQUE constraint collisions mid-renumber:
  // Pass 1: shift everyone to 1000+ (safe range)
  // Pass 2: set final 1..N values
  remaining.forEach((s, i) => {
    if (!s._isNew) {
      run(
        'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
        [1000 + i + 1, roundId, target_team_id, s.player_id]
      )
    }
  })
  remaining.forEach((s, i) => {
    if (s._isNew) {
      run(
        `INSERT INTO round_selections (round_id, team_id, player_id, slot_number, confirmed, position)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roundId, target_team_id, playerId, i + 1, dragged.confirmed || 0, dragged.position || null]
      )
    } else {
      run(
        'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
        [i + 1, roundId, target_team_id, s.player_id]
      )
    }
  })

  // If cross-team, compact source team slots too (two-pass)
  if (from_team_id !== target_team_id) {
    const sourceRemaining = all(
      'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? ORDER BY slot_number ASC',
      [roundId, from_team_id]
    )
    sourceRemaining.forEach((s, i) => {
      run(
        'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
        [1000 + i + 1, roundId, from_team_id, s.player_id]
      )
    })
    sourceRemaining.forEach((s, i) => {
      run(
        'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
        [i + 1, roundId, from_team_id, s.player_id]
      )
    })
  }

  res.json({ success: true })
})

// Cycle availability status for a player in a round/team slot
// 0 = unconfirmed, 1 = waiting (contacted), 2 = confirmed, 3 = unavailable
app.patch('/api/rounds/:roundId/selections/:teamId/:playerId/confirm', (req, res) => {
  const { roundId, teamId, playerId } = req.params
  const current = get(
    'SELECT confirmed FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
    [roundId, teamId, playerId]
  )
  if (!current) return res.status(404).json({ error: 'Not found' })
  const newVal = ((current.confirmed || 0) + 1) % 4
  run(
    'UPDATE round_selections SET confirmed = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
    [newVal, roundId, teamId, playerId]
  )
  res.json({ confirmed: newVal })
})

// Update position for a player in a round selection
app.patch('/api/rounds/:roundId/selections/:playerId/position', (req, res) => {
  const { roundId, playerId } = req.params
  const { position } = req.body
  run(
    'UPDATE round_selections SET position = ? WHERE round_id = ? AND player_id = ?',
    [position || null, roundId, playerId]
  )
  res.json({ success: true })
})

// Delete a round
app.delete('/api/rounds/:id', (req, res) => {
  const { id } = req.params
  run('DELETE FROM round_selections WHERE round_id = ?', [id])
  run('DELETE FROM round_matches WHERE round_id = ?', [id])
  run('DELETE FROM rounds WHERE id = ?', [id])
  res.json({ success: true })
})

// ============ UNAVAILABILITY API ============

// Get all unavailability records (optionally filtered by player)
app.get('/api/unavailability', (req, res) => {
  const { player_id } = req.query
  const where = player_id ? 'WHERE pu.player_id = ?' : ''
  const params = player_id ? [player_id] : []
  const rows = all(`
    SELECT pu.*, p.name as player_name
    FROM player_unavailability pu
    JOIN players p ON pu.player_id = p.id
    ${where}
    ORDER BY pu.from_date, pu.from_round, p.name
  `, params)
  res.json(rows)
})

// Create unavailability record
app.post('/api/unavailability', (req, res) => {
  const { player_id, from_date, to_date, from_round, to_round, notes } = req.body
  if (!player_id) return res.status(400).json({ error: 'player_id required' })
  const now = new Date().toISOString()
  run(`
    INSERT INTO player_unavailability (player_id, from_date, to_date, from_round, to_round, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [player_id, from_date || null, to_date || null, from_round || null, to_round || null, notes || null, now, now])
  const row = get('SELECT * FROM player_unavailability ORDER BY id DESC LIMIT 1')
  res.json(row)
})

// Update unavailability record
app.patch('/api/unavailability/:id', (req, res) => {
  const { from_date, to_date, from_round, to_round, notes } = req.body
  const now = new Date().toISOString()
  run(`
    UPDATE player_unavailability
    SET from_date = ?, to_date = ?, from_round = ?, to_round = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `, [from_date || null, to_date || null, from_round || null, to_round || null, notes || null, now, req.params.id])
  const row = get('SELECT * FROM player_unavailability WHERE id = ?', [req.params.id])
  res.json(row)
})

// Delete unavailability record
app.delete('/api/unavailability/:id', (req, res) => {
  run('DELETE FROM player_unavailability WHERE id = ?', [req.params.id])
  res.json({ success: true })
})

// Mark/unmark a round selection as unavailable (drag to/from unavailable bucket)
app.patch('/api/rounds/:roundId/selections/:teamId/:playerId/unavailable', (req, res) => {
  const { roundId, teamId, playerId } = req.params
  const { is_unavailable } = req.body
  run(`
    UPDATE round_selections SET is_unavailable = ?
    WHERE round_id = ? AND team_id = ? AND player_id = ?
  `, [is_unavailable ? 1 : 0, roundId, teamId, playerId])
  res.json({ success: true })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
