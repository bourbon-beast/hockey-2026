const express = require('express')
const router = express.Router()
const { all } = require('../db')

// GET /api/teams
router.get('/', async (req, res) => {
  try {
    const teams = await all('SELECT * FROM teams ORDER BY sort_order')
    res.json(teams)
  } catch (err) {
    console.error('GET /api/teams error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/teams/:id/players
router.get('/:id/players', async (req, res) => {
  try {
    const teamId = req.params.id

    const mainSquad = await all(`
      SELECT p.*, pth.games_played as games_for_team
      FROM players p
      JOIN player_team_history pth ON p.id = pth.player_id
      WHERE pth.team_id = ? AND pth.role = 'main_squad'
      ORDER BY pth.games_played DESC
    `, [teamId])

    const fillIns = await all(`
      SELECT p.*, pth.games_played as games_for_team
      FROM players p
      JOIN player_team_history pth ON p.id = pth.player_id
      WHERE pth.team_id = ? AND pth.role = 'fill_in'
      ORDER BY pth.games_played DESC
    `, [teamId])

    const squad2026 = await all(`
      SELECT * FROM players
      WHERE assigned_team_id_2026 = ?
      ORDER BY name
    `, [teamId])

    res.json({ mainSquad, fillIns, squad2026 })
  } catch (err) {
    console.error('GET /api/teams/:id/players error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
