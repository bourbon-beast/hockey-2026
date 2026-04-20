# -*- coding: utf-8 -*-
"""
functions/main.py — Firebase Cloud Functions for MHC Squad Tracker

Two HTTP-triggered functions, both deployable to UAT and PROD:

  syncHv      — Scrapes HV results + fixtures, writes to Firestore match docs,
                generates weekly digest, saves to hvSync/latest + weeklyDigests/round_N
  syncLadder  — Scrapes HV ladder positions, writes to hvSync/ladders + hvSync/latest

Both accept:  GET/POST  (no body needed)
Query params: ?env=uat (default) | ?env=prod

Deploy:
  firebase deploy --only functions                    # both functions
  firebase deploy --only functions:syncHv             # single function
  firebase use uat && firebase deploy --only functions  # to UAT project
  firebase use prod && firebase deploy --only functions # to PROD project

Local test:
  functions-framework --target syncHv
  functions-framework --target syncLadder
"""

import re
import sys
import json
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import firestore as fs
from firebase_functions import https_fn

REGION = 'australia-southeast1'

# ── Firebase ID token auth ────────────────────────────────────────────────────
# All sync functions require a valid Firebase ID token from an admin user.
# Callers must send:  Authorization: Bearer <idToken>
# Admin emails are stored in Firestore at config/admins  { emails: [...] }
import os
from firebase_admin import auth as fb_auth

def require_admin(req) -> tuple[bool, str]:
    """
    Verifies the Firebase ID token in the Authorization header and checks
    that the caller's email is listed in config/admins.

    Returns (True, '') on success, (False, reason_string) on failure.
    Never raises — all exceptions are caught and returned as failure reasons.
    """
    auth_header = req.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return False, 'Missing or malformed Authorization header'

    id_token = auth_header[len('Bearer '):]

    # Ensure firebase_admin is initialised before verify_id_token
    try:
        db = _get_db()
    except Exception as e:
        return False, f'Error initialising Firebase: {e}'

    try:
        decoded = fb_auth.verify_id_token(id_token)
    except Exception as e:
        return False, f'Invalid ID token: {e}'

    caller_email = decoded.get('email', '').lower().strip()
    if not caller_email:
        return False, 'Token has no email claim'

    try:
        admins_doc = db.collection('config').document('admins').get()
        if not admins_doc.exists:
            return False, 'config/admins document not found'
        allowed = [e.lower().strip() for e in admins_doc.to_dict().get('emails', [])]
    except Exception as e:
        return False, f'Error reading config/admins: {e}'

    if caller_email not in allowed:
        return False, f'Email {caller_email} is not an admin'

    return True, ''

# ── Firebase app init (singleton — uses default service account in Cloud) ─────
_app = None
def _get_db():
    global _app
    if _app is None:
        _app = firebase_admin.initialize_app()
    return fs.client()

# ── Shared constants ──────────────────────────────────────────────────────────
BASE_URL = 'https://www.hockeyvictoria.org.au'
HEADERS  = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
MPL_ONLY_ROUNDS = {19, 20, 21, 22}

COMPETITIONS = [
    {'name': 'Premier League',          'short': 'MPL',  'team_id': 'PL',
     'team_url': f'{BASE_URL}/games/team/25879/409898'},
    {'name': 'Premier League Reserves', 'short': 'MPLR', 'team_id': 'PLR',
     'team_url': f'{BASE_URL}/games/team/25879/412426'},
    {'name': 'Pennant B',               'short': 'MPB',  'team_id': 'PB',
     'team_url': f'{BASE_URL}/games/team/25879/412423'},
    {'name': 'Pennant C',               'short': 'MPC',  'team_id': 'PC',
     'team_url': f'{BASE_URL}/games/team/25879/412424'},
    {'name': 'Pennant E',               'short': 'MPE',  'team_id': 'PE',
     'team_url': f'{BASE_URL}/games/team/25879/412425'},
    {'name': 'Metro 2 South',           'short': 'M2S',  'team_id': 'Metro',
     'team_url': f'{BASE_URL}/games/team/25879/412422'},
]

LADDER_URLS = {
    'PL':    f'{BASE_URL}/pointscore/25879/42156',
    'PLR':   f'{BASE_URL}/pointscore/25879/42243',
    'PB':    f'{BASE_URL}/pointscore/25879/42237',
    'PC':    f'{BASE_URL}/pointscore/25879/42238',
    'PE':    f'{BASE_URL}/pointscore/25879/42242',
    'Metro': f'{BASE_URL}/pointscore/25879/42235',
}

# ══════════════════════════════════════════════════════════════════════════════
# SHARED SCRAPERS (used by both functions)
# ══════════════════════════════════════════════════════════════════════════════

def fetch_soup(url):
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, 'html.parser')


def clean_opponent(raw):
    """Strip HV competition prefix and common hockey club suffixes.

    'Mens PL - 2026 Doncaster HC'              → 'Doncaster'
    'Mens PL - 2026 Melbourne University Hockey Club' → 'Melbourne University'
    'Mens PL - 2026 KBH Brumbies Hockey Club'  → 'KBH Brumbies'
    """
    m = re.search(r' - 20\d\d (.+)$', raw)
    name = m.group(1).strip() if m else raw.strip()

    # Remove trailing hockey club suffixes (order matters — longest first)
    suffixes = [
        r'\s+Hockey Club$',
        r'\s+Hockey Section$',
        r'\s+Hockey Association$',
        r'\s+Hockey$',
        r'\s+HC$',
    ]
    for pattern in suffixes:
        name = re.sub(pattern, '', name, flags=re.IGNORECASE).strip()

    return name


def parse_team_page(team_url):
    """Scrape HV team page — returns list of round dicts."""
    soup = fetch_soup(team_url)
    rounds = []
    seen = set()

    for b_tag in soup.find_all('b'):
        text = b_tag.get_text(strip=True)
        m = re.match(r'^Round\s+(\d+)$', text)
        if not m:
            continue
        round_num = int(m.group(1))
        if round_num in seen:
            continue
        seen.add(round_num)

        container = b_tag.find_parent()
        for _ in range(10):
            if container is None:
                break
            if (container.find('a', href=re.compile(r'/venues/')) and
                    container.find('a', href=re.compile(r'/games/team/'))):
                break
            container = container.find_parent()
        if container is None:
            continue

        block = container.get_text(separator='\n', strip=True)

        dm = re.search(
            r'(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+(\d{1,2}:\d{2})',
            block
        )
        date_str = dm.group(1) if dm else None
        time_str = dm.group(2) if dm else None

        venue_tag = container.find('a', href=re.compile(r'/venues/'))
        venue = venue_tag.get_text(strip=True) if venue_tag else None

        field = None
        if venue_tag:
            nxt = venue_tag.find_next_sibling()
            if nxt:
                s = nxt.get_text(strip=True)
                if s and len(s) <= 6:
                    field = s

        status = 'played' if 'Played' in block else 'upcoming'
        opp_tag  = container.find('a', href=re.compile(r'/games/team/'))
        opponent = clean_opponent(opp_tag.get_text(strip=True)) if opp_tag else None
        is_home  = 'Mentone' in (venue or '')

        score_mentone = score_opponent = result = None
        if status == 'played':
            rm = re.search(r'\b(Win|Loss|Draw)\b', block)
            result = rm.group(1) if rm else None
            sm = re.search(r'(\d+)\s*\n?\s*-\s*\n?\s*(\d+)', block)
            if sm:
                a, b = int(sm.group(1)), int(sm.group(2))
                if result == 'Win':
                    score_mentone, score_opponent = max(a, b), min(a, b)
                elif result == 'Loss':
                    score_mentone, score_opponent = min(a, b), max(a, b)
                else:
                    score_mentone, score_opponent = a, b

        detail_url = None
        detail_tag = container.find('a', href=re.compile(r'/game/\d+'))
        if detail_tag:
            href = detail_tag['href']
            detail_url = href if href.startswith('http') else BASE_URL + href

        rounds.append({
            'round': round_num, 'date_str': date_str, 'time_str': time_str,
            'venue': venue, 'field': field, 'status': status,
            'opponent': opponent, 'score_mentone': score_mentone,
            'score_opponent': score_opponent, 'result': result,
            'is_home': is_home, 'detail_url': detail_url,
        })

    rounds.sort(key=lambda r: r['round'])
    return rounds


