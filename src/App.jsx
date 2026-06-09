import { useState, useEffect } from 'react'
import { ClipboardList, Calendar, UserX, Users, LayoutGrid, MoreHorizontal, Settings, Vote } from 'lucide-react'
import TeamView from './components/TeamView'
import AllPlayers from './components/AllPlayers'
import RoundPlanner from './components/RoundPlanner'
import PlayerModal from './components/PlayerModal'
import UnavailabilityManager from './components/UnavailabilityManager'
import FixtureView from './components/FixtureView'
import AdminView from './components/AdminView'
import VotingOverview from './components/VotingOverview'
import UnavailBadge from './components/UnavailBadge'
import LoginPage from './components/LoginPage'
import { getTeams, getStatuses } from './db'
import { getAllowedUser } from './db.access'
import { subscribeToAuthToken, signOutUser } from './auth'
import { isAdminUser, isBootstrapAdmin } from './access'

const NAV = [
  { id: 'round',   label: 'Planner',       Icon: ClipboardList },
  { id: 'fixture', label: 'Fixture',       Icon: Calendar      },
  { id: 'unavail', label: 'Availability',  Icon: UserX         },
  { id: 'team',    label: 'Teams',         Icon: LayoutGrid,   adminOnly: true },
  { id: 'players', label: 'Players',       Icon: Users,        adminOnly: true },
  { id: 'votes',   label: 'Votes',         Icon: Vote,         adminOnly: true },
  { id: 'admin',   label: 'Admin',         Icon: Settings,     adminOnly: true },
]

const MOBILE_TABS = ['round', 'fixture', 'unavail']

