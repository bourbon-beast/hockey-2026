const express = require('express')
const router = express.Router()
const { all, get } = require('../db')

const TEAMS = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']

// GET /api/dashboard
// Returns current/next round detail + season grid summary
router.get('/', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10)

    // All season rounds ordered by date
    const rounds = await all(`
      SELECT * FROM rounds
      WHERE round_type = 'season'
      ORDER BY
        CASE WHEN round_date IS NOT NULL AND round_date != '' THEN round_date
             ELSE '1000-' || printf('%04d', COALESCE(round_number, 9999))
        END ASC
    `)

    // Current round = next round whose date >= today
    // Falls back to last round if season is over
    let currentRound = rounds.find(r => r.round_date && r.round_date >= today)
    if (!currentRound) currentRound = rounds[rounds.length - 1]
    if (!currentRound) return res.json({ currentRound: null, teamSummaries: [], seasonGrid: [] })

    // Match details + selections for current round
    const matches    = await all('SELECT * FROM round_matches WHERE round_id = ?', [currentRound.id])
    const selections = await all(`
      SELECT rs.team_id, rs.player_id, rs.confirmed, rs.is_unavailable,
             p.name, p.primary_team_id_2025
      FROM round_selections rs
      JOIN players p ON p.id = rs.player_id
      WHERE rs.round_id = ?
    `, [currentRound.id])

    // Unavailability for current round (players not yet placed)
    const unavailRows = await all(`
      SELECT pu.player_id, p.name, p.primary_team_id_2025
      FROM player_unavailability pu
      JOIN players p ON p.id = pu.player_id
      WHERE pu.round_id = ?
    `, [currentRound.id])

    // Build per-team summaries
    const teamSummaries = TEAMS.map(teamId => {
      const match  = matches.find(m => m.team_id === teamId) || {}
      const teamSels = selections.filter(s => s.team_id === teamId && !s.is_unavailable)
      const confirmed   = teamSels.filter(s => Number(s.confirmed) === 2).length
      const waiting     = teamSels.filter(s => Number(s.confirmed) === 1).length
      const unconfirmed = teamSels.filter(s => Number(s.confirmed) === 0).length
      const total       = teamSels.length

      // Players from this team's primary squad who are unavailable this round
      const teamUnavail = unavailRows.filter(u => u.primary_team_id_2025 === teamId)

      return {
        teamId,
        match_date:   match.match_date   || null,
        time:         match.time         || null,
        arrive_at:    match.arrive_at    || null,
        opponent:     match.opponent     || null,
        venue:        match.venue        || null,
        top_colour:   match.top_colour   || null,
        socks_colour: match.socks_colour || null,
        total, confirmed, waiting, unconfirmed,
        unavailablePlayers: teamUnavail.map(u => u.name),
      }
    })

    // Season grid — lightweight counts per round per team
    const roundIds = rounds.map(r => r.id)
    let allCounts = []

    if (roundIds.length > 0) {
      const placeholders = roundIds.map(() => '?').join(',')
      allCounts = await all(`
        SELECT round_id, team_id,
          COUNT(*) as total,
          SUM(CASE WHEN confirmed = 2 THEN 1 ELSE 0 END) as confirmed
        FROM round_selections
        WHERE round_id IN (${placeholders}) AND is_unavailable = 0
        GROUP BY round_id, team_id
      `, roundIds)
    }

    const countsByRound = {}
    allCounts.forEach(c => {
      if (!countsByRound[c.round_id]) countsByRound[c.round_id] = {}
      countsByRound[c.round_id][c.team_id] = { total: Number(c.total), confirmed: Number(c.confirmed) }
    })

    const seasonGrid = rounds.map(r => {
      const teamCounts = countsByRound[r.id] || {}
      return {
        id:           r.id,
        round_number: r.round_number,
        name:         r.name,
        round_date:   r.round_date,
        isCurrent:    r.id === currentRound.id,
        teams:        teamCounts,
      }
    })

    res.json({ currentRound, teamSummaries, seasonGrid })
  } catch (err) {
    console.error('GET /api/dashboard error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
