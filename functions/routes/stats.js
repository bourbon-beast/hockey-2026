const express = require('express')
const router = express.Router()
const { all, get } = require('../db')

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    const totalRow = await get('SELECT COUNT(*) as count FROM players')
    const assignedRow = await get('SELECT COUNT(*) as count FROM players WHERE assigned_team_id_2026 IS NOT NULL')

    const byStatus = await all(`
      SELECT s.id as status_id, s.label, s.color, COUNT(p.id) as count
      FROM statuses s
      LEFT JOIN players p ON p.status_id = s.id
      GROUP BY s.id
      ORDER BY s.sort_order
    `)

    const byTeam = await all(`
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

    const newRegistrations = await all(`
      SELECT id, name, status_id, assigned_team_id_2026, playing_preference
      FROM players WHERE status_id = 'new' ORDER BY name
    `)

    res.json({
      totalPlayers: totalRow.count,
      assigned2026: assignedRow.count,
      byStatus,
      byTeam,
      newRegistrations
    })
  } catch (err) {
    console.error('GET /api/stats error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
