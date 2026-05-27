"""Shared paths for CLI scripts. Service account JSON files live in the repo root."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = Path(__file__).resolve().parent
DATA_DIR = SCRIPTS_DIR / "data"

FIXTURE_JSON = DATA_DIR / "fixture_2026.json"


def service_account_path(filename: str) -> str:
    return str(REPO_ROOT / filename)


ENV_CONFIG = {
    "prod": {
        "service_account": service_account_path(
            "hockey-2026-f521f-firebase-adminsdk-fbsvc-6c421c359a.json"
        ),
        "project_id": "hockey-2026-f521f",
    },
    "uat": {
        "service_account": service_account_path("hockey-2026-uat-firebase-adminsdk.json"),
        "project_id": "hockey-2026-uat",
    },
}