def parse_scorers(game_url):
    """Fetch game detail page, return Mentone scorer strings (legacy — wraps parse_game_stats)."""
    stats = parse_game_stats(game_url)
    scorers = []
    for p in stats:
        if p['goals'] > 0:
            name = _hv_name_to_display(p['hv_name'])
            scorers.append(name if p['goals'] == 1 else f'{name} ({p["goals"]})')
    return scorers


def _hv_name_to_display(hv_name):
    """Convert 'Richardson, Scott' → 'Scott Richardson' for display."""
    nm = re.match(r'\d+\.\s*([^(#]+)', hv_name)
    raw = nm.group(1).strip().rstrip(',').strip() if nm else hv_name.strip()
    if ',' in raw:
        parts = raw.split(',', 1)
        return f'{parts[1].strip()} {parts[0].strip()}'
    return raw


def parse_game_stats(game_url):
    """
    Fetch HV game detail page, return per-player stats for Mentone players.

    Each entry:
      { hv_name, attended, goals, green_cards, yellow_cards, red_cards, gk, ets }

    Columns on HV game page (after Name):
      Goals | Green Card | Yellow Card | Red Card | GK | ETS
    """
    try:
        soup = fetch_soup(game_url)
    except Exception:
        return []

    for h5 in soup.find_all('h5'):
        if 'mentone' not in h5.get_text(strip=True).lower():
            continue
        table = h5.find_next('table')
        if not table:
            break

        players = []
        for row in table.find_all('tr')[1:]:
            cells = row.find_all('td')
            if len(cells) < 1:
                continue

            name_cell = cells[0]

            # Skip rows without a player hyperlink — these are section headers,
            # fill-in section headers ("Fill-ins"), totals rows, etc.
            # Both regular squad members and fill-ins have /games/statistics/ links.
            player_link = name_cell.find('a', href=lambda h: h and '/games/statistics/' in h)
            if not player_link:
                continue

            # HV uses:
            #   fa-check (or fa-check-square) = attended
            #   fa-square text-light          = did NOT attend
            # Fill-ins have no icon at all — they played, so treat as attended.
            # Regular squad members with no icon are also treated as attended.
            icon         = name_cell.find('i', class_=lambda c: c and 'fa-' in c)
            icon_classes = icon.get('class', []) if icon else []
            did_not_attend = (
                'fa-square' in icon_classes and
                ('text-light' in icon_classes or 'text-muted' in icon_classes)
            )
            attended = not did_not_attend

            # Extract player name — squad players have "17. Richardson, Scott (#5)"
            # fill-ins just have "Osborne, Matthew" with no number prefix
            name_raw = name_cell.get_text(strip=True)
            nm = re.match(r'^\d+\.\s*(.*?)(?:\s*\(#\d+\))?$', name_raw.strip())
            if nm:
                hv_name = nm.group(1).strip()
            else:
                # Fill-in: no number prefix, may or may not have (#N) suffix
                hv_name = re.sub(r'\s*\(#\d+\)\s*$', '', name_raw).strip()

            def _int(cells, idx):
                if idx >= len(cells):
                    return 0
                v = cells[idx].get_text(strip=True)
                try:
                    return int(v)
                except ValueError:
                    return 0

            players.append({
                'hv_name':      hv_name,
                'attended':     attended,
                'goals':        _int(cells, 1),
                'green_cards':  _int(cells, 2),
                'yellow_cards': _int(cells, 3),
                'red_cards':    _int(cells, 4),
                'gk':           _int(cells, 5),
                'ets':          _int(cells, 6),
            })
        return players

    return []


# ── HV name alias helpers ─────────────────────────────────────────────────────

def _load_hv_aliases(db):
    """
    Returns { 'Richardson, Scott': '123', 'An, John': '45', ... }
    (HV name string → Firestore player doc ID as string)
    Stored at config/hvNameAliases as a plain map.
    """
    snap = db.collection('config').document('hvNameAliases').get()
    return snap.to_dict() if snap.exists else {}


def _save_hv_alias(db, hv_name, player_id):
    """Persist a single HV name → player ID mapping."""
    db.collection('config').document('hvNameAliases').set(
        {hv_name: str(player_id)}, merge=True
    )


def _match_hv_players(hv_stats, all_players, hv_aliases):
    """
    Resolve each HV player name to a Firestore player doc.

    hv_stats     — list of dicts from parse_game_stats
    all_players  — list of { id, name, ... } from Firestore players collection
    hv_aliases   — { hv_name: player_id_str, ... }

    Returns:
      matched   — list of { ...stats, player_id }
      unmatched — list of hv_name strings that could not be resolved
    """
    import difflib

    # Build lookup: normalised display name → player
    # Players stored as "First Last"; HV names come as "Last, First"
    def _normalise(name):
        return name.lower().strip()

    player_map = {_normalise(p['name']): p for p in all_players}

    matched   = []
    unmatched = []

    for stat in hv_stats:
        hv_name = stat['hv_name']

        # 1. Saved alias lookup (exact)
        if hv_name in hv_aliases:
            pid = hv_aliases[hv_name]
            player = next((p for p in all_players if str(p['id']) == str(pid)), None)
            if player:
                matched.append({**stat, 'player_id': str(player['id'])})
                continue

        # 2. Convert "Last, First" → "First Last" and try exact match
        if ',' in hv_name:
            parts = hv_name.split(',', 1)
            display = f'{parts[1].strip()} {parts[0].strip()}'
        else:
            display = hv_name

        norm = _normalise(display)
        if norm in player_map:
            matched.append({**stat, 'player_id': str(player_map[norm]['id'])})
            continue

        # 3. Fuzzy match on display name
        close = difflib.get_close_matches(norm, player_map.keys(), n=1, cutoff=0.78)
        if close:
            matched.append({**stat, 'player_id': str(player_map[close[0]]['id']),
                             'fuzzy': True, 'fuzzy_matched_to': player_map[close[0]]['name']})
            continue

        unmatched.append(hv_name)

    return matched, unmatched


# ── Player stats sync ─────────────────────────────────────────────────────────

