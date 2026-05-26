// src/db.votes.js — Firestore helpers for round voting
import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, orderBy
} from 'firebase/firestore'

// ─── Vote Session ─────────────────────────────────────────────────────────────
// Each round+team has a single vote session doc that controls open/closed state.
// Path: votes/{roundId}__{teamId}

export function voteSessionId(roundId, teamId) {
  return `${roundId}__${teamId}`
}

export async function getVoteSession(roundId, teamId) {
  const snap = await getDoc(doc(db, 'votes', voteSessionId(roundId, teamId)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function createVoteSession(roundId, teamId, { roundLabel, players, matchContext = null }) {
  const id = voteSessionId(roundId, teamId)
  await setDoc(doc(db, 'votes', id), {
    roundId: String(roundId),
    teamId,
    roundLabel,
    players,          // [{ id, name }] — snapshot of players at time of creation
    matchContext,     // optional snapshot of opponent, venue, date/time, and score
    isOpen: true,
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function updateVoteSession(roundId, teamId, { roundLabel, players, matchContext = null }) {
  const id = voteSessionId(roundId, teamId)
  await updateDoc(doc(db, 'votes', id), {
    roundLabel,
    players,
    matchContext,
    updatedAt: new Date().toISOString(),
  })
  return id
}

export async function closeVoteSession(roundId, teamId) {
  const id = voteSessionId(roundId, teamId)
  await updateDoc(doc(db, 'votes', id), {
    isOpen: false,
    closedAt: new Date().toISOString(),
  })
  return id
}

export async function reopenVoteSession(roundId, teamId) {
  const id = voteSessionId(roundId, teamId)
  await updateDoc(doc(db, 'votes', id), {
    isOpen: true,
    closedAt: null,
  })
  return id
}

// ─── Vote Responses ───────────────────────────────────────────────────────────
// Path: votes/{sessionId}/responses/{responseId}
// Each response: { voterName, votes: { '3': playerId, '2': playerId, '1': playerId }, submittedAt }

export async function submitVote(sessionId, { votes }) {
  const ref = await addDoc(collection(db, 'votes', sessionId, 'responses'), {
    votes,          // { '3': playerId, '2': playerId, '1': playerId }
    submittedAt: new Date().toISOString(),
  })
  return ref.id
}

export async function getVoteResponses(sessionId) {
  const snap = await getDocs(
    query(collection(db, 'votes', sessionId, 'responses'), orderBy('submittedAt', 'asc'))
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getVotingOverview(rounds, teams) {
  const sessionsSnap = await getDocs(collection(db, 'votes'))
  const sessionDocs = sessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
  const sessionMap = {}

  await Promise.all(sessionDocs.map(async session => {
    const responses = await getVoteResponses(session.id)
    sessionMap[session.id] = {
      ...session,
      responses,
      responseCount: responses.length,
      players: Array.isArray(session.players) ? session.players : [],
    }
  }))

  const roundStats = []
  const teamTallies = {}

  teams.forEach(team => {
    const playerTotals = {}
    const roundsForTeam = rounds.map(round => {
      const sessionId = voteSessionId(round.id, team.id)
      const session = sessionMap[sessionId] || null
      const players = session?.players || []
      const responses = session?.responses || []
      const tally = session ? tallyVotes(responses, players) : []

      tally.forEach(player => {
        if (!playerTotals[String(player.playerId)]) {
          playerTotals[String(player.playerId)] = {
            playerId: player.playerId,
            name: player.name,
            points: 0,
            votes3: 0,
            votes2: 0,
            votes1: 0,
            rounds: {},
          }
        }
        playerTotals[String(player.playerId)].points += player.points
        playerTotals[String(player.playerId)].votes3 += player.votes3
        playerTotals[String(player.playerId)].votes2 += player.votes2
        playerTotals[String(player.playerId)].votes1 += player.votes1
        playerTotals[String(player.playerId)].rounds[String(round.id)] = player.points
      })

      const squadSize = players.length
      const responseCount = session?.responseCount || 0
      const participation = squadSize > 0 ? Math.round((responseCount / squadSize) * 100) : 0
      const match = session?.matchContext || {}

      return {
        roundId: round.id,
        roundNumber: round.round_number,
        roundLabel: session?.roundLabel || match.roundLabel || (round.round_type === 'season' ? `Round ${round.round_number}` : round.name || 'Practice'),
        roundDate: match.matchDate || round.round_date || round.sat_date || '',
        teamId: team.id,
        teamName: team.name || team.id,
        sessionId,
        session,
        hasSession: !!session,
        isOpen: session?.isOpen === true,
        opponent: match.opponent || '',
        venue: match.venue || '',
        result: match.result || '',
        scoreFor: match.scoreFor,
        scoreAgainst: match.scoreAgainst,
        squadSize,
        responseCount,
        participation,
      }
    })

    roundStats.push(...roundsForTeam)
    teamTallies[team.id] = Object.values(playerTotals).sort((a, b) =>
      b.points - a.points ||
      b.votes3 - a.votes3 ||
      a.name.localeCompare(b.name)
    )
  })

  return { sessions: sessionMap, roundStats, teamTallies }
}

// Tally up points: returns [{ playerId, name, points, votes3, votes2, votes1 }] sorted desc
export function tallyVotes(responses, players) {
  const map = {}
  players.forEach(p => {
    map[String(p.id)] = { playerId: p.id, name: p.name, points: 0, votes3: 0, votes2: 0, votes1: 0 }
  })
  responses.forEach(r => {
    const v = r.votes || {}
    if (v['3'] && map[String(v['3'])]) { map[String(v['3'])].points += 3; map[String(v['3'])].votes3++ }
    if (v['2'] && map[String(v['2'])]) { map[String(v['2'])].points += 2; map[String(v['2'])].votes2++ }
    if (v['1'] && map[String(v['1'])]) { map[String(v['1'])].points += 1; map[String(v['1'])].votes1++ }
  })
  return Object.values(map).sort((a, b) => b.points - a.points || b.votes3 - a.votes3)
}
