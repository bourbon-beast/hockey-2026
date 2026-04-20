"""
scripts/reset_game_counts.py
────────────────────────────
One-off script to reset all player game count fields that were
inflated by the Round Planner's addSelection calls.

What it does:
  - Sets gamesPlayed2026 = {}  (empty map)
  - Sets totalGames2026   = 0
  - Leaves teamsPlayed2026 alone (used for picker filter, not counts)
  - Leaves stats2026 alone (goals/cards come from syncHv, not the planner)

After running this, trigger syncHv to rebuild counts from actual HV attendance.

Usage:
  cd F:/Documents/Steve/Development/hockey-2026
  python scripts/reset_game_counts.py [--env uat|prod] [--dry-run]

Defaults to UAT. Pass --env prod to run against production.
Pass --dry-run to preview without writing.
"""

import sys
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

# ── Args ──────────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument('--env',     choices=['uat', 'prod'], default='uat')
parser.add_argument('--dry-run', action='store_true', help='Preview only, no writes')
args = parser.parse_args()

DRY_RUN = args.dry_run

# ── Firebase project config ───────────────────────────────────────────────────

PROJECT_IDS = {
    'uat':  'hockey-2026-uat',
    'prod': 'hockey-2026-f521f',
}

project_id = PROJECT_IDS[args.env]

print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Connecting to Firebase project: {project_id}")
print("-" * 60)

# Initialise with Application Default Credentials
# Run `firebase login` and `gcloud auth application-default login` first
firebase_admin.initialize_app(options={'projectId': project_id})
db = firestore.client()

# ── Load all players ──────────────────────────────────────────────────────────

players_ref = db.collection('players')
all_players = list(players_ref.stream())

print(f"Found {len(all_players)} player documents")

# ── Identify players with non-empty gamesPlayed2026 ──────────────────────────

to_reset = []
for doc in all_players:
    data = doc.to_dict()
    gp   = data.get('gamesPlayed2026', {})
    tg   = data.get('totalGames2026', 0)
    name = data.get('name', doc.id)

    # Only touch players where counts are non-zero (skip already-clean records)
    if gp or tg:
        to_reset.append((doc.id, name, gp, tg))

print(f"Players with non-zero game counts: {len(to_reset)}")
print()

if not to_reset:
    print("Nothing to reset. Exiting.")
    sys.exit(0)

# ── Preview ───────────────────────────────────────────────────────────────────

print("Players to be reset:")
for pid, name, gp, tg in sorted(to_reset, key=lambda x: x[1]):
    teams_str = ', '.join(f"{t}:{c}" for t, c in sorted(gp.items())) if gp else '—'
    print(f"  {name:<30} gamesPlayed={teams_str}  total={tg}")

print()

if DRY_RUN:
    print("[DRY RUN] No changes written.")
    sys.exit(0)

# ── Confirm ───────────────────────────────────────────────────────────────────

confirm = input(f"Reset game counts for {len(to_reset)} players in [{args.env.upper()}]? (yes/no): ").strip().lower()
if confirm != 'yes':
    print("Aborted.")
    sys.exit(0)

# ── Write in batches of 400 ───────────────────────────────────────────────────

BATCH_SIZE = 400
batch      = db.batch()
count      = 0
total      = 0

for pid, name, gp, tg in to_reset:
    ref = db.collection('players').document(str(pid))
    batch.update(ref, {
        'gamesPlayed2026': {},
        'totalGames2026':  0,
        # Note: teamsPlayed2026 intentionally left intact (used for picker filter)
        # Note: stats2026 intentionally left intact (goals/cards from syncHv)
    })
    count += 1
    total += 1

    if count >= BATCH_SIZE:
        batch.commit()
        print(f"  Committed batch of {count} (total so far: {total})")
        batch = db.batch()
        count = 0

if count > 0:
    batch.commit()
    print(f"  Committed final batch of {count}")

print()
print(f"✅ Done — reset {total} player(s) in [{args.env.upper()}]")
print()
print("Next step: trigger syncHv to rebuild counts from HV attendance data.")
print(f"  UAT:  https://australia-southeast1-hockey-2026-uat.cloudfunctions.net/syncHv")
print(f"  Prod: https://australia-southeast1-hockey-2026-f521f.cloudfunctions.net/syncHv")
