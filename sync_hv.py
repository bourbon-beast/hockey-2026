#!/usr/bin/env python3
"""
sync_hv.py — Weekly HV scraper + Firestore updater
Scrapes Hockey Victoria for the 6 Mentone men's comps, writes results
(scoreFor, scoreAgainst, result, scorers) to Firestore, and outputs
a text/email digest.

Run from the project root (Tuesday or Wednesday after weekend games):
    pip install firebase-admin requests beautifulsoup4
    python sync_hv.py
    python sync_hv.py --dry-run          # preview without writing
    python sync_hv.py --format json      # JSON output instead of text
    python sync_hv.py --comp PL          # single competition only
"""

import re
import sys
import json
import argparse
from datetime import date, datetime

import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore as fs

# ── Configuration ─────────────────────────────────────────────────────────────

SERVICE_ACCOUNT = 'hockey-2026-f521f-firebase-adminsdk-fbsvc-6c421c359a.json'

ENV_CONFIG = {
    'prod': {
        'service_account': 'hockey-2026-f521f-firebase-adminsdk-fbsvc-6c421c359a.json',
        'project_id':      'hockey-2026-f521f',
    },
    'uat': {
        'service_account': 'hockey-2026-uat-firebase-adminsdk.json',  # download from Firebase console
        'project_id':      'hockey-2026-uat',
    },
}

BASE_URL = 'https://www.hockeyvictoria.org.au'
HEADERS  = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
                  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# Rounds that are MPL-only (midweek) — no games for other comps
MPL_ONLY_ROUNDS = {19, 20, 21, 22}

COMPETITIONS = [
    {'name': "Premier League",          'short': 'MPL',  'team_id': 'PL',
     'team_url': f'{BASE_URL}/games/team/25879/409898'},
    {'name': "Premier League Reserves", 'short': 'MPLR', 'team_id': 'PLR',
     'team_url': f'{BASE_URL}/games/team/25879/412426'},
    {'name': "Pennant B",               'short': 'MPB',  'team_id': 'PB',
     'team_url': f'{BASE_URL}/games/team/25879/412423'},
    {'name': "Pennant C",               'short': 'MPC',  'team_id': 'PC',
     'team_url': f'{BASE_URL}/games/team/25879/412424'},
    {'name': "Metro 2 South",           'short': 'M2S',  'team_id': 'Metro',
     'team_url': f'{BASE_URL}/games/team/25879/412422'},
    {'name': "Pennant E",               'short': 'MPE',  'team_id': 'PE',
     'team_url': f'{BASE_URL}/games/team/25879/412425'},
]


# ── Scrapers ──────────────────────────────────────────────────────────────────

def fetch_soup(url: str) -> BeautifulSoup:
    resp = requests.get(url, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, 'html.parser')


def clean_opponent(raw: str) -> str:
    """Strip competition prefix: 'Mens PL - 2026 Doncaster HC' → 'Doncaster HC'"""
    m = re.search(r' - 20\d\d (.+)$', raw)
    return m.group(1).strip() if m else raw.strip()


