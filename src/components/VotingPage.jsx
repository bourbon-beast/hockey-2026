// src/components/VotingPage.jsx
// Public, no-login anonymous voting page. URL: /vote/:roundId/:teamId
// Players assign 3, 2, 1 points to three different teammates then submit.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getVoteSession, submitVote } from '../db.votes'

export default function VotingPage() {
  const { roundId, teamId } = useParams()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [votes, setVotes] = useState({ '3': null, '2': null, '1': null })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    getVoteSession(roundId, teamId)
      .then(s => {
        if (!s) setError('Voting session not found. Check the link or ask your team manager.')
        else if (!s.isOpen) setError('Voting for this round has closed.')
        else setSession(s)
      })
      .catch(() => setError('Failed to load voting session.'))
      .finally(() => setLoading(false))
  }, [roundId, teamId])

  const clearVote = (points) => {
    setVotes(prev => ({ ...prev, [String(points)]: null }))
  }

  const assignVote = (points, playerId) => {
    setVotes(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { if (next[k] === playerId) next[k] = null })
      if (prev[String(points)] === playerId) {
        next[String(points)] = null
      } else {
        next[String(points)] = playerId
      }
      return next
    })
  }

  const ready = votes['3'] !== null && votes['2'] !== null && votes['1'] !== null

  const handleSubmit = async () => {
    if (!ready || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitVote(`${roundId}__${teamId}`, { votes })
      setSubmitted(true)
    } catch (e) {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm">Loading…</div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <div className="text-4xl">🏑</div>
        <p className="text-slate-300 text-sm max-w-xs">{error}</p>
      </div>
    </div>
  )

  // ── Submitted ────────────────────────────────────────────────────────────
  if (submitted) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <div className="text-5xl">✅</div>
        <h2 className="text-white text-xl font-bold">Vote submitted!</h2>
        <p className="text-slate-400 text-sm">Your votes have been recorded anonymously.</p>
        <div className="mt-4 space-y-1.5 text-sm">
          {[['3', '🥇'], ['2', '🥈'], ['1', '🥉']].map(([pts, medal]) => {
            const p = session.players.find(pl => String(pl.id) === String(votes[pts]))
            return p ? (
              <div key={pts} className="text-slate-300">{medal} {pts} pts — {p.name}</div>
            ) : null
          })}
        </div>
      </div>
    </div>
  )

  const assignedIds = new Set(Object.values(votes).filter(Boolean).map(String))

  // ── Voting UI ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 text-white">

      {/* ── Header ── */}
      <div className="bg-slate-800 border-b border-slate-700 px-5 py-5">
        <div className="flex items-baseline gap-3 mb-1">
          <span className="text-3xl font-extrabold tracking-tight text-white">{session.teamId}</span>
          <span className="text-xl font-semibold text-blue-400">{session.roundLabel}</span>
        </div>
        <p className="text-sm text-slate-400 font-medium">Best &amp; Fairest — assign 3, 2 and 1 points</p>
        <p className="text-xs text-slate-600 mt-0.5">Anonymous · votes close automatically</p>
      </div>

      {/* ── Vote slot summary ── */}
      <div className="px-4 py-3 border-b border-slate-700 flex gap-2">
        {[
          ['3', '🥇', 'border-yellow-500/60 bg-yellow-500/10', 'text-yellow-400'],
          ['2', '🥈', 'border-slate-400/40 bg-slate-400/10', 'text-slate-300'],
          ['1', '🥉', 'border-amber-700/40 bg-amber-800/10', 'text-amber-500'],
        ].map(([pts, medal, border, colour]) => {
          const player = session.players.find(p => String(p.id) === String(votes[pts]))
          return (
            <div key={pts}
              className={`flex-1 flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border ${
                player ? border : 'border-slate-700 bg-slate-800/40'
              }`}
            >
              <span className="text-xl leading-none">{medal}</span>
              <span className={`text-sm font-bold ${player ? colour : 'text-slate-600'}`}>{pts} pts</span>
              {player ? (
                <div className="text-center">
                  <div className="text-xs text-white font-medium leading-tight">{player.name.split(' ')[0]}</div>
                  <button onClick={() => clearVote(pts)} className="text-[10px] text-slate-500 hover:text-red-400 mt-0.5">clear</button>
                </div>
              ) : (
                <span className="text-xs text-slate-600">—</span>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Player list ── */}
      <div className="px-4 py-3 space-y-2 pb-32">
        <p className="text-xs text-slate-500 mb-3">
          Tap a player to assign your next available points. Tap again to remove.
        </p>

        {session.players.map(player => {
          const pid = String(player.id)
          const assignedPts = Object.entries(votes).find(([, v]) => String(v) === pid)?.[0]
          const isAssigned = !!assignedPts
          const nextPts = ['3', '2', '1'].find(p => votes[p] === null)
          const allFull = assignedIds.size >= 3 && !isAssigned

          return (
            <button
              key={pid}
              onClick={() => {
                if (isAssigned) clearVote(assignedPts)
                else if (nextPts) assignVote(nextPts, pid)
              }}
              disabled={allFull}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all ${
                isAssigned
                  ? assignedPts === '3'
                    ? 'bg-yellow-500/20 border border-yellow-500/50'
                    : assignedPts === '2'
                    ? 'bg-slate-400/20 border border-slate-400/40'
                    : 'bg-amber-800/20 border border-amber-700/40'
                  : allFull
                  ? 'bg-slate-800/40 border border-slate-700/40 opacity-40 cursor-not-allowed'
                  : 'bg-slate-800 border border-slate-700 active:bg-slate-700'
              }`}
            >
              {/* Avatar / points badge */}
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                isAssigned
                  ? assignedPts === '3' ? 'bg-yellow-500 text-slate-900'
                  : assignedPts === '2' ? 'bg-slate-300 text-slate-900'
                  : 'bg-amber-700 text-white'
                  : 'bg-slate-700 text-slate-400'
              }`}>
                {isAssigned ? assignedPts : player.name.charAt(0)}
              </div>

              <span className="text-sm font-medium flex-1">{player.name}</span>

              {isAssigned && (
                <span className={`text-xs font-bold ${
                  assignedPts === '3' ? 'text-yellow-400'
                  : assignedPts === '2' ? 'text-slate-300'
                  : 'text-amber-500'
                }`}>
                  {assignedPts} pts
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Fixed submit footer ── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-700 px-4 py-4 backdrop-blur-sm"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {submitError && <p className="text-red-400 text-xs mb-2 text-center">{submitError}</p>}
        <button
          onClick={handleSubmit}
          disabled={!ready || submitting}
          className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
            ready && !submitting
              ? 'bg-blue-600 text-white active:bg-blue-700'
              : 'bg-slate-700 text-slate-500 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Submitting…' : ready ? 'Submit votes' : `Select ${3 - assignedIds.size} more player${3 - assignedIds.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
