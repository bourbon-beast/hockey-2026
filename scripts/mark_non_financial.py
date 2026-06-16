#!/usr/bin/env python3
"""
mark_non_financial.py — Mark players as non-financial from a Majestri/club Excel export.

Reads an Excel spreadsheet where each row is a player whose "Financial" status is "NO",
matches each name against Firestore players, and sets isNotFinancial=True.

Intended workflow:
  1. Run against UAT first to verify all names match
  2. Review output, resolve any unmatched names
  3. Re-run with --env prod to apply to production

Usage (from project root):
    python scripts/mark_non_financial.py --xlsx-file "F:/Downloads/Mens & Master list 280526.xlsx"
    python scripts/mark_non_financial.py --xlsx-file "..." --dry-run
    python scripts/mark_non_financial.py --xlsx-file "..." --env prod
"""

import re
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

try:
    import openpyxl
except ImportError:
    print("❌ openpyxl not installed. Run: pip install openpyxl", file=sys.stderr)
    sys.exit(1)


def parse_excel_names(xlsx_path: Path) -> list[dict]:
    """
    Read the spreadsheet and return a list of dicts with:
      - raw: original cell value
      - candidates: list of "FirstName LastName" strings to try matching
      - financial: value from column K
    """
    wb = openpyxl.load_workbook(xlsx_path)
    ws = wb.active
    records = []

    for row in ws.iter_rows(min_row=2, values_only=True):
        raw_name = row[0]
        financial = row[10]  # column K (0-indexed: 10)
        if not raw_name:
            continue

        raw_name = str(raw_name).strip()
        candidates = name_to_candidates(raw_name)
        records.append({'raw': raw_name, 'candidates': candidates, 'financial': financial})

    return records


def name_to_candidates(raw: str) -> list[str]:
    """
    Convert "LastName, FirstName" (possibly with "(Alias)") into candidate
    "FirstName LastName" strings for matching.

    Examples:
      "Quenette, Steve"           → ["Steve Quenette"]
      "Rogalsky, Lucas (Luke)"    → ["Lucas Rogalsky", "Luke Rogalsky"]
      "Badesha, Jaspreet singh"   → ["Jaspreet singh Badesha"]
    """
    if ',' not in raw:
        return [raw.strip()]

    last, rest = raw.split(',', 1)
    last = last.strip()
    rest = rest.strip()

    # Extract parenthetical alias
    alias_match = re.search(r'\(([^)]+)\)', rest)
    alias = alias_match.group(1).strip() if alias_match else None

    # Primary first name: everything before the parenthetical
    primary = re.sub(r'\s*\([^)]*\)', '', rest).strip()

    candidates = [f"{primary} {last}"]
    if alias:
        candidates.append(f"{alias} {last}")

    return candidates


def build_player_index(db) -> dict[str, tuple[str, str]]:
    """
    Returns {normalized_name: (doc_id, display_name)} for all Firestore players.
    Normalized = lowercase, collapsed whitespace.
    """
    index = {}
    for doc in db.collection('players').stream():
        name = doc.to_dict().get('name', '')
        if name:
            key = ' '.join(name.lower().split())
            index[key] = (doc.id, name)
    return index


def main():
    parser = argparse.ArgumentParser(description='Mark non-financial players in Firestore')
    parser.add_argument('--xlsx-file', required=True, help='Path to the Excel spreadsheet')
    parser.add_argument('--env', choices=['prod', 'uat'], default='uat',
                        help='Target environment (default: uat)')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing')
    args = parser.parse_args()

    env = ENV_CONFIG[args.env]
    print(f"🎯 Target: {args.env.upper()} ({env['project_id']})")
    if args.dry_run:
        print("🔍 DRY RUN — no writes will occur")

    xlsx_path = Path(args.xlsx_file)
    if not xlsx_path.exists():
        print(f"❌ File not found: {xlsx_path}", file=sys.stderr)
        sys.exit(1)

    records = parse_excel_names(xlsx_path)
    print(f"📊 Loaded {len(records)} names from {xlsx_path.name}")

    cred = credentials.Certificate(env['service_account'])
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    print("📋 Loading players from Firestore...")
    player_index = build_player_index(db)
    print(f"   Found {len(player_index)} players\n")

    matched = []
    unmatched = []
    now = datetime.now(timezone.utc).isoformat()

    for rec in records:
        found = None
        for candidate in rec['candidates']:
            key = ' '.join(candidate.lower().split())
            if key in player_index:
                found = (key, player_index[key])
                break

        if found:
            _, (doc_id, display_name) = found
            matched.append((doc_id, display_name, rec['raw']))
            status = 'DRY' if args.dry_run else '✅'
            print(f"  {status}  [{doc_id:>4}] {display_name}  ← {rec['raw']!r}")
            if not args.dry_run:
                db.collection('players').document(doc_id).update({
                    'isNotFinancial': True,
                    'updatedAt': now,
                })
        else:
            unmatched.append(rec['raw'])
            print(f"  ❌  NO MATCH for {rec['raw']!r}  (tried: {rec['candidates']})")

    print(f"\n{'Would update' if args.dry_run else 'Updated'} {len(matched)} players.")

    if unmatched:
        print(f"\n⚠️  {len(unmatched)} unmatched name(s) — update manually or check spelling:")
        for name in unmatched:
            print(f"   • {name}")
    else:
        print("✅ All names matched successfully.")


if __name__ == '__main__':
    main()