def parse_team_page(team_url: str) -> list[dict]:
    """
    Returns list of round dicts for a team page.

    HV HTML structure (confirmed via debug):
    - Round label is in <b>Round N</b>, NOT <strong>
    - Each round lives inside a parent <div class="card ..."> or similar
      that contains one or more <div class="row align-items-center"> blocks:
        Block 1: round label + date/time
        Block 2: venue link + field code
        Block 3 (played): status ("Played"), opponent link, score, result, detail link
        Block 3 (upcoming): status ("Playing"), opponent link, detail link
    - /game/ links use FULL URLs (https://...), not relative paths
    """
    soup = fetch_soup(team_url)
    rounds = []
    seen = set()

    # Find every <b> whose text is exactly "Round N"
    for b_tag in soup.find_all('b'):
        text = b_tag.get_text(strip=True)
        m = re.match(r'^Round\s+(\d+)$', text)
        if not m:
            continue
        round_num = int(m.group(1))
        if round_num in seen:
            continue
        seen.add(round_num)

        # The <b> is inside a col-div inside a row-div.
        # Walk up to find the card-level container that holds ALL row blocks
        # for this round (date row + venue row + status/score row).
        # We need to go high enough to capture all three row blocks.
        container = b_tag.find_parent()
        for _ in range(10):
            if container is None:
                break
            # Stop when we have both a venue link AND a /games/team/ link
            # (that means we've captured the full round card)
            if (container.find('a', href=re.compile(r'/venues/')) and
                    container.find('a', href=re.compile(r'/games/team/'))):
                break
            container = container.find_parent()

        if container is None:
            continue

        block = container.get_text(separator='\n', strip=True)

        # ── Date + time ───────────────────────────────────────────────
        dm = re.search(
            r'(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}\s+\w{3}\s+\d{4})\s+(\d{1,2}:\d{2})',
            block
        )
        date_str = dm.group(1) if dm else None
        time_str = dm.group(2) if dm else None

        # ── Venue ─────────────────────────────────────────────────────
        venue_tag = container.find('a', href=re.compile(r'/venues/'))
        venue = venue_tag.get_text(strip=True) if venue_tag else None

        # ── Field code — lives in a <div> immediately after the venue <a> ─
        field = None
        if venue_tag:
            nxt = venue_tag.find_next_sibling()
            if nxt:
                s = nxt.get_text(strip=True)
                if s and len(s) <= 6:
                    field = s

        # ── Status ────────────────────────────────────────────────────
        status = 'played' if 'Played' in block else 'upcoming'

        # ── Opponent ──────────────────────────────────────────────────
        opp_tag  = container.find('a', href=re.compile(r'/games/team/'))
        opponent = clean_opponent(opp_tag.get_text(strip=True)) if opp_tag else None

        # ── Home / Away ───────────────────────────────────────────────
        is_home = 'Mentone' in (venue or '')

        # ── Score & result ────────────────────────────────────────────
        # Scores are plain text nodes: "0\n  -\n  4"
        # Don't use home/away to assign scores — venue name is unreliable
        # (neutral venues like Parkville break it). Use Win/Loss directly:
        #   Win  → Mentone score is the higher number
        #   Loss → Mentone score is the lower number
        #   Draw → both equal, order irrelevant
        score_mentone = score_opponent = None
        result = None
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
                    # Draw or unknown — both equal anyway
                    score_mentone, score_opponent = a, b

        # ── Game detail URL — full URL on HV ──────────────────────────
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


def parse_scorers(game_url: str) -> list[str]:
    """Fetch game detail page, return Mentone scorer strings e.g. ['First Last', 'Name (2)']"""
    try:
        soup = fetch_soup(game_url)
    except Exception as e:
        print(f"    ⚠️  Couldn't fetch game detail: {e}", file=sys.stderr)
        return []

    # Match card uses <h5> for team headers
    for h5 in soup.find_all('h5'):
        if 'mentone' in h5.get_text(strip=True).lower():
            table = h5.find_next('table')
            if not table:
                break
            scorers = []
            for row in table.find_all('tr')[1:]:
                cells = row.find_all('td')
                if len(cells) < 2:
                    continue
                name_raw  = cells[0].get_text(strip=True)
                goals_raw = cells[1].get_text(strip=True)
                if not (goals_raw and re.match(r'^\d+$', goals_raw)):
                    continue
                goals = int(goals_raw)
                if goals < 1:
                    continue
                # Name format: "1. Last, First (#7)" → flip to "First Last"
                nm = re.match(r'\d+\.\s*([^(#]+)', name_raw)
                if nm:
                    raw = nm.group(1).strip().rstrip(',').strip()
                    name = (f"{raw.split(',')[1].strip()} {raw.split(',')[0].strip()}"
                            if ',' in raw else raw)
                    scorers.append(name if goals == 1 else f"{name} ({goals})")
            return scorers
    return []


# ── Firestore helpers ─────────────────────────────────────────────────────────

def load_round_map(db) -> dict:
    """Returns {roundNumber: firestoreDocId} for all season rounds."""
    result = {}
    for r in db.collection('rounds').stream():
        d = r.to_dict()
        if d.get('roundType') == 'season' and d.get('roundNumber') is not None:
            result[int(d['roundNumber'])] = r.id
    return result


def write_result_to_firestore(db, round_doc_id: str, team_id: str, game: dict,
                               scorers: list[str], dry_run: bool) -> None:
    """Write result fields to rounds/{roundDocId}/matches/{teamId}.
    scoreFor/scoreAgainst are always from Mentone's perspective."""
    update = {
        'scoreFor':     game['score_mentone'],
        'scoreAgainst': game['score_opponent'],
        'result':       game['result'] or '',
        'scorers':      scorers,
        'hvGameUrl':    game['detail_url'] or '',
        'hvLastSync':   datetime.utcnow().isoformat() + 'Z',
    }
    if dry_run:
        print(f"    DRY  match/{team_id} → result={game['result']} "
              f"score={game['score_mentone']}-{game['score_opponent']} scorers={scorers}")
    else:
        (db.collection('rounds').document(round_doc_id)
           .collection('matches').document(team_id)
           .set(update, merge=True))


