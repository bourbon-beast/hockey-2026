import { useState, useEffect } from 'react'
import { getTeamPlayers, getRounds, getRoundMatches, getHvSync } from '../db'
import { HV_LINKS } from './hvLinks'

// ── TeamView ─────────────────────────────────────────────────────────────────

// Aggregate W/D/L/GF/GA from all match docs for a given team
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

// Ordinal suffix: 1 → "1st", 2 → "2nd" etc.
function ordinal(n) {
  if (!n) return '—'
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// Position colour: top 4 = green, else slate
function posColour(pos) {
  if (!pos) return '#94a3b8'
  if (pos <= 4) return '#16a34a'
  return '#64748b'
}


export default function TeamView({ teams, statuses, selectedTeam, onSelectTeam, onSelectPlayer, refreshKey }) {
  const [teamData, setTeamData]         = useState(null)
  const [record, setRecord]             = useState(null)
  const [ladderPositions, setLadder]    = useState({}) // { PL: 3, PLR: 1, ... }
  const [loading, setLoading]           = useState(true)

  const team = teams.find(t => t.id === selectedTeam)

  // Load ladder positions once from hvSync/latest
  useEffect(() => {
    getHvSync().then(sync => {
      if (sync?.ladders) {
        // ladders: { PL: { position: 3 }, PLR: { position: 1 }, ... }
        // TODO: populated by sync_hv.py ladder scraping (not yet implemented)
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

  return (
    <div className="space-y-4">

      {/* ── Ladder position strip ─────────────────────────────────── */}
      <div className="grid grid-cols-6 gap-2">
        {teams.filter(t => t.id !== 'NEW').map(t => {
          const pos     = ladderPositions[t.id] ?? null
          const hvLinks = HV_LINKS[t.id]
          const card = (
            <div key={t.id}
                 onClick={() => onSelectTeam(t.id)}
                 className={`bg-white rounded-lg border cursor-pointer transition-all text-center
                             py-2.5 px-1 select-none
                             ${selectedTeam === t.id
                               ? 'border-blue-500 ring-2 ring-blue-200'
                               : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="text-xs font-bold text-slate-500 tracking-wide">{t.id}</div>
              {hvLinks?.ladderUrl ? (
                <a href={hvLinks.ladderUrl}
                   target="_blank" rel="noopener noreferrer"
                   onClick={e => e.stopPropagation()}
                   className="block text-2xl font-black leading-tight mt-0.5 hover:opacity-70 transition-opacity"
                   style={{ color: posColour(pos) }}>
                  {ordinal(pos)}
                </a>
              ) : (
                <div className="text-2xl font-black leading-tight mt-0.5"
                     style={{ color: posColour(pos) }}>
                  {ordinal(pos)}
                </div>
              )}
            </div>
          )
          return card
        })}
      </div>

      {/* ── Team selector tabs ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {teams.filter(t => t.id !== 'NEW').map(t => (
          <button key={t.id} onClick={() => onSelectTeam(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTeam === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}>
            {t.id}
          </button>
        ))}
      </div>

      {/* ── Team header card ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div style={{ background: '#eab308', height: '3px' }} />
        <div className="px-5 py-4" style={{ background: '#1e3a8a' }}>
          <h2 className="text-xl font-bold text-white tracking-wide">
            Mentone {team?.name}
          </h2>
          <p className="text-blue-200 text-xs mt-0.5">2026 Season</p>
        </div>

        {/* HV links row */}
        {HV_LINKS[selectedTeam] && (
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-100 bg-slate-50 flex-wrap">
            <a href={HV_LINKS[selectedTeam].teamUrl}
               target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
              Team page ↗
            </a>
            <span className="text-slate-300">|</span>
            <a href={HV_LINKS[selectedTeam].compUrl}
               target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
              Fixtures ↗
            </a>
            <span className="text-slate-300">|</span>
            <a href={HV_LINKS[selectedTeam].ladderUrl}
               target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium">
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
            { label: 'Goals',  val: record?.played > 0 ? `${record.GF}–${record.GA}` : '—',
              color: 'text-slate-500' },
          ].map(({ label, val, color }) => (
            <div key={label} className="py-3">
              <div className={`text-lg font-bold tabular-nums ${color}`}>{val}</div>
              <div className="text-xs text-slate-400 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>


      {/* ── Player list ──────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-slate-400 py-12 text-center text-sm">Loading…</div>
        ) : teamData?.squad2026.length === 0 ? (
          <div className="text-slate-400 py-12 text-center text-sm">
            No players selected for this team yet
          </div>
        ) : (<>
          <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Squad — {teamData.squad2026.length}
            </span>
          </div>
          {teamData.squad2026.map((player, idx) => {
            const isBorrowed = player.assigned_team_id_2026 &&
                               player.assigned_team_id_2026 !== selectedTeam
            return (
              <div key={player.id}
                   onClick={() => onSelectPlayer && onSelectPlayer(player)}
                   className={`flex items-center gap-2 px-4 py-2.5 cursor-pointer
                               hover:bg-slate-50 transition-colors
                               ${idx !== teamData.squad2026.length - 1 ? 'border-b border-slate-100' : ''}`}>
                <span className="text-sm text-slate-800">{player.name}</span>
                {isBorrowed && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                    {player.assigned_team_id_2026}
                  </span>
                )}
              </div>
            )
          })}
        </>)}
      </div>

    </div>
  )
}
