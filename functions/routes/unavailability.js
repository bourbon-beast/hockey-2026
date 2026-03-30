const express = require('express')
const router = express.Router()
const { all, get, run } = require('../db')

// GET /api/unavailability?round_id=X
// Returns all player unavailability records, optionally filtered by round
router.get('/', async (req, res) => {
  try {
    const { round_id, player_id } = req.query
    let whereClause = ''
    const args = []
    if (round_id)  { whereClause = 'WHERE pu.round_id = ?';  args.push(round_id) }
    if (player_id) { whereClause = 'WHERE pu.player_id = ?'; args.push(player_id) }
    const rows = await all(`
      SELECT pu.id, pu.player_id, pu.round_id, pu.notes,
             p.name as player_name,
             r.round_number, r.name as round_name, r.round_date
      FROM player_unavailability pu
      JOIN players p ON p.id = pu.player_id
      JOIN rounds r ON r.id = pu.round_id
      ${whereClause}
      ORDER BY r.round_date, r.round_number, p.name
    `, args)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/unavailability — mark a player unavailable for a round
router.post('/', async (req, res) => {
  try {
    const { player_id, round_id, notes } = req.body
    if (!player_id || !round_id) return res.status(400).json({ error: 'player_id and round_id required' })

    // Upsert — ignore if already exists
    const existing = await get(
      'SELECT id FROM player_unavailability WHERE player_id = ? AND round_id = ?',
      [player_id, round_id]
    )
    if (existing) return res.json({ id: existing.id, player_id, round_id, notes, already_existed: true })

    const result = await run(
      'INSERT INTO player_unavailability (player_id, round_id, notes, created_at) VALUES (?, ?, ?, ?)',
      [player_id, round_id, notes || null, new Date().toISOString()]
    )
    res.json({ id: Number(result.lastInsertRowid), player_id, round_id, notes })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/unavailability/:id
router.delete('/:id', async (req, res) => {
  try {
    await run('DELETE FROM player_unavailability WHERE id = ?', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/unavailability/player/:playerId/round/:roundId
router.delete('/player/:playerId/round/:roundId', async (req, res) => {
  try {
    await run(
      'DELETE FROM player_unavailability WHERE player_id = ? AND round_id = ?',
      [req.params.playerId, req.params.roundId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
