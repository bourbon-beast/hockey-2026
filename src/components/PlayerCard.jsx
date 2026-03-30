import React from 'react'

// ⚡ Bolt Optimization:
// Wrapped PlayerCard in React.memo() to prevent unnecessary re-renders.
// Since these cards are rendered in large lists (TeamView, AllPlayers),
// this ensures only cards with changed props (like when being dragged or updated) will re-render,
// saving significant React reconciliation time during drag-and-drop operations.
const PlayerCard = React.memo(function PlayerCard({ player, statuses, onClick, showPrimaryTeam = false }) {
  const status = statuses.find(s => s.id === player.status_id)
  
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <span 
        className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
        style={{ backgroundColor: status?.color || '#6b7280' }}
        title={status?.label}
      />
      <span className="font-medium text-gray-800 flex-1">{player.name}</span>
      {showPrimaryTeam && player.primary_team_id_2025 && (
        <span className="text-xs text-gray-400 px-1.5 py-0.5 bg-gray-100 rounded">
          {player.primary_team_id_2025}
        </span>
      )}
      <span className="text-sm text-gray-500">({player.games_for_team || player.total_games_2025})</span>
      {player.assigned_team_id_2026 && (
        <span className="text-xs text-blue-600 font-medium">
          → {player.assigned_team_id_2026}
        </span>
      )}
    </div>
  )
})

export default PlayerCard
