import { describe, it, expect } from 'vitest'
import {
    derivePlayerEligibility,
    computeUsuallyPlays,
    finalsThreshold,
    finalsEligibleForTeam,
    validateRound,
} from './eligibility'

const RANKINGS = { PL: 1, PLR: 2, PB: 3, PC: 4, PE: 5, Metro: 6 }

// Helper: build a planner-shaped player from per-team [games, gk, ets] triples
const player = (teams = {}, extra = {}) => ({
    games_played_2026: Object.fromEntries(
        Object.entries(teams).map(([tid, [g]]) => [tid, g])),
    stats_2026_by_team: Object.fromEntries(
        Object.entries(teams).map(([tid, [, gk = 0, ets = 0]]) => [
            tid, { gkAppearances: gk, ets }])),
    ...extra,
})

let nextId = 1
const sel = (playerId, teamId, extra = {}) => ({
    id: `s${nextId++}`,
    player_id: playerId,
    team_id: teamId,
    slot_number: extra.slot_number ?? 1,
    position: extra.position ?? null,
    is_unavailable: extra.is_unavailable ?? 0,
    eligibility_tag: extra.eligibility_tag ?? null,
})

const run = (selections, players) =>
    validateRound(selections, new Map(Object.entries(players).map(([k, v]) => [Number(k), v])), RANKINGS)

const statusOf = (results, s) => results.get(s.id).status
const reasonsOf = (results, s) => results.get(s.id).reasons.map(r => r.regRef)

describe('derivation — field/GK records and Usually Plays (R8)', () => {
    it('excludes GK and ETS matches from the field record', () => {
        const d = derivePlayerEligibility(player({ PB: [6, 2, 1], PC: [3] }), RANKINGS)
        expect(d.fieldRecord).toEqual({ PB: 3, PC: 3 })
        expect(d.gkRecord).toEqual({ PB: 2, PC: 0 })
    })

    it('usuallyPlays = simple majority of field matches', () => {
        const d = derivePlayerEligibility(player({ PB: [5], PC: [2] }), RANKINGS)
        expect(d.usuallyPlays).toBe('PB')
    })

    it('majority tie → higher-ranked team wins', () => {
        expect(computeUsuallyPlays({ PC: 4, PB: 4 }, RANKINGS)).toBe('PB')
    })

    it('three-way tie → highest-ranked of the tied set', () => {
        expect(computeUsuallyPlays({ PE: 3, PC: 3, PB: 3 }, RANKINGS)).toBe('PB')
    })

    it('zero field matches → usuallyPlays null', () => {
        expect(derivePlayerEligibility(player({}), RANKINGS).usuallyPlays).toBeNull()
        // All appearances were GK → still no field record
        expect(derivePlayerEligibility(player({ PB: [4, 4] }), RANKINGS).usuallyPlays).toBeNull()
    })
})

describe('lockout boundary (R4 — Reg 8.4.1)', () => {
    const withHigher = (n) => player({ PC: [12], PB: [n] }) // usuallyPlays PC, PB above

    it('9 higher-grade games → approaching, not locked out', () => {
        const d = derivePlayerEligibility(withHigher(9), RANKINGS)
        expect(d.lockedOutBelow).toBe(false)
        expect(d.approachingLockout).toBe(true)
    })

    it('10 higher-grade games → locked out', () => {
        const d = derivePlayerEligibility(withHigher(10), RANKINGS)
        expect(d.lockedOutBelow).toBe(true)
        expect(d.approachingLockout).toBe(false)
    })

    it('7 higher-grade games → no warning', () => {
        const d = derivePlayerEligibility(withHigher(7), RANKINGS)
        expect(d.approachingLockout).toBe(false)
    })
})

describe('finals eligibility (R9 — Reg 8.5.1)', () => {
    it('threshold rounds fractional majority UP', () => {
        expect(finalsThreshold(18)).toBe(6)
        expect(finalsThreshold(17)).toBe(6)   // 5.67 → 6
        expect(finalsThreshold(16)).toBe(6)   // 5.33 → 6
        expect(finalsThreshold(15)).toBe(5)
    })

    it('counts field matches in the team and lower, both tests must pass', () => {
        const d = derivePlayerEligibility(player({ PC: [4], PE: [2] }), RANKINGS)
        const res = finalsEligibleForTeam(d, 'PC', RANKINGS, 18)
        expect(res.eligible).toBe(true)        // 6 at-or-below + usuallyPlays PC
        const resPB = finalsEligibleForTeam(d, 'PB', RANKINGS, 18)
        expect(resPB.eligible).toBe(true)      // PC+PE count for PB too; up below PB
        const resHigh = finalsEligibleForTeam(
            derivePlayerEligibility(player({ PL: [10], PC: [6] }), RANKINGS), 'PC', RANKINGS, 18)
        expect(resHigh.eligible).toBe(false)   // majority test fails (usuallyPlays PL)
    })

    it('reports shortfall', () => {
        const d = derivePlayerEligibility(player({ PC: [4] }), RANKINGS)
        expect(finalsEligibleForTeam(d, 'PC', RANKINGS, 18).gamesNeeded).toBe(2)
    })
})

