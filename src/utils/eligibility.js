// eligibility.js — HV Eligibility Engine (docs/ELIGIBILITY-ENGINE.md)
//
// Pure functions only — no Firestore imports. Inputs are the player-doc
// aggregates written by syncHv (gamesPlayed2026 / stats2026ByTeam), the
// config/teamRankings doc, and the current round's planner selections.
//
// Rule sources: HV 2026 Competition Rules 3.2.1, 3.3; Regulations 8.1–8.5.
// Design principle: warn, never block. Breaches render loudly but saves
// are never prevented — the club wears any forfeit, not the software.

export const LOCKOUT_THRESHOLD = 10      // Reg 8.4.1(a)
export const LOCKOUT_WARNING_FROM = 8    // approaching-lockout warning band (8–9)
export const EXEMPT_SLOTS_PER_TEAM = 3   // Reg 8.4.4
export const MAX_MATCHES_PER_ROUND = 2   // Reg 8.1 / 8.3

export const ELIGIBILITY_TAGS = ['ETS', 'DGK', 'EXEMPT']

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Derive a player's eligibility state from their scraped season record.
 *
 * @param {object} player  planner-shaped player: { games_played_2026, stats_2026_by_team }
 * @param {object} rankings  { teamId: rank } — rank 1 = highest grade
 * @param {number} roundsInSeason
 * @returns derived eligibility values (see ELIGIBILITY-ENGINE.md §2)
 */
export function derivePlayerEligibility(player, rankings, roundsInSeason = 18) {
    const games = player?.games_played_2026 || {}
    const byTeam = player?.stats_2026_by_team || {}

    // GK (incl. DGK per Reg 8.3.3.1) and ETS matches are excluded from the
    // field playing record (Reg 8.3.2 / 8.3.3).
    const fieldRecord = {}
    const gkRecord = {}
    for (const [tid, n] of Object.entries(games)) {
        const s = byTeam[tid] || {}
        const gk = s.gkAppearances || 0
        const ets = s.ets || 0
        gkRecord[tid] = gk
        fieldRecord[tid] = Math.max(0, (n || 0) - gk - ets)
    }

    const usuallyPlays = computeUsuallyPlays(fieldRecord, rankings)

    // Field matches in teams ranked strictly above the given team
    const higherGradeCount = (teamId) => {
        const rank = rankings[teamId]
        if (rank == null) return 0
        return Object.entries(fieldRecord).reduce(
            (sum, [tid, n]) => (rankings[tid] != null && rankings[tid] < rank ? sum + n : sum), 0)
    }

    const higherGradeGames = usuallyPlays ? higherGradeCount(usuallyPlays) : 0
    const lockedOutBelow = higherGradeGames >= LOCKOUT_THRESHOLD
    const approachingLockout = !lockedOutBelow && higherGradeGames >= LOCKOUT_WARNING_FROM

    return {
        fieldRecord,
        gkRecord,
        usuallyPlays,
        higherGradeCount,
        higherGradeGames,
        lockedOutBelow,
        approachingLockout,
        roundsInSeason,
    }
}

/**
 * Usually Plays (R8): team with the simple majority of field-record matches.
 * Equal count between teams → the higher-ranked (lower rank number) team.
 * Zero field matches → null (direction/lockout rules pass vacuously).
 */
export function computeUsuallyPlays(fieldRecord, rankings) {
    let best = null
    let bestCount = 0
    for (const [tid, n] of Object.entries(fieldRecord)) {
        if (n <= 0) continue
        if (n > bestCount) { best = tid; bestCount = n; continue }
        if (n === bestCount && best != null) {
            const r = rankings[tid], rb = rankings[best]
            if (r != null && (rb == null || r < rb)) best = tid
        }
    }
    return best
}

// ── Finals eligibility (R9 — Phase 2) ────────────────────────────────────────
// TODO(Phase 2): finals eligibility view per ELIGIBILITY-ENGINE.md §6 —
// per-player × per-team grid of finalsEligible with gamesNeededForFinals.
// Deliberately not wired into Planner validation.

