// src/db.js — Firestore data access layer
// Replaces all fetch('/api/...') calls with direct Firestore SDK
import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  addDoc, query, where, orderBy, writeBatch, deleteField, arrayUnion, arrayRemove
} from 'firebase/firestore'
import { getNextConfirmedState } from './utils.js'

// ─── Config (Teams + Statuses) ───────────────────────────────────────────────

export async function getTeams() {
  const snap = await getDoc(doc(db, 'config', 'teams'))
  if (!snap.exists()) return []
  return snap.data().teams
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(t => ({ id: t.id, name: t.name, sort_order: t.sortOrder }))
}

export async function getStatuses() {
  const snap = await getDoc(doc(db, 'config', 'statuses'))
  if (!snap.exists()) return []
  return snap.data().statuses
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(s => ({ id: s.id, label: s.label, color: s.color, sort_order: s.sortOrder }))
}

// ─── Players ─────────────────────────────────────────────────────────────────

// Returns players in the shape the components expect (snake_case keys for now
// to minimise component changes — we can camelCase everything later)
export async function getPlayers(includeInactive = false) {
  const snap = await getDocs(collection(db, 'players'))
  let players = snap.docs.map(d => {
    const data = d.data()
    return {
      id: Number(d.id),
      name: data.name,
      status_id: data.statusId || null,
      primary_team_id_2025: data.primaryTeam2025,
      assigned_team_id_2026: data.assignedTeam2026,
      total_games_2025: data.totalGames2025 || 0,
      notes: data.notes,
      default_position: data.defaultPosition,
      is_active: data.isActive ? 1 : 0,
      is_new_registration: data.isNewRegistration ? 1 : 0,
      is_international: data.isInternational ? 1 : 0,
      needs_visa: data.needsVisa ? 1 : 0,
      player_type: data.playerType || null,
      interested_in: data.interestedIn || null,
      previous_club: data.previousClub || null,
      follow_up_ok: data.followUpOk ?? null,
      unsure_reason: data.unsureReason || null,
      playing_preference: data.playingPreference || null,
      teams_played_2026: data.teamsPlayed2026 || [],
      games_played_2026: data.gamesPlayed2026 || {},
      total_games_2026:  data.totalGames2026 || 0,
      stats_2026:        data.stats2026 || null,
    }
  })
  if (!includeInactive) players = players.filter(p => p.is_active === 1)
  return players
}

export async function getPlayer(playerId) {
  const snap = await getDoc(doc(db, 'players', String(playerId)))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    id: Number(snap.id),
    name: data.name,
    status_id: data.statusId || null,
    primary_team_id_2025: data.primaryTeam2025,
    assigned_team_id_2026: data.assignedTeam2026,
    total_games_2025: data.totalGames2025 || 0,
    notes: data.notes,
    default_position: data.defaultPosition,
    is_active: data.isActive ? 1 : 0,
    is_new_registration: data.isNewRegistration ? 1 : 0,
    is_international: data.isInternational ? 1 : 0,
    needs_visa: data.needsVisa ? 1 : 0,
    player_type: data.playerType || null,
    interested_in: data.interestedIn || null,
    previous_club: data.previousClub || null,
    follow_up_ok: data.followUpOk ?? null,
    unsure_reason: data.unsureReason || null,
    playing_preference: data.playingPreference || null,
    teams_played_2026: data.teamsPlayed2026 || [],
    games_played_2026: data.gamesPlayed2026 || {},
    total_games_2026:  data.totalGames2026 || 0,
    stats_2026:        data.stats2026 || null,
    history: [],
  }
}

