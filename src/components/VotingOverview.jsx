import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, RefreshCw } from 'lucide-react'
import { getRounds } from '../db'
import { getVotingOverview, tallyVotes, closeVoteSession, reopenVoteSession } from '../db.votes'
import { buildVoteLink } from '../voteUrl'
import PageHeader from './PageHeader'

/** Accent colours for progress/sparklines only */
const TOKENS = {
  navy: '#041C2C',
  cream: '#f6f1e6',
  blue: '#7DA1C4',
  yellow: '#F1B434',
}

function formatDate(value) {
  if (!value) return 'Date TBC'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: value >= 80 ? TOKENS.yellow : TOKENS.blue }}
      />
    </div>
  )
}

function Sparkline({ rounds, roundIds }) {
  const values = roundIds.map(id => rounds[String(id)] || 0)
  const max = Math.max(3, ...values)
  return (
    <div className="flex h-8 items-end gap-1">
      {values.map((value, index) => (
        <div
          key={`${roundIds[index]}-${index}`}
          className="w-1.5 rounded-t"
          title={`${value} point${value === 1 ? '' : 's'}`}
          style={{
            height: value ? `${Math.max(18, (value / max) * 100)}%` : 3,
            background: value ? TOKENS.yellow : 'rgb(226 232 240)',
          }}
        />
      ))}
    </div>
  )
}

function OverviewTabs({ activeTab, onTab }) {
  return (
    <div className="flex w-full gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto">
      {['rounds', 'tally'].map(tab => (
        <button
          key={tab}
          type="button"
          onClick={() => onTab(tab)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
            activeTab === tab ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {tab === 'rounds' ? 'Rounds' : 'Season tally'}
        </button>
      ))}
    </div>
  )
}

function RoundVoteTally({ round }) {
  if (!round.hasSession) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
        No voting form has been created for this round yet.
      </div>
    )
  }

  const responses = round.session?.responses || []
  const players = round.session?.players || []
  const scored = tallyVotes(responses, players).filter(player => player.points > 0)

  if (responses.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
        No votes submitted yet.
      </div>
    )
  }

  if (scored.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
        No player has received points yet.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="divide-y divide-slate-200">
        {scored.map((player, index) => (
          <div key={player.playerId} className="flex items-center gap-3 px-4 py-3">
            <span className="w-8 shrink-0 text-xs font-semibold text-slate-400">#{index + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">{player.name}</div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {player.votes3 > 0 && (
                <span className="rounded border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">
                  {player.votes3}×3
                </span>
              )}
              {player.votes2 > 0 && (
                <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                  {player.votes2}×2
                </span>
              )}
              {player.votes1 > 0 && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                  {player.votes1}×1
                </span>
              )}
              <span className="w-8 text-right text-sm font-bold tabular-nums text-slate-900">{player.points}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        {responses.length} vote{responses.length === 1 ? '' : 's'} submitted
      </div>
    </div>
  )
}

