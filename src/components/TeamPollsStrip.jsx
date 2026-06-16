import { useEffect, useState } from 'react'
import { Check, ChevronRight, Copy } from 'lucide-react'
import { auth } from '../firebase'
import { buildPollLink, createPoll, subscribeTeamPolls } from '../db.polls'
import { canViewPoll } from '../access'
import { PollCreateForm, pollDisplayTitle } from './PollShared'

function pollLoadErrorMessage(error) {
  if (error?.code === 'permission-denied') {
    return "You don't have permission to browse polls. If this persists, ask an admin to update Firestore rules."
  }
  return 'Failed to load polls.'
}

export default function TeamPollsStrip({
  teamId,
  teamName,
  teamPlayers = [],
  isAdmin = false,
  userEmail = '',
  onViewAllPolls,
}) {
  const [polls, setPolls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copiedPollId, setCopiedPollId] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (!teamId) return undefined
    setLoading(true)
    setError('')
    const unsubscribe = subscribeTeamPolls(teamId, rows => {
      setPolls(rows.filter(poll => canViewPoll(poll, userEmail, isAdmin)))
      setLoading(false)
    }, e => {
      console.error('Failed to load team polls', e)
      setError(pollLoadErrorMessage(e))
      setLoading(false)
    }, { isAdmin, userEmail })
    return unsubscribe
  }, [teamId, userEmail, isAdmin])

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

  const handleCreate = async ({ title, intro, questions, isPrivate }) => {
    setCreating(true)
    try {
      await createPoll({
        teamId,
        teamName,
        targetType: 'teams',
        targetTeamIds: [teamId],
        targetPlayerIds: (teamPlayers || []).map(player => String(player.id)),
        targetPlayers: (teamPlayers || []).map(player => ({
          id: String(player.id),
          name: player.name,
          teamId,
        })),
        title,
        intro,
        questions,
        isPrivate,
        createdByEmail: auth.currentUser?.email || '',
      })
      setShowCreate(false)
    } catch (e) {
      console.error('Failed to create poll', e)
      alert(e.message || 'Could not create poll.')
      throw e
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Team polls</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Polls scoped to this team. All polls also appear in the central Polls registry.
          </p>
        </div>
        {onViewAllPolls && (
          <button
            type="button"
            onClick={() => onViewAllPolls(teamId)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
          >
            View all polls
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="p-4">
        {loading ? (
          <div className="text-sm text-slate-400">Loading polls…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : polls.length === 0 ? (
          <div className="text-sm text-slate-500">No polls for this team yet.</div>
        ) : (
          <div className="space-y-2">
            {polls.map(poll => (
              <div
                key={poll.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`rounded px-1.5 py-0.5 font-semibold ${poll.isOpen ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                      {poll.isOpen ? 'Open' : 'Closed'}
                    </span>
                    {poll.isPrivate && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-700">Private</span>
                    )}
                    {poll.createdAt && (
                      <span className="text-slate-400">
                        {new Date(poll.createdAt).toLocaleDateString('en-AU')}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                    {pollDisplayTitle(poll)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyLink(poll.id)}
                  className={`inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                    copiedPollId === poll.id
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  {copiedPollId === poll.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedPollId === poll.id ? 'Copied' : 'Copy link'}
                </button>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            {!showCreate ? (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Quick create for this team
              </button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    New team poll
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Cancel
                  </button>
                </div>
                <PollCreateForm
                  creating={creating}
                  targetDescription={`Targets ${teamPlayers.length} player${teamPlayers.length === 1 ? '' : 's'} on ${teamId}. Manage responses in Polls.`}
                  onCreate={handleCreate}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
