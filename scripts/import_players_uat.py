#!/usr/bin/env python3
"""
import_players_uat.py — Import prod player documents into UAT (or any env).

Reads a Firefoo JSON export and writes each player doc to Firestore,
preserving the original numeric document IDs.

Usage (from project root):
    python scripts/import_players_uat.py --json-file "F:/Downloads/players-1780004164.json"
    python scripts/import_players_uat.py --json-file "..." --dry-run
    python scripts/import_players_uat.py --json-file "..." --overwrite
    python scripts/import_players_uat.py --json-file "..." --env prod   # ⚠️  careful!
"""

import json
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from _paths import ENV_CONFIG  # noqa: E402

SKIP_FIELDS = {'__collections__'}


def main():
    parser = argparse.ArgumentParser(description='Import Firefoo player export into Firestore')
    parser.add_argument('--json-file', required=True, help='Path to Firefoo players JSON export')
    parser.add_argument('--env', choices=['prod', 'uat'], default='uat',
                        help='Target environment (default: uat)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    parser.add_argument('--overwrite', action='store_true',
                        help='Overwrite existing docs (default: skip them)')
    args = parser.parse_args()

    env = ENV_CONFIG[args.env]
    print(f"🎯 Target: {args.env.upper()} ({env['project_id']})")
    if args.dry_run:
        print("🔍 DRY RUN — no writes will occur")

    # Load JSON
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"❌ File not found: {json_path}", file=sys.stderr)
        sys.exit(1)

    with open(json_path, encoding='utf-8') as f:
        export = json.load(f)

    players = export.get('data', {})
    print(f"📊 Loaded {len(players)} player records from {json_path.name}")

    # Init Firestore
    cred = credentials.Certificate(env['service_account'])
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # Fetch existing IDs to decide skip/overwrite
    print("📋 Checking existing players in Firestore...")
    existing_ids = {d.id for d in db.collection('players').stream()}
    print(f"   Found {len(existing_ids)} existing player docs")

    written = skipped = 0
    now = datetime.now(timezone.utc).isoformat()

    for doc_id, raw_data in sorted(players.items(), key=lambda x: int(x[0])):
        # Strip internal Firefoo fields
        data = {k: v for k, v in raw_data.items() if k not in SKIP_FIELDS}

        already_exists = doc_id in existing_ids
        if already_exists and not args.overwrite:
            print(f"  SKIP  [{doc_id:>4}] {data.get('name', '?')}  (already exists)")
            skipped += 1
            continue

        action = 'OVERWRITE' if already_exists else 'WRITE'
        label = f"  {'DRY' if args.dry_run else action:>9}  [{doc_id:>4}] {data.get('name', '?')}"

        if args.dry_run:
            print(label)
        else:
            db.collection('players').document(doc_id).set(data)
            print(f"  ✅ {label.strip()}")
        written += 1

    print(f"\n{'Would write' if args.dry_run else 'Wrote'} {written} records, skipped {skipped}.")


if __name__ == '__main__':
    main()
