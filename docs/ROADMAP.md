# MHC Squad Tracker Roadmap and Ideas

This is the single source of truth for future work that is not implemented yet.

## How to use

- Add every new product idea here before ending a planning conversation.
- If an idea is discussed but not implemented, add it as a todo in the `Backlog` section.
- Keep items short, concrete, and grouped by category.
- Move an item from `Backlog` to `Planned Next` when we agree to build it.
- Mark an item as done by moving it to `Completed`.

## Idea intake template

Copy this into the right `Backlog` section when a new idea comes up:

- [ ] `Idea title` — Why it matters: `one line` — Scope: `S/M/L`

## Planned Next

- [ ] Multi-section club structure (`Mens`, `Womens`, `Juniors`, `Masters`, `Midweek`, custom) — Why it matters: clubs with multiple sections cannot use the app without hacking team names — Scope: L
- [ ] Dynamic team count per club (support 2 to 8+ teams without code changes) — Why it matters: the current six-team hardcoding blocks smaller and larger clubs from onboarding — Scope: M
- [ ] Hybrid team onboarding: discovery import plus manual add/edit fallback — Why it matters: discovery will always miss some teams; without a manual fallback admins are stuck — Scope: M
- [ ] Role-based access with a `club_admin` who can view/manage all teams — Why it matters: without a club-level admin role there is no safe way to delegate management across sections — Scope: M
- [ ] Coach and `team_manager` roles with `teamIds` on `allowedUsers` — Why it matters: coaches need team-scoped poll create and planner edit without full admin access — Scope: M
- [ ] Team-scoped poll permissions in Firestore rules — Why it matters: UI gating alone is not enough once coaches can create polls for assigned teams only — Scope: S

## Backlog

### Authentication and access

- [ ] Scoped roles for section and team-level access (`section_admin`, `viewer`).
- [ ] Unify app admin model and Cloud Function admin model.
- [ ] Add role-matrix test checklist for UAT before production rollout.

### Data model and configuration

- [ ] Add first-class `sections` model and link each team to a section.
- [ ] Store external source IDs per team (RevSport ID and/or HV IDs).
- [ ] Replace remaining six-team constants with Firestore-driven configuration.

### Setup and onboarding UX

- [ ] Setup wizard that asks how many teams each section needs.
- [ ] Team review screen to confirm discovered teams and manually add missing teams.
- [ ] “Start simple” mode for small clubs (2-team setup preset).

### Integrations and sync

- [ ] Read HV/RevSport discovery data into a normalised team import format.
- [ ] Make sync scripts load active teams from Firestore instead of fixed constants.
- [ ] Add sync health checks for missing external IDs or broken links.

### Player polls and outreach

- [ ] Per-player ephemeral poll URLs — one tokenised link per player so responses are attributed without asking for email on the form — Scope: M
- [ ] Deliver poll links to players — primary path: email to address on file; investigate SMS/WhatsApp as alternate channels — Scope: M/L
- [ ] Email infrastructure — shared send layer (Resend or SendGrid via Cloud Function) used by polls, intentions campaign, and any future outreach; personalised content supported via player record fields — Scope: M

### Pre-season intentions campaign (depends on: polls + email infrastructure)

- [ ] Admin triggers a new "intentions round" for the upcoming season from within the app — Scope: S
- [ ] App generates a personalised link per existing player (token-based, same pattern as voting/unavailability) pre-filling name and email — Scope: S
- [ ] Personalised email sent to each player via shared email layer, including their prior season stats (games played, teams, goals etc.) pulled from Firestore — Scope: M
- [ ] Public (non-personalised) link also available for sharing broadly to attract new players — Scope: S
- [ ] Intentions form hosted in-app (replaces Tally) — fields: availability intention, playing preference, fill-in willingness, follow-up consent, background, notes — Scope: M
- [ ] Submission matching: personalised link responses auto-matched to player; public link responses go to unmatched queue for admin review (same pattern as HV/availability sync) — Scope: S
- [ ] New/unmatched submissions can be promoted to full player records from the admin review UI — Scope: S
- [ ] Intentions dashboard — who has responded, who hasn't, breakdown by intention (returning / unsure / new) — Scope: M

### Reporting and exports

- [ ] Ensure planner exports, fixture summaries, and digest output work for any team count.
- [ ] Add optional section-based digest generation (send by section or whole club).
- [ ] Add “club-wide view” toggle for users with global access.

### Operations and rollout

- [ ] Add migration script from current six-team setup to section/team model.
- [ ] Add sample seed profiles (2-team, 6-team, 8-team) for UAT validation.
- [ ] Create rollout checklist for UAT -> production with rollback notes.

## Completed

- [x] Polls MVP (core, no delivery) — Central Polls registry plus slim team-scoped strip on Teams page; public name-entry form; admin response matching in Polls nav — Scope: M
- [x] "Not Financial" player indicator — Why it matters: allows selectors to see fee status at a glance in the planner, lists, digests, and image sheets — Scope: S (Implemented via amber superscript $ badge and exports)
- [x] Unavailability submit UX parity with voting form — Why it matters: users are left with a blank form and no feedback after submitting, causing confusion and duplicate submissions — Scope: S (Implemented via Receipt Modal preserving form data)

## Parking Lot (raw ideas)

- Capture rough ideas here first, then promote to `Backlog` after they are clear.
- Poll delivery: email is simplest if player emails exist in Firestore; SMS/WhatsApp need provider + consent and may suit reminders better than first send.
