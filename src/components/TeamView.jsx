import { useState, useEffect, useMemo } from 'react'
import { getTeamPlayers, getRounds, getRoundMatches, getHvSync, getHvLadders } from '../db'
import { HV_LINKS } from './hvLinks'
import HvAliasPanel from './HvAliasPanel'
import TeamPollsStrip from './TeamPollsStrip'
import PageHeader from './PageHeader'
import { TEAM_FULL_NAMES } from './roundUtils'

async function fetchTeamRecord(teamId) {
  const rounds = await getRounds()
  const seasonRounds = rounds.filter(r => r.round_type === 'season')
  let W = 0, D = 0, L = 0, GF = 0, GA = 0
  await Promise.all(seasonRounds.map(async r => {
    const matches = await getRoundMatches(r.id)
    const m = matches.find(m => m.team_id === teamId)
    if (!m?.result) return
    if (m.result === 'Win')  W++
    if (m.result === 'Draw') D++
    if (m.result === 'Loss') L++
    if (m.score_for     != null) GF += m.score_for
    if (m.score_against != null) GA += m.score_against
  }))
  return { W, D, L, GF, GA, played: W + D + L }
}

function ordinal(n) {
  if (!n) return '—'
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function cardPoints(s26) {
  if (!s26) return 0
  return (
    (s26.greenCards || 0) * 1 +
    (s26.yellowCards || 0) * 2 +
    (s26.redCards || 0) * 3
  )
}

function squadHasPerTeamStats(players) {
  return (players || []).some(p => Object.keys(p.stats_2026_by_team || {}).length > 0)
}

function teamStats(player, teamId, players) {
  const byTeam = player.stats_2026_by_team
  if (byTeam && teamId in byTeam) return byTeam[teamId]
  // Per-team stats backfilled — missing entry means zero for this team
  if (squadHasPerTeamStats(players)) return null
  // Pre-backfill fallback: show season totals until stats2026ByTeam is populated
  if ((player.games_played_2026?.[teamId] || 0) > 0) return player.stats_2026
  return null
}

function compareSquadPlayer(a, b, teamId, col, players) {
  if (col === 'name') return a.name.localeCompare(b.name)
  if (col === 'gp') {
    return (b.games_played_2026?.[teamId] || 0) - (a.games_played_2026?.[teamId] || 0)
  }
  if (col === 'goals') {
    return (teamStats(b, teamId, players)?.goals || 0) - (teamStats(a, teamId, players)?.goals || 0)
  }
  if (col === 'cardPts') {
    return cardPoints(teamStats(b, teamId, players)) - cardPoints(teamStats(a, teamId, players))
  }
  return 0
}

function sortSquadPlayers(list, teamId, col, dir) {
  return [...list].sort((a, b) => {
    const cmp = compareSquadPlayer(a, b, teamId, col, list)
    return dir === 'asc' ? cmp : -cmp
  })
}

function computeTeamLeaders(players, teamId) {
  let topScorer = null
  let mostGames = null
  let discipline = null

  for (const player of players || []) {
    const s26 = teamStats(player, teamId, players)
    const goals = s26?.goals || 0
    const gp = player.games_played_2026?.[teamId] || 0
    const pts = cardPoints(s26)

    if (goals > 0 && (!topScorer || goals > topScorer.value || (goals === topScorer.value && player.name < topScorer.name))) {
      topScorer = { name: player.name, value: goals, subtitle: `${goals} goal${goals === 1 ? '' : 's'} this season` }
    }
    if (gp > 0 && (!mostGames || gp > mostGames.value || (gp === mostGames.value && player.name < mostGames.name))) {
      mostGames = { name: player.name, value: gp, subtitle: `${gp} appearance${gp === 1 ? '' : 's'}` }
    }
    if (pts > 0 && (!discipline || pts > discipline.value || (pts === discipline.value && player.name < discipline.name))) {
      discipline = { name: player.name, value: pts, subtitle: `${pts} card point${pts === 1 ? '' : 's'}` }
    }
  }

  return { topScorer, mostGames, discipline }
}

function fmtDate(dateStr, opts) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', opts)
  } catch { return '' }
}

