// src/db.votes.js — Firestore helpers for round voting
import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, query, orderBy
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

export async function createVoteSession(roundId, teamId, { roundLabel, players }) {
  const id = voteSessionId(roundId, teamId)
  await setDoc(doc(db, 'votes', id), {
    roundId: String(roundId),
    teamId,
    roundLabel,
    players,          // [{ id, name }] — snapshot of players at time of creation
    isOpen: true,
    createdAt: new Date().toISOString(),
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
