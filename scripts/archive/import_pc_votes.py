"""
Import historical Pennant C Best & Fairest CSV submissions into Firestore votes.

Usage:
  python scripts/archive/import_pc_votes.py --env uat --dry-run
  python scripts/archive/import_pc_votes.py --env prod --dry-run
  python scripts/archive/import_pc_votes.py --env prod --write --confirm-prod-write IMPORT_PC_PROD

It writes deterministic response document IDs (`csv_<submission_id>`) so
rerunning it updates the same imported rows rather than duplicating votes.
"""

import argparse
import csv
import re
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore

_SCRIPTS = Path(__file__).resolve().parent.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))
from _paths import ENV_CONFIG  # noqa: E402


TEAM_ID = "PC"
TEAM_NAME = "Pennant C"

IMPORTS = [
    {
        "round_number": 1,
        "path": Path("f:/Downloads/Round 1_ Pennant C B&F_Submissions_2026-05-18.csv"),
    },
    {
        "round_number": 2,
        "path": Path("f:/Downloads/B&F Pennant C_Submissions_2026-05-18.csv"),
    },
    {
        "round_number": 3,
        "path": Path("f:/Downloads/B&F PC Round 3_Submissions_2026-05-18.csv"),
    },
    {
        "round_number": 4,
        "path": Path("f:/Downloads/B&F PC Round 4_Submissions_2026-05-18.csv"),
    },
]

# CSV exports include nicknames and reversed parenthetical forms. Values point at
# the canonical player name we expect to find in Firestore.
NAME_ALIASES = {
    "nicko daniel n bowen": ["Daniel N Bowen", "Daniel N Bowen (Nick)"],
    "daniel n bowen nick": ["Daniel N Bowen", "Daniel N Bowen (Nick)"],
    "stuart quenette": ["Stuart Quenette", "Stuart Quenette (Buba)"],
    "stuart quenette buba": ["Stuart Quenette", "Stuart Quenette (Buba)"],
    "alexander bowen bundy": ["Alexander Bowen", "Alexander Bowen (Bundy)"],
}


def normalize_name(value):
    text = (value or "").strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[()]", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def compact_doc_id(value):
    return re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip()).strip("_")


def vote_column(fieldnames, points):
    target = f"{points} vote"
    for field in fieldnames or []:
        normalized = normalize_name(field)
        if normalized == target or normalized == f"{target}s":
            return field
    raise ValueError(f"Could not find {points}-vote column in CSV headers: {fieldnames}")


def read_csv_votes(path):
    if not path.exists():
        raise FileNotFoundError(f"CSV not found: {path}")

    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        col3 = vote_column(reader.fieldnames, 3)
        col2 = vote_column(reader.fieldnames, 2)
        col1 = vote_column(reader.fieldnames, 1)
        rows = []
        for row in reader:
            submission_id = (row.get("Submission ID") or "").strip()
            if not submission_id:
                raise ValueError(f"Missing Submission ID in {path}")
            rows.append({
                "submission_id": submission_id,
                "respondent_id": (row.get("Respondent ID") or "").strip(),
                "submitted_at": (row.get("Submitted at") or "").strip(),
                "names": {
                    "3": (row.get(col3) or "").strip(),
                    "2": (row.get(col2) or "").strip(),
                    "1": (row.get(col1) or "").strip(),
                },
            })
        return rows


def initialize_firestore(env):
    config = ENV_CONFIG[env]
    project_id = config["project_id"]
    service_account = Path(config["service_account"])
    if service_account.exists():
        cred = credentials.Certificate(str(service_account))
        firebase_admin.initialize_app(cred, {"projectId": project_id})
    else:
        firebase_admin.initialize_app(options={"projectId": project_id})
    return firestore.client(), project_id


def load_rounds(db):
    rounds = {}
    for doc in db.collection("rounds").stream():
        data = doc.to_dict()
        if data.get("roundType") != "season":
            continue
        round_number = data.get("roundNumber")
        if round_number in {1, 2, 3, 4}:
            rounds[round_number] = {"id": doc.id, **data}
    return rounds


def load_players(db):
    players = []
    lookup = {}
    collisions = {}

    for doc in db.collection("players").stream():
        data = doc.to_dict()
        player = {"id": doc.id, "name": data.get("name", doc.id), **data}
        players.append(player)
        key = normalize_name(player["name"])
        lookup.setdefault(key, []).append(player)

    for alias, canonical_names in NAME_ALIASES.items():
        for canonical in canonical_names:
            canonical_key = normalize_name(canonical)
            if canonical_key in lookup:
                lookup[normalize_name(alias)] = lookup[canonical_key]
                break

    for key, matches in lookup.items():
        if len(matches) > 1:
            collisions[key] = matches

    return players, lookup, collisions