function formatFixtureTime(t) {
  if (!t) return ''
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr || '0', 10)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

function formatOpponentLabel(match) {
  if (!match?.opponent) return 'TBC'
  const isHome = match?.is_home ?? match?.venue?.toLowerCase().includes('mentone') ?? false
  return `${match.opponent} (${isHome ? 'Home' : 'Away'})`
}

function shortVenue(venue) {
  return (venue || '')
    .replace('Hockey Centre', 'HC')
    .replace('Playing Fields', 'Oval')
    .replace('Secondary College', 'SC')
}

function FixtureResultPill({ match }) {
  if (!match?.opponent) {
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400">—</span>
  }
  if (!match.result) {
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Upcoming</span>
  }
  const cfg = {
    Win:  { bg: '#dcfce7', text: '#15803d', label: 'W' },
    Loss: { bg: '#fee2e2', text: '#dc2626', label: 'L' },
    Draw: { bg: '#fef3c7', text: '#b45309', label: 'D' },
  }[match.result] || { bg: '#f1f5f9', text: '#475569', label: '?' }
  const score = (match.score_for != null && match.score_against != null)
    ? `${match.score_for}–${match.score_against}`
    : ''
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-bold tabular-nums"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      {[score, cfg.label].filter(Boolean).join(' ')}
    </span>
  )
}