export async function createPlayer(data) {
  // Use sequential numeric IDs to match the existing "1", "2", ... convention.
  // addDoc generates random string IDs which break Number(id) throughout the app.
  const snap = await getDocs(collection(db, 'players'))
  const numericIds = snap.docs.map(d => parseInt(d.id, 10)).filter(n => !isNaN(n))
  const nextId = String(numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1)

  await setDoc(doc(db, 'players', nextId), {
    name: data.name,
    statusId: data.status_id || 'new',
    defaultPosition: data.default_position || null,
    isActive: true,
    assignedTeam2026: data.assigned_team_id_2026 || null,
    primaryTeam2025: null,
    totalGames2025: 0,
    notes: data.notes || null,
    isNewRegistration: true,
    isInternational: false,
    needsVisa: false,
    playerType: null,
    interestedIn: null,
    previousClub: null,
    followUpOk: null,
    unsureReason: null,
    playingPreference: null,
    teamsPlayed2026: [],
    gamesPlayed2026: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  return { id: Number(nextId), name: data.name }
}

// ─── HV Name Alias Management ────────────────────────────────────────────────

// Returns { 'Richardson, Scott': '123', 'An, John': '45', ... }
export async function getHvNameAliases() {
  const snap = await getDoc(doc(db, 'config', 'hvNameAliases'))
  return snap.exists() ? snap.data() : {}
}

// Save a single HV name → player ID resolution
export async function saveHvAlias(hvName, playerId) {
  await setDoc(doc(db, 'config', 'hvNameAliases'), { [hvName]: String(playerId) }, { merge: true })
}

// Returns list of HV names that couldn't be auto-matched on last sync
export async function getHvUnmatchedNames() {
  const snap = await getDoc(doc(db, 'config', 'hvUnmatchedNames'))
  if (!snap.exists()) return []
  return snap.data().names || []
}

// Clear a name from the unmatched list once resolved
export async function resolveHvUnmatchedName(hvName) {
  const snap = await getDoc(doc(db, 'config', 'hvUnmatchedNames'))
  if (!snap.exists()) return
  const names = (snap.data().names || []).filter(n => n !== hvName)
  await setDoc(doc(db, 'config', 'hvUnmatchedNames'), { names, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function removeTeamPlayed(playerId, teamId) {
  // Removes a team from teamsPlayed2026 and zeroes out the game count for that team.
  // Used to clean up polluted data from practice matches etc.
  const updates = {
    teamsPlayed2026: arrayRemove(teamId),
    [`gamesPlayed2026.${teamId}`]: 0,
    updatedAt: new Date().toISOString(),
  }
  await updateDoc(doc(db, 'players', String(playerId)), updates)
}

export async function updatePlayer(playerId, data) {
  const updates = { updatedAt: new Date().toISOString() }
  if (data.name !== undefined)                  updates.name = data.name
  if (data.is_active !== undefined)             updates.isActive = data.is_active
  if (data.status_id !== undefined)             updates.statusId = data.status_id || null
  if (data.assigned_team_id_2026 !== undefined) updates.assignedTeam2026 = data.assigned_team_id_2026 || null
  if (data.notes !== undefined)                 updates.notes = data.notes || null
  if (data.default_position !== undefined)      updates.defaultPosition = data.default_position || null
  if (data.is_new_registration !== undefined)   updates.isNewRegistration = !!data.is_new_registration
  if (data.is_international !== undefined)      updates.isInternational = !!data.is_international
  if (data.needs_visa !== undefined)            updates.needsVisa = !!data.needs_visa
  if (data.player_type !== undefined)           updates.playerType = data.player_type || null
  if (data.interested_in !== undefined)         updates.interestedIn = data.interested_in || null
  if (data.previous_club !== undefined)         updates.previousClub = data.previous_club || null
  if (data.follow_up_ok !== undefined)          updates.followUpOk = data.follow_up_ok ?? null
  if (data.unsure_reason !== undefined)         updates.unsureReason = data.unsure_reason || null
  if (data.playing_preference !== undefined)    updates.playingPreference = data.playing_preference || null
  await updateDoc(doc(db, 'players', String(playerId)), updates)
}

// ─── Rounds ──────────────────────────────────────────────────────────────────

export async function getRounds() {
  const snap = await getDocs(collection(db, 'rounds'))
  const rounds = snap.docs.map(d => {
    const data = d.data()
    return {
      id: Number(d.id) || d.id,
      round_number: data.roundNumber,
      name: data.name,
      round_type: data.roundType || 'season',
      round_date: data.roundDate,
      sat_date: data.satDate || data.roundDate || null,
      sun_date: data.sunDate || null,
      created_at: data.createdAt,
      updated_at: data.updatedAt,
    }
  })
  // Sort: season rounds by date, then practice rounds
  return rounds.sort((a, b) => {
    if (a.round_type === 'season' && b.round_type !== 'season') return -1
    if (a.round_type !== 'season' && b.round_type === 'season') return 1
    if (a.round_type === 'season' && b.round_type === 'season') {
      const aKey = a.round_date || `9999-${String(a.round_number || 9999).padStart(4, '0')}`
      const bKey = b.round_date || `9999-${String(b.round_number || 9999).padStart(4, '0')}`
      return aKey.localeCompare(bKey)
    }
    return 0
  })
}

// GET /api/rounds/:id replacement — returns { ...round, matches, selections, bench }
export async function getRoundDetail(roundId, allPlayers = null) {
  const roundSnap = await getDoc(doc(db, 'rounds', String(roundId)))
  if (!roundSnap.exists()) return null

  const roundData = roundSnap.data()
  const round = {
    id: Number(roundSnap.id) || roundSnap.id,
    round_number: roundData.roundNumber,
    name: roundData.name,
    round_type: roundData.roundType,
    round_date: roundData.roundDate,
    sat_date: roundData.satDate || roundData.roundDate || null,
    sun_date: roundData.sunDate || null,
  }

  // Fetch matches subcollection
  const matchesSnap = await getDocs(collection(db, 'rounds', String(roundId), 'matches'))
  const matches = matchesSnap.docs.map(d => ({
    team_id: d.id,
    match_date: d.data().matchDate || '',
    time: d.data().time || '',
    venue: d.data().venue || '',
    opponent: d.data().opponent || '',
    top_colour: d.data().topColour || 'blue',
    socks_colour: d.data().socksColour || 'yellow',
    arrive_at: d.data().arriveAt || '',
  }))

  // Fetch selections subcollection
  const selectionsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  
  // If allPlayers not passed, fetch them (for hydrating names)
  if (!allPlayers) {
    const playersSnap = await getDocs(collection(db, 'players'))
    allPlayers = playersSnap.docs.map(d => ({ id: Number(d.id) || d.id, ...d.data() }))
  }

  const playerMap = {}
  allPlayers.forEach(p => { playerMap[String(p.id)] = p })

  const selections = selectionsSnap.docs.map(d => {
    const sel = d.data()
    const player = playerMap[sel.playerId] || {}
    return {
      id: d.id,
      round_id: roundId,
      team_id: sel.teamId,
      player_id: Number(sel.playerId) || sel.playerId,
      slot_number: sel.slotNumber,
      position: sel.position || null,
      confirmed: sel.confirmed ? (sel.confirmed === true ? 2 : sel.confirmed) : 0,
      is_unavailable: sel.isUnavailable ? 1 : 0,
      // Hydrated player fields
      name: player.name || 'Unknown',
      status_id: null,
      primary_team_id_2025: player.primaryTeam2025 || null,
      default_position: player.defaultPosition || null,
      // Round-scoped note stored on the selection doc itself
      note: sel.note || null,
    }
  }).sort((a, b) => {
    if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id)
    return (a.slot_number || 0) - (b.slot_number || 0)
  })

  return { ...round, matches, selections, bench: [] }
}

// ─── Round CRUD ──────────────────────────────────────────────────────────────

export async function createRound({ round_type, name, round_number, round_date, sat_date, sun_date, copy_from_round_id }, teams) {
  const now = new Date().toISOString()
  const satD = sat_date || round_date || null
  const sunD = sun_date || null
  const ref = await addDoc(collection(db, 'rounds'), {
    roundNumber: round_number || null,
    name: name || null,
    roundType: round_type || 'season',
    roundDate: satD,   // keep roundDate = sat for backward compat
    satDate: satD,
    sunDate: sunD,
    createdAt: now,
    updatedAt: now,
  })
  const roundId = ref.id

  // Create match docs for each team
  const teamIds = teams.map(t => t.id).filter(id => id !== 'NEW')

  if (copy_from_round_id) {
    // Copy matches (blank date/opponent) and selections from source round
    const srcMatches = await getDocs(collection(db, 'rounds', String(copy_from_round_id), 'matches'))
    const srcSelections = await getDocs(collection(db, 'rounds', String(copy_from_round_id), 'selections'))

    const batch = writeBatch(db)
    for (const tid of teamIds) {
      const srcMatch = srcMatches.docs.find(d => d.id === tid)?.data() || {}
      batch.set(doc(db, 'rounds', roundId, 'matches', tid), {
        matchDate: '',
        time: srcMatch.time || '',
        venue: srcMatch.venue || '',
        opponent: '',
        topColour: srcMatch.topColour || 'blue',
        socksColour: srcMatch.socksColour || 'yellow',
        arriveAt: srcMatch.arriveAt || '',
      })
    }
    for (const selDoc of srcSelections.docs) {
      const sel = selDoc.data()
      const newRef = doc(collection(db, 'rounds', roundId, 'selections'))
      batch.set(newRef, {
        playerId: sel.playerId,
        teamId: sel.teamId,
        slotNumber: sel.slotNumber,
        position: sel.position || null,
        confirmed: false,
        isUnavailable: sel.isUnavailable || false,
      })
    }
    await batch.commit()
  } else {
    // Just create empty match docs
    const batch = writeBatch(db)
    for (const tid of teamIds) {
      batch.set(doc(db, 'rounds', roundId, 'matches', tid), {
        matchDate: '', time: '', venue: '', opponent: '',
        topColour: 'blue', socksColour: 'yellow', arriveAt: '',
      })
    }
    await batch.commit()
  }

  return {
    id: roundId,
    round_number: round_number || null,
    name: name || null,
    round_type: round_type || 'season',
    round_date: satD,
    sat_date: satD,
    sun_date: sunD,
    created_at: now,
    updated_at: now,
  }
}

export async function updateRound(roundId, data) {
  const updates = { updatedAt: new Date().toISOString() }
  if (data.round_number !== undefined) updates.roundNumber = data.round_number
  if (data.name !== undefined)         updates.name = data.name
  if (data.round_date !== undefined)   updates.roundDate = data.round_date || null
  if (data.sat_date !== undefined)     { updates.satDate = data.sat_date || null; updates.roundDate = data.sat_date || null }
  if (data.sun_date !== undefined)     updates.sunDate = data.sun_date || null
  await updateDoc(doc(db, 'rounds', String(roundId)), updates)
  // Return updated round in expected shape
  const snap = await getDoc(doc(db, 'rounds', String(roundId)))
  const d = snap.data()
  return {
    id: Number(snap.id) || snap.id,
    round_number: d.roundNumber,
    name: d.name,
    round_type: d.roundType,
    round_date: d.roundDate,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  }
}

export async function deleteRound(roundId) {
  // Delete subcollections first
  const rid = String(roundId)
  const matchesDel = await getDocs(collection(db, 'rounds', rid, 'matches'))
  const selsDel = await getDocs(collection(db, 'rounds', rid, 'selections'))
  const batch = writeBatch(db)
  matchesDel.docs.forEach(d => batch.delete(d.ref))
  selsDel.docs.forEach(d => batch.delete(d.ref))
  batch.delete(doc(db, 'rounds', rid))
  await batch.commit()
}

// ─── Match Details ───────────────────────────────────────────────────────────

export async function updateMatchDetails(roundId, teamId, data) {
  const updates = {}
  if (data.match_date !== undefined)   updates.matchDate = data.match_date || ''
  if (data.time !== undefined)         updates.time = data.time || ''
  if (data.arrive_at !== undefined)    updates.arriveAt = data.arrive_at || ''
  if (data.opponent !== undefined)     updates.opponent = data.opponent || ''
  if (data.venue !== undefined)        updates.venue = data.venue || ''
  if (data.top_colour !== undefined)   updates.topColour = data.top_colour || ''
  if (data.socks_colour !== undefined) updates.socksColour = data.socks_colour || ''
  await setDoc(doc(db, 'rounds', String(roundId), 'matches', teamId), updates, { merge: true })
}

// ─── Selections ──────────────────────────────────────────────────────────────

// Add multiple selections in a single Firestore batch (much faster than sequential adds)
// Also updates teamsPlayed2026 on each player doc so they appear in team quick-select filters
export async function addSelectionBatch(roundId, players) {
  // players: [{ team_id, player_id, slot_number }, ...]
  const batch = writeBatch(db)
  const ids = []
  for (const { team_id, player_id, slot_number } of players) {
    const ref = doc(collection(db, 'rounds', String(roundId), 'selections'))
    batch.set(ref, {
      teamId: team_id,
      playerId: String(player_id),
      slotNumber: slot_number,
      position: null,
      confirmed: false,
      isUnavailable: false,
    })
    ids.push(ref.id)
    // Track which teams a player has been selected for (for picker filter)
    // Note: gamesPlayed2026 counts are only updated by syncHv (actual attendance)
    batch.update(doc(db, 'players', String(player_id)), {
      teamsPlayed2026: arrayUnion(team_id),
      updatedAt: new Date().toISOString(),
    })
  }
  await batch.commit()
  return ids
}

export async function addSelection(roundId, { team_id, player_id, slot_number }) {
  const batch = writeBatch(db)
  const selRef = doc(collection(db, 'rounds', String(roundId), 'selections'))
  batch.set(selRef, {
    teamId: team_id,
    playerId: String(player_id),
    slotNumber: slot_number,
    position: null,
    confirmed: false,
    isUnavailable: false,
  })
  // Keep teamsPlayed2026 in sync (for picker filter)
  // Note: gamesPlayed2026 counts only updated by syncHv (actual attendance)
  batch.update(doc(db, 'players', String(player_id)), {
    teamsPlayed2026: arrayUnion(team_id),
    updatedAt: new Date().toISOString(),
  })
  await batch.commit()
  return { id: selRef.id }
}

export async function removeSelection(roundId, teamId, playerId) {
  // Find the selection doc by teamId + playerId
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const target = selsSnap.docs.find(d => {
    const data = d.data()
    return data.teamId === teamId && String(data.playerId) === String(playerId)
  })
  if (target) {
    await deleteDoc(target.ref)
    // Re-number remaining slots and decrement game count
    const remaining = selsSnap.docs
      .filter(d => d.id !== target.id && d.data().teamId === teamId)
      .sort((a, b) => (a.data().slotNumber || 0) - (b.data().slotNumber || 0))
    const batch = writeBatch(db)
    remaining.forEach((d, i) => batch.update(d.ref, { slotNumber: i + 1 }))
    // Note: gamesPlayed2026 is not decremented here — counts come from syncHv only
    await batch.commit()
  }
}

export async function updateSelectionUnavailable(roundId, teamId, playerId, isUnavailable) {
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const target = selsSnap.docs.find(d => {
    const data = d.data()
    return data.teamId === teamId && String(data.playerId) === String(playerId)
  })
  if (target) {
    const updates = { isUnavailable }
    if (isUnavailable) updates.confirmed = 0  // reset state when moved to bucket
    await updateDoc(target.ref, updates)
  }
}

export { getNextConfirmedState } from './utils.js'

export async function toggleSelectionConfirmed(roundId, teamId, playerId) {
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const target = selsSnap.docs.find(d => {
    const data = d.data()
    return data.teamId === teamId && String(data.playerId) === String(playerId)
  })
  if (target) {
    const current = target.data().confirmed || 0
    const next = getNextConfirmedState(current)
    await updateDoc(target.ref, { confirmed: next })
    return next
  }
  return 0
}

export async function updateSelectionPosition(roundId, teamId, playerId, position) {
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const target = selsSnap.docs.find(d => {
    const data = d.data()
    return data.teamId === teamId && String(data.playerId) === String(playerId)
  })
  if (target) {
    await updateDoc(target.ref, { position: position || null })
  }
}

// Round-scoped note — stored directly on the selection document
export async function updateSelectionNote(roundId, selectionId, note) {
  await updateDoc(doc(db, 'rounds', String(roundId), 'selections', selectionId), {
    note: note || null,
  })
}

// Drag-and-drop: move player between teams or reorder within team
export async function moveSelection(roundId, { playerId, from_team_id, target_team_id, target_player_id, insert_after }) {
  const selsSnap = await getDocs(collection(db, 'rounds', String(roundId), 'selections'))
  const allDocs = selsSnap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }))

  // Find the moving player's selection doc
  const moving = allDocs.find(d => String(d.playerId) === String(playerId) && d.teamId === from_team_id)
  if (!moving) return

  // Update team if cross-team move
  if (from_team_id !== target_team_id) {
    moving.teamId = target_team_id
  }

  // Get target team selections (excluding the moving player)
  const targetSels = allDocs
    .filter(d => d.teamId === target_team_id && d.id !== moving.id)
    .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0))

  // Find insert position
  let insertIdx = targetSels.length
  if (target_player_id) {
    const ti = targetSels.findIndex(d => String(d.playerId) === String(target_player_id))
    if (ti !== -1) insertIdx = insert_after ? ti + 1 : ti
  }
  targetSels.splice(insertIdx, 0, moving)

  // Re-number all target team slots
  const batch = writeBatch(db)
  targetSels.forEach((d, i) => {
    batch.update(d.ref, { slotNumber: i + 1, teamId: target_team_id })
  })

  // Re-number source team if cross-team
  if (from_team_id !== target_team_id) {
    const fromSels = allDocs
      .filter(d => d.teamId === from_team_id && d.id !== moving.id)
      .sort((a, b) => (a.slotNumber || 0) - (b.slotNumber || 0))
    fromSels.forEach((d, i) => {
      batch.update(d.ref, { slotNumber: i + 1 })
    })
  }

  await batch.commit()
}