def write_fixture_to_firestore(db, round_doc_id: str, team_id: str, game: dict,
                                dry_run: bool) -> None:
    """Update fixture fields (venue/time may have changed on HV)."""
    update = {
        'venue':     game['venue'] or '',
        'time':      game['time_str'] or '',
        'matchDate': _parse_date(game['date_str']),
        'opponent':  game['opponent'] or '',
        'hvLastSync': datetime.utcnow().isoformat() + 'Z',
    }
    if dry_run:
        print(f"    DRY  match/{team_id} fixture → {game['date_str']} {game['time_str']} "
              f"vs {game['opponent']} @ {game['venue']}")
    else:
        (db.collection('rounds').document(round_doc_id)
           .collection('matches').document(team_id)
           .set(update, merge=True))


def _parse_date(date_str: str | None) -> str:
    if not date_str:
        return ''
    try:
        return datetime.strptime(date_str, '%d %b %Y').strftime('%Y-%m-%d')
    except Exception:
        return ''


# ── Text output formatter ─────────────────────────────────────────────────────

RESULT_EMOJI = {'Win': '✅', 'Loss': '❌', 'Draw': '🟡'}

def format_date_nice(date_str: str, time_str: str) -> str:
    """Format '11 Apr 2026' + '13:30' → 'Saturday 11 Apr @ 13:30'"""
    try:
        dt = datetime.strptime(date_str, '%d %b %Y')
        day_name = dt.strftime('%A')
        return f"{day_name} {date_str} @ {time_str}" if time_str else f"{day_name} {date_str}"
    except Exception:
        return f"{date_str} {time_str or ''}".strip()


def format_text(summaries: list[dict]) -> str:
    today = date.today().strftime('%d %b %Y')
    lines = [
        f"Mentone Hockey Club — Weekly Update",
        f"Week of {today}",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "RESULTS",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ]

    for s in summaries:
        r = s.get('last_result')
        if s.get('error'):
            lines.append(f"\n{s['name']}: Error — {s['error']}")
            continue
        if not r:
            lines.append(f"\n{s['name']}: Season not started yet")
            continue

        # Always show Mentone score first regardless of home/away
        score = (f"{r['score_mentone']}–{r['score_opponent']}"
                 if r['score_mentone'] is not None else '--')
        ha     = 'Home' if r['is_home'] else 'Away'
        result = r['result'] or 'Not entered'

        lines.append(f"\n{s['name']} | Round {r['round']}")
        lines.append(f"Result: {result} ({ha}) against {r['opponent']}")
        lines.append(f"Score:  {score}")

        scorers = s.get('scorers', [])
        if scorers:
            lines.append(f"Goals:  {', '.join(scorers)}")
        else:
            lines.append("Goals:  --")

    lines += [
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "NEXT ROUND",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ]
    for s in summaries:
        f = s.get('next_fixture')
        if not f:
            continue
        ha    = 'Home' if f['is_home'] else 'Away'
        venue = (f['venue'] or 'TBC').replace('Hockey Centre', 'HC').replace('Playing Fields', 'Oval')
        when  = format_date_nice(f['date_str'], f['time_str']) if f['date_str'] else 'TBC'
        lines.append(f"\n{s['name']} | Round {f['round']}")
        lines.append(f"Playing: {f['opponent']} @ {venue} [{f['field'] or ''}]")
        lines.append(f"When:    {when}")

    lines.append("")
    return "\n".join(lines)


# ── HTML output formatter (for Gmail rich-text paste) ─────────────────────────

RESULT_COLOUR = {'Win': '#16a34a', 'Loss': '#dc2626', 'Draw': '#ca8a04'}