function TeamSelectorCards({ teams, selectedTeam, ladderPositions, onSelectTeam }) {
  const visibleTeams = teams.filter(t => t.id !== 'NEW')
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
      {visibleTeams.map(t => {
        const selected = selectedTeam === t.id
        const pos = ladderPositions[t.id] ?? null
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTeam(t.id)}
            className={`min-w-[9.5rem] flex-shrink-0 rounded-xl border px-3 py-2.5 text-left transition-all ${
              selected
                ? 'border-slate-800 bg-slate-800 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className={`text-sm font-bold tracking-wide ${selected ? 'text-white' : 'text-slate-800'}`}>
              {t.id}
            </div>
            <div className={`mt-0.5 text-[11px] leading-tight ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
              {TEAM_FULL_NAMES[t.id] || t.name || t.id}
            </div>
            <div className={`mt-1 text-xs font-semibold ${selected ? 'text-blue-200' : 'text-slate-400'}`}>
              {ordinal(pos)}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SeasonStatsBar({ record }) {
  const stats = [
    { label: 'Played', val: record?.played ?? '—', color: 'text-slate-800' },
    { label: 'Won',    val: record?.W     ?? '—', color: 'text-green-600'  },
    { label: 'Drawn',  val: record?.D     ?? '—', color: 'text-amber-500'  },
    { label: 'Lost',   val: record?.L     ?? '—', color: 'text-red-500'    },
    {
      label: 'Goals',
      val: record?.played > 0 ? `${record.GF}–${record.GA}` : '—',
      color: 'text-slate-600',
    },
  ]

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div style={{ background: '#eab308', height: '3px' }} />
      <div className="grid grid-cols-5 divide-x divide-slate-100 text-center">
        {stats.map(({ label, val, color }) => (
          <div key={label} className="px-2 py-3 sm:px-4">
            <div className={`text-xl font-black tabular-nums sm:text-2xl ${color}`}>{val}</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-xs">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeaderHighlightCard({ label, leader, accent }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div style={{ background: accent.bar, height: '3px' }} />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">
            {leader?.name || '—'}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {leader?.subtitle || 'No data yet'}
          </div>
        </div>
        <div
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl font-black tabular-nums text-white"
          style={{ background: accent.bg }}
        >
          {leader?.value ?? '—'}
        </div>
      </div>
    </div>
  )
}

function TeamFixturesList({ teamId, refreshKey }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      const rounds = await getRounds()
      const season = rounds
        .filter(r => r.round_type === 'season')
        .sort((a, b) => (a.round_number || 0) - (b.round_number || 0))

      const withMatches = await Promise.all(season.map(async round => {
        const matches = await getRoundMatches(round.id)
        const match = matches.find(m => m.team_id === teamId) || null
        return { round, match }
      }))

      if (!cancelled) {
        setRows(withMatches)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [teamId, refreshKey])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">Fixtures &amp; Results</h3>
        <p className="mt-0.5 text-xs text-slate-500">Full season schedule for this team</p>
      </div>
      {loading ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">Loading fixtures…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">No season rounds found.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map(({ round, match }) => {
            const dateLabel = fmtDate(match?.match_date || round.sat_date, { day: 'numeric', month: 'short' })
            const timeLabel = formatFixtureTime(match?.time)
            const venueLabel = shortVenue(match?.venue)
            const meta = [dateLabel, timeLabel, venueLabel].filter(Boolean).join(' · ')

            return (
              <div key={round.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 flex-shrink-0 text-xs font-bold text-slate-400">
                  R{round.round_number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {formatOpponentLabel(match)}
                  </div>
                  {meta && <div className="mt-0.5 truncate text-xs text-slate-400">{meta}</div>}
                </div>
                <div className="flex-shrink-0">
                  <FixtureResultPill match={match} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function TeamLeaderboard({ teamData, teamId, sort, onSort, onSelectPlayer }) {
  const played = teamData?.playedForTeam || []
  const assigned = teamData?.assignedNotYetPlayed || []
  const sortedPlayed = sortSquadPlayers(played, teamId, sort.col, sort.dir)

  const headerCls = 'px-3 py-2.5 text-xs font-semibold text-slate-500 cursor-pointer hover:bg-slate-50 select-none'

  const toggleSort = (col) => {
    onSort(prev =>
      prev.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: col === 'name' ? 'asc' : 'desc' },
    )
  }

  const renderRow = (player, muted = false) => {
    const gp = player.games_played_2026?.[teamId] || 0
    const s26 = teamStats(player, teamId, played)
    const hasCards = s26 && (s26.greenCards > 0 || s26.yellowCards > 0 || s26.redCards > 0)

    return (
      <tr
        key={player.id}
        onClick={() => onSelectPlayer?.(player)}
        className={`cursor-pointer transition-colors hover:bg-slate-50 ${muted ? 'text-slate-400' : ''}`}
      >
        <td className="px-3 py-2.5 text-sm font-medium text-slate-800">
          <span className="inline-flex items-center gap-1.5">
            <span className={muted ? 'text-slate-500' : ''}>{player.name}</span>
            {player.is_not_financial === 1 && (
              <sup className="text-[10px] font-bold text-amber-500 align-super" title="Not financial">$</sup>
            )}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums">
          {gp > 0 ? gp : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5 text-right text-sm tabular-nums">
          {s26?.goals > 0 ? s26.goals : <span className="text-slate-300">—</span>}
        </td>
        <td className="px-3 py-2.5">
          {hasCards ? (
            <span className="flex items-center gap-1">
              {s26.greenCards  > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white" style={{ background: '#16a34a' }}>{s26.greenCards}</span>}
              {s26.yellowCards > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white" style={{ background: '#ca8a04' }}>{s26.yellowCards}</span>}
              {s26.redCards    > 0 && <span className="inline-flex h-5 w-5 items-center justify-center rounded text-xs font-bold text-white" style={{ background: '#dc2626' }}>{s26.redCards}</span>}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">Team Leaderboard</h3>
        <p className="mt-0.5 text-xs text-slate-500">Season stats for players who have appeared</p>
      </div>
      {played.length === 0 && assigned.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-400">No players on this team yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px]">
            <thead className="border-b border-slate-100 bg-slate-50/80">
              <tr>
                <th onClick={() => toggleSort('name')} className={`${headerCls} text-left`}>
                  Player{sort.col === 'name' && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th onClick={() => toggleSort('gp')} className={`${headerCls} w-12 text-right`}>
                  GP{sort.col === 'gp' && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th onClick={() => toggleSort('goals')} className={`${headerCls} w-14 text-right`}>
                  Goals{sort.col === 'goals' && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
                <th onClick={() => toggleSort('cardPts')} className={`${headerCls} w-20 text-left`}>
                  Cards{sort.col === 'cardPts' && <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPlayed.map(player => renderRow(player))}
              {assigned.map(player => renderRow(player, true))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HvLinksRow({ teamId }) {
  const links = HV_LINKS[teamId]
  if (!links) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hockey Victoria</span>
      <a href={links.teamUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600">
        Team ↗
      </a>
      <a href={links.compUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600">
        Fixtures ↗
      </a>
      <a href={links.ladderUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:text-blue-600">
        Ladder ↗
      </a>
    </div>
  )
}

export default function TeamView({ teams, selectedTeam, onSelectTeam, onSelectPlayer, refreshKey, isAdmin, userEmail, onViewAllPolls }) {
  const [teamData, setTeamData] = useState(null)
  const [record, setRecord] = useState(null)
  const [ladderPositions, setLadder] = useState({})
  const [loading, setLoading] = useState(true)
  const [leaderSort, setLeaderSort] = useState({ col: 'goals', dir: 'desc' })

  const team = teams.find(t => t.id === selectedTeam)

  useEffect(() => {
    let isMounted = true

    async function loadLadderPositions() {
      let ladders = null
      try {
        const ladderSync = await getHvLadders()
        ladders = ladderSync?.ladders || null
      } catch {
        ladders = null
      }

      if (!ladders) {
        try {
          const latestSync = await getHvSync()
          ladders = latestSync?.ladders || null
        } catch {
          ladders = null
        }
      }

      if (isMounted && ladders) {
        setLadder(Object.fromEntries(
          Object.entries(ladders).map(([teamId, data]) => [teamId, data?.position ?? null]),
        ))
      }
    }

    loadLadderPositions()
    return () => { isMounted = false }
  }, [])

  useEffect(() => {
    setLoading(true)
    setRecord(null)
    Promise.all([
      getTeamPlayers(selectedTeam),
      fetchTeamRecord(selectedTeam),
    ]).then(([data, rec]) => {
      setTeamData(data)
      setRecord(rec)
      setLoading(false)
    })
  }, [selectedTeam, refreshKey])

  useEffect(() => {
    setLeaderSort({ col: 'goals', dir: 'desc' })
  }, [selectedTeam])

  const leaders = useMemo(
    () => computeTeamLeaders(teamData?.playedForTeam, selectedTeam),
    [teamData?.playedForTeam, selectedTeam],
  )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Teams"
        description="Select a team to see its record, season leaders, and full fixture list."
      />

      <TeamSelectorCards
        teams={teams}
        selectedTeam={selectedTeam}
        ladderPositions={ladderPositions}
        onSelectTeam={onSelectTeam}
      />

      <SeasonStatsBar record={record} />

      <HvLinksRow teamId={selectedTeam} />

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400 shadow-sm">
          Loading team data…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <LeaderHighlightCard
              label="Top Scorer"
              leader={leaders.topScorer}
              accent={{ bar: '#2563eb', bg: '#2563eb' }}
            />
            <LeaderHighlightCard
              label="Most Games"
              leader={leaders.mostGames}
              accent={{ bar: '#16a34a', bg: '#16a34a' }}
            />
            <LeaderHighlightCard
              label="Discipline"
              leader={leaders.discipline}
              accent={{ bar: '#eab308', bg: '#ca8a04' }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <TeamFixturesList teamId={selectedTeam} refreshKey={refreshKey} />
            </div>
            <div className="lg:col-span-2">
              <TeamLeaderboard
                teamData={teamData}
                teamId={selectedTeam}
                sort={leaderSort}
                onSort={setLeaderSort}
                onSelectPlayer={onSelectPlayer}
              />
            </div>
          </div>
        </>
      )}

      <TeamPollsStrip
        teamId={selectedTeam}
        teamName={team?.name || selectedTeam}
        teamPlayers={teamData?.squad2026 || []}
        isAdmin={isAdmin}
        userEmail={userEmail}
        onViewAllPolls={onViewAllPolls}
      />

      {isAdmin && <HvAliasPanel />}
    </div>
  )
}
