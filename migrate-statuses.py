import sqlite3

# Map old status text -> new status_id
STATUS_MAP = {
    'Yes, planning to play': 'planning',
    'Unsure just yet':       'unsure',
    'Unlikely to play':      'unlikely',
    'Not heard from':        'not_heard',
    'Not returning':         'not_returning',
    'Fill-in / Emergency':   'fill_in',
    'New to club/restarting':'new',
}

old = sqlite3.connect('F:/Documents/Steve/Development/players-2026/backend/players.db')
old.row_factory = sqlite3.Row
new_db = sqlite3.connect('F:/Documents/Steve/Development/hockey-2026/server/squad.db')
new_db.row_factory = sqlite3.Row

old_players = old.execute('SELECT name, status, team_2026 FROM players').fetchall()
old_by_name = {r['name']: r for r in old_players}

new_players = new_db.execute('SELECT id, name, status_id, assigned_team_id_2026 FROM players').fetchall()

status_changes = []
team_changes = []
no_match = []

for np in new_players:
    name = np['name']
    if name not in old_by_name:
        no_match.append(name)
        continue

    op = old_by_name[name]
    new_status = STATUS_MAP.get(op['status'])

    # Status change?
    if new_status and new_status != np['status_id']:
        status_changes.append({
            'id': np['id'],
            'name': name,
            'old': np['status_id'],
            'new': new_status,
        })

    # Team change? Only fill gaps (don't overwrite existing)
    if op['team_2026'] and not np['assigned_team_id_2026']:
        team_changes.append({
            'id': np['id'],
            'name': name,
            'team': op['team_2026'],
        })

print(f'=== STATUS CHANGES ({len(status_changes)}) ===')
for c in status_changes:
    print(f'  {c["name"]}: {c["old"]} -> {c["new"]}')

print(f'\n=== TEAM GAP FILLS ({len(team_changes)}) ===')
for c in team_changes:
    print(f'  {c["name"]}: -> {c["team"]}')

print(f'\n=== NO MATCH IN OLD DB ({len(no_match)}) ===')
for n in no_match:
    print(f'  {n}')

print('\n=== DRY RUN COMPLETE — no changes written ===')
print(f'Run with --apply to commit changes')

import sys
if '--apply' in sys.argv:
    now = __import__('datetime').datetime.utcnow().isoformat()
    for c in status_changes:
        new_db.execute(
            'UPDATE players SET status_id = ?, updated_at = ? WHERE id = ?',
            (c['new'], now, c['id'])
        )
    for c in team_changes:
        new_db.execute(
            'UPDATE players SET assigned_team_id_2026 = ?, updated_at = ? WHERE id = ?',
            (c['team'], now, c['id'])
        )
    new_db.commit()
    print(f'\n=== APPLIED: {len(status_changes)} status updates, {len(team_changes)} team fills ===')