function FramedPage({ children }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      {children}
    </div>
  )
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function App() {
  const [view, setView]               = useState('round')
  const [teams, setTeams]             = useState([])
  const [statuses, setStatuses]       = useState([])
  const [selectedTeam, setSelectedTeam] = useState('PL')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [refreshKey, setRefreshKey]   = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [accessReady, setAccessReady] = useState(false)
  const [allowedUser, setAllowedUser] = useState(null)
  const [accessError, setAccessError] = useState('')
  const [bootstrapLoading, setBootstrapLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState('')
  const [bootstrapVersion, setBootstrapVersion] = useState(0)
  const isAllowed = isBootstrapAdmin(user) || allowedUser?.enabled === true
  const isAdmin = isAdminUser(user, allowedUser)

  useEffect(() => subscribeToAuthToken(currentUser => {
    setUser(currentUser)
    setAuthReady(true)
  }), [])


  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      if (!authReady) return
      setAccessReady(false)
      setAllowedUser(null)
      setAccessError('')

      if (!user) {
        setAccessReady(true)
        return
      }

      if (isBootstrapAdmin(user)) {
        setAccessReady(true)
        return
      }

      try {
        const record = await getAllowedUser(user.email)
        if (!cancelled) setAllowedUser(record)
      } catch (e) {
        console.error('Failed to check tracker access', e)
        if (!cancelled) setAccessError('Unable to check tracker access.')
      } finally {
        if (!cancelled) setAccessReady(true)
      }
    }

    loadAccess()

    return () => { cancelled = true }
  }, [authReady, user])

  useEffect(() => {
    if (!authReady || !accessReady) return
    if (!isAllowed) {
      setTeams([])
      setStatuses([])
      setBootstrapLoading(false)
      setBootstrapError('')
      return
    }

    let cancelled = false

    async function loadBootstrap() {
      setBootstrapLoading(true)
      setBootstrapError('')

      const maxAttempts = 3
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const [teamsData, statusesData] = await Promise.all([getTeams(), getStatuses()])
          if (cancelled) return
          setTeams(teamsData)
          setStatuses(statusesData)
          setBootstrapLoading(false)
          setBootstrapError('')
          return
        } catch (e) {
          if (cancelled) return
          console.error(`Bootstrap load failed (${attempt}/${maxAttempts})`, e)
          if (attempt === maxAttempts) {
            setTeams([])
            setStatuses([])
            setBootstrapError('Unable to load tracker data right now.')
            setBootstrapLoading(false)
            return
          }
          await wait(500 * attempt)
          if (cancelled) return
        }
      }
    }

    loadBootstrap()
    return () => { cancelled = true }
  }, [authReady, accessReady, isAllowed, bootstrapVersion])

  const refresh = () => setRefreshKey(k => k + 1)
  const retryBootstrap = () => setBootstrapVersion(v => v + 1)
  const openPlayer  = (player) => setSelectedPlayer(player)
  const closePlayer = () => { setSelectedPlayer(null); refresh() }

  const handleSignOut = async () => {
    setShowLogoutConfirm(false)
    setLogoutPending(true)
    setUser(null)
    setAllowedUser(null)
    setAccessError('')
    setAuthReady(true)
    setAccessReady(true)
    setTeams([])
    setStatuses([])
    setBootstrapLoading(false)
    setBootstrapError('')
    try {
      await signOutUser()
    } catch (e) {
      console.error('Sign out failed', e)
    } finally {
      setLogoutPending(false)
    }
  }

  if (!authReady || !accessReady || (isAllowed && bootstrapLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
        Loading tracker data...
      </div>
    )
  }

  if (!isAllowed) {
    return <LoginPage deniedUser={user} accessError={accessError} />
  }

  if (bootstrapError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-4 text-center">
        <p className="text-sm font-medium text-slate-700">{bootstrapError}</p>
        <p className="text-xs text-slate-500">Please check your connection and try again.</p>
        <button
          type="button"
          onClick={retryBootstrap}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Desktop top nav ───────────────────────────────────────────── */}
      <nav className="hidden sm:block bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-800">MHC Squad Tracker</h1>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              title={user.email}
              aria-label={`User menu for ${user.email}`}
              className={`w-7 h-7 rounded-full text-xs font-semibold text-white flex items-center justify-center ${isAdmin ? 'bg-blue-600' : 'bg-slate-400'}`}
            >
              <span aria-hidden="true">{(user.displayName || user.email || '?').charAt(0).toUpperCase()}</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {NAV.filter(n => !n.adminOnly || isAdmin).map(n => (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`relative flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-md text-xs font-medium transition-colors ${
                  view === n.id
                    ? 'text-blue-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <n.Icon size={18} strokeWidth={1.5} />
                <span>{n.label}</span>
                {view === n.id && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-blue-600 rounded-full" />
                )}
                {n.id === 'admin' && isAdmin && <UnavailBadge />}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Mobile top bar — title only ───────────────────────────────── */}
      <nav className="sm:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-800">MHC Squad Tracker</h1>
          <span className="text-xs text-slate-400 font-medium">
            {NAV.find(n => n.id === view)?.label}
          </span>
        </div>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          title={user.email}
          aria-label={`User menu for ${user.email}`}
          className={`h-8 w-8 rounded-full text-xs font-semibold text-white flex items-center justify-center ${isAdmin ? 'bg-blue-600' : 'bg-slate-400'}`}
        >
          <span aria-hidden="true">{(user.displayName || user.email || '?').charAt(0).toUpperCase()}</span>
        </button>
      </nav>

      {/* Main content — bottom padding on mobile to clear tab bar */}
      <main className="p-3 sm:p-6 pb-20 sm:pb-6">
        {view === 'players' && isAdmin && <FramedPage><AllPlayers statuses={statuses} teams={teams} onSelectPlayer={openPlayer} refreshKey={refreshKey} onRefresh={refresh} /></FramedPage>}
        {view === 'team'    && isAdmin && <FramedPage><TeamView teams={teams} statuses={statuses} selectedTeam={selectedTeam} onSelectTeam={setSelectedTeam} onSelectPlayer={openPlayer} refreshKey={refreshKey} onRefresh={refresh} isAdmin={isAdmin} /></FramedPage>}
        {view === 'round'   && <RoundPlanner statuses={statuses} onSelectPlayer={openPlayer} isAdmin={isAdmin} />}
        {view === 'unavail' && <UnavailabilityManager onSelectPlayer={openPlayer} />}
        {view === 'fixture' && <FramedPage><FixtureView teams={teams} isAdmin={isAdmin} /></FramedPage>}
        {view === 'votes'   && isAdmin && <FramedPage><VotingOverview teams={teams} /></FramedPage>}
        {view === 'admin'   && isAdmin && <FramedPage><AdminView /></FramedPage>}
      </main>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {MOBILE_TABS.map(id => {
          const n = NAV.find(n => n.id === id)
          return (
            <button
              key={id}
              onClick={() => { setView(id); setShowMoreMenu(false) }}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors ${
                view === id && !showMoreMenu ? 'text-blue-600' : 'text-slate-400'
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
            showMoreMenu || !MOBILE_TABS.includes(view) ? 'text-blue-600' : 'text-slate-400'
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
            className="absolute bottom-16 right-0 left-0 bg-white border-t border-slate-200 shadow-lg"
            onClick={e => e.stopPropagation()}
          >
            {NAV.filter(n => !MOBILE_TABS.includes(n.id) && (!n.adminOnly || isAdmin)).map(n => (
              <button
                key={n.id}
                onClick={() => { setView(n.id); setShowMoreMenu(false) }}
                className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium border-b border-slate-100 ${
                  view === n.id ? 'text-blue-600 bg-blue-50' : 'text-slate-700'
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

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h2 className="text-base font-semibold text-slate-900">Sign out?</h2>
            <p className="mt-2 text-sm text-slate-500">
              You are signed in as <span className="font-medium text-slate-700">{user?.email}</span>.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={logoutPending}
                className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={logoutPending}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {logoutPending ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
