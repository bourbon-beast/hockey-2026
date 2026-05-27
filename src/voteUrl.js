// voteUrl.js — readable public paths for voting: /vote/{teamId}/{roundKey}
import { TEAM_LABELS } from './components/roundUtils'

export const VOTE_TEAM_IDS = Object.keys(TEAM_LABELS)

/** URL-safe slug from round name (non-season). */
export function slugifyRoundName(name) {
  const s = String(name || 'round')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || 'round'
}

function idTail(id) {
  const t = String(id).replace(/[^a-z0-9]/gi, '').slice(-4)
  return t || '0'
}

/**
 * Path segment for a round. Season: r{n}. Non-season: slug(name), with -{idTail} if slug clashes.
 */
export function buildVotePathSegment(round, allRounds = []) {
  if (round.round_type === 'season' && round.round_number != null) {
    return `r${round.round_number}`
  }
  let base = slugifyRoundName(round.name)
  const conflicts = allRounds.filter(
    r =>
      r.id !== round.id &&
      r.round_type !== 'season' &&
      slugifyRoundName(r.name) === slugifyRoundName(round.name)
  )
  if (conflicts.length > 0) {
    base = `${base}-${idTail(round.id)}`
  }
  return base
}

export function buildVoteLink(origin, teamId, round, allRounds = []) {
  const seg = buildVotePathSegment(round, allRounds)
  const base = String(origin).replace(/\/$/, '')
  return `${base}/vote/${encodeURIComponent(teamId)}/${encodeURIComponent(seg)}`
}

/** @returns {string|number|null} Firestore round id */
export function resolveRoundIdFromKey(roundKey, rounds) {
  const key = String(roundKey || '').trim()
  if (!key) return null

  const seasonMatch = /^r(\d+)$/i.exec(key)
  if (seasonMatch) {
    const n = Number(seasonMatch[1])
    const hit = rounds.find(
      r => r.round_type === 'season' && Number(r.round_number) === n
    )
    return hit?.id ?? null
  }

  for (const r of rounds) {
    if (r.round_type === 'season') continue
    if (buildVotePathSegment(r, rounds) === key) return r.id
  }
  return null
}

export function isValidVoteTeamId(teamId) {
  return VOTE_TEAM_IDS.includes(teamId)
}