def sync_player_stats(db, info):
    """
    1. For each played match doc that has hvGameUrl but no statsLastSync:
       - Scrape parse_game_stats, store raw playerStats array on the match doc
       - Mark statsLastSync timestamp
    2. After scraping, recompute season totals from ALL stored playerStats
       across all match docs and batch-write to players/{id}.

    Returns list of unmatched HV names (for admin resolution UI).
    """
    info('Starting player stats sync...')

    # Load all players and HV name aliases
    all_players  = [{'id': d.id, **d.to_dict()} for d in db.collection('players').stream()]
    hv_aliases   = _load_hv_aliases(db)
    now_iso      = datetime.utcnow().isoformat() + 'Z'

    # ── Phase 1: scrape any match docs missing statsLastSync ──────────────────
    rounds_snap = db.collection('rounds').stream()
    all_unmatched = []
    scraped = 0

    for round_doc in rounds_snap:
        round_data = round_doc.to_dict()
        if round_data.get('roundType') != 'season':
            continue

        matches_snap = db.collection('rounds').document(round_doc.id)\
                         .collection('matches').stream()

        for match_doc in matches_snap:
            match_data = match_doc.to_dict()
            hv_url     = match_data.get('hvGameUrl', '')
            already    = match_data.get('statsLastSync')
            has_stats  = bool(match_data.get('playerStats'))

            # Only scrape played matches with a game URL not yet processed.
            # Re-scrape if previously synced but got zero players (empty first run).
            if not hv_url or (already and has_stats):
                continue

            team_id = match_doc.id
            info(f'   Scraping stats: R{round_data.get("roundNumber")} {team_id} — {hv_url}')

            try:
                raw_stats = parse_game_stats(hv_url)
            except Exception as e:
                info(f'      Error scraping {hv_url}: {e}')
                continue

            # Resolve player IDs
            matched, unmatched = _match_hv_players(raw_stats, all_players, hv_aliases)
            all_unmatched.extend(unmatched)

            if unmatched:
                info(f'      Unmatched players: {unmatched}')

            # Serialise for Firestore storage (only matched + attended players)
            player_stats_to_store = [
                {
                    'playerId':    m['player_id'],
                    'attended':    m['attended'],
                    'goals':       m['goals'],
                    'greenCards':  m['green_cards'],
                    'yellowCards': m['yellow_cards'],
                    'redCards':    m['red_cards'],
                    'gk':          m['gk'],
                    'ets':         m['ets'],
                }
                for m in matched
            ]

            # Write back to match doc
            db.collection('rounds').document(round_doc.id)\
              .collection('matches').document(team_id)\
              .set({
                  'playerStats':    player_stats_to_store,
                  'statsLastSync':  now_iso,
                  'statsUnmatched': unmatched,
              }, merge=True)

            scraped += 1
            info(f'      ✅ Stored stats for {len(player_stats_to_store)} players '
                 f'({len(unmatched)} unmatched)')

    info(f'   Scraped {scraped} new match(es)')

    # ── Phase 2: recompute totals from ALL stored playerStats ─────────────────
    info('   🔢 Recomputing season totals from stored stats...')

    # totals[player_id] = { goals, greenCards, yellowCards, redCards, gk, ets,
    #                        gamesPerTeam: {PL: n, PLR: n, ...} }
    totals = {}

    rounds_snap2 = db.collection('rounds').stream()
    for round_doc in rounds_snap2:
        round_data2 = round_doc.to_dict()
        if round_data2.get('roundType') != 'season':
            continue

        # Use satDate as canonical match date (falls back to sunDate).
        # Keeps tiebreakers chronologically correct even when round numbers
        # are out of calendar order (e.g. midweek rounds 19-20).
        match_date = round_data2.get('satDate') or round_data2.get('sunDate') or ''

        matches_snap2 = db.collection('rounds').document(round_doc.id)\
                          .collection('matches').stream()

        for match_doc in matches_snap2:
            match_data  = match_doc.to_dict()
            team_id     = match_doc.id
            player_stats = match_data.get('playerStats', [])

            for ps in player_stats:
                if not ps.get('attended'):
                    continue
                pid = ps['playerId']
                if pid not in totals:
                    totals[pid] = {
                        'goals': 0, 'greenCards': 0, 'yellowCards': 0,
                        'redCards': 0, 'gk': 0, 'ets': 0,
                        'gamesPerTeam': {},
                        'lastGoalDate': '',
                        'lastCardDate': '',
                    }
                t = totals[pid]
                goals_this = ps.get('goals', 0)
                cards_this = (ps.get('greenCards', 0) +
                              ps.get('yellowCards', 0) +
                              ps.get('redCards', 0))
                t['goals']       += goals_this
                t['greenCards']  += ps.get('greenCards', 0)
                t['yellowCards'] += ps.get('yellowCards', 0)
                t['redCards']    += ps.get('redCards', 0)
                t['gk']          += ps.get('gk', 0)
                t['ets']         += ps.get('ets', 0)
                t['gamesPerTeam'][team_id] = t['gamesPerTeam'].get(team_id, 0) + 1
                # Track most recent match date where player scored / got carded
                if goals_this > 0 and match_date > t['lastGoalDate']:
                    t['lastGoalDate'] = match_date
                if cards_this > 0 and match_date > t['lastCardDate']:
                    t['lastCardDate'] = match_date

    info(f'   Writing totals for {len(totals)} player(s)...')

    # Batch write player totals
    batch = db.batch()
    batch_count = 0

    for player_id, t in totals.items():
        games_per_team  = t.pop('gamesPerTeam')
        teams_played    = [tid for tid, cnt in games_per_team.items() if cnt > 0]
        total_games     = sum(games_per_team.values())

        player_ref = db.collection('players').document(str(player_id))
        batch.set(player_ref, {
            'stats2026': {
                'goals':         t['goals'],
                'greenCards':    t['greenCards'],
                'yellowCards':   t['yellowCards'],
                'redCards':      t['redCards'],
                'gkAppearances': t['gk'],
                'ets':           t['ets'],
                'lastGoalDate':  t['lastGoalDate'],
                'lastCardDate':  t['lastCardDate'],
            },
            'gamesPlayed2026':   games_per_team,
            'teamsPlayed2026':   teams_played,
            'totalGames2026':    total_games,
            'statsUpdatedAt':    now_iso,
        }, merge=True)
        batch_count += 1

        # Firestore batch limit is 500 writes
        if batch_count >= 400:
            batch.commit()
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()

    info(f'   ✅ Player stats written for {len(totals)} player(s)')

    # Save unmatched names to config for admin UI
    unique_unmatched = list(set(all_unmatched))
    if unique_unmatched:
        db.collection('config').document('hvUnmatchedNames').set(
            {'names': unique_unmatched, 'updatedAt': now_iso}, merge=True
        )
        info(f'   ⚠️  Saved {len(unique_unmatched)} unmatched name(s) to config/hvUnmatchedNames')

    return unique_unmatched

# ══════════════════════════════════════════════════════════════════════════════
# syncHv HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def load_round_map(db):
    """Returns {roundNumber: firestoreDocId} for all season rounds."""
    result = {}
    for r in db.collection('rounds').stream():
        d = r.to_dict()
        if d.get('roundType') == 'season' and d.get('roundNumber') is not None:
            result[int(d['roundNumber'])] = r.id
    return result


def _parse_date(date_str):
    if not date_str:
        return ''
    try:
        return datetime.strptime(date_str, '%d %b %Y').strftime('%Y-%m-%d')
    except Exception:
        return ''


def write_result(db, round_doc_id, team_id, game, scorers):
    """Write result to rounds/{roundDocId}/matches/{teamId}.
    Score always Mentone-first: scoreFor = Mentone, scoreAgainst = opponent."""
    (db.collection('rounds').document(round_doc_id)
       .collection('matches').document(team_id)
       .set({
           'scoreFor':     game['score_mentone'],
           'scoreAgainst': game['score_opponent'],
           'result':       game['result'] or '',
           'scorers':      scorers,
           'hvGameUrl':    game['detail_url'] or '',
           'hvLastSync':   datetime.utcnow().isoformat() + 'Z',
       }, merge=True))


def write_fixture(db, round_doc_id, team_id, game):
    """Update fixture fields (venue/time may have changed on HV)."""
    (db.collection('rounds').document(round_doc_id)
       .collection('matches').document(team_id)
       .set({
           'venue':      game['venue'] or '',
           'time':       game['time_str'] or '',
           'matchDate':  _parse_date(game['date_str']),
           'opponent':   game['opponent'] or '',
           'field':      game['field'] or '',
           'isHome':     game['is_home'],
           'hvLastSync': datetime.utcnow().isoformat() + 'Z',
       }, merge=True))


TEAM_DISPLAY_NAMES = {
    'PL':    'Premier League',
    'PLR':   'Premier League Reserves',
    'PB':    'Pennant B',
    'PC':    'Pennant C',
    'PE':    'Pennant E',
    'Metro': 'Metro',
}

def _fmt_time(time_str):
    """Convert 24h time string to 12h with am/pm. '13:30' → '1:30pm', '12:00' → '12pm'."""
    if not time_str:
        return ''
    try:
        h, m = int(time_str.split(':')[0]), int(time_str.split(':')[1])
        suffix = 'pm' if h >= 12 else 'am'
        h12 = 12 if h == 0 else (h - 12 if h > 12 else h)
        return f'{h12}:{m:02d}{suffix}' if m else f'{h12}{suffix}'
    except Exception:
        return time_str