def format_html(summaries: list[dict]) -> str:
    today = date.today().strftime('%d %b %Y')

    # Shared inline styles — no external CSS so Gmail renders it correctly
    S = {
        'wrap':    'font-family:Arial,sans-serif;font-size:14px;color:#1e293b;max-width:600px;',
        'h1':      'font-size:18px;font-weight:bold;margin:0 0 2px 0;',
        'sub':     'font-size:12px;color:#64748b;margin:0 0 16px 0;',
        'rule':    'border:none;border-top:2px solid #1e3a8a;margin:16px 0 8px 0;',
        'section': 'font-size:13px;font-weight:bold;text-transform:uppercase;'
                   'letter-spacing:0.05em;color:#1e3a8a;margin:0 0 12px 0;',
        'block':   'margin:0 0 16px 0;padding:0;',
        'comp':    'font-size:14px;font-weight:bold;margin:0 0 3px 0;',
        'label':   'font-weight:bold;',
        'muted':   'color:#64748b;',
        'badge_w': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;'
                   'font-weight:bold;color:#fff;background:#16a34a;',
        'badge_l': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;'
                   'font-weight:bold;color:#fff;background:#dc2626;',
        'badge_d': 'display:inline-block;padding:1px 7px;border-radius:3px;font-size:12px;'
                   'font-weight:bold;color:#fff;background:#ca8a04;',
    }

    def badge(result):
        st = {'Win': S['badge_w'], 'Loss': S['badge_l'], 'Draw': S['badge_d']}.get(result, S['badge_d'])
        return f'<span style="{st}">{result}</span>'

    def row(label, value):
        return (f'<tr><td style="{S["label"]}width:70px;padding:1px 8px 1px 0;">{label}</td>'
                f'<td style="padding:1px 0;">{value}</td></tr>')

    parts = [f'<div style="{S["wrap"]}">',
             f'<p style="{S["h1"]}">Mentone Hockey Club — Weekly Update</p>',
             f'<p style="{S["sub"]}">Week of {today}</p>',
             f'<hr style="{S["rule"]}">',
             f'<p style="{S["section"]}">Results</p>']

    # Figure out which round number the "next fixture" group is
    next_rounds = [s["next_fixture"]["round"] for s in summaries
                   if s.get("next_fixture")]
    next_round_num = next_rounds[0] if next_rounds else None

    for s in summaries:
        r = s.get('last_result')
        if s.get('error'):
            parts.append(f'<div style="{S["block"]}"><p style="{S["comp"]}">{s["name"]}</p>'
                         f'<p style="{S["muted"]}">Error fetching data</p></div>')
            continue
        if not r:
            parts.append(f'<div style="{S["block"]}"><p style="{S["comp"]}">{s["name"]}</p>'
                         f'<p style="{S["muted"]}">Season not started yet</p></div>')
            continue

        score  = (f"{r['score_mentone']}–{r['score_opponent']}"
                  if r['score_mentone'] is not None else '–')
        ha     = 'Home' if r['is_home'] else 'Away'
        result = r['result'] or 'Not entered'
        scorers = s.get('scorers', [])
        goals_val = ', '.join(scorers) if scorers else '–'

        opp      = r['opponent']
        round_n  = r['round']
        parts.append(
            f'<div style="{S["block"]}">'
            f'<p style="{S["comp"]}">{s["name"]} &nbsp;·&nbsp; Round {round_n} &nbsp;'
            f'{badge(result)}</p>'
            f'<table style="border-collapse:collapse;">'
            f'{row("Result:", f"{result} ({ha}) against {opp}")}'
            f'{row("Score:", score)}'
            f'{row("Goals:", goals_val)}'
            f'</table></div>'
        )

    # Next round section
    if next_round_num:
        parts += [f'<hr style="{S["rule"]}">',
                  f'<p style="{S["section"]}">Next Round — Round {next_round_num}</p>']

        for s in summaries:
            f = s.get('next_fixture')
            if not f:
                continue
            venue = (f['venue'] or 'TBC').replace('Hockey Centre', 'HC').replace('Playing Fields', 'Oval')
            when  = format_date_nice(f['date_str'], f['time_str']) if f['date_str'] else 'TBC'
            field = f'[{f["field"]}]' if f.get('field') else ''

            opp_name  = f['opponent']
            field_str = f'[{f["field"]}]' if f.get('field') else ''
            parts.append(
                f'<div style="{S["block"]}">'
                f'<p style="{S["comp"]}">{s["name"]}</p>'
                f'<table style="border-collapse:collapse;">'
                f'{row("Playing:", f"{opp_name} @ {venue} {field_str}")}'
                f'{row("When:", when)}'
                f'</table></div>'
            )

    parts.append('</div>')
    return '\n'.join(parts)

