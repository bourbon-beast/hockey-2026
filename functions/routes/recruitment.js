const express = require('express')
const router = express.Router()
const { all } = require('../db')

// GET /api/recruitment
router.get('/', async (req, res) => {
  try {
    const newPlayers = await all(`
      SELECT id, name, status_id, assigned_team_id_2026, playing_preference,
             player_type, interested_in, previous_club, follow_up_ok,
             is_international, needs_visa, notes, created_at
      FROM players
      WHERE status_id = 'new'
      ORDER BY name
    `)

    const internationals = await all(`
      SELECT id, name, status_id, assigned_team_id_2026, primary_team_id_2025,
             total_games_2025, is_international, needs_visa, notes
      FROM players
      WHERE is_international = 1
      ORDER BY assigned_team_id_2026, name
    `)

    const intlByTeam = await all(`
      SELECT assigned_team_id_2026 as team_id, COUNT(*) as count
      FROM players
      WHERE is_international = 1 AND assigned_team_id_2026 IS NOT NULL
      GROUP BY assigned_team_id_2026
    `)

    res.json({ newPlayers, internationals, intlByTeam })
  } catch (err) {
    console.error('GET /api/recruitment error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