def _fmt_fixture_line(team_id, fix, html=False):
    """Format a single fixture as a compact one-liner."""
    name     = TEAM_DISPLAY_NAMES.get(team_id, team_id)
    day      = datetime.strptime(fix['date_str'], '%d %b %Y').strftime('%A') if fix.get('date_str') else ''
    time_fmt = _fmt_time(fix.get('time_str', ''))
    when     = ' '.join(filter(None, [day, time_fmt]))
    venue    = (fix.get('venue') or '')
    # Shorten common venue suffixes
    for pat in [r'\s+Hockey Club$', r'\s+Hockey Centre$', r'\s+Hockey$',
                r'\s+Playing Fields$', r'\s+Secondary College$', r'\s+HC$']:
        venue = re.sub(pat, '', venue, flags=re.IGNORECASE).strip()
    is_state = 'state' in (fix.get('venue') or '').lower()
    loc      = venue if (not fix.get('is_home') or is_state) else 'Home'
    opp_part = f"vs {fix['opponent']}" if fix.get('opponent') else ''
    loc_part = f"@ {loc}" if loc else ''
    detail   = f"{when + ' ' if when else ''}{opp_part}{' ' + loc_part if loc_part else ''}"
    if html:
        return f'<strong>{name}</strong> – {detail}'
    return f'{name} – {detail}'


def _build_leaders(db):
    """
    Read all active players from Firestore and return top-N season leaders.

    Returns:
      {
        'scorers': [ {'name': 'Scott Richardson', 'goals': 9, 'team': 'PB'}, ... ],
        'hackers': [ {'name': 'John Smith', 'total': 3,
                      'green': 1, 'yellow': 2, 'red': 0, 'team': 'PL'}, ... ],
      }
    Only includes players with stats2026 set and at least 1 goal / 1 card respectively.
    """
    scorers = []
    hackers = []
    CARD_WEIGHTS = {'green': 1, 'yellow': 2, 'red': 3}

    for doc in db.collection('players').stream():
        d = doc.to_dict()
        if not d.get('isActive', True):
            continue
        s = d.get('stats2026')
        if not s:
            continue

        name   = d.get('name', '?')

        goals = s.get('goals', 0)
        if goals > 0:
            scorers.append({
                'name': name,
                'goals': goals,
                'lastGoalDate': s.get('lastGoalDate', ''),
            })

        green  = s.get('greenCards', 0)
        yellow = s.get('yellowCards', 0)
        red    = s.get('redCards', 0)
        card_points = (
            (green * CARD_WEIGHTS['green']) +
            (yellow * CARD_WEIGHTS['yellow']) +
            (red * CARD_WEIGHTS['red'])
        )
        total = green + yellow + red
        if total > 0:
            hackers.append({
                'name': name,
                'total': total,
                'cardPoints': card_points,
                'green': green, 'yellow': yellow, 'red': red,
                'lastCardDate': s.get('lastCardDate', ''),
            })

    scorers.sort(key=lambda x: (
        -x['goals'],
        tuple(-ord(c) for c in x['lastGoalDate'].ljust(10)) if x['lastGoalDate'] else (0,),
        x['name'].lower(),
    ))
    # Fix: descending date means we negate — use reverse trick via string comparison
    # Sort scorers: most goals first, then most recent goal date, then alpha
    scorers.sort(key=lambda x: (
        -x['goals'],
        tuple(-ord(c) for c in x['lastGoalDate'].ljust(10)) if x['lastGoalDate'] else (0,),
        x['name'].lower(),
    ))

    hackers.sort(key=lambda x: (
        -x['cardPoints'],
        -x['yellow'],
        -x['red'],
        -x['green'],
        tuple(-ord(c) for c in x['lastCardDate'].ljust(10)) if x['lastCardDate'] else (0,),
        x['name'].lower(),
    ))

    def _split_top_n(lst, n=5):
        """
        Return (top, also) where top = first n entries and also = remainder
        that are tied with the last entry in top (same score as position n).
        If the list has <= n entries, also is always empty.
        """
        if not lst:
            return [], []
        top  = lst[:n]
        rest = lst[n:]
        return top, rest

    top_scorers, also_scorers = _split_top_n(scorers)
    top_hackers, also_hackers = _split_top_n(hackers)

    return {
        'scorers':      top_scorers,
        'scorers_also': also_scorers,
        'hackers':      top_hackers,
        'hackers_also': also_hackers,
    }


def format_text(summaries, leaders=None):
    SEP = '------------------------------'
    today = date.today().strftime('%d %b %Y')
    lines = [
        'Mentone Hockey Club - Weekly Update',
        'Week ending ' + today,
        'Please keep your unavailability up to date: https://docs.google.com/spreadsheets/d/1MWl3gvFFzniLRFACXHmzPzsAQRIYJsMPlSlnNKh4-p8/edit?usp=sharing',
        '',
        SEP, 'RESULTS', SEP,
    ]
    for s in summaries:
        r = s.get('last_result')
        if s.get('error'):
            lines.append('\n' + s['name'] + ': Error - ' + s['error'])
            continue
        if not r:
            lines.append('\n' + s['name'] + ': Season not started yet')
            continue
        score  = (str(r['score_mentone']) + '-' + str(r['score_opponent'])) if r['score_mentone'] is not None else '--'
        result = r['result'] or 'Not entered'
        lines += ['\n' + s['name'] + ' | Round ' + str(r['round']) + ' | ' + result,
                  'Versus: ' + r['opponent'] + '  ' + score,
                  'Goals:  ' + (', '.join(s.get('scorers', [])) or '--')]

    lines += ['', SEP, 'NEXT ROUND', SEP]
    next_round_nums = [s['next_fixture']['round'] for s in summaries if s.get('next_fixture')]
    if next_round_nums:
        lines.append(f'Round {next_round_nums[0]}')
    for s in summaries:
        f = s.get('next_fixture')
        if not f:
            continue
        lines.append(_fmt_fixture_line(s['team_id'], f))

    # ── Season leaders ────────────────────────────────────────────────────────
    if leaders and (leaders.get('scorers') or leaders.get('hackers')):
        lines += ['', SEP, 'SEASON LEADERS', SEP]

        if leaders.get('scorers'):
            scorer_parts = []
            for i, p in enumerate(leaders['scorers'], 1):
                scorer_parts.append(f"{i}. {p['name']} — {p['goals']}")
            lines.append('Top Scorers:')
            lines += scorer_parts
            also = leaders.get('scorers_also', [])
            if also:
                from collections import defaultdict
                by_goals = defaultdict(list)
                for p in also:
                    by_goals[p['goals']].append(p['name'])
                for goals_val in sorted(by_goals.keys(), reverse=True):
                    names_str = ', '.join(by_goals[goals_val])
                    lines.append(f"Also on {goals_val} goal{'s' if goals_val != 1 else ''}: {names_str}")

        if leaders.get('hackers'):
            lines.append('')
            hacker_parts = []
            for i, p in enumerate(leaders['hackers'], 1):
                card_detail = []
                card_detail += ['Y'] * p['yellow']
                card_detail += ['G'] * p['green']
                card_detail += ['R'] * p['red']
                hacker_parts.append(
                    f"{i}. {p['name']} ({' '.join(card_detail)})"
                )
            lines.append('Cards of Shame:')
            lines += hacker_parts
            also = leaders.get('hackers_also', [])
            if also:
                also_strs = []
                for p in also:
                    badges = ['Y'] * p['yellow'] + ['G'] * p['green'] + ['R'] * p['red']
                    also_strs.append(f"{p['name']} ({' '.join(badges)})")
                lines.append('Also: ' + ', '.join(also_strs))

    return '\n'.join(lines)