def load_pc_players_for_round(db, round_id, all_players):
    player_by_id = {str(player["id"]): player for player in all_players}
    selections = []
    for doc in db.collection("rounds").document(str(round_id)).collection("selections").stream():
        data = doc.to_dict()
        if data.get("teamId") != TEAM_ID or data.get("isUnavailable"):
            continue
        player_id = str(data.get("playerId"))
        player = player_by_id.get(player_id)
        selections.append({
            "id": int(player_id) if player_id.isdigit() else player_id,
            "name": player.get("name", player_id) if player else player_id,
            "slot": data.get("slotNumber") or 999,
        })

    return [
        {"id": selection["id"], "name": selection["name"]}
        for selection in sorted(selections, key=lambda item: item["slot"])
    ]


def load_match_context(db, round_id, round_number, round_data):
    snap = db.collection("rounds").document(str(round_id)).collection("matches").document(TEAM_ID).get()
    match = snap.to_dict() if snap.exists else {}
    score_for = match.get("scoreFor")
    score_against = match.get("scoreAgainst")
    return {
        "teamId": TEAM_ID,
        "teamName": TEAM_NAME,
        "roundLabel": f"Round {round_number}",
        "opponent": match.get("opponent", ""),
        "venue": match.get("venue", ""),
        "matchDate": match.get("matchDate") or round_data.get("roundDate") or round_data.get("satDate") or "",
        "time": match.get("time", ""),
        "arriveAt": match.get("arriveAt", ""),
        "isHome": match.get("isHome"),
        "result": match.get("result", ""),
        "scoreFor": score_for if score_for is not None else None,
        "scoreAgainst": score_against if score_against is not None else None,
        "scorers": [],
    }


def map_votes(import_rows, player_lookup, eligible_ids_by_round):
    mapped = {}
    unmatched = {}
    ambiguous = {}

    for item in import_rows:
        round_number = item["round_number"]
        mapped_rows = []
        for row in item["rows"]:
            votes = {}
            for points, raw_name in row["names"].items():
                matches = player_lookup.get(normalize_name(raw_name), [])
                if not matches:
                    unmatched.setdefault(raw_name, set()).add(round_number)
                    continue
                if len(matches) > 1:
                    eligible_matches = [
                        player for player in matches
                        if str(player["id"]) in eligible_ids_by_round.get(round_number, set())
                    ]
                    if len(eligible_matches) == 1:
                        matches = eligible_matches
                    else:
                        ambiguous.setdefault(raw_name, set()).add(round_number)
                        continue
                if len(matches) > 1:
                    ambiguous.setdefault(raw_name, set()).add(round_number)
                    continue
                player = matches[0]
                votes[points] = int(player["id"]) if str(player["id"]).isdigit() else player["id"]
            mapped_rows.append({**row, "votes": votes})
        mapped[round_number] = mapped_rows

    return mapped, unmatched, ambiguous


def print_dry_run(import_rows, mapped_rows, player_lookup, rounds, project_id, eligible_ids_by_round):
    print(f"\n[DRY RUN] Project: {project_id}")
    print("-" * 72)
    for item in import_rows:
        round_number = item["round_number"]
        round_data = rounds.get(round_number)
        print(f"Round {round_number}: {len(item['rows'])} submissions -> round doc {round_data['id']}")
        seen = sorted({name for row in item["rows"] for name in row["names"].values()}, key=str.lower)
        for raw_name in seen:
            matches = player_lookup.get(normalize_name(raw_name), [])
            if len(matches) > 1:
                eligible_matches = [
                    player for player in matches
                    if str(player["id"]) in eligible_ids_by_round.get(round_number, set())
                ]
                if len(eligible_matches) == 1:
                    matches = eligible_matches
            if len(matches) == 1:
                player = matches[0]
                mapped_name = f"{player['name']} [{player['id']}]"
            elif len(matches) > 1:
                mapped_name = f"AMBIGUOUS {[(p['name'], p['id']) for p in matches]}"
            else:
                mapped_name = "UNMATCHED"
            print(f"  {raw_name:<32} -> {mapped_name}")
        print()

    print("Response docs to write:")
    for round_number, rows in mapped_rows.items():
        vote_count = len(rows)
        print(f"  Round {round_number}: {vote_count} response doc(s)")


