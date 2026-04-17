import { useState, useEffect } from 'react'
import { getTeamPlayers, getRounds, getRoundMatches, getHvSync } from '../db'
import { HV_LINKS } from './hvLinks'
import HvAliasPanel from './HvAliasPanel'
import { getVoteSession, getVoteResponses, tallyVotes } from '../db.votes'

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

function posColour(pos) {
  if (!pos) return '#94a3b8'
  if (pos <= 4) return '#16a34a'
  return '#64748b'
}

export default function TeamView({ teams, statuses, selectedTeam, onSelectTeam, onSelectPlayer, refreshKey, isAdmin }) {
  const [teamData, setTeamData]      = useState(null)
  const [record, setRecord]          = useState(null)
  const [ladderPositions, setLadder] = useState({})
  const [loading, setLoading]        = useState(true)
  const [activeTab, setActiveTab]    = useState('squad') // 'squad' | 'votes'

  // Votes state
  const [votesRoundList, setVotesRoundList]   = useState([])
  const [votesRound, setVotesRound]           = useState(null)
  const [votesRoundLoading, setVotesRoundLoading] = useState(false)

  const team = teams.find(t => t.id === selectedTeam)

  useEffect(() => {
    getHvSync().then(sync => {
      if (sync?.ladders) {
        const pos = {}
        Object.entries(sync.ladders).forEach(([teamId, data]) => {
          pos[teamId] = data.position ?? null
        })
        setLadder(pos)
      }
    })
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

  // Load rounds when votes tab is first opened
  useEffect(() => {
    if (activeTab !== 'votes') return
    if (votesRoundList.length > 0) return
    setVotesRoundLoading(true)
    getRounds().then(rounds => {
      const season = rounds
        .filter(r => r.round_type === 'season')
        .sort((a, b) => {
          // Sort by sat_date ascending, fall back to round_number
          const aDate = a.sat_date || a.round_date || ''
          const bDate = b.sat_date || b.round_date || ''
          if (aDate && bDate) return aDate.localeCompare(bDate)
          return (a.round_number || 0) - (b.round_number || 0)
        })
      setVotesRoundList(season)
      // Default to most recent round
      if (season.length > 0 && !votesRound) {
        const last = season[season.length - 1]
        setVotesRound({ id: last.id, label: `Round ${last.round_number}` })
      }
      setVotesRoundLoading(false)
    })
  }, [activeTab, selectedTeam])

  // Reset votes state when team changes
  useEffect(() => {
    setVotesRoundList([])
    setVotesRound(null)
  }, [selectedTeam])

  return (
    <div className="space-y-4">
      {/* ── Ladder position strip ─────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-2">
        {teams.filter(t => t.id !== 'NEW').map(t => {
          const pos     = ladderPositions[t.id] ?? null
          const hvLinks = HV_LINKS[t.id]
          return (
            <div key={t.id} onClick={() => { onSelectTeam(t.id); setActiveTab('squad') }}
              className={`bg-white rounded-lg border cursor-pointer transition-all text-center py-2.5 px-1 select-none
                ${selectedTeam === t.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="text-xs font-bold text-slate-500 tracking-wide">{t.id}</div>
              {hvLinks?.ladderUrl ? (
                <a href={hvLinks.ladderUrl} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="block text-2xl font-black leading-tight mt-0.5 hover:opacity-70 transition-opacity"
                  style={{ color: posColour(pos) }}>
                  {ordinal(pos)}
                </a>
              ) : (
                <div className="text-2xl font-black leading-tight mt-0.5" style={{ color: posColour(pos) }}>
                  {ordinal(pos)}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Team selector tabs ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {teams.filter(t => t.id !== 'NEW').map(t => (
          <button key={t.id} onClick={() => { onSelectTeam(t.id); setActiveTab('squad') }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTeam === t.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}>
            {t.id}
          </button>
        ))}
      </div>

      {/* ── Team header card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div style={{ background: '#eab308', height: '3px' }} />
        <div className="px-5 py-4" style={{ background: '#1e3a8a' }}>
          <h2 className="text-xl font-bold text-white tracking-wide">Mentone {team?.name}</h2>
          <p className="text-blue-200 text-xs mt-0.5">2026 Season</p>
        </div>

        {/* ── HV links row ── */}
        {HV_LINKS[selectedTeam] && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 bg-slate-50 flex-wrap">
            <a href={HV_LINKS[selectedTeam].teamUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
              Team ↗
            </a>
            <a href={HV_LINKS[selectedTeam].compUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
              Fixtures ↗
            </a>
            <a href={HV_LINKS[selectedTeam].ladderUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-colors">
              Ladder ↗
            </a>
          </div>
        )}

        {/* W/D/L record row */}
        <div className="grid grid-cols-5 divide-x divide-slate-100 text-center">
          {[
            { label: 'Played', val: record?.played ?? '—', color: 'text-slate-700' },
            { label: 'Won',    val: record?.W     ?? '—', color: 'text-green-600'  },
            { label: 'Drawn',  val: record?.D     ?? '—', color: 'text-amber-500'  },
            { label: 'Lost',   val: record?.L     ?? '—', color: 'text-red-500'    },
            { label: 'Goals',  val: record?.played > 0 ? `${record.GF}–${record.GA}` : '—', color: 'text-slate-500' },
          ].map(({ label, val, color }) => (
            <div key={label} className="py-3">
              <div className={`text-lg font-bold tabular-nums ${color}`}>{val}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Squad / Votes tab bar ── */}
        <div className="flex border-t border-slate-100">
          <button onClick={() => setActiveTab('squad')}
            className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
              activeTab === 'squad'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            Squad
          </button>
          {isAdmin && (
            <button onClick={() => setActiveTab('votes')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === 'votes'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}>
              🗳 Votes
            </button>
          )}
        </div>
      </div>

      {/* ── Squad tab ──────────────────────────────────────────────── */}
      {activeTab === 'squad' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="text-slate-400 py-12 text-center text-sm">Loading…</div>
          ) : teamData?.squad2026.length === 0 ? (
            <div className="text-slate-400 py-12 text-center text-sm">No players selected for this team yet</div>
          ) : (<>
            {/* Players confirmed as having actually played (from HV sync) */}
            {teamData.playedForTeam?.length > 0 && (<>
              <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Played this season</span>
                <span className="text-xs text-slate-400">{teamData.playedForTeam.length}</span>
              </div>
              {teamData.playedForTeam.map((player, idx) => {
                const gp       = player.games_played_2026?.[selectedTeam] || 0
                const s26      = player.stats_2026
                const hasCards = s26 && (s26.greenCards > 0 || s26.yellowCards > 0 || s26.redCards > 0)
                const isLast   = idx === teamData.playedForTeam.length - 1 && !teamData.assignedNotYetPlayed?.length
                return (
                  <div key={player.id} onClick={() => onSelectPlayer && onSelectPlayer(player)}
                    className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${!isLast ? 'border-b border-slate-100' : ''}`}>
                    <span className="text-sm text-slate-800 flex-1">{player.name}</span>
                    {hasCards && (
                      <span className="flex items-center gap-0.5 flex-shrink-0">
                        {s26.greenCards  > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-xs font-bold" style={{background:'#16a34a',fontSize:'10px'}}>{s26.greenCards}</span>}
                        {s26.yellowCards > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-xs font-bold" style={{background:'#ca8a04',fontSize:'10px'}}>{s26.yellowCards}</span>}
                        {s26.redCards    > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-xs font-bold" style={{background:'#dc2626',fontSize:'10px'}}>{s26.redCards}</span>}
                      </span>
                    )}
                    {s26?.goals > 0 && <span className="text-xs text-blue-600 font-semibold flex-shrink-0">{s26.goals}g</span>}
                    <span className="text-xs flex-shrink-0 tabular-nums font-medium w-8 text-right text-slate-500">{gp}gp</span>
                  </div>
                )
              })}
            </>)}
            {/* Assigned but not yet played */}
            {teamData.assignedNotYetPlayed?.length > 0 && (<>
              <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Assigned — not yet played</span>
                <span className="text-xs text-slate-400">{teamData.assignedNotYetPlayed.length}</span>
              </div>
              {teamData.assignedNotYetPlayed.map((player, idx) => (
                <div key={player.id} onClick={() => onSelectPlayer && onSelectPlayer(player)}
                  className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${idx !== teamData.assignedNotYetPlayed.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <span className="text-sm text-slate-500 flex-1">{player.name}</span>
                  <span className="text-xs text-slate-300 flex-shrink-0">—</span>
                </div>
              ))}
            </>)}
          </>)}
        </div>
      )}

      {/* ── Votes tab ──────────────────────────────────────────────── */}
      {activeTab === 'votes' && isAdmin && (
        <div className="space-y-3">

          {/* Round selector */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Select round</span>
            </div>
            {votesRoundLoading ? (
              <div className="px-4 py-3 text-xs text-slate-400">Loading rounds…</div>
            ) : votesRoundList.length === 0 ? (
              <div className="px-4 py-3 text-xs text-slate-400">No season rounds found.</div>
            ) : (
              <div className="flex gap-1.5 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {votesRoundList.map(r => (
                  <button key={r.id}
                    onClick={() => setVotesRound({ id: r.id, label: `Round ${r.round_number}` })}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      votesRound?.id === r.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                    }`}>
                    R{r.round_number}
                    {r.sat_date && <span className="ml-1 opacity-60 font-normal hidden sm:inline">
                      {new Date(r.sat_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Results panels: per-round tally + season total side by side on desktop */}
          {votesRound && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Per-round tally */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{votesRound.label}</span>
                </div>
                <VoteRoundPanel roundId={votesRound.id} teamId={selectedTeam} />
              </div>

              {/* Season total tally */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Season total</span>
                </div>
                <VoteSeasonPanel roundList={votesRoundList} teamId={selectedTeam} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── HV Name Alias resolution panel ──────────────────────────── */}
      {activeTab === 'squad' && <HvAliasPanel />}

    </div>
  )
}

// ── VoteRoundPanel ────────────────────────────────────────────────────────────
// Tally for a single round + team

function VoteRoundPanel({ roundId, teamId }) {
  const [tally, setTally]     = useState([])
  const [count, setCount]     = useState(0)
  const [loading, setLoading] = useState(true)
  const [noSession, setNoSession] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNoSession(false)
    async function load() {
      const session = await getVoteSession(roundId, teamId)
      if (!session) { setNoSession(true); setLoading(false); return }
      const responses = await getVoteResponses(`${roundId}__${teamId}`)
      setCount(responses.length)
      setTally(tallyVotes(responses, session.players))
      setLoading(false)
    }
    load()
  }, [roundId, teamId])

  const medal = i => ['🥇', '🥈', '🥉'][i] ?? null
  const scored = tally.filter(t => t.points > 0)

  if (loading) return <div className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</div>
  if (noSession) return <div className="px-4 py-8 text-center text-slate-400 text-sm">No voting session for this round yet.</div>
  if (scored.length === 0) return <div className="px-4 py-8 text-center text-slate-400 text-sm">No votes submitted yet.</div>

  return (
    <div>
      <div className="divide-y divide-slate-100">
        {scored.map((t, i) => (
          <div key={t.playerId} className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? 'bg-slate-50/60' : ''}`}>
            <span className="w-6 text-center text-base flex-shrink-0">
              {medal(i) || <span className="text-xs text-slate-300 font-mono">#{i+1}</span>}
            </span>
            <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
            <div className="flex items-center gap-1">
              {t.votes3 > 0 && <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-semibold">{t.votes3}×3</span>}
              {t.votes2 > 0 && <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">{t.votes2}×2</span>}
              {t.votes1 > 0 && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">{t.votes1}×1</span>}
              <span className="text-sm font-bold text-slate-800 w-6 text-right tabular-nums">{t.points}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
        {count} vote{count !== 1 ? 's' : ''} submitted
      </div>
    </div>
  )
}

// ── VoteSeasonPanel ───────────────────────────────────────────────────────────
// Cumulative tally across all rounds for the team

function VoteSeasonPanel({ roundList, teamId }) {
  const [tally, setTally]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roundList.length) return
    setLoading(true)
    async function load() {
      // Accumulate responses across all rounds
      const allResponses = []
      const playerMap = {}   // playerId → name (from any session)

      await Promise.all(roundList.map(async r => {
        const session = await getVoteSession(r.id, teamId)
        if (!session) return
        // Build player map from session snapshot
        session.players.forEach(p => { playerMap[String(p.id)] = p.name })
        const responses = await getVoteResponses(`${r.id}__${teamId}`)
        allResponses.push(...responses)
      }))

      // Build combined player list from all seen players
      const players = Object.entries(playerMap).map(([id, name]) => ({ id, name }))
      setTally(tallyVotes(allResponses, players))
      setLoading(false)
    }
    load()
  }, [roundList, teamId])

  const medal = i => ['🥇', '🥈', '🥉'][i] ?? null
  const scored = tally.filter(t => t.points > 0)

  if (loading) return <div className="px-4 py-8 text-center text-slate-400 text-sm">Loading…</div>
  if (scored.length === 0) return <div className="px-4 py-8 text-center text-slate-400 text-sm">No votes recorded yet.</div>

  return (
    <div className="divide-y divide-slate-100">
      {scored.map((t, i) => (
        <div key={t.playerId} className={`flex items-center gap-3 px-4 py-3 ${i < 3 ? 'bg-slate-50/60' : ''}`}>
          <span className="w-6 text-center text-base flex-shrink-0">
            {medal(i) || <span className="text-xs text-slate-300 font-mono">#{i+1}</span>}
          </span>
          <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
          <div className="flex items-center gap-1">
            {t.votes3 > 0 && <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-semibold">{t.votes3}×3</span>}
            {t.votes2 > 0 && <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">{t.votes2}×2</span>}
            {t.votes1 > 0 && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">{t.votes1}×1</span>}
            <span className="text-sm font-bold text-indigo-700 w-8 text-right tabular-nums">{t.points}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