def main():
    parser = argparse.ArgumentParser(description='Sync HV results to Firestore')
    parser.add_argument('--env',      choices=['prod', 'uat'], default='uat',
                        help='Target environment (default: uat — use --env prod to write to production)')
    parser.add_argument('--dry-run',  action='store_true', help='Preview without writing')
    parser.add_argument('--format',   choices=['text', 'json'], default='text')
    parser.add_argument('--comp',     choices=[c['short'] for c in COMPETITIONS] + ['all'],
                        default='all', help='Single comp or all (default)')
    parser.add_argument('--no-firebase', action='store_true',
                        help='Skip Firestore entirely — just scrape and print')
    parser.add_argument('--debug', action='store_true',
                        help='Dump raw HTML and parse diagnostics to debug_hv.html')
    args = parser.parse_args()

    env = ENV_CONFIG[args.env]
    print(f"🎯 Target: {args.env.upper()} ({env['project_id']})", file=sys.stderr)

    # Init Firestore (unless skipped)
    db = round_map = None
    if not args.no_firebase:
        cred = credentials.Certificate(env['service_account'])
        firebase_admin.initialize_app(cred)
        db = fs.client()
        print("📋 Loading rounds from Firestore...", file=sys.stderr)
        round_map = load_round_map(db)
        print(f"   {len(round_map)} season rounds loaded", file=sys.stderr)

    comps = (COMPETITIONS if args.comp == 'all'
             else [c for c in COMPETITIONS if c['short'] == args.comp])

    # Debug mode — dump raw HTML and diagnose parsing
    if args.debug:
        comp = comps[0]
        print(f"\n🔍 DEBUG: fetching {comp['team_url']}", file=sys.stderr)
        resp = requests.get(comp['team_url'], headers=HEADERS, timeout=20)
        html = resp.text
        with open('debug_hv.html', 'w', encoding='utf-8') as f:
            f.write(html)
        soup_d = BeautifulSoup(html, 'html.parser')

        print(f"\n--- Basic counts ---", file=sys.stderr)
        print(f"  HTML size:              {len(html):,} bytes", file=sys.stderr)
        print(f"  <strong> tags:          {len(soup_d.find_all('strong'))}", file=sys.stderr)
        print(f"  /game/ links (strict):  {len(soup_d.find_all('a', href=re.compile(r'^/game/\d+$')))}", file=sys.stderr)
        print(f"  /game/ links (loose):   {len(soup_d.find_all('a', href=re.compile(r'/game/')))}", file=sys.stderr)
        print(f"  /venues/ links:         {len(soup_d.find_all('a', href=re.compile(r'/venues/')))}", file=sys.stderr)
        print(f"  /games/team/ links:     {len(soup_d.find_all('a', href=re.compile(r'/games/team/')))}", file=sys.stderr)

        print(f"\n--- Elements containing 'Round N' text ---", file=sys.stderr)
        for node in soup_d.find_all(string=re.compile(r'^\s*Round\s+\d+\s*$')):
            p = node.parent
            gp = p.find_parent() if p else None
            print(f"  Text: '{node.strip()}' | <{p.name} class={p.get('class',[])}> | "
                  f"grandparent: <{gp.name if gp else '?'} class={gp.get('class',[]) if gp else []}>",
                  file=sys.stderr)

        print(f"\n--- First venue link + surrounding HTML ---", file=sys.stderr)
        first_venue = soup_d.find('a', href=re.compile(r'/venues/'))
        if first_venue:
            container = first_venue.find_parent()
            for _ in range(6):
                if container is None: break
                txt = container.get_text(' ', strip=True)
                if re.search(r'Round\s+\d+', txt):
                    break
                container = container.find_parent()
            if container:
                html_snippet = str(container)[:800]
                print(f"  Container: <{container.name} class={container.get('class',[])}>\n"
                      f"  HTML (first 800 chars):\n{html_snippet}", file=sys.stderr)

        print(f"\n--- First 5 /game/ loose links ---", file=sys.stderr)
        for a in soup_d.find_all('a', href=re.compile(r'/game/'))[:5]:
            print(f"  href={a['href']} | text={a.get_text(strip=True)[:40]}", file=sys.stderr)

        print(f"\n--- Played round container for R19/R20 ---", file=sys.stderr)
        # Find all b tags with "Round N" text and look at the played ones
        for b_tag in soup_d.find_all('b'):
            t = b_tag.get_text(strip=True)
            if not re.match(r'^Round\s+(19|20)$', t):
                continue
            # Walk up to the full card container
            cont = b_tag.find_parent()
            for _ in range(10):
                if cont is None: break
                if (cont.find('a', href=re.compile(r'/venues/')) and
                        cont.find('a', href=re.compile(r'/games/team/'))):
                    break
                cont = cont.find_parent()
            if cont is None:
                print(f"  {t}: container not found", file=sys.stderr)
                continue
            block_txt = cont.get_text(separator=' | ', strip=True)
            print(f"\n  {t} container <{cont.name} class={cont.get('class',[])}>\n"
                  f"  Text: {block_txt[:300]}", file=sys.stderr)
            # Show all tags with digit content
            print(f"  Digit-bearing tags:", file=sys.stderr)
            for tag in cont.find_all(True):
                txt = tag.get_text(strip=True)
                if re.match(r'^\d+$', txt) and len(txt) <= 3:
                    print(f"    <{tag.name} class={tag.get('class',[])}> → '{txt}'", file=sys.stderr)
            print(f"  HTML snippet (first 600):\n{str(cont)[:600]}", file=sys.stderr)
        return

    summaries = []
    for comp in comps:
        print(f"\n🌐 Fetching {comp['short']} — {comp['name']}...", file=sys.stderr)
        try:
            rounds = parse_team_page(comp['team_url'])
        except Exception as e:
            print(f"   ❌ Failed: {e}", file=sys.stderr)
            summaries.append({'name': comp['name'], 'short': comp['short'],
                               'error': str(e), 'last_result': None, 'next_fixture': None})
            continue

        played   = [r for r in rounds if r['status'] == 'played']
        upcoming = [r for r in rounds if r['status'] == 'upcoming']

        last_result  = played[-1]  if played   else None
        next_fixture = upcoming[0] if upcoming else None

        # Fetch scorers for last played game
        scorers = []
        if last_result and last_result.get('detail_url'):
            print(f"   ⚽ Fetching scorers for R{last_result['round']}...", file=sys.stderr)
            scorers = parse_scorers(last_result['detail_url'])

        # Write to Firestore
        if db and round_map and not args.no_firebase:
            # Write last result
            if last_result:
                doc_id = round_map.get(last_result['round'])
                if doc_id:
                    write_result_to_firestore(db, doc_id, comp['team_id'],
                                              last_result, scorers, args.dry_run)
                else:
                    print(f"   ⚠️  R{last_result['round']} not in Firestore round map",
                          file=sys.stderr)

            # Update upcoming fixture (venue/time may have changed on HV)
            if next_fixture:
                doc_id = round_map.get(next_fixture['round'])
                if doc_id:
                    write_fixture_to_firestore(db, doc_id, comp['team_id'],
                                               next_fixture, args.dry_run)

        summaries.append({
            'name':         comp['name'],
            'short':        comp['short'],
            'team_id':      comp['team_id'],
            'error':        None,
            'last_result':  last_result,
            'scorers':      scorers,
            'next_fixture': next_fixture,
        })

    # Serialise summaries (strips non-JSON-serialisable fields)
    def serialise(s):
        out = {k: v for k, v in s.items() if k not in ('last_result', 'next_fixture')}
        for key in ('last_result', 'next_fixture'):
            g = s.get(key)
            out[key] = (None if g is None else
                        {k: v for k, v in g.items() if k != 'parsed_dt'})
        return out

    text_output = format_text(summaries)
    html_output = format_html(summaries)
    serial_output = [serialise(s) for s in summaries]

    # Determine the round number this digest is for (next upcoming round)
    next_round_nums = [s['next_fixture']['round'] for s in summaries if s.get('next_fixture')]
    digest_round = next_round_nums[0] if next_round_nums else None

    # Write digest + structured data to Firestore hvSync/latest
    if db and not args.no_firebase and not args.dry_run:
        now_iso = datetime.utcnow().isoformat() + 'Z'
        db.collection('hvSync').document('latest').set({
            'syncedAt':  now_iso,
            'text':      text_output,
            'html':      html_output,
            'summaries': serial_output,
        })
        print("\n💾 Saved to Firestore hvSync/latest", file=sys.stderr)

        # Save versioned digest — keyed by round, overwrites if run again same week
        if digest_round is not None:
            doc_id = f'round_{digest_round}'
            db.collection('weeklyDigests').document(doc_id).set({
                'roundNumber': digest_round,
                'generatedAt': now_iso,
                'text':        text_output,
                'html':        html_output,
                'summaries':   serial_output,
            })
            print(f"💾 Saved to Firestore weeklyDigests/{doc_id}", file=sys.stderr)
        else:
            print("⚠️  No upcoming round found — weeklyDigests not written", file=sys.stderr)

    # Output
    if args.format == 'json':
        print(json.dumps(serial_output, indent=2))
    else:
        print(text_output)


if __name__ == '__main__':
    main()
