import { useState, useEffect } from 'react'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import PlayerCard from './PlayerCard'
import DroppableArea from './DroppableArea'
import DraggablePlayer from './DraggablePlayer'
import { getTeamPlayers, updatePlayer } from '../db'

export default function TeamView({ teams, statuses, selectedTeam, onSelectTeam, onSelectPlayer, refreshKey, onRefresh }) {
  const [teamData, setTeamData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activePlayer, setActivePlayer] = useState(null)
  const [filterStatus, setFilterStatus] = useState(null) // null = all, or status_id

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  useEffect(() => {
    setLoading(true)
    getTeamPlayers(selectedTeam)
      .then(data => {
        setTeamData(data)
        setLoading(false)
      })
  }, [selectedTeam, refreshKey])

  const handleDragStart = (event) => {
    const player = findPlayer(event.active.id)
    setActivePlayer(player)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActivePlayer(null)

    if (!over) return

    const playerId = active.id
    const targetArea = over.id

    if (targetArea === 'squad-2026') {
      updatePlayer(playerId, { assigned_team_id_2026: selectedTeam }).then(() => onRefresh())
    } else if (targetArea === 'unassigned') {
      updatePlayer(playerId, { assigned_team_id_2026: null }).then(() => onRefresh())
    }
  }

  const findPlayer = (id) => {
    if (!teamData) return null
    const all = [...teamData.mainSquad, ...teamData.fillIns, ...teamData.squad2026]
    return all.find(p => p.id === id)
  }

  const filterPlayers = (players) => {
    if (!filterStatus) return players
    return players.filter(p => p.status_id === filterStatus)
  }

  const getStatusCounts = (players) => {
    const counts = {}
    players.forEach(p => {
      counts[p.status_id] = (counts[p.status_id] || 0) + 1
    })
    return counts
  }

  const toggleFilter = (statusId) => {
    setFilterStatus(current => current === statusId ? null : statusId)
  }

  if (loading || !teamData) {
    return <div className="text-gray-500">Loading...</div>
  }

  const team = teams.find(t => t.id === selectedTeam)
  const statusCounts = getStatusCounts(teamData.mainSquad)

  return (
    <DndContext 
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div>
        {/* Team tabs */}
        <div className="flex gap-1 mb-6">
          {teams.filter(t => t.id !== 'NEW').map(t => (
            <button
              key={t.id}
              onClick={() => onSelectTeam(t.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedTeam === t.id
                  ? 'bg-gray-800 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {t.id}
            </button>
          ))}
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setFilterStatus(null)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              !filterStatus 
                ? 'bg-gray-800 text-white' 
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All ({teamData.mainSquad.length})
          </button>
          {statuses.map(s => {
            const count = statusCounts[s.id] || 0
            if (count === 0) return null
            const isActive = filterStatus === s.id
            return (
              <button
                key={s.id}
                onClick={() => toggleFilter(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-all ${
                  isActive 
                    ? 'ring-2 ring-offset-1' 
                    : 'hover:opacity-80'
                }`}
                style={{ 
                  backgroundColor: isActive ? s.color : s.color + '20',
                  color: isActive ? 'white' : s.color,
                  ringColor: s.color
                }}
              >
                <span 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: isActive ? 'white' : s.color }}
                />
                {s.label} ({count})
              </button>
            )
          })}
        </div>

        <h2 className="text-lg font-semibold text-gray-800 mb-4">{team?.name}</h2>

        <div className="grid grid-cols-2 gap-6">
          {/* Left side - 2025 data */}
          <div className="space-y-6">
            {/* Main Squad 2025 */}
            <DroppableArea 
              id="unassigned" 
              label={
                <div className="flex items-center justify-between w-full">
                  <span>2025 Main Squad</span>
                  <span className="text-gray-500 text-sm">
                    {filterStatus 
                      ? `${filterPlayers(teamData.mainSquad).length} of ${teamData.mainSquad.length}`
                      : `${teamData.mainSquad.length} players`
                    }
                  </span>
                </div>
              }
            >
              <div className="space-y-1">
                {filterPlayers(teamData.mainSquad).map(player => (
                  <DraggablePlayer key={player.id} player={player}>
                    <PlayerCard 
                      player={player} 
                      statuses={statuses}
                      onClick={() => onSelectPlayer(player)}
                    />
                  </DraggablePlayer>
                ))}
                {filterPlayers(teamData.mainSquad).length === 0 && (
                  <p className="text-gray-400 text-sm py-2">No players match filter</p>
                )}
              </div>
            </DroppableArea>

            {/* Fill-ins 2025 */}
            <DroppableArea 
              id="fillins" 
              label={`2025 Fill-ins (${teamData.fillIns.length})`}
            >
              <div className="space-y-1">
                {filterPlayers(teamData.fillIns).map(player => (
                  <DraggablePlayer key={player.id} player={player}>
                    <PlayerCard 
                      player={player} 
                      statuses={statuses}
                      onClick={() => onSelectPlayer(player)}
                      showPrimaryTeam
                    />
                  </DraggablePlayer>
                ))}
                {teamData.fillIns.length === 0 && (
                  <p className="text-gray-400 text-sm py-2">No fill-ins</p>
                )}
              </div>
            </DroppableArea>
          </div>

          {/* Right side - 2026 squad */}
          <DroppableArea 
            id="squad-2026" 
            label={
              <div className="flex items-center justify-between w-full">
                <span>2026 Squad</span>
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">
                  {teamData.squad2026.length} players
                </span>
              </div>
            } 
            highlight
          >
            <div className="space-y-1 min-h-[200px]">
              {teamData.squad2026.map(player => (
                <DraggablePlayer key={player.id} player={player}>
                  <PlayerCard 
                    player={player} 
                    statuses={statuses}
                    onClick={() => onSelectPlayer(player)}
                    showPrimaryTeam={player.primary_team_id_2025 !== selectedTeam}
                  />
                </DraggablePlayer>
              ))}
              {teamData.squad2026.length === 0 && (
                <p className="text-gray-400 text-sm py-4 text-center">
                  Drag players here to assign to 2026 squad
                </p>
              )}
            </div>
          </DroppableArea>
        </div>
      </div>

      <DragOverlay>
        {activePlayer ? (
          <div className="opacity-80">
            <PlayerCard player={activePlayer} statuses={statuses} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