// ─── Player Unavailability (master list) ─────────────────────────────────────

export async function getUnavailability({ round_id, player_id } = {}) {
  let q
  if (round_id) {
    q = query(collection(db, 'playerUnavailability'), where('roundId', '==', String(round_id)))
  } else if (player_id) {
    q = query(collection(db, 'playerUnavailability'), where('playerId', '==', String(player_id)))
  } else {
    q = collection(db, 'playerUnavailability')
  }
  const snap = await getDocs(q)
  return snap.docs.map(d => ({
    id: d.id,
    player_id: d.data().playerId,
    round_id: d.data().roundId,
    days: d.data().days || 'both',   // 'sat' | 'sun' | 'both'
    notes: d.data().notes,
  }))
}

export async function addUnavailability({ player_id, round_id, days = 'both', notes }) {
  const ref = await addDoc(collection(db, 'playerUnavailability'), {
    playerId: String(player_id),
    roundId: String(round_id),
    days: days,
    notes: notes || null,
    createdAt: new Date().toISOString(),
  })
  return { id: ref.id }
}

export async function updateUnavailabilityDays(player_id, round_id, days) {
  // days: 'sat' | 'sun' | 'both' — update existing record, or add if missing
  const q = query(
    collection(db, 'playerUnavailability'),
    where('playerId', '==', String(player_id)),
    where('roundId', '==', String(round_id))
  )
  const snap = await getDocs(q)
  if (snap.empty) {
    await addDoc(collection(db, 'playerUnavailability'), {
      playerId: String(player_id),
      roundId: String(round_id),
      days,
      createdAt: new Date().toISOString(),
    })
  } else {
    await updateDoc(snap.docs[0].ref, { days })
  }
}

