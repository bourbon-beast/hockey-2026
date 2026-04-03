import { useState, useEffect } from 'react'
import { getTeamPlayers } from '../db'

export default function TeamView({ teams, statuses, selectedTeam, onSelectTeam, onSelectPlayer, refreshKey }) {
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getTeamPlayers(selectedTeam)
      .then(data => {
        setTeamData(data)
        setLoading(false)
      })
  }, [selectedTeam, refreshKey])

  if (loading || !teamData) {
    return <div className="text-slate-400 py-12 text-center text-sm">Loading squad…</div>
  }

  const team = teams.find(t => t.id === selectedTeam)

  const PlayerRow = ({ player, showPrimary = false }) => (
    <div
      onClick={() => onSelectPlayer && onSelectPlayer(player)}
      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer border border-transparent hover:border-slate-200 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-slate-800 truncate block">{player.name}</span>
        {showPrimary && player.primary_team_id_2025 && (
          <span className="text-xs text-slate-400">2025: {player.primary_team_id_2025}</span>
        )}
      </div>
      {player.default_position && (
        <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
          {player.default_position}
        </span>
      )}
      {player.games_played_2026 && Object.keys(player.games_played_2026).length > 0 && (
        <span className="text-xs text-blue-600 font-semibold w-6 text-right">
          {Object.values(player.games_played_2026).reduce((a, b) => a + b, 0)}g
        </span>
      )}
    </div>
  )


  return (
    <div className="space-y-4">

      {/* Team tabs */}
      <div className="flex flex-wrap gap-1.5">
        {teams.filter(t => t.id !== 'NEW').map(t => (
          <button
            key={t.id}
            onClick={() => onSelectTeam(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedTeam === t.id
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {t.id}
          </button>
        ))}
      </div>

      <h2 className="text-base font-semibold text-slate-700">{team?.name}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* 2026 Squad — derived from round selections */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-sm font-semibold text-slate-700">2026 Squad</span>
            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded">
              {teamData.squad2026.length} players
            </span>
          </div>
          <div className="p-2 space-y-0.5">
            {teamData.squad2026.map(p => (
              <PlayerRow key={p.id} player={p} showPrimary={p.primary_team_id_2025 !== selectedTeam} />
            ))}
            {teamData.squad2026.length === 0 && (
              <p className="text-slate-400 text-sm py-6 text-center">
                No players selected for this team yet
              </p>
            )}
          </div>
        </div>

        {/* 2025 Main Squad — for reference */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <span className="text-sm font-semibold text-slate-700">2025 Main Squad</span>
            <span className="text-xs text-slate-500">{teamData.mainSquad.length} players</span>
          </div>
          <div className="p-2 space-y-0.5">
            {teamData.mainSquad.map(p => (
              <PlayerRow key={p.id} player={p} />
            ))}
            {teamData.mainSquad.length === 0 && (
              <p className="text-slate-400 text-sm py-6 text-center">No 2025 data</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
