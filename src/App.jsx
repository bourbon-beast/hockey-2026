import { useState, useEffect } from 'react'
import { ClipboardList, Calendar, UserX, Users, LayoutGrid, MoreHorizontal } from 'lucide-react'
import TeamView from './components/TeamView'
import AllPlayers from './components/AllPlayers'
import RoundPlanner from './components/RoundPlanner'
import PlayerModal from './components/PlayerModal'
import UnavailabilityManager from './components/UnavailabilityManager'
import FixtureView from './components/FixtureView'
import { getTeams, getStatuses } from './db'

const NAV = [
  { id: 'round',   label: 'Planner',       Icon: ClipboardList },
  { id: 'fixture', label: 'Fixture',       Icon: Calendar      },
  { id: 'unavail', label: 'Availability',  Icon: UserX         },
  { id: 'team',    label: 'Teams',         Icon: LayoutGrid    },
  { id: 'players', label: 'Players',       Icon: Users         },
]

const MOBILE_TABS = ['round', 'fixture', 'unavail', 'team']

function App() {
  const [view, setView]               = useState('round')
  const [teams, setTeams]             = useState([])
  const [statuses, setStatuses]       = useState([])
  const [selectedTeam, setSelectedTeam] = useState('PL')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [refreshKey, setRefreshKey]   = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  useEffect(() => {
    getTeams().then(setTeams)
    getStatuses().then(setStatuses)
  }, [])

  const refresh = () => setRefreshKey(k => k + 1)
  const openPlayer  = (player) => setSelectedPlayer(player)
  const closePlayer = () => { setSelectedPlayer(null); refresh() }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Desktop top nav ───────────────────────────────────────────── */}
      <nav className="hidden sm:block bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-800">MHC Squad Tracker</h1>
          <div className="flex items-center gap-2">
            {NAV.map(n => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                  view === n.id
                    ? 'text-blue-600'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <n.Icon size={18} strokeWidth={1.5} />
                <span>{n.label}</span>
                {view === n.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Mobile top bar — title only ───────────────────────────────── */}
      <nav className="sm:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-base font-bold text-gray-800">MHC Squad Tracker</h1>
        <span className="text-sm text-gray-400 font-medium">
          {NAV.find(n => n.id === view)?.label}
        </span>
      </nav>

      {/* Main content — bottom padding on mobile to clear tab bar */}
      <main className="p-3 sm:p-6 pb-20 sm:pb-6">
        {view === 'players' && <AllPlayers statuses={statuses} teams={teams} onSelectPlayer={openPlayer} refreshKey={refreshKey} onRefresh={refresh} />}
        {view === 'team'    && <TeamView teams={teams} statuses={statuses} selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} onSelectPlayer={openPlayer} refreshKey={refreshKey} onRefresh={refresh} />}
        {view === 'round'   && <RoundPlanner statuses={statuses} onSelectPlayer={openPlayer} />}
        {view === 'unavail' && <UnavailabilityManager onSelectPlayer={openPlayer} />}
        {view === 'fixture' && <FixtureView teams={teams} />}
      </main>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {MOBILE_TABS.map(id => {
          const n = NAV.find(n => n.id === id)
          return (
            <button
              key={id}
              onClick={() => { setView(id); setShowMoreMenu(false) }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                view === id && !showMoreMenu ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <n.Icon size={20} strokeWidth={1.75} />
              <span>{n.label}</span>
            </button>
          )
        })}

        {/* More button */}
        <button
          onClick={() => setShowMoreMenu(m => !m)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
            showMoreMenu || !MOBILE_TABS.includes(view) ? 'text-blue-600' : 'text-gray-400'
          }`}
        >
          <MoreHorizontal size={20} strokeWidth={1.75} />
          <span>More</span>
        </button>
      </nav>

      {/* ── More menu overlay ─────────────────────────────────────────── */}
      {showMoreMenu && (
        <div className="sm:hidden fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)}>
          <div
            className="absolute bottom-16 right-0 left-0 bg-white border-t border-gray-200 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            {NAV.filter(n => !MOBILE_TABS.includes(n.id)).map(n => (
              <button
                key={n.id}
                onClick={() => { setView(n.id); setShowMoreMenu(false) }}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-gray-100 ${
                  view === n.id ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
                }`}
              >
                <n.Icon size={18} strokeWidth={1.75} />
                {n.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player modal */}
      {selectedPlayer && (
        <PlayerModal player={selectedPlayer} teams={teams} statuses={statuses} onClose={closePlayer} onPlayerUpdated={refresh} />
      )}
    </div>
  )
}

export default App