export async function removeUnavailability(playerId, roundId) {
  const q = query(
    collection(db, 'playerUnavailability'),
    where('playerId', '==', String(playerId)),
    where('roundId', '==', String(roundId))
  )
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

// ─── Carry Forward ───────────────────────────────────────────────────────────
// Copies selections from sourceRoundId into targetRoundId for the specified teamIds.
// Merges — players already present in target team are skipped.
// Availability resets to 0 (unconfirmed) for all copied players.
export async function carryForwardSelections(sourceRoundId, targetRoundId, teamIds) {
  const srcSnap = await getDocs(collection(db, 'rounds', String(sourceRoundId), 'selections'))
  const tgtSnap = await getDocs(collection(db, 'rounds', String(targetRoundId), 'selections'))

  // Build a set of "teamId:playerId" already in the target round
  const existing = new Set(
    tgtSnap.docs.map(d => `${d.data().teamId}:${d.data().playerId}`)
  )

  // Find current max slotNumber per team in target so we append correctly
  const maxSlots = {}
  tgtSnap.docs.forEach(d => {
    const { teamId, slotNumber } = d.data()
    if (!maxSlots[teamId] || slotNumber > maxSlots[teamId]) maxSlots[teamId] = slotNumber
  })

  // Filter source to requested teams only, skip already-present players
  const toAdd = srcSnap.docs
    .map(d => ({ ...d.data() }))
    .filter(sel => teamIds.includes(sel.teamId))
    .filter(sel => !existing.has(`${sel.teamId}:${sel.playerId}`))

  if (toAdd.length === 0) return { copied: 0 }

  // Sort by team + slot so ordering is preserved
  toAdd.sort((a, b) => {
    if (a.teamId !== b.teamId) return a.teamId.localeCompare(b.teamId)
    return (a.slotNumber || 0) - (b.slotNumber || 0)
  })

  const nextSlot = { ...maxSlots }
  const batch = writeBatch(db)
  for (const sel of toAdd) {
    if (!nextSlot[sel.teamId]) nextSlot[sel.teamId] = 0
    nextSlot[sel.teamId]++
    const ref = doc(collection(db, 'rounds', String(targetRoundId), 'selections'))
    batch.set(ref, {
      playerId: sel.playerId,
      teamId: sel.teamId,
      slotNumber: nextSlot[sel.teamId],
      position: sel.position || null,
      confirmed: 0,
      isUnavailable: sel.isUnavailable || false,
    })
  }
  await batch.commit()
  return { copied: toAdd.length }
}

// ─── Team View (players by team) ─────────────────────────────────────────────

export async function getTeamPlayers(teamId) {
  const players = await getPlayers(true) // include inactive

  // Players actually confirmed as having played for this team (from syncHv attendance data)
  const playedForTeam = players
    .filter(p => (p.games_played_2026?.[teamId] || 0) > 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Players assigned to this team who haven't played yet (new to squad this season)
  const assignedNotYetPlayed = players
    .filter(p => p.assigned_team_id_2026 === teamId)
    .filter(p => (p.games_played_2026?.[teamId] || 0) === 0)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Combined squad: played first, then assigned-but-not-yet-played
  const squad2026 = [
    ...playedForTeam,
    ...assignedNotYetPlayed,
  ]

  // 2025 main squad — kept for reference column
  const mainSquad = players.filter(p => p.primary_team_id_2025 === teamId)

  return { mainSquad, fillIns: [], squad2026, playedForTeam, assignedNotYetPlayed }
}

// ─── HV Fixture & Sync ───────────────────────────────────────────────────────

// Lightweight match fetch — no selections, no player hydration.
// Used by FixtureView to render all teams for a given round.
export async function getRoundMatches(roundId) {
  const snap = await getDocs(collection(db, 'rounds', String(roundId), 'matches'))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      team_id:       d.id,
      match_date:    data.matchDate  || '',
      time:          data.time       || '',
      venue:         data.venue      || '',
      opponent:      data.opponent   || '',
      arrive_at:     data.arriveAt   || '',
      top_colour:    data.topColour  || '',
      socks_colour:  data.socksColour || '',
      score_for:     data.scoreFor     ?? null,
      score_against: data.scoreAgainst ?? null,
      result:        data.result     || '',
      scorers:       data.scorers    || [],
      is_home:       data.isHome      ?? null,
    }
  })
}

