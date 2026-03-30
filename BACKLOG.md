# MHC Squad Tracker — Backlog

Last updated: 28 Mar 2026

---

## 🔴 In Progress / Immediate

- [ ] **Player unavailability — seed script** — fix Andy Ridley / Trent Dean name mismatch, run seed after deploy
- [ ] **Deploy pending changes** — `./deploy.sh --all` (unavailability backend + frontend, round ordering, player modal)

---

## 🟡 Up Next

- [ ] **Round selector — date labels** — show date next to round in dropdown once round_date is populated
- [ ] **New round modal — date field** — let you set round_date when creating a new round
- [ ] **Action buttons cleanup** — merge New / Copy / Rename / Delete into ⋯ menu, keep Team Sheet prominent
- [ ] **Season dashboard** — replace registration dashboard as default home view
  - Per-team "this round" cards (squad size, confirmed count, match details)
  - Round-by-round summary table (rounds × teams)
  - Move registration dashboard to sub-page under Players or a Season Setup tab
- [ ] **Match results field** — add `result` text field to `round_matches` (e.g. "W 3-1") for season dashboard

---

## 🟢 Backlog

### Round Planner
- [ ] **Unavailability management UI** — currently only in PlayerModal; consider quick-add from Round Planner too
- [ ] **Copy to next round** — simplified copy that pre-selects the next empty round
- [ ] **Practice rounds** — ad-hoc, created manually; consider whether they need dates or stay as-is

### Players
- [ ] **Player game stats scraping** — scrape games played from RevSport as season progresses
- [ ] **Player unavailability — bulk entry** — faster way to enter multiple players for a round at once (currently one-by-one in PlayerModal)

### Mobile
- [ ] **Dashboard mobile layout** — registration cards still cramped on small screens (2-col grid done, verify)
- [ ] **Touch UX review** — test drag-and-drop on actual devices after deploy

### Database / Backend
- [ ] **Migrate from Turso to Firestore** — Turso latency is poor; Firestore already used at Outstaffer; do after season features stabilise
- [ ] **Player unavailability — Andy Ridley name** — check exact spelling in DB and fix seed script

### Nice to Have
- [ ] **Notifications** — push/SMS when team sheet is published (post-Firestore migration)
- [ ] **Player self-service unavailability** — players mark themselves via a link (post-Firestore)
- [ ] **RevSport fixture sync** — auto-pull opponent/venue from RevSport API if available

---

## ✅ Done

- [x] Round Planner — mobile optimisation (touch drag-and-drop, team filter, horizontal scroll)
- [x] Round Planner — team sheet export (date, time, arrive, vs, venue, kit)
- [x] Round Planner — arrive_at field per team (manual entry)
- [x] Round Planner — player unavailability bucket (drag to unavailable, restore)
- [x] Round Planner — unavailability persisted to DB (missing route fixed)
- [x] Round Planner — mobile round selector dropdown
- [x] Round Planner — team filter pills on mobile
- [x] App — bottom tab nav on mobile (Dashboard / Round Planner / Players / More)
- [x] App — deploy script (deploy.sh)
- [x] Rounds — pre-seeded all 22 rounds with dates (seed-rounds.cjs)
- [x] Rounds — round_date column + ordering by date
- [x] Team sheet — Premier League / Premier League Reserves naming fixed
- [x] Team sheet — date format "Sunday 29th", arrive time, kit row
- [x] Player unavailability — backend routes + table migration
- [x] Player unavailability — PlayerModal UI (round checkboxes)
- [x] Player unavailability — picker hides unavailable players by default, toggle to show
- [x] Dashboard — responsive grid (2-col mobile, 5-col desktop)