function VotingSummaryStrip({ activeTab, participation, totalResponses, totalCapacity, openRounds }) {
  const primaryOpen = openRounds[0]
  const extraOpenCount = openRounds.length > 1 ? openRounds.length - 1 : 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">Season participation</div>
      <p className="mt-1 text-sm text-slate-900">
        <span className="font-semibold">{participation}%</span>
        <span className="text-slate-600">
          {' · '}
          {totalResponses}/{totalCapacity || 0} possible votes
        </span>
      </p>

      {activeTab === 'rounds' && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {primaryOpen ? (
            <>
              <div className="text-xs font-semibold text-amber-800">Current open round</div>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900">{primaryOpen.roundLabel}</div>
                  {(primaryOpen.opponent || primaryOpen.hasSession) && (
                    <div className="mt-0.5 text-sm text-slate-600">
                      {primaryOpen.opponent ? `vs ${primaryOpen.opponent}` : 'Opponent TBC'}
                    </div>
                  )}
                </div>
                <div className="w-full sm:w-56 sm:flex-shrink-0">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {primaryOpen.responseCount}/{primaryOpen.squadSize || 0} submitted
                    </span>
                  </div>
                  <ProgressBar value={primaryOpen.participation} />
                </div>
              </div>
              {extraOpenCount > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  +{extraOpenCount} other open round{extraOpenCount === 1 ? '' : 's'}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">No voting form is currently open for this team.</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function VotingOverview({ teams }) {
  const visibleTeams = useMemo(() => teams.filter(t => t.id !== 'NEW'), [teams])
  const [rounds, setRounds] = useState([])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTeam, setActiveTeam] = useState(visibleTeams[0]?.id || 'PL')
  const [activeTab, setActiveTab] = useState('rounds')
  const [expandedRoundId, setExpandedRoundId] = useState(null)
  const [copiedSessionId, setCopiedSessionId] = useState(null)
  const [sessionBusy, setSessionBusy] = useState(null)

  useEffect(() => {
    if (!visibleTeams.length) return
    setActiveTeam(current => visibleTeams.some(t => t.id === current) ? current : visibleTeams[0].id)
  }, [visibleTeams])

  const load = async () => {
    if (!visibleTeams.length) return
    setLoading(true)
    setError('')
    try {
      const allRounds = (await getRounds()).filter(r => r.round_type === 'season')
      const data = await getVotingOverview(allRounds, visibleTeams)
      setRounds(allRounds)
      setOverview(data)
    } catch (e) {
      console.error('Failed to load voting overview', e)
      setError('Failed to load voting overview.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [visibleTeams])

  const team = visibleTeams.find(t => t.id === activeTeam) || visibleTeams[0]
  const teamRounds = useMemo(
    () => (overview?.roundStats || []).filter(r => r.teamId === team?.id),
    [overview, team?.id]
  )
  const sessionRounds = useMemo(
    () => teamRounds
      .filter(r => r.hasSession)
      .sort((a, b) => (b.roundNumber ?? 0) - (a.roundNumber ?? 0)),
    [teamRounds]
  )
  const tally = overview?.teamTallies?.[team?.id] || []
  const roundIds = rounds.map(r => r.id)
  const openRounds = useMemo(
    () => sessionRounds.filter(r => r.isOpen),
    [sessionRounds]
  )
  const totalResponses = sessionRounds.reduce((sum, r) => sum + r.responseCount, 0)
  const totalCapacity = sessionRounds.reduce((sum, r) => sum + r.squadSize, 0)
  const participation = totalCapacity > 0 ? Math.round((totalResponses / totalCapacity) * 100) : 0
  const topThree = tally.slice(0, 3)

  const handleCopyVoteLink = async (round) => {
    if (!round?.hasSession || !round.isOpen) return
    const sourceRound = rounds.find(r => String(r.id) === String(round.roundId))
    if (!sourceRound) return

    const link = buildVoteLink(window.location.origin, round.teamId, sourceRound, rounds)
    try {
      await navigator.clipboard.writeText(link)
      setCopiedSessionId(round.sessionId)
      setTimeout(() => {
        setCopiedSessionId(current => current === round.sessionId ? null : current)
      }, 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedSessionId(round.sessionId)
      setTimeout(() => {
        setCopiedSessionId(current => current === round.sessionId ? null : current)
      }, 2500)
    }
  }

  const handleCloseVoting = async (round) => {
    if (!round?.hasSession || !round.isOpen) return
    if (!window.confirm(`Close voting for ${round.roundLabel}? Players will no longer be able to submit votes.`)) return
    setSessionBusy(round.sessionId)
    try {
      await closeVoteSession(round.roundId, round.teamId)
      await load()
    } catch (e) {
      console.error('Failed to close voting', e)
      alert('Could not close voting — try again.')
    } finally {
      setSessionBusy(null)
    }
  }

  const handleReopenVoting = async (round) => {
    if (!round?.hasSession || round.isOpen) return
    if (!window.confirm(`Reopen voting for ${round.roundLabel}?`)) return
    setSessionBusy(round.sessionId)
    try {
      await reopenVoteSession(round.roundId, round.teamId)
      await load()
    } catch (e) {
      console.error('Failed to reopen voting', e)
      alert('Could not reopen voting — try again.')
    } finally {
      setSessionBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Voting overview" description="Coach admin dashboard" />
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-400 shadow-sm">
          Loading voting overview…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Voting overview" description="Coach admin dashboard" />
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-red-600 shadow-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 text-slate-900">
      <PageHeader title="Voting overview" description="Coach admin dashboard" />

      <div className="flex flex-wrap gap-1.5">
        {visibleTeams.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTeam(t.id)}
            className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
              activeTeam === t.id
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {t.id}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {team?.name || team?.id || 'Team'}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {activeTab === 'rounds' ? `${participation}% of votes are in` : 'Season tally'}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {activeTab === 'rounds'
                  ? 'Track submitted voting forms by round.'
                  : 'Leaderboard sorted by points, then 3-vote count.'}
              </p>
            </div>
            <OverviewTabs activeTab={activeTab} onTab={setActiveTab} />
          </div>

          <VotingSummaryStrip
            activeTab={activeTab}
            participation={participation}
            totalResponses={totalResponses}
            totalCapacity={totalCapacity}
            openRounds={openRounds}
          />

          {activeTab === 'rounds' ? (
            <div className="space-y-3">
              {sessionRounds.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  No voting forms yet for this team — create one from Round Planner.
                </div>
              ) : (
                sessionRounds.map(round => {
                  const isExpanded = expandedRoundId === round.sessionId
                  const busy = sessionBusy === round.sessionId
                  return (
                  <div key={round.sessionId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-500">{round.roundLabel}</div>
                        <div className="mt-1 text-base font-semibold text-slate-900">
                          {round.opponent ? `vs ${round.opponent}` : 'Opponent TBC'}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {[formatDate(round.roundDate), round.venue].filter(Boolean).join(' · ')}
                          {round.scoreFor != null && round.scoreAgainst != null
                            ? ` · ${round.scoreFor}-${round.scoreAgainst}`
                            : ''}
                          {round.result ? ` · ${round.result}` : ''}
                        </div>
                      </div>
                      <div className="w-full sm:w-56">
                        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            {round.responseCount}/{round.squadSize || 0} submitted
                          </span>
                          <span
                            className={`font-semibold ${round.isOpen ? 'text-amber-800' : 'text-slate-400'}`}
                          >
                            {round.isOpen ? 'Open' : 'Closed'}
                          </span>
                        </div>
                        <ProgressBar value={round.participation} />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                      {round.isOpen && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCopyVoteLink(round)}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                            copiedSessionId === round.sessionId
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                          }`}
                          title="Copy voting link"
                          aria-label={`Copy voting link for ${round.roundLabel}`}
                        >
                          {copiedSessionId === round.sessionId ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy link
                            </>
                          )}
                        </button>
                      )}
                      {round.isOpen ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleCloseVoting(round)}
                          className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busy ? 'Closing…' : 'Close voting'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleReopenVoting(round)}
                          className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50"
                        >
                          {busy ? 'Reopening…' : 'Reopen'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpandedRoundId(current => current === round.sessionId ? null : round.sessionId)}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        {isExpanded ? 'Hide votes' : 'View votes'}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="mt-3">
                        <RoundVoteTally round={round} />
                      </div>
                    )}
                  </div>
                  )
                })
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {tally.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">No submitted votes yet for this team.</div>
              ) : (
                tally.map((player, index) => (
                  <div
                    key={player.playerId}
                    className="grid gap-3 border-b border-slate-100 px-4 py-4 sm:grid-cols-[56px_1fr_130px_110px]"
                  >
                    <div className="flex items-center gap-3 sm:block">
                      <div className="text-xs font-semibold text-slate-400">#{index + 1}</div>
                      <div
                        className="mt-0 hidden h-9 w-9 items-center justify-center rounded-full text-sm font-semibold sm:flex"
                        style={{ background: TOKENS.cream, color: TOKENS.navy }}
                      >
                        {initials(player.name)}
                      </div>
                    </div>
                    <div>
                      <div className="text-base font-semibold text-slate-900">{player.name}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {player.votes3} × 3 votes · {player.votes2} × 2 votes · {player.votes1} × 1 votes
                      </div>
                    </div>
                    <Sparkline rounds={player.rounds} roundIds={roundIds} />
                    <div className="text-left sm:text-right">
                      <div className="text-2xl font-bold leading-none text-slate-900">{player.points}</div>
                      <div className="text-xs text-slate-500">points</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-500">Top three</div>
              <button
                type="button"
                onClick={load}
                className="rounded-lg p-1 text-slate-400 hover:text-slate-700"
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {topThree.length === 0 ? (
                <p className="text-sm text-slate-500">No leaderboard yet.</p>
              ) : (
                topThree.map((player, index) => (
                  <div key={player.playerId} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold"
                        style={{ background: index === 0 ? TOKENS.yellow : TOKENS.cream, color: TOKENS.navy }}
                      >
                        {initials(player.name)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{player.name}</div>
                        <div className="text-xs text-slate-500">{player.votes3} first-place votes</div>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-slate-900">{player.points}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