// Returns the most recent HV sync digest from Firestore.
export async function getHvSync() {
  const snap = await getDoc(doc(db, 'hvSync', 'latest'))
  if (!snap.exists()) return null
  return snap.data()
}

// ─── Weekly Digests ──────────────────────────────────────────────────────────

// Returns all saved digests ordered newest-round first.
// Each item: { id, roundNumber, generatedAt, html, text, summaries }
export async function getDigestHistory() {
  const snap = await getDocs(
    query(collection(db, 'weeklyDigests'), orderBy('roundNumber', 'desc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Returns a single saved digest by round number, or null if not found.
export async function getDigest(roundNumber) {
  const snap = await getDoc(doc(db, 'weeklyDigests', `round_${roundNumber}`))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

// ─── HV Stats — alias resolution helper ──────────────────────────────────────

// After saving a new alias for an HV name, clear statsLastSync on any match docs
// that have that name in their statsUnmatched array. This forces those matches to
// be re-scraped on the next syncHv run so the new alias is applied.
export async function clearStatsLastSyncForHvName(hvName) {
  const roundsSnap = await getDocs(collection(db, 'rounds'))
  const batch = writeBatch(db)
  let cleared = 0

  for (const roundDoc of roundsSnap.docs) {
    if (roundDoc.data().roundType !== 'season') continue
    const matchesSnap = await getDocs(
      collection(db, 'rounds', roundDoc.id, 'matches')
    )
    for (const matchDoc of matchesSnap.docs) {
      const unmatched = matchDoc.data().statsUnmatched || []
      if (unmatched.includes(hvName)) {
        batch.update(matchDoc.ref, { statsLastSync: deleteField() })
        cleared++
      }
    }
  }

  if (cleared > 0) await batch.commit()
  return cleared
}
