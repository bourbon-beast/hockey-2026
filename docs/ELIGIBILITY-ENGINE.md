# HV Eligibility Engine — Specification

**Status:** Phase 1 built (June 2026) — pending UAT verification. Remaining
manual steps per environment: run `scripts/seed_team_rankings.py`, then run
"Full re-scrape (GK/ETS backfill)" in the admin HV Sync panel to repopulate
historical `playerStats` with roles (uses `syncPlayerStats` with
`forceRescrape: true`; resumable if it times out).
**Source of rules:** HV 2026 Competition Rules (Rule 3.2.1, 3.3) and Regulations (Reg 8.1–8.5)
**Owner:** Steve · **Last updated:** June 2026

## Goal

When a selector places a player into a team in the Round Planner, validate the
selection against HV double-up and anti-stacking rules in real time, and surface
finals eligibility as the season progresses. The existing cosmetic "DU" badge
(player appears in >1 team this round) becomes a stateful eligibility indicator:
legal / warning / breach, with the reg reference in a tooltip.

**Design principle: warn, never block.** Selectors stay in control. The club
wears any forfeit, not the software, so breaches render loudly (red) but do not
prevent saving a selection.

## Verified facts (do not re-litigate)

1. HV public game pages (e.g. hockeyvictoria.org.au/game/<id>) expose per-player
   **GK** and **ETS** columns alongside Goals and Green/Yellow/Red cards.
   Confirmed visually against a live 2026 game page. Roles are scrapeable with
   the same row-parsing approach as cards in `functions/main.py`.
2. The existing `international` flag on player records means **HV-approved
   Overseas Player** (the regulated, capped status) — not merely "from
   overseas". Reuse it directly; do NOT add a new field.
3. GK vs DGK does not need to be distinguished in our data. Per Reg 8.3.3.1,
   any match where the player is assigned GK *or* DGK on ERS counts toward the
   goalkeeper ledger; any match with neither counts as a field match. Whatever
   HV collapses into the GK column is sufficient.
4. ERS (what HV scrapes from) is what HV audits against, so eligibility maths
   must run off scraped `playerStats`, not our own selection data. Planner
   selections are provisional, forward-looking intent for the current round.

## Rules summary (the legal model)

Competition section for all six MHC men's teams = Senior (Metro included).

- **R1 — Round cap (Reg 8.1/8.3):** max two (2) matches per player per round
  per competition section, regardless of when matches are played.
- **R2 — Overseas cap (Rule 3.2.1, Reg 8.3.1):** approved Overseas Players are
  limited to one (1) match per round. No tag, permit note, or exemption in our
  app overrides this.
- **R3 — Direction (Reg 8.4.3):** the second match in a round must be in a team
  ranked HIGHER than the player's Usually Plays team (any number of grades up),
  OR exactly ONE team below. Two-or-more below = breach unless EXEMPT (R5).
- **R4 — Anti-stacking lockout (Reg 8.4.1(a)):** Seniors are 18-round
  competitions. A player with 10+ matches in any higher-ranked team(s) is
  ineligible for any lower-ranked team for the remainder of regular rounds.
- **R5 — Exemption slots (Reg 8.4.4):** up to three (3) players per team per
  round may play despite being ineligible under R4, but ONLY one team below
  their Usually Plays team, and only that one match in the round.
- **R6 — Double-up Goalkeeper (Reg 8.3.3):** a player may play GK in one match
  and field in another in the same round, regardless of anti-stacking. GK
  matches form a separate ledger excluded from the field playing record.
- **R7 — Elite Team Substitute (Reg 8.3.2):** ETS matches are excluded from the
  playing record entirely (anti-stacking AND finals). Valid only when the ETS
  plays in a team above their Usually Plays team, covering a player absent on
  State/National duties. The absence condition cannot be verified by the app —
  selector responsibility, noted in tooltip.
- **R8 — Usually Plays (Rules definition):** the team holding a simple
  mathematical majority of the player's field-record matches (ETS and GK
  matches excluded). Equal count between teams → the higher-ranked team.
- **R9 — Finals eligibility (Reg 8.5.1):** per team, BOTH must hold at end of
  regular rounds: (a) field matches in that team and/or lower-ranked teams
  >= ceil(33.333% of rounds, excluding byes); AND (b) majority test per R8 for
  that team or lower. Fractional majority rounds UP (Reg 8.5.1(d)).
- **R10 — Finals rounds:** max two finals matches per finals round, only via
  ETS / permit / dual qualification / DGK split record (Reg 8.5.2).

## 1. Data model changes (Firestore)

### `config/teamRankings` (new document)

