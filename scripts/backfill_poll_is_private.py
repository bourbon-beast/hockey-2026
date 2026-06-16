#!/usr/bin/env python3
"""
backfill_poll_is_private.py — Set isPrivate=false on polls missing the field.

Older polls were created before isPrivate existed. Firestore list queries use
where('isPrivate', '==', false), which does not match documents without the field.

Usage (from project root):
    python scripts/backfill_poll_is_private.py --env uat
    python scripts/backfill_poll_is_private.py --env uat --dry-run
"""

import argparse
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from _paths import ENV_CONFIG  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill isPrivate=false on legacy polls")
    parser.add_argument("--env", choices=("uat", "prod"), default="uat")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg = ENV_CONFIG[args.env]
    if not Path(cfg["service_account"]).is_file():
        print(f"Missing service account: {cfg['service_account']}", file=sys.stderr)
        sys.exit(1)

    firebase_admin.initialize_app(credentials.Certificate(cfg["service_account"]))
    db = firestore.client()

    updated = 0
    scanned = 0
    for doc in db.collection("polls").stream():
        scanned += 1
        data = doc.to_dict() or {}
        if "isPrivate" in data:
            continue
        print(f"  {doc.id}: set isPrivate=false")
        if not args.dry_run:
            doc.reference.update({"isPrivate": False})
        updated += 1

    label = "would update" if args.dry_run else "updated"
    print(f"\nScanned {scanned} polls; {label} {updated}.")


if __name__ == "__main__":
    main()