def format_html(summaries, leaders=None):
    today = date.today().strftime('%d %b %Y')
    S = {
        'wrap':    'font-family:Arial,sans-serif;font-size:14px;color:#1e293b;max-width:600px;',
        'h1':      'font-size:18px;font-weight:bold;margin:0 0 2px 0;',
        'sub':     'font-size:12px;color:#64748b;margin:0 0 16px 0;',
        'rule':    'border:none;border-top:2px solid #1e3a8a;margin:16px 0 8px 0;',
        'section': 'font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.05em;color:#1e3a8a;margin:0 0 12px 0;',
        'block':   'margin:0 0 16px 0;padding:0;',
        'comp':    'font-size:14px;font-weight:bold;margin:0 0 3px 0;',
        'label':   'font-weight:bold;',
        'muted':   'color:#64748b;',
        'badge_w': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;font-weight:bold;color:#fff;background:#16a34a;',
        'badge_l': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;font-weight:bold;color:#fff;background:#dc2626;',
        'badge_d': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;font-weight:bold;color:#fff;background:#ca8a04;',
        'card_g':  'display:inline-block;padding:0 5px;border-radius:3px;font-size:11px;font-weight:bold;color:#fff;background:#16a34a;',
        'card_y':  'display:inline-block;padding:0 5px;border-radius:3px;font-size:11px;font-weight:bold;color:#fff;background:#ca8a04;',
        'card_r':  'display:inline-block;padding:0 5px;border-radius:3px;font-size:11px;font-weight:bold;color:#fff;background:#dc2626;',
    }

    def badge(result):
        st = {'Win': S['badge_w'], 'Loss': S['badge_l'], 'Draw': S['badge_d']}.get(result, S['badge_d'])
        return f'<span style="{st}">{result}</span>'

    def row(label, value):
        return (f'<tr><td style="{S["label"]}width:70px;padding:1px 8px 1px 0;">{label}</td>'
                f'<td style="padding:1px 0;">{value}</td></tr>')

    next_rounds    = [s['next_fixture']['round'] for s in summaries if s.get('next_fixture')]
    next_round_num = next_rounds[0] if next_rounds else None

    UNAVAIL_URL = ('https://docs.google.com/spreadsheets/d/'
                   '1MWl3gvFFzniLRFACXHmzPzsAQRIYJsMPlSlnNKh4-p8/edit?usp=sharing')

    parts = [f'<div style="{S["wrap"]}">',
             f'<p style="{S["h1"]}">Mentone Hockey Club — Weekly Update</p>',
             f'<p style="{S["sub"]}">Week ending {today}</p>',
             f'<p style="font-size:12px;color:#64748b;margin:0 0 12px 0;">'
             f'Please keep your unavailability up to date: '
             f'<a href="{UNAVAIL_URL}" style="color:#1d4ed8;">Unavailability Tracker</a></p>',
             f'<hr style="{S["rule"]}">',
             f'<p style="{S["section"]}">Results</p>']

    for s in summaries:
        r = s.get('last_result')
        if s.get('error'):
            parts.append('<div style="%s"><p style="%s">%s</p><p style="%s">Error fetching data</p></div>'
                         % (S['block'], S['comp'], s['name'], S['muted']))
            continue
        if not r:
            parts.append('<div style="%s"><p style="%s">%s</p><p style="%s">Season not started yet</p></div>'
                         % (S['block'], S['comp'], s['name'], S['muted']))
            continue
        score   = '%s\u2013%s' % (r['score_mentone'], r['score_opponent']) if r['score_mentone'] is not None else '\u2013'
        result  = r['result'] or 'Not entered'
        scorers = s.get('scorers', [])
        opp     = r['opponent']
        goals   = ', '.join(scorers) if scorers else '\u2013'
        parts.append(
            '<div style="%s">'
            '<p style="%s">%s &nbsp;&middot;&nbsp; Round %s &nbsp;%s</p>'
            '<table style="border-collapse:collapse;">%s%s</table></div>'
            % (S['block'], S['comp'], s['name'], r['round'], badge(result),
               row('Versus:', opp + ' &nbsp; ' + score),
               row('Goals:', goals))
        )

    if next_round_num:
        fixture_list = ''.join(
            f'<p style="margin:2px 0;font-size:13px;color:#1e293b;">{_fmt_fixture_line(s["team_id"], s["next_fixture"], html=True)}</p>'
            for s in summaries if s.get('next_fixture')
        )
        parts += [
            '<hr style="%s">' % S['rule'],
            '<p style="%s">Next Round &mdash; Round %s</p>' % (S['section'], next_round_num),
            '<div style="margin:0 0 8px 0;">%s</div>' % fixture_list,
        ]

    # ── Season leaders ────────────────────────────────────────────────────────
    if leaders and (leaders.get('scorers') or leaders.get('hackers')):
        parts += [
            '<hr style="%s">' % S['rule'],
            '<p style="%s">Season Leaders</p>' % S['section'],
        ]

        # ── Top Scorers table ─────────────────────────────────────────────────
        if leaders.get('scorers'):
            parts.append('<p style="font-size:12px;font-weight:bold;color:#475569;margin:0 0 4px 0;">Top Scorers</p>')
            rows_html = ''
            for i, p in enumerate(leaders['scorers'], 1):
                bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
                rows_html += (
                    f'<tr style="background:{bg};">'
                    f'<td style="padding:3px 6px;color:#94a3b8;font-size:12px;width:18px;">{i}</td>'
                    f'<td style="padding:3px 6px;font-weight:500;">{p["name"]}</td>'
                    f'<td style="padding:3px 6px;font-weight:bold;text-align:right;">{p["goals"]}</td>'
                    f'</tr>'
                )
            parts.append(
                f'<table style="border-collapse:collapse;width:100%;margin-bottom:4px;">'
                f'{rows_html}</table>'
            )
            # "Also on X goals" footer — names of players beyond top 5
            also = leaders.get('scorers_also', [])
            if also:
                # Group by goal count (there may be multiple tail values)
                from collections import defaultdict
                by_goals = defaultdict(list)
                for p in also:
                    by_goals[p['goals']].append(p['name'])
                also_lines = []
                for goals_val in sorted(by_goals.keys(), reverse=True):
                    names_str = ', '.join(by_goals[goals_val])
                    also_lines.append(
                        f'Also on {goals_val} goal{"s" if goals_val != 1 else ""}: {names_str}'
                    )
                also_text = ' &nbsp;·&nbsp; '.join(also_lines)
                parts.append(
                    f'<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:0 0 12px 0;">'
                    f'{also_text}</p>'
                )
            else:
                parts.append('<div style="margin-bottom:12px;"></div>')

        # ── Cards of Shame table ──────────────────────────────────────────────
        if leaders.get('hackers'):
            parts.append('<p style="font-size:12px;font-weight:bold;color:#475569;margin:0 0 4px 0;">Cards of Shame</p>')
            rows_html = ''
            for i, p in enumerate(leaders['hackers'], 1):
                bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
                # Build individual card badges — one per card, e.g. Y Y G not Y2 G1
                card_badges = ''
                card_badges += (f'<span style="{S["card_y"]}">Y</span> ' * p['yellow'])
                card_badges += (f'<span style="{S["card_g"]}">G</span> ' * p['green'])
                card_badges += (f'<span style="{S["card_r"]}">R</span> ' * p['red'])
                card_badges = card_badges.strip()
                rows_html += (
                    f'<tr style="background:{bg};">'
                    f'<td style="padding:3px 6px;color:#94a3b8;font-size:12px;width:18px;">{i}</td>'
                    f'<td style="padding:3px 6px;font-weight:500;">{p["name"]}</td>'
                    f'<td style="padding:3px 6px;text-align:right;">{card_badges}</td>'
                    f'</tr>'
                )
            parts.append(
                f'<table style="border-collapse:collapse;width:100%;margin-bottom:4px;">'
                f'{rows_html}</table>'
            )
            # "Also" footer for cards — show name + their badges inline
            also = leaders.get('hackers_also', [])
            if also:
                also_parts = []
                for p in also:
                    badges = ''
                    badges += (f'<span style="{S["card_y"]}">Y</span> ' * p['yellow'])
                    badges += (f'<span style="{S["card_g"]}">G</span> ' * p['green'])
                    badges += (f'<span style="{S["card_r"]}">R</span> ' * p['red'])
                    also_parts.append(f'{p["name"]} {badges.strip()}')
                also_html = ' &nbsp;·&nbsp; '.join(also_parts)
                parts.append(
                    f'<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:0 0 8px 0;">'
                    f'Also: {also_html}</p>'
                )

    parts.append('</div>')
    return '\n'.join(parts)