/**
 * Minimum field matches for finals qualification in a team:
 * ceil(33.333% of rounds the team actually played, excluding byes) —
 * Reg 8.5.1(a)(i), fractional rounds UP per Reg 8.5.1(d).
 */
export function finalsThreshold(roundsPlayedByTeam) {
    return Math.ceil(roundsPlayedByTeam / 3)
}

/**
 * R9 both-tests result for one team.
 * (a) field matches in that team and/or lower-ranked teams >= threshold
 * (b) Usually Plays (R8) resolves to that team or a lower-ranked team
 *
 * @param {object} derived  result of derivePlayerEligibility
 * @param {string} teamId
 * @param {object} rankings
 * @param {number} roundsPlayedByTeam  rounds the team actually played (byes excluded)
 */
export function finalsEligibleForTeam(derived, teamId, rankings, roundsPlayedByTeam) {
    const rank = rankings[teamId]
    if (rank == null) return { eligible: false, gamesNeeded: null }
    const atOrBelow = Object.entries(derived.fieldRecord).reduce(
        (sum, [tid, n]) => (rankings[tid] != null && rankings[tid] >= rank ? sum + n : sum), 0)
    const threshold = finalsThreshold(roundsPlayedByTeam)
    const countTest = atOrBelow >= threshold
    const up = derived.usuallyPlays
    const majorityTest = up != null && rankings[up] != null && rankings[up] >= rank
    return {
        eligible: countTest && majorityTest,
        gamesNeeded: Math.max(0, threshold - atOrBelow),
    }
}

// ── Validation engine (§3) ────────────────────────────────────────────────────

const ok = () => ({ status: 'ok', reasons: [] })

/**
 * Validate the current round's selections.
 *
 * @param {Array} selections  planner-shaped selections for the round:
 *   { id, player_id, team_id, slot_number, position, is_unavailable, eligibility_tag }
 * @param {Map|object} playersById  player_id → planner-shaped player
 *   (needs games_played_2026, stats_2026_by_team, is_international)
 * @param {object} rankings  { teamId: rank }
 * @param {number} roundsInSeason
 * @returns {Map} selection.id → { status: 'ok'|'warning'|'breach',
 *   reasons: [{ level, message, regRef }] }
 */