def write_import(db, import_rows, mapped_rows, rounds, all_players, project_id):
    total = 0
    player_by_id = {str(player["id"]): player for player in all_players}
    for item in import_rows:
        round_number = item["round_number"]
        round_data = rounds[round_number]
        round_id = round_data["id"]
        session_id = f"{round_id}__{TEAM_ID}"
        session_ref = db.collection("votes").document(session_id)
        existing = session_ref.get()
        pc_players = load_pc_players_for_round(db, round_id, all_players)
        player_snapshot = {str(player["id"]): player for player in pc_players}
        for row in mapped_rows[round_number]:
            for player_id in row["votes"].values():
                key = str(player_id)
                if key not in player_snapshot and key in player_by_id:
                    player_snapshot[key] = {
                        "id": int(key) if key.isdigit() else key,
                        "name": player_by_id[key].get("name", key),
                    }
        pc_players = list(player_snapshot.values())
        match_context = load_match_context(db, round_id, round_number, round_data)
        session_payload = {
            "roundId": str(round_id),
            "teamId": TEAM_ID,
            "roundLabel": f"Round {round_number}",
            "players": pc_players,
            "matchContext": match_context,
            "isOpen": existing.to_dict().get("isOpen", False) if existing.exists else False,
        }
        if existing.exists:
            session_payload["updatedAt"] = firestore.SERVER_TIMESTAMP
            session_ref.set(session_payload, merge=True)
        else:
            session_payload["createdAt"] = firestore.SERVER_TIMESTAMP
            session_ref.set(session_payload)

        batch = db.batch()
        batch_count = 0
        for row in mapped_rows[round_number]:
            response_id = f"csv_{compact_doc_id(row['submission_id'])}"
            response_ref = session_ref.collection("responses").document(response_id)
            batch.set(response_ref, {
                "votes": row["votes"],
                "submittedAt": row["submitted_at"],
                "source": "csv_import",
                "sourceSubmissionId": row["submission_id"],
                "sourceRespondentId": row["respondent_id"],
                "importedAt": firestore.SERVER_TIMESTAMP,
            }, merge=True)
            batch_count += 1
            total += 1
            if batch_count == 400:
                batch.commit()
                batch = db.batch()
                batch_count = 0
        if batch_count:
            batch.commit()
        print(f"Wrote Round {round_number}: session {session_id}, {len(mapped_rows[round_number])} responses")
    print(f"\nDone. Wrote/updated {total} imported response doc(s) in {project_id}.")


def verify_counts(db, rounds, project_id):
    print(f"\n{project_id} vote response counts:")
    for round_number in sorted(rounds):
        round_id = rounds[round_number]["id"]
        session_id = f"{round_id}__{TEAM_ID}"
        responses = list(db.collection("votes").document(session_id).collection("responses").stream())
        imported = [doc for doc in responses if doc.id.startswith("csv_")]
        print(f"  Round {round_number}: {len(responses)} total responses ({len(imported)} CSV imports)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--env", choices=["uat", "prod"], default="uat")
    parser.add_argument(
        "--confirm-prod-write",
        default="",
        help="Required as IMPORT_PC_PROD when writing to production.",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Preview only; default mode")
    mode.add_argument("--write", action="store_true", help="Write imported votes")
    args = parser.parse_args()

    dry_run = not args.write
    if args.write and args.env == "prod" and args.confirm_prod_write != "IMPORT_PC_PROD":
        print(
            "ERROR: Production writes require --confirm-prod-write IMPORT_PC_PROD",
            file=sys.stderr,
        )
        sys.exit(1)

    db, project_id = initialize_firestore(args.env)
    rounds = load_rounds(db)
    missing_rounds = sorted({1, 2, 3, 4} - set(rounds.keys()))
    if missing_rounds:
        print(f"ERROR: Missing {args.env.upper()} season round docs for: {missing_rounds}", file=sys.stderr)
        sys.exit(1)

    all_players, player_lookup, collisions = load_players(db)
    eligible_ids_by_round = {
        number: {str(player["id"]) for player in load_pc_players_for_round(db, data["id"], all_players)}
        for number, data in rounds.items()
    }

    import_rows = []
    for item in IMPORTS:
        import_rows.append({
            "round_number": item["round_number"],
            "path": item["path"],
            "rows": read_csv_votes(item["path"]),
        })

    mapped_rows, unmatched, ambiguous = map_votes(import_rows, player_lookup, eligible_ids_by_round)
    print_dry_run(import_rows, mapped_rows, player_lookup, rounds, project_id, eligible_ids_by_round)

    if ambiguous:
        print("ERROR: Ambiguous vote names. No writes performed.", file=sys.stderr)
        for name, round_numbers in sorted(ambiguous.items(), key=lambda item: item[0].lower()):
            matches = player_lookup.get(normalize_name(name), [])
            options = ", ".join(f"{p['name']} [{p['id']}]" for p in matches)
            rounds_text = ", ".join(f"R{number}" for number in sorted(round_numbers))
            print(f"  {name} ({rounds_text}) -> {options}", file=sys.stderr)
        sys.exit(1)

    if unmatched:
        print("ERROR: Unmatched vote names. No writes performed.", file=sys.stderr)
        for name, round_numbers in sorted(unmatched.items(), key=lambda item: item[0].lower()):
            rounds_text = ", ".join(f"R{number}" for number in sorted(round_numbers))
            print(f"  {name} ({rounds_text})", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print("[DRY RUN] All names matched. No changes written.")
        verify_counts(db, rounds, project_id)
        return

    write_import(db, import_rows, mapped_rows, rounds, all_players, project_id)
    verify_counts(db, rounds, project_id)


if __name__ == "__main__":
    main()
