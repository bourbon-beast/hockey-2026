#!/usr/bin/env python3
"""
seed_team_rankings.py — Seed config/teamRankings for the HV eligibility engine.

Rank 1 = highest grade. Drives the anti-stacking direction rule (Reg 8.4.3),
the 10-game lockout context (Reg 8.4.1) and the finals 33.33% calculation
(Reg 8.5.1). See docs/ELIGIBILITY-ENGINE.md section 1.

Usage (from project root):
    python scripts/seed_team_rankings.py --env uat
    python scripts/seed_team_rankings.py --env prod
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

TEAM_RANKINGS = {
    "rankings": {"PL": 1, "PLR": 2, "PB": 3, "PC": 4, "PE": 5, "Metro": 6},
    "roundsInSeason": 18,
    "season": 2026,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed config/teamRankings")
    parser.add_argument("--env", choices=("uat", "prod"), default="uat")
    args = parser.parse_args()

    cfg = ENV_CONFIG[args.env]
    if not Path(cfg["service_account"]).is_file():
        print(f"Missing service account: {cfg['service_account']}", file=sys.stderr)
        sys.exit(1)

    firebase_admin.initialize_app(credentials.Certificate(cfg["service_account"]))
    db = firestore.client()

    db.collection("config").document("teamRankings").set(TEAM_RANKINGS)
    print(f"Seeded config/teamRankings on {args.env}: {TEAM_RANKINGS}")


if __name__ == "__main__":
    main()
