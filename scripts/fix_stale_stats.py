"""
scripts/fix_stale_stats.py
──────────────────────────
Cleans up bad data from the pre-fix scraper run:

1. Removes 'Fill-ins' from config/hvUnmatchedNames (header row parsed as player)
2. Clears statsLastSync on any match doc that has 'Fill-ins' in statsUnmatched,
   so the next syncHv re-scrapes them cleanly with the fixed parser
3. Saves the Ed Hall alias: 'Hall, Edward' → player doc ID for Ed Hall

Usage:
  python scripts/fix_stale_stats.py [--env uat|prod] [--dry-run]
"""

import sys
import argparse
import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1 import DELETE_FIELD

parser = argparse.ArgumentParser()
parser.add_argument('--env',     choices=['uat', 'prod'], default='uat')
parser.add_argument('--dry-run', action='store_true')
args = parser.parse_args()

DRY = args.dry_run
PROJECT_IDS = {'uat': 'hockey-2026-uat', 'prod': 'hockey-2026-f521f'}
project_id  = PROJECT_IDS[args.env]

print(f"\n{'[DRY RUN] ' if DRY else ''}Project: {project_id}")
print("-" * 60)

firebase_admin.initialize_app(options={'projectId': project_id})
db = firestore.client()

# ── 1. Fix config/hvUnmatchedNames ────────────────────────────────────────────

print("\n[1] Checking config/hvUnmatchedNames...")
unmatched_ref  = db.collection('config').document('hvUnmatchedNames')
unmatched_snap = unmatched_ref.get()

if unmatched_snap.exists:
    names = unmatched_snap.to_dict().get('names', [])
    print(f"    Current unmatched names: {names}")
    bad = [n for n in names if n.lower() in ('fill-ins', 'fill ins', 'fillin', 'fill_ins') or n.strip() == '']
    if bad:
        cleaned = [n for n in names if n not in bad]
        print(f"    Removing: {bad}")
        print(f"    Keeping:  {cleaned}")
        if not DRY:
            unmatched_ref.set({'names': cleaned}, merge=True)
            print("    Saved.")
    else:
        print("    No 'Fill-ins' entries found — nothing to remove.")
else:
    print("    Document does not exist — skipping.")

# ── 2. Reset statsLastSync on affected match docs ─────────────────────────────

print("\n[2] Scanning match docs for bad statsUnmatched entries...")

rounds_snap = db.collection('rounds').stream()
reset_count = 0

for round_doc in rounds_snap:
    if round_doc.to_dict().get('roundType') != 'season':
        continue
    matches_snap = db.collection('rounds').document(round_doc.id)\
                     .collection('matches').stream()
    for match_doc in matches_snap:
        data       = match_doc.to_dict()
        unmatched  = data.get('statsUnmatched', [])
        bad_names  = [n for n in unmatched if n.lower() in ('fill-ins', 'fill ins')]
        if not bad_names:
            continue
        rnum = round_doc.to_dict().get('roundNumber', '?')
        tid  = match_doc.id
        print(f"    R{rnum} {tid} — bad entries: {bad_names} — will reset statsLastSync")
        if not DRY:
            match_doc.reference.update({
                'statsLastSync':  DELETE_FIELD,
                'statsUnmatched': [n for n in unmatched if n not in bad_names],
            })
        reset_count += 1

print(f"    {reset_count} match doc(s) flagged for re-scrape.")

# ── 3. Save Ed Hall alias ─────────────────────────────────────────────────────

print("\n[3] Saving alias: 'Hall, Edward' -> Ed Hall...")

# Find Ed Hall's player doc ID
players_snap = db.collection('players').stream()
ed_hall_id   = None
for p in players_snap:
    if p.to_dict().get('name', '').lower() == 'ed hall':
        ed_hall_id = p.id
        print(f"    Found Ed Hall — player ID: {ed_hall_id}")
        break

if not ed_hall_id:
    print("    ERROR: Could not find player named 'Ed Hall' in Firestore.")
    print("    Check the exact name in the players collection and update manually.")
else:
    if not DRY:
        db.collection('config').document('hvNameAliases').set(
            {'Hall, Edward': str(ed_hall_id)},
            merge=True
        )
        print(f"    Saved alias 'Hall, Edward' -> {ed_hall_id}")
    else:
        print(f"    [DRY RUN] Would save alias 'Hall, Edward' -> {ed_hall_id}")

# ── Summary ───────────────────────────────────────────────────────────────────

print()
if DRY:
    print("[DRY RUN] No changes written.")
else:
    print("Done. Next step: trigger syncHv to re-scrape the affected match docs.")
