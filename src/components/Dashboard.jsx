import { useState, useEffect } from 'react'

const TEAMS = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']
const TEAM_FULL = {
  PL: 'Premier League', PLR: 'Premier League Res',
  PB: 'Pennant B', PC: 'Pennant C', PE: 'Pennant E', Metro: 'Metro 2 South'
}

function roundLabel(r) {
  if (!r) return ''
  return r.name || `Round ${r.round_number}`
}

function dateStr(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
}

function squadColour(total) {
  if (total === 0)  return 'bg-slate-100 text-slate-400'
  if (total < 11)   return 'bg-red-100 text-red-700 font-bold'
  if (total <= 16)  return 'bg-green-100 text-green-700 font-semibold'
  return 'bg-orange-100 text-orange-700 font-semibold'
}

export default function Dashboard({ refreshKey }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [refreshKey])

  if (loading) return <div className="text-gray-400 text-sm p-4">Loading...</div>
  if (!data?.currentRound) return <div className="text-gray-400 text-sm p-4">No rounds found.</div>

  const { currentRound, teamSummaries, seasonGrid } = data

  return (
    <div className="space-y-5">

      {/* ── Round header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{roundLabel(currentRound)}</h2>
          {currentRound.round_date && (
            <p className="text-sm text-gray-400 mt-0.5">
              Week of {dateStr(currentRound.round_date)}
            </p>
          )}
        </div>
        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">Auto-selected</span>
      </div>

      {/* ── Per-team cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {teamSummaries.map(t => (
          <TeamCard key={t.teamId} t={t} />
        ))}
      </div>

      {/* ── Season grid ────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Season at a Glance</h3>
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-gray-400 font-medium w-20 sticky left-0 bg-white">Round</th>
                {TEAMS.map(tid => (
                  <th key={tid} className="px-2 py-2 text-gray-500 font-semibold text-center">{tid}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seasonGrid.map(r => (
                <tr
                  key={r.id}
                  className={`border-b border-gray-50 ${r.isCurrent ? 'bg-blue-50' : ''}`}
                >
                  <td className={`px-3 py-1.5 sticky left-0 font-medium ${r.isCurrent ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-600'}`}>
                    <div>{r.name || `R${r.round_number}`}</div>
                    {r.round_date && <div className="text-gray-400 font-normal">{dateStr(r.round_date)}</div>}
                  </td>
                  {TEAMS.map(tid => {
                    const c = r.teams[tid]
                    return (
                      <td key={tid} className="px-2 py-1.5 text-center">
                        {c ? (
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${squadColour(c.total)}`}>
                            {c.total}
                            {c.confirmed > 0 && <span className="text-green-600 ml-0.5">✓{c.confirmed}</span>}
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">
          Squad count per team · ✓ = confirmed · 🔴 under 11 · 🟢 11–16 · 🟠 over 16
        </p>
      </div>

    </div>
  )
}

function TeamCard({ t }) {
  const hasMatch = t.opponent || t.time || t.venue
  const allUnconfirmed = t.total > 0 && t.confirmed === 0

  return (
    <div className={`bg-white rounded-lg border overflow-hidden ${
      t.total === 0 ? 'border-gray-100' : 'border-gray-200'
    }`}>
      {/* Navy header */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ background: '#1e3a8a' }}>
        <div>
          <div className="text-white font-bold text-sm">{t.teamId}</div>
          <div className="text-blue-300 text-xs">{TEAM_FULL[t.teamId]}</div>
        </div>
        {/* Squad count badge */}
        <div className={`text-xs font-bold px-2 py-0.5 rounded ${
          t.total === 0     ? 'bg-slate-600 text-slate-300' :
          t.total < 11      ? 'bg-red-500 text-white' :
          t.total <= 16     ? 'bg-green-500 text-white' :
                              'bg-orange-400 text-white'
        }`}>
          {t.total === 0 ? 'Empty' : `${t.total} players`}
        </div>
      </div>

      {/* Match info */}
      <div className="px-3 py-2 space-y-0.5">
        {hasMatch ? (
          <>
            {t.opponent && <div className="text-sm font-semibold text-gray-800">vs {t.opponent}</div>}
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {t.time     && <span>⏰ {t.time}</span>}
              {t.arrive_at && <span>🏃 {t.arrive_at}</span>}
            </div>
            {t.venue && <div className="text-xs text-gray-400 truncate">📍 {t.venue}</div>}
          </>
        ) : (
          <div className="text-xs text-gray-300 italic">No match details yet</div>
        )}
      </div>

      {/* Availability strip */}
      {t.total > 0 && (
        <div className="px-3 pb-2">
          <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 mb-1">
            {t.confirmed   > 0 && <div className="bg-green-500"  style={{ width: `${(t.confirmed/t.total)*100}%` }} />}
            {t.waiting     > 0 && <div className="bg-yellow-400" style={{ width: `${(t.waiting/t.total)*100}%` }} />}
            {t.unconfirmed > 0 && <div className="bg-gray-300"   style={{ width: `${(t.unconfirmed/t.total)*100}%` }} />}
          </div>
          <div className="flex gap-2 text-xs text-gray-500">
            {t.confirmed   > 0 && <span className="text-green-600">✓ {t.confirmed}</span>}
            {t.waiting     > 0 && <span className="text-yellow-600">? {t.waiting}</span>}
            {t.unconfirmed > 0 && <span className="text-gray-400">– {t.unconfirmed}</span>}
          </div>
        </div>
      )}

      {/* Unavailability alert */}
      {t.unavailablePlayers.length > 0 && (
        <div className="px-3 pb-2 border-t border-gray-100 pt-1.5">
          <div className="text-xs text-red-500 font-medium mb-0.5">
            🚫 {t.unavailablePlayers.length} unavailable
          </div>
          <div className="text-xs text-gray-400 truncate">
            {t.unavailablePlayers.slice(0, 3).join(', ')}
            {t.unavailablePlayers.length > 3 && ` +${t.unavailablePlayers.length - 3} more`}
          </div>
        </div>
      )}
    </div>
  )
}