```json
{
  "rankings": { "PL": 1, "PLR": 2, "PB": 3, "PC": 4, "PE": 5, "Metro": 6 },
  "roundsInSeason": 18,
  "season": 2026
}
```

Rank 1 = highest. Config, not hardcoded — rankings can change between seasons,
and Reg 8.2.2 club-nominated priority for equal grades would live here too.
`roundsInSeason` drives both the R4 lockout threshold context and the R9
33⅓% calculation.

### `players/{id}` — no changes

Reuse existing `international` flag for R2. Do not add `isOverseasPlayer` or
`isGoalkeeper`; GK status comes from scraped per-match roles, and
`defaultPosition` remains a planning convenience only.

### `playerStats` (extend — written by `syncHv`)

Each per-match appearance record gains two booleans parsed from the HV game
page roster table:

- `gk: true|false` — GK column flagged (covers both GK and DGK per Reg 8.3.3.1)
- `ets: true|false` — ETS column flagged

If a permit marker ever appears in the page markup, capture it as
`permit: true` in the same pass, but do not block on it.

### `rounds/{id}/selections/{sel}` (extend)

New optional field on a selection, set by the selector via the Planner:

- `eligibilityTag: null | "ETS" | "DGK" | "EXEMPT"`

Semantics — applies to the player's SECOND selection in a round:
- `ETS`    — Elite Team Substitute (R7); excluded from record
- `DGK`    — this selection is the goalkeeper match of a GK double-up (R6)
- `EXEMPT` — consumes one of the team's three Reg 8.4.4 slots (R5)
- `null`   — ordinary double-up under R1/R3

Tags express forward-looking intent for the current round only. The scraped
`playerStats` record is the historical truth; no reconciliation needed.

## 2. Derivation module (new: `src/utils/eligibility.js`)

Pure functions, no Firestore imports, unit-testable in isolation. Inputs:
player's appearance list from `playerStats`, `teamRankings`, `roundsInSeason`.
Computed on demand client-side (~100 players × 18 rounds is trivial; no Cloud
Function needed).

| Derived value | Definition |
|---|---|
| `fieldRecord[teamId]` | Count of matches per team where `!gk && !ets` |
| `gkRecord[teamId]` | Count of matches per team where `gk === true` |
| `usuallyPlays` | Team with simple majority of fieldRecord; tie → higher rank |
| `higherGradeCount(teamId)` | Sum of fieldRecord across teams ranked above teamId |
| `lockedOutBelow` | `true` when higherGradeCount(usuallyPlays-or-below) >= 10 |
| `approachingLockout` | `true` when that count is 8 or 9 (warning trigger) |
| `finalsEligible[teamId]` | R9 both-tests result per team |
| `gamesNeededForFinals[teamId]` | Shortfall vs ceil(roundsInSeason / 3) |

Edge cases the module must handle:
- Player with zero field matches: `usuallyPlays = null`; direction rule (R3)
  passes vacuously (a new player can be placed anywhere).
- Byes: excluded from the rounds denominator in R9 per Reg 8.5.1(a)(i). The
  denominator is rounds the TEAM actually played, derivable from fixtures.
- Equal field count across 3+ teams: highest-ranked of the tied set wins (R8).

## 3. Validation engine (same module: `validateRound(selections, derived, tags)`)

Runs on every selection change for the current round. Returns per-selection
results: `{ status: "ok" | "warning" | "breach", reason, regRef }`.

Evaluation order (first breach wins for badge colour; all reasons collected
for the tooltip):

| # | Check | Result on fail |
|---|---|---|
| V1 | Player has 3+ selections this round | breach — "Max 2 matches per round (Reg 8.1)" |
| V2 | `international` flag + 2 selections | breach — "Approved Overseas Player: max 1 match per round (Rule 3.2.1)". No tag overrides. |
| V3 | 2nd selection team is 2+ ranks below usuallyPlays, tag ≠ EXEMPT | breach — "2nd match more than one grade below Usually Plays (Reg 8.4.3)" |
| V4 | `lockedOutBelow` and selection is below usuallyPlays, tag ∉ {EXEMPT, DGK} | breach — "Anti-stacking lockout: 10+ higher-grade games (Reg 8.4.1)" |
| V5 | Team has 4+ EXEMPT tags this round | breach on 4th+ — "Exemption limit 3 per team per round (Reg 8.4.4)" |
| V6 | EXEMPT selection is not exactly one rank below usuallyPlays, or player has a 2nd selection | breach — "Exempt players: one grade down, one match only (Reg 8.4.4)" |
| V7 | DGK tag but player's other selection this round also tagged DGK, or no other selection | breach — "DGK requires one GK match + one field match, same round (Reg 8.3.3)" |
| V8 | ETS tag on a team not ranked above usuallyPlays | breach — "ETS must play above their usual team (Reg 8.3.2)" |
| V9 | ETS tag present (valid placement) | warning — "ETS: confirm covered player is absent on State/National duties — not verifiable here" |
| V10 | `approachingLockout` | warning — "N higher-grade games: 10 triggers anti-stacking lockout (Reg 8.4.1)" |

