"""
fetch_tally_intentions.py

Fetches all submissions from the MHC 2026 player intentions Tally form
and dumps them to scripts/data/tally_intentions_raw.json

Run: python scripts/fetch_tally_intentions.py
"""

import json
import os
import requests

TALLY_API_KEY = "tly-Cy8QUkZ8LRBvpeAs9cUaXciCCwPaeNRX"
FORM_ID = "2EAKap"
OUT_PATH = os.path.join(os.path.dirname(__file__), "data", "tally_intentions_raw.json")

headers = {
    "Authorization": f"Bearer {TALLY_API_KEY}",
    "Accept": "application/json",
}

def fetch_all_submissions():
    submissions = []
    page = 1
    while True:
        resp = requests.get(
            f"https://api.tally.so/forms/{FORM_ID}/submissions",
            headers=headers,
            params={"page": page, "limit": 100},
        )
        if not resp.ok:
            print(f"ERROR {resp.status_code}: {resp.text}")
            break
        data = resp.json()
        batch = data.get("submissions", [])
        submissions.extend(batch)
        print(f"  Page {page}: {len(batch)} submissions (total so far: {len(submissions)})")
        if len(batch) < 100:
            break
        page += 1
    return submissions

def fetch_form_meta():
    resp = requests.get(f"https://api.tally.so/forms/{FORM_ID}", headers=headers)
    if resp.ok:
        return resp.json()
    print(f"Could not fetch form meta: {resp.status_code}")
    return {}

if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    print("Fetching form metadata...")
    meta = fetch_form_meta()
    print(f"  Form: {meta.get('title', '(unknown)')}")

    print("Fetching submissions...")
    submissions = fetch_all_submissions()
    print(f"Total submissions: {len(submissions)}")

    output = {"form": meta, "submissions": submissions}
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nDumped to: {OUT_PATH}")

    # Print a quick field summary from the first submission
    if submissions:
        print("\n--- Field labels in first submission ---")
        for field in submissions[0].get("fields", []):
            print(f"  [{field.get('type')}] {field.get('label')!r:50s} = {str(field.get('value'))[:60]}")