# ══════════════════════════════════════════════════════════════════════════════
# CLOUD FUNCTION 1: syncHv
# ══════════════════════════════════════════════════════════════════════════════

@https_fn.on_request(region=REGION, timeout_sec=300, memory=512)
def syncHv(req: https_fn.Request) -> https_fn.Response:
    """
    Scrapes HV for results + fixtures, writes to Firestore match docs,
    generates weekly digest, saves to:
      - hvSync/latest          (always overwritten — existing behaviour)
      - weeklyDigests/round_N  (keyed by upcoming round — overwrites if re-run)

    Call independently:  GET/POST https://.../syncHv
    """
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
    cors_headers = {'Access-Control-Allow-Origin': '*'}

    ok, reason = require_admin(req)
    if not ok:
        return https_fn.Response(
            json.dumps({'error': reason}), status=401,
            mimetype='application/json', headers=cors_headers
        )

    db = _get_db()
    now_iso = datetime.utcnow().isoformat() + 'Z'
    log = []

    def info(msg):
        log.append(msg)
        print(msg)

    info('📋 Loading round map from Firestore...')
    round_map = load_round_map(db)
    info(f'   {len(round_map)} season rounds loaded')

    summaries = []

    for comp in COMPETITIONS:
        info(f"\n🌐 Fetching {comp['short']} — {comp['name']}...")
        try:
            rounds = parse_team_page(comp['team_url'])
        except Exception as e:
            info(f'   ❌ Failed: {e}')
            summaries.append({'name': comp['name'], 'short': comp['short'],
                               'team_id': comp['team_id'], 'error': str(e),
                               'last_result': None, 'next_fixture': None, 'scorers': []})
            continue

        played   = sorted([r for r in rounds if r['status'] == 'played'],
                          key=lambda r: _parse_date(r.get('date_str')) or '')
        upcoming = sorted([r for r in rounds if r['status'] == 'upcoming'],
                          key=lambda r: _parse_date(r.get('date_str')) or '')
        last_result  = played[-1]  if played   else None
        next_fixture = upcoming[0] if upcoming else None

        scorers = []
        if last_result and last_result.get('detail_url'):
            info(f"   ⚽ Fetching scorers for R{last_result['round']}...")
            scorers = parse_scorers(last_result['detail_url'])

        # Write results for ALL played rounds (not just last) so stats scraper
        # has hvGameUrl available for every game, including older rounds.
        # Scorers string is only populated for last_result (used in digest).
        for game in played:
            doc_id = round_map.get(game['round'])
            if not doc_id:
                info(f"   ⚠️  R{game['round']} not in round map — skipping")
                continue
            game_scorers = scorers if game is last_result else []
            write_result(db, doc_id, comp['team_id'], game, game_scorers)
            if game is last_result:
                info(f"   💾 Written result R{game['round']} {comp['team_id']}: "
                     f"{game['result']} {game['score_mentone']}-{game['score_opponent']}")

        # Update upcoming fixture details
        if next_fixture:
            doc_id = round_map.get(next_fixture['round'])
            if doc_id:
                write_fixture(db, doc_id, comp['team_id'], next_fixture)
                info(f"   💾 Updated fixture R{next_fixture['round']} {comp['team_id']}")

        summaries.append({
            'name': comp['name'], 'short': comp['short'], 'team_id': comp['team_id'],
            'error': None, 'last_result': last_result,
            'scorers': scorers, 'next_fixture': next_fixture,
        })

    # Strip non-serialisable fields
    def serialise(s):
        out = {k: v for k, v in s.items() if k not in ('last_result', 'next_fixture')}
        for key in ('last_result', 'next_fixture'):
            g = s.get(key)
            out[key] = None if g is None else {k: v for k, v in g.items() if k != 'parsed_dt'}
        return out

    # Build season leaders from updated player stats
    try:
        leaders = _build_leaders(db)
        info(f"   🏆 Leaders: {len(leaders['scorers'])} scorers, {len(leaders['hackers'])} hackers")
    except Exception as e:
        info(f'⚠️  Leaders build failed: {e}')
        leaders = None

    text_output   = format_text(summaries, leaders)
    html_output   = format_html(summaries, leaders)
    serial_output = [serialise(s) for s in summaries]

    # Determine upcoming round number — this digest's key
    next_round_nums = [s['next_fixture']['round'] for s in summaries if s.get('next_fixture')]
    digest_round    = next_round_nums[0] if next_round_nums else None

    # Sync player stats (scrape new games + recompute totals)
    try:
        unmatched_names = sync_player_stats(db, info)
    except Exception as e:
        info(f'⚠️  Player stats sync failed: {e}')
        unmatched_names = []

    # Always write hvSync/latest (keeps existing DigestPanel working)
    db.collection('hvSync').document('latest').set({
        'syncedAt': now_iso, 'text': text_output,
        'html': html_output, 'summaries': serial_output,
    })
    info('\n💾 Saved hvSync/latest')

    # Write versioned digest — overwrite if re-run for same round
    if digest_round is not None:
        doc_id = f'round_{digest_round}'
        db.collection('weeklyDigests').document(doc_id).set({
            'roundNumber': digest_round, 'generatedAt': now_iso,
            'text': text_output, 'html': html_output, 'summaries': serial_output,
        })
        info(f'💾 Saved weeklyDigests/{doc_id}')
    else:
        info('⚠️  No upcoming round — weeklyDigests not written')

    return https_fn.Response(
        json.dumps({'ok': True, 'digestRound': digest_round, 'log': log,
                    'unmatchedHvNames': unmatched_names}),
        status=200, mimetype='application/json', headers=cors_headers
    )

# ══════════════════════════════════════════════════════════════════════════════
# CLOUD FUNCTION 4: syncPlayerStats  (standalone — safe to call anytime)
# ══════════════════════════════════════════════════════════════════════════════

@https_fn.on_request(region=REGION, timeout_sec=300, memory=512)
def syncPlayerStats(req: https_fn.Request) -> https_fn.Response:
    """
    Scrapes stats for any newly played match docs, then recomputes season
    totals per player from all stored match stats.

    Can be called independently without triggering the full syncHv flow.
    Also accepts POST body: { 'forceRescrape': true } to re-scrape all
    match docs regardless of statsLastSync (use when fixing scraper bugs).
    """
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
    cors_headers = {'Access-Control-Allow-Origin': '*'}

    ok, reason = require_admin(req)
    if not ok:
        return https_fn.Response(
            json.dumps({'error': reason}), status=401,
            mimetype='application/json', headers=cors_headers
        )

    # Optional: force re-scrape of already-processed match docs
    force = False
    try:
        body = req.get_json(silent=True) or {}
        force = bool(body.get('forceRescrape', False))
    except Exception:
        pass

    db  = _get_db()
    log = []

    def info(msg):
        log.append(msg)
        print(msg)

    if force:
        info('⚠️  forceRescrape=true — clearing statsLastSync from all match docs...')
        rounds_snap = db.collection('rounds').stream()
        batch = db.batch()
        cleared = 0
        for rd in rounds_snap:
            if rd.to_dict().get('roundType') != 'season':
                continue
            for md in db.collection('rounds').document(rd.id).collection('matches').stream():
                if md.to_dict().get('statsLastSync'):
                    batch.update(md.reference, {'statsLastSync': None})
                    cleared += 1
                    if cleared % 400 == 0:
                        batch.commit()
                        batch = db.batch()
        batch.commit()
        info(f'   Cleared statsLastSync on {cleared} match doc(s)')

    unmatched = sync_player_stats(db, info)

    return https_fn.Response(
        json.dumps({'ok': True, 'log': log, 'unmatchedHvNames': unmatched}),
        status=200, mimetype='application/json', headers=cors_headers
    )


