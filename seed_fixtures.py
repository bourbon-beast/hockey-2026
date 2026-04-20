#!/usr/bin/env python3
"""
seed_fixtures.py — One-time Firestore seeder
Reads fixture_2026.json (pre-parsed from the HV Excel export by Claude)
and writes matchDate, time, venue, opponent to Firestore for all 6 teams
across all 22 rounds.

Run from the project root:
    pip install firebase-admin
    python seed_fixtures.py
    python seed_fixtures.py --dry-run        # preview without writing
    python seed_fixtures.py --env prod       # write to PROD (default: uat)
    python seed_fixtures.py --round 1        # single round only
"""

import json
import argparse
import firebase_admin
from firebase_admin import credentials, firestore

# ── Configuration ─────────────────────────────────────────────────────────────

FIXTURE_FILE = 'fixture_2026.json'

ENV_CONFIG = {
    'prod': {
        'service_account': 'hockey-2026-f521f-firebase-adminsdk-fbsvc-6c421c359a.json',
        'project_id':      'hockey-2026-f521f',
    },
    'uat': {
        'service_account': 'hockey-2026-uat-firebase-adminsdk.json',
        'project_id':      'hockey-2026-uat',
    },
}


def load_round_map(db) -> dict:
    """Returns {roundNumber: firestoreDocId} for all season rounds."""
    result = {}
    for r in db.collection('rounds').stream():
        d = r.to_dict()
        if d.get('roundType') == 'season' and d.get('roundNumber') is not None:
            result[int(d['roundNumber'])] = r.id
    return result


def main():
    parser = argparse.ArgumentParser(description='Seed fixture data into Firestore from fixture_2026.json')
    parser.add_argument('--env',     choices=['prod', 'uat'], default='uat',
                        help='Target environment (default: uat)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    parser.add_argument('--round',   type=int, help='Only seed a specific round number')
    args = parser.parse_args()

    env = ENV_CONFIG[args.env]
    print(f"🎯 Target: {args.env.upper()} ({env['project_id']})")

    # Load fixture JSON
    with open(FIXTURE_FILE) as f:
        data = json.load(f)
    fixtures = data['fixtures']
    if args.round:
        fixtures = [x for x in fixtures if x['round'] == args.round]
    print(f"📊 Loaded {len(fixtures)} fixtures from {FIXTURE_FILE}")

    # Init Firestore
    cred = credentials.Certificate(env['service_account'])
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    # Map roundNumber → Firestore docId
    print("📋 Loading rounds from Firestore...")
    round_map = load_round_map(db)
    print(f"   Found {len(round_map)} season rounds: {sorted(round_map.keys())}")

    # Write
    print(f"\n{'🔍 DRY RUN' if args.dry_run else '✍️  Writing'} match data...\n")
    updates = 0
    missing = set()

    for f in fixtures:
        doc_id = round_map.get(f['round'])
        if not doc_id:
            missing.add(f['round'])
            continue

        match_data = {
            'matchDate': f.get('date') or '',
            'time':      f.get('time') or '',
            'venue':     f.get('venue') or '',
            'opponent':  f.get('opponent') or '',
            'isHome':    f.get('isHome', False),
        }

        # Also seed any results already in the JSON (R19 pre-season loss etc.)
        if f.get('result'):
            match_data['result']       = f['result']
            match_data['scoreFor']     = f.get('scoreFor')
            match_data['scoreAgainst'] = f.get('scoreAgainst')

        flag  = '🏠' if f.get('isHome') else '✈️ '
        label = (f"R{f['round']:2d} {f['teamId']:6s} | "
                 f"{f.get('date','')} {f.get('time','')} | "
                 f"{flag} vs {f.get('opponent','')}")

        if args.dry_run:
            print(f"  DRY  {label}")
        else:
            (db.collection('rounds').document(doc_id)
               .collection('matches').document(f['teamId'])
               .set(match_data, merge=True))
            print(f"  ✅  {label}")
        updates += 1

    print(f"\n{'Would write' if args.dry_run else 'Wrote'} {updates} records.")
    if missing:
        print(f"⚠️  Rounds with no Firestore doc: {sorted(missing)}")
        print("   → Create these rounds in the app first, then re-run.")


if __name__ == '__main__':
    main()
