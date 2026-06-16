import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, Plus, X } from 'lucide-react'
import { auth } from '../firebase'
import { getPlayers } from '../db'
import {
  buildPollLink,
  buildPollSummary,
  closePoll,
  createPoll,
  deletePollResponse,
  ignorePollResponse,
  markPollResponseReviewed,
  reopenPoll,
  subscribePollResponses,
  subscribePolls,
  updatePollResponseMatch,
} from '../db.polls'
import { downloadPollResponsesCsv } from '../utils/exportPollCsv'
import PageHeader from './PageHeader'
import { PollCreateForm, PollSummary, pollDisplayTitle } from './PollShared'
import { canViewPoll } from '../access'

function playerTeamId(player) {
  return player.teamId || player.assigned_team_id_2026 || player.assignedTeam2026 || null
}

function playerInTeam(player, teamId) {
  if (playerTeamId(player) === teamId) return true
  if (Array.isArray(player.teams_played_2026) && player.teams_played_2026.includes(teamId)) return true
  if (player.games_played_2026 && Number(player.games_played_2026[teamId] || 0) > 0) return true
  return false
}

function targetLabel(poll) {
  if (poll.targetType === 'all_active') return `All active players (${poll.targetPlayers?.length || 0})`
  if (poll.targetType === 'custom') return `Custom audience (${poll.targetPlayers?.length || poll.targetPlayerIds?.length || 0})`
  if (poll.targetType === 'players') return `Selected players (${poll.targetPlayers?.length || poll.targetPlayerIds?.length || 0})`
  if (poll.targetTeamIds?.length > 1) return `${poll.targetTeamIds.length} teams`
  if (poll.teamName || poll.teamId) return poll.teamName || poll.teamId
  return 'Custom audience'
}

function targetSnapshot(players) {
  return players.map(player => ({
    id: String(player.id),
    name: player.name,
    teamId: playerTeamId(player),
  }))
}