# ══════════════════════════════════════════════════════════════════════════════
# syncLadder HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def fetch_ladder(url):
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')

    table = None
    for t in soup.find_all('table'):
        headers = [th.get_text(strip=True).lower() for th in t.find_all('th')]
        if 'team' in headers and 'wins' in headers and 'played' in headers:
            table = t
            break
    if not table:
        return []

    def safe_int(val):
        try: return int(val)
        except: return 0

    rows = []
    for tr in table.find_all('tr')[1:]:
        cells = [td.get_text(strip=True) for td in tr.find_all('td')]
        if len(cells) < 5:
            continue
        pos_match = re.match(r'^(\d+)\.?\s*(.*)', cells[0])
        if not pos_match:
            continue
        rows.append({
            'position': int(pos_match.group(1)),
            'team':     pos_match.group(2).strip(),
            'played':   safe_int(cells[1]) if len(cells) > 1 else 0,
            'wins':     safe_int(cells[2]) if len(cells) > 2 else 0,
            'draws':    safe_int(cells[3]) if len(cells) > 3 else 0,
            'losses':   safe_int(cells[4]) if len(cells) > 4 else 0,
            'byes':     safe_int(cells[5]) if len(cells) > 5 else 0,
            'for_':     safe_int(cells[6]) if len(cells) > 6 else 0,
            'against':  safe_int(cells[7]) if len(cells) > 7 else 0,
            'diff':     safe_int(cells[8]) if len(cells) > 8 else 0,
            'points':   safe_int(cells[9]) if len(cells) > 9 else 0,
        })
    return rows


# ══════════════════════════════════════════════════════════════════════════════
# CLOUD FUNCTION 2: syncLadder
# ══════════════════════════════════════════════════════════════════════════════

@https_fn.on_request(region=REGION, timeout_sec=120, memory=512)
def syncLadder(req: https_fn.Request) -> https_fn.Response:
    """
    Scrapes HV ladder positions for all 6 Mentone comps, writes to:
      - hvSync/ladders   (full ladder data)
      - hvSync/latest    (patched with position summary — for TeamView strip)

    Call independently:  GET/POST https://.../syncLadder
    """
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
    cors_headers = {'Access-Control-Allow-Origin': '*'}

    ok, reason = require_admin(req)
    if not ok:
        return https_fn.Response(
            json.dumps({'error': reason}), status=401,
            mimetype='application/json', headers=cors_headers
        )

    db = _get_db()
    now_iso = datetime.utcnow().isoformat() + 'Z'
    log     = []

    def info(msg):
        log.append(msg)
        print(msg)

    results = {}

    for team_id, url in LADDER_URLS.items():
        info(f'🔢 Fetching ladder: {team_id}...')
        try:
            rows = fetch_ladder(url)
        except Exception as e:
            info(f'   ❌ Error: {e}')
            results[team_id] = {'error': str(e)}
            continue

        mentone = next((r for r in rows if 'mentone' in r['team'].lower()), None)
        total   = len(rows)

        if not mentone:
            info(f'   ⚠️  Mentone not found in {total} rows')
            results[team_id] = {'position': None, 'total': total, 'error': 'not found'}
            continue

        pos       = mentone['position']
        in_finals = pos <= 4
        top4      = rows[:4]
        display   = top4[:] if pos <= 4 else top4 + [mentone]

        info(f"   {'🟢' if in_finals else '⚪'} {team_id}: {pos}/{total} "
             f"W{mentone['wins']} D{mentone['draws']} L{mentone['losses']} Pts:{mentone['points']}")

        results[team_id] = {
            'position': pos, 'total': total, 'inFinals': in_finals,
            'mentone': mentone, 'top4': top4, 'displayRows': display,
        }

    # Write full ladder data
    db.collection('hvSync').document('ladders').set({
        'syncedAt': now_iso, 'ladders': results,
    })
    info('💾 Saved hvSync/ladders')

    # Patch hvSync/latest with position summary (used by TeamView)
    summary = {}
    for team_id, data in results.items():
        if not data.get('error'):
            summary[team_id] = {
                'position': data['position'],
                'total':    data['total'],
                'inFinals': data['inFinals'],
            }
    db.collection('hvSync').document('latest').set(
        {'ladders': summary}, merge=True
    )
    info('💾 Patched hvSync/latest with ladder positions')

    return https_fn.Response(
        json.dumps({'ok': True, 'teams': list(results.keys()), 'log': log}),
        status=200, mimetype='application/json', headers=cors_headers
    )


# ═══════════════════════════════════════════════════════════════════════════════
# syncUnavailability — Parse Google Sheet, return staged result (no writes)
# confirmUnavailabilitySync — Write confirmed matches to Firestore
#
# Sheet structure:
#   Row 3: round labels  (Rd 19, Round 1, Round 2 …)
#   Row 4: day labels    (SAT, SUN, SAT, SUN …)
#   Row 5: dates         (29 Mar, 11 Apr, 12 Apr …)
#   Row 6+: player names (non-empty = unavailable that day)
#
# Only future rounds are processed (dates after today are kept).
# ═══════════════════════════════════════════════════════════════════════════════

SHEET_ID = '1MWl3gvFFzniLRFACXHmzPzsAQRIYJsMPlSlnNKh4-p8'
SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

def _sheets_token():
    """Get a short-lived access token using the default service account credentials."""
    import google.auth
    import google.auth.transport.requests
    creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token

def _fetch_sheet(token, range_='2026 Unavailability'):
    """Fetch a range from the unavailability sheet."""
    url = f'{SHEETS_API}/{SHEET_ID}/values/{range_}'
    resp = requests.get(url, headers={'Authorization': f'Bearer {token}'}, timeout=15)
    resp.raise_for_status()
    return resp.json().get('values', [])

def _parse_sheet(values, today_str):
    """
    Parse the sheet values into a list of {sheet_name, round_date, day} dicts.
    Only includes columns whose date is >= today.

    values[0] = row 1, values[2] = row 3 (round labels), etc.
    We need rows 3,4,5 (index 2,3,4) and then rows 6+ (index 5+).
    """
    if len(values) < 5:
        return []

    round_row = values[2] if len(values) > 2 else []   # row 3 — round labels
    day_row   = values[3] if len(values) > 3 else []   # row 4 — SAT/SUN
    date_row  = values[4] if len(values) > 4 else []   # row 5 — dates
    name_rows = values[5:] if len(values) > 5 else []  # row 6+

    # Build column map: col_index → {round_label, day, date_str}
    # Dates in sheet look like "11 Apr" or "02 Apr" — we parse to YYYY-MM-DD
    from datetime import datetime as dt
    col_map = {}
    current_year = date.today().year

    for col_idx, raw_date in enumerate(date_row):
        raw_date = raw_date.strip() if raw_date else ''
        if not raw_date:
            continue
        try:
            parsed = dt.strptime(f'{raw_date} {current_year}', '%d %b %Y')
            date_iso = parsed.strftime('%Y-%m-%d')
        except ValueError:
            continue
        if date_iso < today_str:
            continue   # skip past dates
        day = day_row[col_idx].strip().lower() if col_idx < len(day_row) else ''
        if day not in ('sat', 'sun'):
            continue
        col_map[col_idx] = {'day': day, 'date': date_iso}

    # Extract names from each active column
    entries = []
    for col_idx, meta in col_map.items():
        for row in name_rows:
            cell = row[col_idx].strip() if col_idx < len(row) else ''
            if cell:
                entries.append({
                    'sheet_name': cell,
                    'date': meta['date'],
                    'day': meta['day'],
                })
    return entries

