# CLI scripts

Maintenance and sync scripts for MHC Squad Tracker. Run from the **project root** unless noted.

Service account JSON files stay in the repo root (gitignored). See `docs/README.md` Part 3 for setup.

```bash
pip install firebase-admin openpyxl requests beautifulsoup4 resend
```

## Recurring / season operations

| Script | Purpose |
|--------|---------|
| [`seed_fixtures.py`](seed_fixtures.py) | One-time season start: seed match dates/venues from [`data/fixture_2026.json`](data/fixture_2026.json) |
| [`sync_hv.py`](sync_hv.py) | Weekly: scrape HV results, update Firestore, print/save digest |
| [`sync_ladder.py`](sync_ladder.py) | Scrape ladder positions → `hvSync/ladders` |

```bash
python scripts/seed_fixtures.py --dry-run
python scripts/sync_hv.py
python scripts/sync_ladder.py --dry-run
```

Prefer **Admin → HV Sync** in the app when possible; these CLIs are for local runs, dry runs, and automation.

## Setup utilities

| Script | Purpose |
|--------|---------|
| [`apps-script-unavail-trigger.js`](apps-script-unavail-trigger.js) | Copy into Google Apps Script for sheet → `autoSyncUnavailability` |
| [`backfill_poll_is_private.py`](backfill_poll_is_private.py) | Set `isPrivate: false` on legacy polls missing the field (needed for non-admin list queries) |
| [`send_resend_test_email.py`](send_resend_test_email.py) | Send a basic test email through Resend |

## Archive (one-off / historical)

Kept for reference; not needed in normal operation.

| Script | Purpose |
|--------|---------|
| [`archive/fix_stale_stats.py`](archive/fix_stale_stats.py) | Clean bad data after an early scraper bug |
| [`archive/reset_game_counts.py`](archive/reset_game_counts.py) | Reset inflated `gamesPlayed2026` from planner bug |
| [`archive/import_pc_votes.py`](archive/import_pc_votes.py) | Import historical Pennant C B&F CSVs (edit CSV paths in file) |

## Data

| Path | Purpose |
|------|---------|
| [`data/fixture_2026.json`](data/fixture_2026.json) | Pre-parsed fixture seed for `seed_fixtures.py` |
| [`_paths.py`](_paths.py) | Shared repo root + service account paths (imported by Python scripts) |
