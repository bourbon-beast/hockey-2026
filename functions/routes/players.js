const express = require('express')
const router = express.Router()
const { all, get, run } = require('../db')

// GET /api/players
router.get('/', async (req, res) => {
  try {
    const includeInactive = req.query.include_inactive === 'true'
    const whereClause = includeInactive ? '' : 'WHERE p.is_active = 1 OR p.is_active IS NULL'
    const players = await all(`
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
  } catch (err) {
    console.error('GET /api/players error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/players/:id
router.get('/:id', async (req, res) => {
  try {
    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id])
    if (!player) return res.status(404).json({ error: 'Not found' })

    const history = await all(`
      SELECT * FROM player_team_history
      WHERE player_id = ?
      ORDER BY games_played DESC
    `, [req.params.id])

    const games2026 = await all(`
      SELECT rs.team_id, COUNT(*) as games
      FROM round_selections rs
      JOIN rounds r ON rs.round_id = r.id
      WHERE rs.player_id = ? AND r.round_type = 'season'
      GROUP BY rs.team_id
    `, [req.params.id])

    res.json({ ...player, history, games2026 })
  } catch (err) {
    console.error('GET /api/players/:id error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/players
router.post('/', async (req, res) => {
  try {
    const { name, status_id = 'not_heard', assigned_team_id_2026 = null, notes = null, playing_preference = null } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })
    const now = new Date().toISOString()
    const result = await run(`
      INSERT INTO players (name, status_id, assigned_team_id_2026, notes, playing_preference,
        is_new_registration, total_games_2025, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `, [name.trim(), status_id, assigned_team_id_2026, notes, playing_preference,
        status_id === 'new' ? 1 : 0, now, now])
    const player = await get('SELECT * FROM players WHERE id = ?', [Number(result.lastInsertRowid)])
    res.json(player)
  } catch (err) {
    console.error('POST /api/players error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/players/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, is_active, status_id, assigned_team_id_2026, notes, is_new_registration,
            playing_preference, unsure_reason, player_type, interested_in, previous_club,
            follow_up_ok, is_international, needs_visa } = req.body
    const updates = []
    const params = []

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty' })
      updates.push('name = ?'); params.push(name.trim())
    }
    if (is_active !== undefined)             { updates.push('is_active = ?');              params.push(is_active ? 1 : 0) }
    if (status_id !== undefined)             { updates.push('status_id = ?');              params.push(status_id) }
    if (assigned_team_id_2026 !== undefined) { updates.push('assigned_team_id_2026 = ?'); params.push(assigned_team_id_2026) }
    if (notes !== undefined)                 { updates.push('notes = ?');                  params.push(notes) }
    if (is_new_registration !== undefined)   { updates.push('is_new_registration = ?');    params.push(is_new_registration ? 1 : 0) }
    if (playing_preference !== undefined)    { updates.push('playing_preference = ?');     params.push(playing_preference || null) }
    if (unsure_reason !== undefined)         { updates.push('unsure_reason = ?');          params.push(unsure_reason || null) }
    if (player_type !== undefined)           { updates.push('player_type = ?');            params.push(player_type || null) }
    if (interested_in !== undefined)         { updates.push('interested_in = ?');          params.push(interested_in || null) }
    if (previous_club !== undefined)         { updates.push('previous_club = ?');          params.push(previous_club || null) }
    if (follow_up_ok !== undefined)          { updates.push('follow_up_ok = ?');           params.push(follow_up_ok === null ? null : (follow_up_ok ? 1 : 0)) }
    if (is_international !== undefined)      { updates.push('is_international = ?');       params.push(is_international ? 1 : 0) }
    if (needs_visa !== undefined)            { updates.push('needs_visa = ?');             params.push(needs_visa ? 1 : 0) }

    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(new Date().toISOString())
      params.push(req.params.id)
      await run(`UPDATE players SET ${updates.join(', ')} WHERE id = ?`, params)
    }

    const player = await get('SELECT * FROM players WHERE id = ?', [req.params.id])
    res.json(player)
  } catch (err) {
    console.error('PATCH /api/players/:id error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