export function validateRound(selections, playersById, rankings, roundsInSeason = 18) {
    const results = new Map()
    const getPlayer = (id) =>
        playersById instanceof Map ? playersById.get(id) : playersById?.[id]

    const active = (selections || []).filter(s => !s.is_unavailable)
    active.forEach(s => results.set(s.id, ok()))

    const add = (sel, level, message, regRef) => {
        const r = results.get(sel.id)
        r.reasons.push({ level, message, regRef })
        if (level === 'breach') r.status = 'breach'
        else if (level === 'warning' && r.status !== 'breach') r.status = 'warning'
    }

    // Group active selections by player
    const byPlayer = new Map()
    for (const s of active) {
        if (!byPlayer.has(s.player_id)) byPlayer.set(s.player_id, [])
        byPlayer.get(s.player_id).push(s)
    }

    // V5 — exemption slots per team (Reg 8.4.4): breach on the 4th+ EXEMPT tag,
    // counted in slot order so the first three keep their slots.
    const exemptByTeam = new Map()
    for (const s of active) {
        if (s.eligibility_tag !== 'EXEMPT') continue
        if (!exemptByTeam.has(s.team_id)) exemptByTeam.set(s.team_id, [])
        exemptByTeam.get(s.team_id).push(s)
    }
    for (const sels of exemptByTeam.values()) {
        sels.sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0))
        sels.slice(EXEMPT_SLOTS_PER_TEAM).forEach(s =>
            add(s, 'breach', `Exemption limit ${EXEMPT_SLOTS_PER_TEAM} per team per round`, 'Reg 8.4.4'))
    }

    for (const [playerId, sels] of byPlayer) {
        const player = getPlayer(playerId) || {}
        const d = derivePlayerEligibility(player, rankings, roundsInSeason)
        const up = d.usuallyPlays
        const upRank = up != null ? rankings[up] : null
        const rankOf = (s) => rankings[s.team_id]

        // V1 — round cap (Reg 8.1 / 8.3)
        if (sels.length > MAX_MATCHES_PER_ROUND) {
            sels.forEach(s => add(s, 'breach',
                `Max ${MAX_MATCHES_PER_ROUND} matches per round`, 'Reg 8.1'))
        }

        // V2 — approved Overseas Player cap (Rule 3.2.1, Reg 8.3.1). No tag overrides.
        if (player.is_international && sels.length >= 2) {
            sels.forEach(s => add(s, 'breach',
                'Approved Overseas Player: max 1 match per round', 'Rule 3.2.1'))
        }

        // V3 — direction of second match (Reg 8.4.3). The second match is the
        // one in the lower-ranked of the player's teams this round. Needs
        // usuallyPlays history; passes vacuously for new players.
        if (sels.length === 2 && upRank != null) {
            const sorted = [...sels].sort((a, b) => (rankOf(a) ?? 99) - (rankOf(b) ?? 99))
            const second = sorted[1]
            const r = rankOf(second)
            if (r != null && r - upRank >= 2 && second.eligibility_tag !== 'EXEMPT') {
                add(second, 'breach',
                    '2nd match more than one grade below Usually Plays', 'Reg 8.4.3')
            }
        }

        for (const s of sels) {
            const r = rankOf(s)
            const tag = s.eligibility_tag || null
            const others = sels.filter(o => o !== s)

            // V4 — anti-stacking lockout (Reg 8.4.1(a))
            if (d.lockedOutBelow && upRank != null && r != null && r > upRank &&
                tag !== 'EXEMPT' && tag !== 'DGK') {
                add(s, 'breach',
                    `Anti-stacking lockout: ${d.higherGradeGames} higher-grade games`, 'Reg 8.4.1')
            }

            // V6 — EXEMPT constraints (Reg 8.4.4): exactly one grade below
            // Usually Plays, and that one match only.
            if (tag === 'EXEMPT' && upRank != null &&
                (r !== upRank + 1 || sels.length >= 2)) {
                add(s, 'breach',
                    'Exempt players: one grade down, one match only', 'Reg 8.4.4')
            }

            // V7 — DGK needs one GK match + one field match in the same round
            if (tag === 'DGK' &&
                (others.length === 0 || others.some(o => o.eligibility_tag === 'DGK'))) {
                add(s, 'breach',
                    'DGK requires one GK match + one field match, same round', 'Reg 8.3.3')
            }
            // DGK position sanity — warning only, positions are optional
            if (tag === 'DGK' && s.position && s.position !== 'GK') {
                add(s, 'warning',
                    'DGK-tagged selection is not in the GK position', 'Reg 8.3.3')
            }

            // V8 — ETS must be above Usually Plays (Reg 8.3.2)
            if (tag === 'ETS' && upRank != null && !(r != null && r < upRank)) {
                add(s, 'breach', 'ETS must play above their usual team', 'Reg 8.3.2')
            }

            // V9 — ETS absence condition is not verifiable from our data
            if (tag === 'ETS') {
                add(s, 'warning',
                    'ETS: confirm covered player is absent on State/National duties — not verifiable here',
                    'Reg 8.3.2')
            }

            // V10 — approaching lockout (8–9 higher-grade games)
            if (d.approachingLockout) {
                add(s, 'warning',
                    `${d.higherGradeGames} higher-grade games: ${LOCKOUT_THRESHOLD} triggers anti-stacking lockout`,
                    'Reg 8.4.1')
            }
        }
    }

    return results
}