describe('validateRound', () => {
    it('V1 — three selections in a round breach on all', () => {
        const p = { 1: player({ PB: [5] }) }
        const s1 = sel(1, 'PB'), s2 = sel(1, 'PC'), s3 = sel(1, 'PE')
        const r = run([s1, s2, s3], p)
        expect(statusOf(r, s1)).toBe('breach')
        expect(reasonsOf(r, s3)).toContain('Reg 8.1')
    })

    it('V2 — Overseas Player double-up breaches even with a tag', () => {
        const p = { 1: player({ PB: [5] }, { is_international: 1 }) }
        const s1 = sel(1, 'PB'), s2 = sel(1, 'PLR', { eligibility_tag: 'ETS' })
        const r = run([s1, s2], p)
        expect(statusOf(r, s1)).toBe('breach')
        expect(reasonsOf(r, s1)).toContain('Rule 3.2.1')
    })

    it('legal double-up: one up or one below is ok', () => {
        const p = { 1: player({ PB: [5] }) }
        const up = sel(1, 'PLR'), own = sel(1, 'PB')
        expect(statusOf(run([own, up], p), up)).toBe('ok')
        const below = sel(1, 'PC'), own2 = sel(1, 'PB')
        expect(statusOf(run([own2, below], p), below)).toBe('ok')
    })

    it('V3 — second match 2+ grades below Usually Plays breaches', () => {
        const p = { 1: player({ PB: [5] }) }
        const s1 = sel(1, 'PB'), s2 = sel(1, 'PE')
        const r = run([s1, s2], p)
        expect(statusOf(r, s2)).toBe('breach')
        expect(reasonsOf(r, s2)).toContain('Reg 8.4.3')
        expect(statusOf(r, s1)).toBe('ok')
    })

    it('V3 passes vacuously for a player with no history', () => {
        const p = { 1: player({}) }
        const s1 = sel(1, 'PL'), s2 = sel(1, 'Metro')
        const r = run([s1, s2], p)
        expect(statusOf(r, s1)).toBe('ok')
        expect(statusOf(r, s2)).toBe('ok')
    })

    it('V4 — locked-out player selected below Usually Plays breaches; DGK tag is excepted', () => {
        const p = { 1: player({ PC: [12], PB: [10] }) } // usuallyPlays PC, locked out
        const below = sel(1, 'PE')
        expect(reasonsOf(run([below], p), below)).toContain('Reg 8.4.1')
        const dgkBelow = sel(1, 'PE', { eligibility_tag: 'DGK' })
        const field = sel(1, 'PC')
        const r = run([dgkBelow, field], p)
        expect(reasonsOf(r, dgkBelow)).not.toContain('Reg 8.4.1')
    })

    it('V5 — fourth EXEMPT tag in a team breaches, first three keep their slots', () => {
        const players = {}
        const sels = []
        for (let i = 1; i <= 4; i++) {
            players[i] = player({ PB: [12], PLR: [10] }) // each locked out of PC
            sels.push(sel(i, 'PC', { eligibility_tag: 'EXEMPT', slot_number: i }))
        }
        const r = run(sels, players)
        expect(statusOf(r, sels[0])).toBe('ok')
        expect(statusOf(r, sels[2])).toBe('ok')
        expect(statusOf(r, sels[3])).toBe('breach')
        expect(reasonsOf(r, sels[3])).toContain('Reg 8.4.4')
    })

    it('V6 — EXEMPT must be exactly one grade down with no second match', () => {
        const p = { 1: player({ PB: [8] }) }
        const twoDown = sel(1, 'PE', { eligibility_tag: 'EXEMPT' })
        expect(statusOf(run([twoDown], p), twoDown)).toBe('breach')
        const oneDown = sel(1, 'PC', { eligibility_tag: 'EXEMPT' })
        expect(statusOf(run([oneDown], p), oneDown)).toBe('ok')
        const withSecond = sel(1, 'PC', { eligibility_tag: 'EXEMPT' })
        const second = sel(1, 'PB')
        expect(statusOf(run([withSecond, second], p), withSecond)).toBe('breach')
    })

    it('V7 — DGK requires a second, non-DGK selection in the round', () => {
        const p = { 1: player({ PB: [5] }) }
        const lone = sel(1, 'PC', { eligibility_tag: 'DGK' })
        expect(statusOf(run([lone], p), lone)).toBe('breach')
        const gk = sel(1, 'PC', { eligibility_tag: 'DGK' })
        const fieldSel = sel(1, 'PB')
        expect(statusOf(run([gk, fieldSel], p), gk)).toBe('ok')
        const bothDgk1 = sel(1, 'PC', { eligibility_tag: 'DGK' })
        const bothDgk2 = sel(1, 'PB', { eligibility_tag: 'DGK' })
        expect(statusOf(run([bothDgk1, bothDgk2], p), bothDgk1)).toBe('breach')
    })

    it('V8/V9 — ETS must be above usual team; valid placement still warns', () => {
        const p = { 1: player({ PB: [5] }) }
        const above = sel(1, 'PLR', { eligibility_tag: 'ETS' })
        const own = sel(1, 'PB')
        const r = run([above, own], p)
        expect(statusOf(r, above)).toBe('warning') // V9 unverifiable-absence warning
        const belowEts = sel(1, 'PC', { eligibility_tag: 'ETS' })
        const own2 = sel(1, 'PB')
        expect(reasonsOf(run([belowEts, own2], p), belowEts)).toContain('Reg 8.3.2')
        expect(statusOf(run([belowEts, own2], p), belowEts)).toBe('breach')
    })

    it('V10 — approaching lockout warns on single selections too', () => {
        const p = { 1: player({ PC: [12], PB: [9] }) }
        const s = sel(1, 'PC')
        const r = run([s], p)
        expect(statusOf(r, s)).toBe('warning')
        expect(r.get(s.id).reasons[0].message).toContain('9 higher-grade games')
    })

    it('unavailable-bucket selections are ignored', () => {
        const p = { 1: player({ PB: [5] }) }
        const bucket = sel(1, 'PE', { is_unavailable: 1 })
        const s1 = sel(1, 'PB'), s2 = sel(1, 'PC')
        const r = run([bucket, s1, s2], p)
        expect(r.has(bucket.id)).toBe(false)
        expect(statusOf(r, s2)).toBe('ok')
    })
})