Notes:
- V3/V4/V6/V8 all depend on `usuallyPlays`; when it is null (no history), they
  pass.
- DGK position sanity (does the DGK-tagged slot look like a GK slot, i.e.
  `position === "GK"`): warning only, never breach — positions in the Planner
  are optional.
- Breaches never block saves. Render only.

## 4. UI changes — Round Planner

Touchpoints: `src/components/RoundPlanner.jsx`, `TeamColumn.jsx`,
`roundUtils.js` (`buildTeamCanvas`), `useRoundManager.js`.

1. **Stateful DU badge** (replaces current cosmetic `duplicateIds` badge):
   - Orange — legal double-up, no issues
   - Amber  — warnings present (V9/V10)
   - Red    — any breach
   Tooltip lists all reasons with reg references. Keep the existing
   `duplicateIds` computation as the trigger for showing a badge at all.
2. **Tag popover** on badge click: ETS / DGK / Exempt / None. Mirror the
   existing NotePopover pattern in `TeamColumn.jsx` (fixed-position popover,
   click-outside close). Writes `eligibilityTag` to the selection doc using
   the established optimistic-update pattern.
3. **Exemption counter** in the team column header when any EXEMPT tags are in
   use for that team this round: "Exemptions: n/3". Red at 4+.
4. **Canvas export** (`buildTeamCanvas`): badge colour carries through; where a
   tag is set, the badge label becomes the tag ("ETS", "DGK", "EX") instead of
   "DU" — matching what HV requires noted on the written team sheet.
5. Single-team players with warnings (V10 approaching-lockout) get a small
   amber dot, not a full badge — lockout risk matters before any double-up
   is attempted.

Scope guard: no changes to drag/drop, carry-forward, voting, digests, or any
unrelated Planner code paths.

## 5. Backend changes — `functions/main.py` (`syncHv`)

1. Extend the per-player roster parse on game pages to read the **GK** and
   **ETS** columns (same table as Goals and card columns — reuse the existing
   row-parsing approach). Write `gk` / `ets` booleans into each `playerStats`
   appearance record.
2. **Backfill:** after deploying, clear `statsLastSync` for the season so the
   next full sync rebuilds all historical appearance records with roles
   populated. Sync is idempotent (overwrite, not append), so re-running is
   safe.
3. `syncHv` remains the sole source of truth for games played; the Planner
   never writes game counts.
4. If the page markup exposes a permit marker, capture as `permit: true`;
   otherwise add a TODO comment and move on.

## 6. Finals eligibility view — Phase 2 (separate epic)

Per-player × per-team grid of `finalsEligible` with `gamesNeededForFinals`
shortfalls ("needs 2 more PLR-or-lower games to hit 33⅓%"). Likely a new admin
tab or an extension of AllPlayers. Useful from ~round 10. Deliberately
decoupled from Planner validation — do not build in Phase 1. Add a TODO
comment in `eligibility.js` referencing this section.

## 7. Build order (strict — backend before frontend)

1. **`syncHv` role parse** (GK/ETS booleans into `playerStats`) + backfill.
   Verify in UAT against the known game page before anything else.
2. **`config/teamRankings`** doc + **`src/utils/eligibility.js`** derivation
   and validation module. Pure functions with unit tests covering: majority
   ties, zero-history players, round-up on fractional majority, lockout
   boundary (9 vs 10), exemption slot counting.
3. **Planner UI**: stateful badge, tag popover, exemption counter, canvas
   export labels.
4. **Phase 2**: finals eligibility view (separate piece of work, not this
   build).

Each step: deploy and verify in UAT before prod. Never deploy to prod
directly.

## 8. Out of scope

- Blocking saves on breach (deliberate — warn only)
- Junior / Masters / Mid Week sections (different thresholds; MHC men's app
  is Senior-section only)
- Playing Permits workflow (Reg 8.6) — manual via HV; at most a free-text
  note on a selection
- Verifying ETS absence conditions (not knowable from available data)
- DGK vs GK distinction (collapsed per Reg 8.3.3.1 — see Verified facts #3)
