// migration/import-firestore.mjs
// Reads exported JSON files and imports into Firestore with the new data model
// Run from project root: node migration/import-firestore.mjs
//
// Firestore structure:
//   players/{playerId}         - flat player docs
//   rounds/{roundId}           - round metadata
//   rounds/{roundId}/matches/{teamId}     - match details per team
//   rounds/{roundId}/selections/{autoId}  - player selections
//   playerUnavailability/{autoId}         - unavailability records

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')

// Initialise Firebase Admin — uses GOOGLE_APPLICATION_CREDENTIALS env var
// or you can pass a service account key file path
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
if (!serviceAccountPath) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON file path')
  console.error('e.g. $env:GOOGLE_APPLICATION_CREDENTIALS = "F:\\path\\to\\serviceAccountKey.json"')
  process.exit(1)
}

const app = initializeApp({
  credential: cert(JSON.parse(readFileSync(serviceAccountPath, 'utf8')))
})
const db = getFirestore(app)

function loadJson(filename) {
  return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf8'))
}

// Helper: build the teamsPlayed2026 and gamesPlayed2026 from selections
function buildPlayerStats(selections) {
  const stats = {} // playerId -> { teams: Set, games: { teamId: count } }
  for (const sel of selections) {
    if (sel.is_unavailable) continue // don't count unavailable slots
    const pid = String(sel.player_id)
    if (!stats[pid]) stats[pid] = { teams: new Set(), games: {} }
    stats[pid].teams.add(sel.team_id)
    stats[pid].games[sel.team_id] = (stats[pid].games[sel.team_id] || 0) + 1
  }
  return stats
}

async function main() {
  console.log('Starting Firestore import...\n')

  // Load all JSON data
  const players = loadJson('players.json')
  const rounds = loadJson('rounds.json')
  const matches = loadJson('round_matches.json')
  const selections = loadJson('round_selections.json')
  const unavailability = loadJson('player_unavailability.json')
  const teams = loadJson('teams.json')
  const statuses = loadJson('statuses.json')

  // Pre-compute player stats from selections
  const playerStats = buildPlayerStats(selections)

  console.log(`Loaded: ${players.length} players, ${rounds.length} rounds, ${matches.length} matches, ${selections.length} selections, ${unavailability.length} unavailability, ${teams.length} teams, ${statuses.length} statuses\n`)

  // --- 0. Import Config (Teams + Statuses) ---
  console.log('Importing config...')
  await db.collection('config').doc('teams').set({
    teams: teams.map(t => ({
      id: t.id,
      name: t.name,
      sortOrder: t.sort_order || 0,
    }))
  })
  await db.collection('config').doc('statuses').set({
    statuses: statuses.map(s => ({
      id: s.id,
      label: s.label,
      color: s.color || null,
      sortOrder: s.sort_order || 0,
    }))
  })
  console.log(`  ✓ ${teams.length} teams and ${statuses.length} statuses imported\n`)

  // --- 1. Import Players ---
  console.log('Importing players...')
  const batch1 = db.batch()
  for (const p of players) {
    const pid = String(p.id)
    const stats = playerStats[pid]
    const ref = db.collection('players').doc(pid)
    batch1.set(ref, {
      name: p.name || '',
      defaultPosition: p.default_position || null,
      isActive: p.is_active === 1,
      assignedTeam2026: p.assigned_team_id_2026 || null,
      primaryTeam2025: p.primary_team_id_2025 || null,
      totalGames2025: p.total_games_2025 || 0,
      notes: p.notes || null,
      teamsPlayed2026: stats ? Array.from(stats.teams) : [],
      gamesPlayed2026: stats ? stats.games : {},
      createdAt: p.created_at || null,
      updatedAt: p.updated_at || null,
    })
  }
  await batch1.commit()
  console.log(`  ✓ ${players.length} players imported\n`)

  // --- 2. Import Rounds + Matches + Selections ---
  console.log('Importing rounds, matches, and selections...')

  // Build lookup maps
  const matchesByRound = {}
  for (const m of matches) {
    if (!matchesByRound[m.round_id]) matchesByRound[m.round_id] = []
    matchesByRound[m.round_id].push(m)
  }
  const selectionsByRound = {}
  for (const s of selections) {
    if (!selectionsByRound[s.round_id]) selectionsByRound[s.round_id] = []
    selectionsByRound[s.round_id].push(s)
  }

  for (const round of rounds) {
    const roundId = String(round.id)
    const roundRef = db.collection('rounds').doc(roundId)

    // Round document
    await roundRef.set({
      roundNumber: round.round_number,
      name: round.name || null,
      roundType: round.round_type || 'season',
      roundDate: round.round_date || null,
      createdAt: round.created_at || null,
      updatedAt: round.updated_at || null,
    })

    // Matches subcollection — keyed by teamId
    const roundMatches = matchesByRound[round.id] || []
    for (const m of roundMatches) {
      await roundRef.collection('matches').doc(m.team_id).set({
        matchDate: m.match_date || null,
        time: m.time || null,
        venue: m.venue || null,
        opponent: m.opponent || null,
        topColour: m.top_colour || 'blue',
        socksColour: m.socks_colour || 'yellow',
        arriveAt: m.arrive_at || null,
      })
    }

    // Selections subcollection
    const roundSelections = selectionsByRound[round.id] || []
    for (const s of roundSelections) {
      await roundRef.collection('selections').doc(String(s.id)).set({
        playerId: String(s.player_id),
        teamId: s.team_id,
        slotNumber: s.slot_number,
        position: s.position || null,
        confirmed: s.confirmed === 1,
        isUnavailable: s.is_unavailable === 1,
      })
    }

    const mCount = roundMatches.length
    const sCount = roundSelections.length
    console.log(`  ✓ Round ${round.round_number || round.name} (id:${roundId}): ${mCount} matches, ${sCount} selections`)
  }
  console.log('')

  // --- 3. Import Player Unavailability ---
  if (unavailability.length > 0) {
    console.log('Importing player unavailability...')
    const batch3 = db.batch()
    for (const u of unavailability) {
      const ref = db.collection('playerUnavailability').doc(String(u.id))
      batch3.set(ref, {
        playerId: String(u.player_id),
        roundId: String(u.round_id),
        notes: u.notes || null,
        createdAt: u.created_at || null,
      })
    }
    await batch3.commit()
    console.log(`  ✓ ${unavailability.length} unavailability records imported\n`)
  } else {
    console.log('No unavailability records to import.\n')
  }

  console.log('=== Import Complete ===')
  console.log(`  Config:         teams (${teams.length}), statuses (${statuses.length})`)
  console.log(`  Players:        ${players.length}`)
  console.log(`  Rounds:         ${rounds.length}`)
  console.log(`  Matches:        ${matches.length}`)
  console.log(`  Selections:     ${selections.length}`)
  console.log(`  Unavailability: ${unavailability.length}`)
}

main().catch(err => {
  console.error('Import failed:', err)
  process.exit(1)
})