def _match_players(entries, players, aliases):
    """
    Match sheet names to Firestore players.
    aliases = {'Adam wylie': 'Adam Wylie', ...}  — saved resolutions
    Returns: matched[], unmatched[]
    """
    import difflib

    player_map = {p['name'].lower().strip(): p for p in players}
    matched = []
    unmatched = []

    # Group entries by (sheet_name, date) to combine sat+sun → 'both'
    grouped = {}
    for e in entries:
        key = (e['sheet_name'], e['date'][:7])  # name + YYYY-MM
        # We'll handle per-day combining after matching
        pass

    for e in entries:
        raw = e['sheet_name']
        resolved = aliases.get(raw, raw)           # apply saved alias
        lookup = resolved.lower().strip()

        if lookup in player_map:
            matched.append({**e, 'player': player_map[lookup], 'confidence': 'exact'})
            continue

        # Fuzzy match
        close = difflib.get_close_matches(lookup, player_map.keys(), n=1, cutoff=0.75)
        if close:
            matched.append({**e, 'player': player_map[close[0]], 'confidence': 'fuzzy',
                            'fuzzy_from': resolved, 'fuzzy_to': player_map[close[0]]['name']})
        else:
            unmatched.append({**e, 'resolved': resolved})

    return matched, unmatched

def _get_round_for_date(db, date_iso):
    """Find a round whose sat_date or sun_date matches the given date."""
    rounds_ref = db.collection('rounds')
    # Check sat_date
    snap = rounds_ref.where('satDate', '==', date_iso).limit(1).get()
    if snap:
        d = snap[0].to_dict(); d['id'] = snap[0].id; d['match_day'] = 'sat'; return d
    # Check sun_date
    snap = rounds_ref.where('sunDate', '==', date_iso).limit(1).get()
    if snap:
        d = snap[0].to_dict(); d['id'] = snap[0].id; d['match_day'] = 'sun'; return d
    return None


def _get_seen_names(db, round_id):
    """Get set of sheet names already processed for this round."""
    doc = db.collection('unavailabilitySyncs').document(round_id).get()
    if doc.exists:
        return set(doc.to_dict().get('seenNames', []))
    return set()


def _consolidate(matched):
    """
    Combine sat+sun entries for the same player+round into a single record.
    If a player appears in both SAT and SUN columns for the same round → 'both'.
    """
    from collections import defaultdict
    groups = defaultdict(list)
    for m in matched:
        key = (m['player']['id'], m['date'][:7])  # player id + YYYY-MM
        groups[key].append(m)

    result = []
    for entries in groups.values():
        days = [e['day'] for e in entries]
        final_day = 'both' if 'sat' in days and 'sun' in days else days[0]
        base = entries[0].copy()
        base['day'] = final_day
        result.append(base)
    return result


# ── syncUnavailability ────────────────────────────────────────────────────────
@https_fn.on_request(region=REGION)
def syncUnavailability(req: https_fn.Request) -> https_fn.Response:
    """
    Reads the Google Sheet, parses unavailability, matches to Firestore players.
    Returns a staged result for review — does NOT write to Firestore.
    """
    # Handle CORS preflight
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
    cors_headers = {'Access-Control-Allow-Origin': '*'}

    ok, reason = require_admin(req)
    if not ok:
        return https_fn.Response(
            json.dumps({'error': reason}), status=401,
            mimetype='application/json', headers=cors_headers
        )

    db = _get_db()
    today_str = date.today().isoformat()

    # 1. Fetch sheet
    try:
        token = _sheets_token()
        values = _fetch_sheet(token)
    except Exception as e:
        return https_fn.Response(json.dumps({'ok': False, 'error': str(e)}),
                                 status=500, mimetype='application/json', headers=cors_headers)

    # 2. Parse columns — skip past dates
    entries = _parse_sheet(values, today_str)

    # 3. Load players + aliases from Firestore
    players = [{'id': d.id, **d.to_dict()}
               for d in db.collection('players').stream()]
    aliases_doc = db.collection('config').document('nameAliases').get()
    aliases = aliases_doc.to_dict() if aliases_doc.exists else {}

    # 4. Match names
    matched, unmatched = _match_players(entries, players, aliases)

    # 5. Consolidate sat+sun → 'both'
    matched = _consolidate(matched)

    # 6. For each matched entry, find the round + check if already seen
    staged = []
    for m in matched:
        round_doc = _get_round_for_date(db, m['date'])
        if not round_doc:
            continue
        seen = _get_seen_names(db, round_doc['id'])
        is_new = m['sheet_name'] not in seen
        staged.append({
            'sheet_name': m['sheet_name'],
            'player_id': m['player']['id'],
            'player_name': m['player']['name'],
            'round_id': round_doc['id'],
            'round_label': round_doc.get('roundNumber') and f"Round {round_doc['roundNumber']}" or round_doc.get('name', '?'),
            'day': m['day'],
            'date': m['date'],
            'is_new': is_new,
            'confidence': m.get('confidence', 'exact'),
            'fuzzy_from': m.get('fuzzy_from'),
            'fuzzy_to': m.get('fuzzy_to'),
        })

    return https_fn.Response(
        json.dumps({'ok': True, 'staged': staged, 'unmatched': unmatched,
                    'new_count': sum(1 for s in staged if s['is_new']),
                    'total_count': len(staged)}),
        status=200, mimetype='application/json', headers=cors_headers
    )


# ── confirmUnavailabilitySync ─────────────────────────────────────────────────
@https_fn.on_request(region=REGION)
def confirmUnavailabilitySync(req: https_fn.Request) -> https_fn.Response:
    """Writes confirmed staged entries to Firestore playerUnavailability."""
    if req.method == 'OPTIONS':
        return https_fn.Response('', status=204, headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        })
    cors_headers = {'Access-Control-Allow-Origin': '*'}

    ok, reason = require_admin(req)
    if not ok:
        return https_fn.Response(
            json.dumps({'error': reason}), status=401,
            mimetype='application/json', headers=cors_headers
        )

    body = req.get_json(silent=True) or {}
    entries = body.get('entries', [])
    new_aliases = body.get('aliases', {})
    db = _get_db()
    batch = db.batch()
    written = 0
    seen_by_round = {}  # round_id → set of sheet_names

    for e in entries:
        player_id = str(e['player_id'])
        round_id  = str(e['round_id'])
        day       = e['day']           # 'sat', 'sun', 'both'
        sheet_name = e.get('sheet_name', '')

        # Write to playerUnavailability — doc id = {round_id}_{player_id}
        doc_ref = db.collection('playerUnavailability').document(f'{round_id}_{player_id}')
        batch.set(doc_ref, {
            'playerId': player_id,
            'roundId': round_id,
            'days': day,
            'source': 'sheet_sync',
            'syncedAt': datetime.utcnow().isoformat(),
        }, merge=True)

        # Track seen names per round
        if round_id not in seen_by_round:
            seen_by_round[round_id] = set(_get_seen_names(db, round_id))
        seen_by_round[round_id].add(sheet_name)
        written += 1

    # Update seenNames for each round touched
    for round_id, names in seen_by_round.items():
        sync_ref = db.collection('unavailabilitySyncs').document(round_id)
        batch.set(sync_ref, {
            'seenNames': list(names),
            'lastSynced': datetime.utcnow().isoformat(),
        }, merge=True)

    # Save new alias resolutions
    if new_aliases:
        alias_ref = db.collection('config').document('nameAliases')
        batch.set(alias_ref, new_aliases, merge=True)

    batch.commit()

    return https_fn.Response(
        json.dumps({'ok': True, 'written': written}),
        status=200, mimetype='application/json', headers=cors_headers
    )

