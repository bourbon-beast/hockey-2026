#!/usr/bin/env python3
"""
sync_ladder.py — Scrapes HV ladder positions for all 6 Mentone men's comps
and writes results to Firestore at hvSync/ladders.

Run separately from sync_hv.py — this won't touch results or fixture data.

    pip install firebase-admin requests beautifulsoup4
    python sync_ladder.py              # write to UAT (default)
    python sync_ladder.py --env prod   # write to PROD
    python sync_ladder.py --dry-run    # print without writing
"""

import re
import sys
import json
import argparse
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore as fs

# ── Configuration ─────────────────────────────────────────────────────────────

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

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

BASE_URL = 'https://www.hockeyvictoria.org.au'

# team_id → ladder URL
LADDER_URLS = {
    'PL':    f'{BASE_URL}/pointscore/25879/42156',
    'PLR':   f'{BASE_URL}/pointscore/25879/42243',
    'PB':    f'{BASE_URL}/pointscore/25879/42237',
    'PC':    f'{BASE_URL}/pointscore/25879/42238',
    'PE':    f'{BASE_URL}/pointscore/25879/42242',
    'Metro': f'{BASE_URL}/pointscore/25879/42235',
}


# ── Scraper ───────────────────────────────────────────────────────────────────

def fetch_ladder(url: str) -> list[dict]:
    """
    Fetch and parse a HV ladder page.
    Returns list of dicts: { position, team, played, wins, draws, losses,
                              byes, for_, against, diff, points }
    Mentone's row will be identified by 'mentone' in the team name.
    """
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    # Find the ladder table — it has headers: Team, Played, Wins, Draws...
    table = None
    for t in soup.find_all('table'):
        headers = [th.get_text(strip=True).lower() for th in t.find_all('th')]
        if 'team' in headers and 'wins' in headers and 'played' in headers:
            table = t
            break

    if not table:
        print(f"  ⚠️  No ladder table found at {url}", file=sys.stderr)
        return []

    rows = []
    for tr in table.find_all('tr')[1:]:  # skip header row
        cells = [td.get_text(strip=True) for td in tr.find_all('td')]
        if len(cells) < 5:
            continue

        # Team cell format: "1. Toorak East Malvern Hockey Club" or "1.Team Name"
        team_raw = cells[0]
        pos_match = re.match(r'^(\d+)\.?\s*(.*)', team_raw)
        if not pos_match:
            continue

        position  = int(pos_match.group(1))
        team_name = pos_match.group(2).strip()

        def safe_int(val):
            try: return int(val)
            except: return 0

        def safe_float(val):
            try: return float(val.replace('%',''))
            except: return 0.0

        rows.append({
            'position': position,
            'team':     team_name,
            'played':   safe_int(cells[1])  if len(cells) > 1 else 0,
            'wins':     safe_int(cells[2])  if len(cells) > 2 else 0,
            'draws':    safe_int(cells[3])  if len(cells) > 3 else 0,
            'losses':   safe_int(cells[4])  if len(cells) > 4 else 0,
            'byes':     safe_int(cells[5])  if len(cells) > 5 else 0,
            'for_':     safe_int(cells[6])  if len(cells) > 6 else 0,
            'against':  safe_int(cells[7])  if len(cells) > 7 else 0,
            'diff':     safe_int(cells[8])  if len(cells) > 8 else 0,
            'points':   safe_int(cells[9])  if len(cells) > 9 else 0,
        })

    return rows


def find_mentone_row(rows: list[dict]) -> dict | None:
    """Find Mentone's row in the ladder."""
    for row in rows:
        if 'mentone' in row['team'].lower():
            return row
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Sync HV ladder positions to Firestore')
    parser.add_argument('--env',     choices=['prod', 'uat'], default='uat',
                        help='Target environment (default: uat)')
    parser.add_argument('--dry-run', action='store_true', help='Print without writing')
    args = parser.parse_args()

    env = ENV_CONFIG[args.env]
    print(f"🎯 Target: {args.env.upper()} ({env['project_id']})", file=sys.stderr)

    # Init Firestore
    db = None
    if not args.dry_run:
        cred = credentials.Certificate(env['service_account'])
        firebase_admin.initialize_app(cred)
        db = fs.client()

    results = {}

    for team_id, url in LADDER_URLS.items():
        print(f"\n🔢 Fetching ladder: {team_id}...", file=sys.stderr)
        try:
            rows = fetch_ladder(url)
        except Exception as e:
            print(f"   ❌ Error: {e}", file=sys.stderr)
            results[team_id] = {'error': str(e)}
            continue

        mentone = find_mentone_row(rows)
        total   = len(rows)

        if not mentone:
            print(f"   ⚠️  Mentone not found in {total} rows", file=sys.stderr)
            results[team_id] = {'position': None, 'total': total, 'error': 'not found'}
            continue

        pos = mentone['position']
        in_finals = pos <= 4
        print(f"   {'🟢' if in_finals else '⚪'} {team_id}: {pos}/{total} "
              f"| W{mentone['wins']} D{mentone['draws']} L{mentone['losses']} "
              f"Pts:{mentone['points']}", file=sys.stderr)

        # Top 4 for display — always include them plus Mentone if outside top 4
        top4 = rows[:4]
        display_rows = top4[:]
        if pos > 4:
            display_rows.append(mentone)

        results[team_id] = {
            'position':    pos,
            'total':       total,
            'inFinals':    in_finals,
            'mentone':     mentone,
            'top4':        top4,
            'displayRows': display_rows,
        }

    # Print summary
    print("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print("LADDER SUMMARY")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    for team_id, data in results.items():
        if data.get('error'):
            print(f"{team_id:6s}: Error — {data['error']}")
        else:
            pos   = data['position']
            total = data['total']
            m     = data['mentone']
            flag  = '✅' if data['inFinals'] else '  '
            print(f"{flag} {team_id:6s}: {pos}/{total} "
                  f"| W{m['wins']} D{m['draws']} L{m['losses']} Pts:{m['points']}")

    # Write to Firestore
    if db and not args.dry_run:
        db.collection('hvSync').document('ladders').set({
            'syncedAt': datetime.utcnow().isoformat() + 'Z',
            'ladders':  results,
        })
        print(f"\n💾 Saved to Firestore hvSync/ladders", file=sys.stderr)

        # Also patch hvSync/latest so the TeamView position strip works
        update = {'ladders': {}}
        for team_id, data in results.items():
            if not data.get('error'):
                update['ladders'][team_id] = {
                    'position': data['position'],
                    'total':    data['total'],
                    'inFinals': data['inFinals'],
                }
        db.collection('hvSync').document('latest').set(update, merge=True)
        print("💾 Patched hvSync/latest with positions", file=sys.stderr)

    elif args.dry_run:
        print("\n(dry run — nothing written)")


if __name__ == '__main__':
    main()