function CreatePollModal({ teams, players, onClose, onCreated }) {
  const [targetType, setTargetType] = useState('all_active')
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set())
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [playerSearch, setPlayerSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const activePlayers = useMemo(() => players.filter(player => player.is_active !== 0), [players])
  const selectedPlayers = useMemo(() => {
    if (targetType === 'all_active') return activePlayers
    const teamPlayers = activePlayers.filter(player => [...selectedTeamIds].some(teamId => playerInTeam(player, teamId)))
    const manualPlayers = activePlayers.filter(player => selectedPlayerIds.has(String(player.id)))
    const byId = new Map()
    ;[...teamPlayers, ...manualPlayers].forEach(player => byId.set(String(player.id), player))
    return [...byId.values()]
  }, [activePlayers, selectedPlayerIds, selectedTeamIds, targetType])
  const selectedTeamCount = selectedTeamIds.size
  const selectedManualPlayerCount = selectedPlayerIds.size

  const filteredPlayers = useMemo(() => {
    const needle = playerSearch.trim().toLowerCase()
    return activePlayers
      .filter(player => !needle || player.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activePlayers, playerSearch])

  const toggleTeam = (teamId) => {
    setSelectedTeamIds(current => {
      const next = new Set(current)
      next.has(teamId) ? next.delete(teamId) : next.add(teamId)
      return next
    })
  }

  const togglePlayer = (playerId) => {
    setSelectedPlayerIds(current => {
      const next = new Set(current)
      const key = String(playerId)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleCreate = async ({ title, intro, questions, isPrivate }) => {
    setCreating(true)
    try {
      const targetPlayers = targetSnapshot(selectedPlayers)
      const resolvedTargetType = targetType === 'all_active'
        ? 'all_active'
        : selectedTeamIds.size > 0 && selectedPlayerIds.size > 0
          ? 'custom'
          : selectedTeamIds.size > 0 ? 'teams' : 'players'
      const pollId = await createPoll({
        title,
        intro,
        questions,
        isPrivate,
        createdByEmail: auth.currentUser?.email || '',
        targetType: resolvedTargetType,
        targetTeamIds: targetType === 'all_active' ? [] : [...selectedTeamIds],
        targetPlayerIds: targetPlayers.map(player => player.id),
        targetPlayers,
      })
      onCreated(pollId)
    } catch (e) {
      alert(e.message || 'Could not create poll.')
      throw e
    } finally {
      setCreating(false)
    }
  }

  const targetControls = (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</div>
        <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          {selectedPlayers.length} recipient{selectedPlayers.length === 1 ? '' : 's'}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {[
          { id: 'all_active', label: 'All active players' },
          { id: 'teams', label: 'Teams' },
          { id: 'players', label: 'Specific players' },
        ].map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => setTargetType(option.id)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-100 ${
              targetType === option.id
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {targetType === 'teams' && (
        <div className="flex flex-wrap gap-2">
          {teams.filter(team => team.id !== 'NEW').map(team => {
            const active = selectedTeamIds.has(team.id)
            return (
              <button
                key={team.id}
                type="button"
                onClick={() => toggleTeam(team.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-100 ${
                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {team.id}
              </button>
            )
          })}
        </div>
      )}

      {targetType === 'players' && (
        <div className="space-y-2">
          <input
            value={playerSearch}
            onChange={e => setPlayerSearch(e.target.value)}
            placeholder="Search players..."
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
          />
          <div className="max-h-52 space-y-1 overflow-auto rounded-lg bg-white p-2">
            {filteredPlayers.map(player => {
              const active = selectedPlayerIds.has(String(player.id))
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => togglePlayer(player.id)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                    active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{player.name}</span>
                  <span className="text-xs text-slate-400">{playerTeamId(player) || 'No team'}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500">
        {targetType === 'all_active'
          ? 'All active players are included.'
          : `${selectedTeamCount} team${selectedTeamCount === 1 ? '' : 's'} and ${selectedManualPlayerCount} individual player${selectedManualPlayerCount === 1 ? '' : 's'} selected.`}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 sm:py-8">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New poll</h2>
            <p className="text-xs text-slate-500">Create one public link and track responses against the selected audience.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <PollCreateForm
            creating={creating}
            targetControls={targetControls}
            onCreate={handleCreate}
          />
        </div>
      </div>
    </div>
  )
}

function pollLoadErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return "You don't have permission to browse polls. If this persists, ask an admin to update Firestore rules."
  }
  return 'Failed to load polls.'
}

function pollMatchesTeam(poll, teamId) {
  if (!teamId) return true
  if (String(poll.teamId || '') === String(teamId)) return true
  if (Array.isArray(poll.targetTeamIds) && poll.targetTeamIds.some(id => String(id) === String(teamId))) return true
  return false
}

export default function PollsView({ teams = [], isAdmin = false, userEmail = '', teamFilter = '', onTeamFilterChange }) {
  const [polls, setPolls] = useState([])
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [copiedPollId, setCopiedPollId] = useState('')
  const [selectedPollId, setSelectedPollId] = useState('')
  const [responses, setResponses] = useState([])
  const [busyPollId, setBusyPollId] = useState('')
  const [busyResponseId, setBusyResponseId] = useState('')
  const [statusFilter, setStatusFilter] = useState('open')
  const [search, setSearch] = useState('')

  useEffect(() => {
    getPlayers(false).then(setPlayers).catch(() => setPlayers([]))
  }, [])

  useEffect(() => {
    setLoading(true)
    const unsubscribe = subscribePolls(rows => {
      setPolls(rows)
      setLoading(false)
    }, e => {
      console.error('Failed to load polls', e)
      setError(pollLoadErrorMessage(e))
      setLoading(false)
    }, { isAdmin, userEmail })
    return unsubscribe
  }, [isAdmin, userEmail])

  const selectedPoll = polls.find(poll => poll.id === selectedPollId) || null
  const canViewSelectedPoll = selectedPoll ? canViewPoll(selectedPoll, userEmail, isAdmin) : false

  useEffect(() => {
    if (selectedPollId && selectedPoll && !canViewPoll(selectedPoll, userEmail, isAdmin)) {
      setSelectedPollId('')
    }
  }, [selectedPollId, selectedPoll, userEmail, isAdmin])

  const selectedTargetPlayers = useMemo(() => {
    if (!selectedPoll) return []
    if (Array.isArray(selectedPoll.targetPlayers) && selectedPoll.targetPlayers.length > 0) return selectedPoll.targetPlayers
    if (selectedPoll.teamId) return targetSnapshot(players.filter(player => playerInTeam(player, selectedPoll.teamId)))
    return []
  }, [players, selectedPoll])

  useEffect(() => {
    if (!selectedPollId || !canViewSelectedPoll) {
      setResponses([])
      return undefined
    }
    return subscribePollResponses(selectedPollId, setResponses, e => {
      console.error('Failed to load poll responses', e)
    })
  }, [selectedPollId, canViewSelectedPoll])

  const visiblePolls = useMemo(
    () => polls.filter(poll => canViewPoll(poll, userEmail, isAdmin)),
    [polls, userEmail, isAdmin],
  )

  const filteredPolls = visiblePolls.filter(poll => {
    if (!pollMatchesTeam(poll, teamFilter)) return false
    if (statusFilter === 'open' && !poll.isOpen) return false
    if (statusFilter === 'closed' && poll.isOpen) return false
    const needle = search.trim().toLowerCase()
    if (!needle) return true
    return `${pollDisplayTitle(poll)} ${targetLabel(poll)}`.toLowerCase().includes(needle)
  })

  const summary = useMemo(
    () => selectedPoll ? buildPollSummary(selectedPoll, responses, selectedTargetPlayers) : null,
    [responses, selectedPoll, selectedTargetPlayers],
  )

  const handleCopyLink = async (pollId) => {
    const link = buildPollLink(window.location.origin, pollId)
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedPollId(pollId)
    setTimeout(() => setCopiedPollId(current => (current === pollId ? '' : current)), 2000)
  }

  const handleToggleOpen = async (poll) => {
    const action = poll.isOpen ? 'close' : 'reopen'
    if (!window.confirm(`${action === 'close' ? 'Close' : 'Reopen'} this poll?`)) return
    setBusyPollId(poll.id)
    try {
      if (poll.isOpen) await closePoll(poll.id)
      else await reopenPoll(poll.id)
    } finally {
      setBusyPollId('')
    }
  }

  const handleCreated = (pollId) => {
    setShowCreate(false)
    setSelectedPollId(pollId)
    setStatusFilter('all')
  }

  const handleMapResponse = async (response, player) => {
    setBusyResponseId(response.id)
    try {
      await updatePollResponseMatch(selectedPollId, response.id, player)
    } finally {
      setBusyResponseId('')
    }
  }

  const handleMarkResponseReviewed = async (response) => {
    setBusyResponseId(response.id)
    try {
      await markPollResponseReviewed(selectedPollId, response.id)
    } finally {
      setBusyResponseId('')
    }
  }

  const handleIgnoreResponse = async (response) => {
    if (!window.confirm(`Ignore response from ${response.name || response.nameKey || 'this person'}?`)) return
    setBusyResponseId(response.id)
    try {
      await ignorePollResponse(selectedPollId, response.id)
    } finally {
      setBusyResponseId('')
    }
  }

  const handleDeleteResponse = async (response) => {
    if (!window.confirm(`Delete response from ${response.name || response.nameKey || 'this person'}?`)) return
    setBusyResponseId(response.id)
    try {
      await deletePollResponse(selectedPollId, response.id)
    } finally {
      setBusyResponseId('')
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Polls"
        description={isAdmin
          ? 'Central registry for all polls — create, share links, and track responses'
          : 'Browse polls, view response summaries, and copy public response links'}
        actions={isAdmin ? (
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New poll
          </button>
        ) : null}
      />

      {teams.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Team</span>
          <button
            type="button"
            onClick={() => onTeamFilterChange?.('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              !teamFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          {teams.filter(team => team.id !== 'NEW').map(team => (
            <button
              key={team.id}
              type="button"
              onClick={() => onTeamFilterChange?.(team.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                teamFilter === team.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {team.id}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {['open', 'closed', 'all'].map(filter => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  statusFilter === filter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search polls..."
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
          />

          <div className="mt-3 space-y-2">
            {loading ? (
              <div className="text-sm text-slate-400">Loading polls...</div>
            ) : error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : filteredPolls.length === 0 ? (
              <div className="text-sm text-slate-500">No polls found.</div>
            ) : filteredPolls.map(poll => (
              <button
                key={poll.id}
                type="button"
                onClick={() => setSelectedPollId(poll.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedPollId === poll.id ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-semibold ${poll.isOpen ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                    {poll.isOpen ? 'Open' : 'Closed'}
                  </span>
                  {poll.isPrivate && (
                    <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">Private</span>
                  )}
                  <span className="truncate text-slate-400">{poll.createdAt ? new Date(poll.createdAt).toLocaleDateString('en-AU') : ''}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{pollDisplayTitle(poll)}</div>
                <div className="mt-1 text-xs text-slate-500">{targetLabel(poll)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selectedPoll || !canViewSelectedPoll ? (
            <div className="py-16 text-center text-sm text-slate-400">Select a poll to view results.</div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{targetLabel(selectedPoll)}</div>
                  <h2 className="mt-1 text-xl font-bold text-slate-900">{pollDisplayTitle(selectedPoll)}</h2>
                  {selectedPoll.isPrivate && (
                    <span className="mt-1 inline-block rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Private</span>
                  )}
                  {selectedPoll.intro && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{selectedPoll.intro}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => downloadPollResponsesCsv(selectedPoll, responses)}
                    disabled={responses.length === 0}
                    title={responses.length === 0 ? 'No responses yet' : 'Download responses as CSV'}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyLink(selectedPoll.id)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${copiedPollId === selectedPoll.id ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
                  >
                    {copiedPollId === selectedPoll.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedPollId === selectedPoll.id ? 'Copied' : 'Copy link'}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={busyPollId === selectedPoll.id}
                      onClick={() => handleToggleOpen(selectedPoll)}
                      className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
                    >
                      {busyPollId === selectedPoll.id ? 'Saving...' : (selectedPoll.isOpen ? 'Close' : 'Reopen')}
                    </button>
                  )}
                </div>
              </div>
              <PollSummary
                summary={summary}
                targetPlayers={selectedTargetPlayers}
                busyResponseId={busyResponseId}
                readOnly={!isAdmin}
                onMap={handleMapResponse}
                onMarkReviewed={handleMarkResponseReviewed}
                onIgnore={handleIgnoreResponse}
                onDelete={handleDeleteResponse}
              />
            </div>
          )}
        </div>
      </div>

      {isAdmin && showCreate && (
        <CreatePollModal
          teams={teams}
          players={players}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
