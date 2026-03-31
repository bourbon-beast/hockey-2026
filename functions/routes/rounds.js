const express = require('express')
const router = express.Router()
const { all, get, run } = require('../db')

// GET /api/rounds
router.get('/', async (req, res) => {
  try {
    const rounds = await all(`
      SELECT * FROM rounds
      ORDER BY
        CASE WHEN round_type = 'season' THEN 0 ELSE 1 END ASC,
        CASE
          WHEN round_type = 'season' AND round_date IS NOT NULL AND round_date != ''
            THEN round_date
          WHEN round_type = 'season'
            THEN '9999-' || printf('%04d', COALESCE(round_number, 9999))
          ELSE '9999'
        END ASC
    `)
    res.json(rounds)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/rounds
router.post('/', async (req, res) => {
  try {
    const { round_number, name, round_type = 'season', round_date, copy_from_round_id } = req.body
    const now = new Date().toISOString()

    const result = await run(`
      INSERT INTO rounds (round_number, name, round_type, round_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [round_number || null, name || null, round_type, round_date || null, now, now])

    const roundId = Number(result.lastInsertRowid)
    const round = await get('SELECT * FROM rounds WHERE id = ?', [roundId])
    const teams = await all("SELECT id FROM teams WHERE id != 'NEW'")

    if (copy_from_round_id) {
      const prevMatches = await all('SELECT * FROM round_matches WHERE round_id = ?', [copy_from_round_id])
      const prevSelections = await all('SELECT * FROM round_selections WHERE round_id = ?', [copy_from_round_id])

      if (teams.length > 0) {
        const matchPlaceholders = teams.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
        const matchArgs = []
        for (const t of teams) {
          const prevMatch = prevMatches.find(m => m.team_id === t.id) || {}
          matchArgs.push(roundId, t.id, '', prevMatch.time || '', prevMatch.venue || '', '')
        }
      const prevMatchesMap = new Map()
      for (const m of prevMatches) {
        prevMatchesMap.set(m.team_id, m)
      }

      for (const t of teams) {
        const prevMatch = prevMatchesMap.get(t.id) || {}
        await run(`
          INSERT INTO round_matches (round_id, team_id, match_date, time, venue, opponent)
          VALUES ${matchPlaceholders}
        `, matchArgs)
      }

      if (prevSelections.length > 0) {
        const selectionPlaceholders = prevSelections.map(() => '(?, ?, ?, ?, ?, 0)').join(', ')
        const selectionArgs = []
        for (const s of prevSelections) {
          selectionArgs.push(roundId, s.team_id, s.player_id, s.slot_number, s.position || null)
        }
        await run(`
          INSERT INTO round_selections (round_id, team_id, player_id, slot_number, position, confirmed)
          VALUES ${selectionPlaceholders}
        `, selectionArgs)
      }
    } else {
      if (teams.length > 0) {
        const matchPlaceholders = teams.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')
        const matchArgs = []
        for (const t of teams) {
          matchArgs.push(roundId, t.id, '', '', '', '')
        }
        await run(`
          INSERT INTO round_matches (round_id, team_id, match_date, time, venue, opponent)
          VALUES ${matchPlaceholders}
        `, matchArgs)
      }
    }

    res.json(round)
  } catch (err) {
    console.error('POST /api/rounds error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/rounds/:id
router.get('/:id', async (req, res) => {
  try {
    const round = await get('SELECT * FROM rounds WHERE id = ?', [req.params.id])
    if (!round) return res.status(404).json({ error: 'Not found' })

    const matches = await all('SELECT * FROM round_matches WHERE round_id = ?', [round.id])
    const selections = await all(`
      SELECT rs.*, p.name, p.status_id, p.primary_team_id_2025, p.default_position
      FROM round_selections rs
      JOIN players p ON rs.player_id = p.id
      WHERE rs.round_id = ?
      ORDER BY rs.team_id, rs.slot_number
    `, [round.id])

    const selectedPlayerIds = selections.map(s => Number(s.player_id))

    let bench = []
    if (selectedPlayerIds.length > 0) {
      const placeholders = selectedPlayerIds.map(() => '?').join(',')
      bench = await all(`
        SELECT rs.team_id, p.id as player_id, p.name, p.status_id, p.primary_team_id_2025,
          COUNT(*) as games_2026
        FROM round_selections rs
        JOIN players p ON rs.player_id = p.id
        WHERE rs.player_id NOT IN (${placeholders})
        GROUP BY rs.team_id, p.id
        ORDER BY rs.team_id, games_2026 DESC
      `, selectedPlayerIds)
    } else {
      bench = await all(`
        SELECT rs.team_id, p.id as player_id, p.name, p.status_id, p.primary_team_id_2025,
          COUNT(*) as games_2026
        FROM round_selections rs
        JOIN players p ON rs.player_id = p.id
        GROUP BY rs.team_id, p.id
        ORDER BY rs.team_id, games_2026 DESC
      `)
    }

    res.json({ ...round, matches, selections, bench })
  } catch (err) {
    console.error('GET /api/rounds/:id error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:id
router.patch('/:id', async (req, res) => {
  try {
    const { round_number, name, round_date } = req.body
    const updates = []
    const params = []
    if (round_number !== undefined) { updates.push('round_number = ?'); params.push(round_number) }
    if (name !== undefined)         { updates.push('name = ?');         params.push(name) }
    if (round_date !== undefined)   { updates.push('round_date = ?');   params.push(round_date || null) }
    if (updates.length > 0) {
      updates.push('updated_at = ?')
      params.push(new Date().toISOString(), req.params.id)
      await run(`UPDATE rounds SET ${updates.join(', ')} WHERE id = ?`, params)
    }
    const round = await get('SELECT * FROM rounds WHERE id = ?', [req.params.id])
    res.json(round)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/rounds/:id/carry-forward
// Copies selections (and optionally positions) from this round into the next round by date.
// Does NOT overwrite players already in the target round — merges in missing ones only.
router.post('/:id/carry-forward', async (req, res) => {
  try {
    const fromId = Number(req.params.id)
    const { overwrite = false } = req.body

    // Find the source round
    const fromRound = await get('SELECT * FROM rounds WHERE id = ?', [fromId])
    if (!fromRound) return res.status(404).json({ error: 'Source round not found' })

    // Find the next round by date order (season rounds only, date after source)
    const nextRound = await get(`
      SELECT * FROM rounds
      WHERE round_type = 'season'
        AND id != ?
        AND round_date > ?
      ORDER BY round_date ASC
      LIMIT 1
    `, [fromId, fromRound.round_date || '0000-00-00'])

    if (!nextRound) return res.status(404).json({ error: 'No next round found — is this the last round?' })

    // Get source selections
    const fromSelections = await all(
      'SELECT * FROM round_selections WHERE round_id = ? AND (is_unavailable IS NULL OR is_unavailable = 0)',
      [fromId]
    )

    if (overwrite) {
      // Clear target selections first
      await run('DELETE FROM round_selections WHERE round_id = ?', [nextRound.id])
    }

    // Get existing selections in target to avoid duplicates
    const existing = await all('SELECT player_id, team_id FROM round_selections WHERE round_id = ?', [nextRound.id])
    const existingKeys = new Set(existing.map(s => `${s.team_id}:${Number(s.player_id)}`))

    // Insert missing players, reset confirmed to 0 (unconfirmed for new round)
    const toInsert = fromSelections.filter(s => !existingKeys.has(`${s.team_id}:${Number(s.player_id)}`))
    let inserted = 0

    if (toInsert.length > 0) {
      const placeholders = toInsert.map(() => '(?, ?, ?, ?, ?, 0)').join(', ')
      const args = []
      for (const s of toInsert) {
        args.push(nextRound.id, s.team_id, s.player_id, s.slot_number, s.position || null)
      }

      await run(
        `INSERT INTO round_selections (round_id, team_id, player_id, slot_number, position, confirmed) VALUES ${placeholders}`,
        args
      )
      inserted = toInsert.length
    }

    res.json({ success: true, to_round_id: nextRound.id, to_round_number: nextRound.round_number, inserted })
  } catch (err) {
    console.error('carry-forward error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/rounds/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    await run('DELETE FROM round_selections WHERE round_id = ?', [id])
    await run('DELETE FROM round_matches WHERE round_id = ?', [id])
    await run('DELETE FROM rounds WHERE id = ?', [id])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/matches/:teamId
router.patch('/:roundId/matches/:teamId', async (req, res) => {
  try {
    const { match_date, time, arrive_at, venue, opponent, top_colour, socks_colour } = req.body
    const { roundId, teamId } = req.params
    await run(`
      UPDATE round_matches
      SET match_date = ?, time = ?, arrive_at = ?, venue = ?, opponent = ?, top_colour = ?, socks_colour = ?
      WHERE round_id = ? AND team_id = ?
    `, [match_date || '', time || '', arrive_at || '', venue || '', opponent || '',
        top_colour || 'blue', socks_colour || 'yellow', roundId, teamId])
    const match = await get('SELECT * FROM round_matches WHERE round_id = ? AND team_id = ?', [roundId, teamId])
    res.json(match)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/rounds/:roundId/selections
router.post('/:roundId/selections', async (req, res) => {
  try {
    const { team_id, player_id, slot_number } = req.body
    const { roundId } = req.params
    const slotFilled = await get(
      'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?',
      [roundId, team_id, slot_number]
    )
    if (slotFilled) {
      await run('DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?',
        [roundId, team_id, slot_number])
    }
    await run('INSERT INTO round_selections (round_id, team_id, player_id, slot_number) VALUES (?, ?, ?, ?)',
      [roundId, team_id, player_id, slot_number])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/rounds/:roundId/selections/:teamId/:playerId
router.delete('/:roundId/selections/:teamId/:playerId', async (req, res) => {
  try {
    const { roundId, teamId, playerId } = req.params
    await run('DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [roundId, teamId, playerId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/selections/:playerId/move
router.patch('/:roundId/selections/:playerId/move', async (req, res) => {
  try {
    const { roundId, playerId } = req.params
    const { target_team_id, target_slot } = req.body
    const dragged = await get(
      'SELECT * FROM round_selections WHERE round_id = ? AND player_id = ?', [roundId, playerId])
    if (!dragged) return res.status(404).json({ error: 'Selection not found' })
    const occupant = await get(
      'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND slot_number = ?',
      [roundId, target_team_id, target_slot])
    if (occupant) {
      await run('UPDATE round_selections SET team_id = ?, slot_number = ? WHERE round_id = ? AND player_id = ?',
        [dragged.team_id, dragged.slot_number, roundId, occupant.player_id])
    }
    await run('UPDATE round_selections SET team_id = ?, slot_number = ? WHERE round_id = ? AND player_id = ?',
      [target_team_id, target_slot, roundId, playerId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/selections/:teamId/:playerId/confirm
router.patch('/:roundId/selections/:teamId/:playerId/confirm', async (req, res) => {
  try {
    const { roundId, teamId, playerId } = req.params
    const current = await get(
      'SELECT confirmed FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [roundId, teamId, playerId])
    if (!current) return res.status(404).json({ error: 'Not found' })
    const newVal = ((Number(current.confirmed) || 0) + 1) % 4
    await run('UPDATE round_selections SET confirmed = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [newVal, roundId, teamId, playerId])
    res.json({ confirmed: newVal })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/selections/:teamId/:playerId/unavailable
router.patch('/:roundId/selections/:teamId/:playerId/unavailable', async (req, res) => {
  try {
    const { roundId, teamId, playerId } = req.params
    const { is_unavailable } = req.body
    await run(
      'UPDATE round_selections SET is_unavailable = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [is_unavailable ? 1 : 0, roundId, teamId, playerId]
    )
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/selections/:playerId/position
router.patch('/:roundId/selections/:playerId/position', async (req, res) => {
  try {
    const { roundId, playerId } = req.params
    const { position } = req.body
    await run('UPDATE round_selections SET position = ? WHERE round_id = ? AND player_id = ?',
      [position || null, roundId, playerId])
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/rounds/:roundId/selections/:playerId/insert
router.patch('/:roundId/selections/:playerId/insert', async (req, res) => {
  try {
    const { roundId, playerId } = req.params
    const { from_team_id, target_team_id, target_player_id, insert_after } = req.body

    const dragged = await get(
      'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [roundId, from_team_id, playerId])
    if (!dragged) return res.status(404).json({ error: 'Selection not found' })

    // Remove dragged player from source
    await run('DELETE FROM round_selections WHERE round_id = ? AND team_id = ? AND player_id = ?',
      [roundId, from_team_id, playerId])

    // Re-fetch target team after removal
    const remaining = await all(
      'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? ORDER BY slot_number ASC',
      [roundId, target_team_id])

    // Find insert position
    let insertIndex = remaining.length
    if (target_player_id) {
      const idx = remaining.findIndex(s => Number(s.player_id) === Number(target_player_id))
      if (idx !== -1) insertIndex = insert_after ? idx + 1 : idx
    }

    // Splice new player in
    remaining.splice(insertIndex, 0, { player_id: Number(playerId), _isNew: true })

    // Two-pass renumber to avoid UNIQUE constraint collisions
    for (const [i, s] of remaining.entries()) {
      if (!s._isNew) {
        await run(
          'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
          [1000 + i + 1, roundId, target_team_id, s.player_id])
      }
    }
    for (const [i, s] of remaining.entries()) {
      if (s._isNew) {
        await run(
          `INSERT INTO round_selections (round_id, team_id, player_id, slot_number, confirmed, position)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [roundId, target_team_id, playerId, i + 1, dragged.confirmed || 0, dragged.position || null])
      } else {
        await run(
          'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
          [i + 1, roundId, target_team_id, s.player_id])
      }
    }

    // Compact source team if cross-team move
    if (from_team_id !== target_team_id) {
      const sourceRemaining = await all(
        'SELECT * FROM round_selections WHERE round_id = ? AND team_id = ? ORDER BY slot_number ASC',
        [roundId, from_team_id])
      for (const [i, s] of sourceRemaining.entries()) {
        await run(
          'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
          [1000 + i + 1, roundId, from_team_id, s.player_id])
      }
      for (const [i, s] of sourceRemaining.entries()) {
        await run(
          'UPDATE round_selections SET slot_number = ? WHERE round_id = ? AND team_id = ? AND player_id = ?',
          [i + 1, roundId, from_team_id, s.player_id])
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('insert error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
