# HV Fixture Sync — Setup & Usage

## Setup — Service account keys

Two Firebase projects, two keys needed:

| Env  | Project ID          | Key file                                    |
|------|---------------------|---------------------------------------------|
| Prod | hockey-2026-f521f   | hockey-2026-f521f-firebase-adminsdk-fbsvc-6c421c359a.json ✅ exists |
| UAT  | hockey-2026-uat     | hockey-2026-uat-firebase-adminsdk.json  ← **needs downloading** |

**To get the UAT key:**
1. Firebase Console → select `hockey-2026-uat` project
2. Project Settings → Service accounts → Generate new private key
3. Save as `hockey-2026-uat-firebase-adminsdk.json` in the project root

---

## Install dependencies (one-time)
```
pip install firebase-admin openpyxl requests beautifulsoup4
```

## Step 1 — Seed all fixtures from Excel (run once at season start)

Both scripts default to `--env uat` so you can't accidentally hit prod.

```bash
# Preview first (no writes)
python seed_fixtures.py "Copy_of_2026_Senior_Competition__2_.xlsx" --dry-run

# Write to UAT (default)
python seed_fixtures.py "Copy_of_2026_Senior_Competition__2_.xlsx"

# Write to PROD only once UAT looks good
python seed_fixtures.py "Copy_of_2026_Senior_Competition__2_.xlsx" --env prod
```

---

## Step 2 — Weekly sync (run Tuesday or Wednesday after weekend games)

Scrapes HV for results from the most recent round, writes scores/result/scorers
to Firestore, and prints a digest ready to paste into email or WhatsApp.

```bash
# All 6 comps → UAT (default, safe)
python sync_hv.py

# Digest only, no Firestore write (works without any key)
python sync_hv.py --no-firebase

# Dry run — shows what would be written, targets UAT
python sync_hv.py --dry-run

# Push to PROD once you're happy with UAT
python sync_hv.py --env prod

# Single comp
python sync_hv.py --comp MPL
```

---

## Firestore fields added to rounds/{id}/matches/{teamId}

| Field          | Type     | Source       | Notes                          |
|----------------|----------|--------------|--------------------------------|
| matchDate      | string   | Excel / HV   | YYYY-MM-DD                     |
| time           | string   | Excel / HV   | HH:MM                          |
| venue          | string   | Excel / HV   | Full venue name                |
| opponent       | string   | Excel / HV   | Opponent club name             |
| scoreFor       | int      | HV           | Mentone's goals                |
| scoreAgainst   | int      | HV           | Opponent's goals               |
| result         | string   | HV           | 'Win' / 'Loss' / 'Draw'        |
| scorers        | string[] | HV           | ['First Last', 'Name (2)']     |
| hvGameUrl      | string   | HV           | Link to game detail page       |
| hvLastSync     | string   | sync_hv.py   | ISO timestamp of last sync     |

Existing fields (topColour, socksColour, arriveAt) are never overwritten.

---

## Round notes

- Rounds 1–18: all 6 comps play (regular season, weekends)
- Rounds 19, 20, 21, 22: MPL only (midweek rounds at Parkville)
  The seed script handles this automatically.
