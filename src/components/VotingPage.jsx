// src/components/VotingPage.jsx
// Public, no-login anonymous voting page. URL: /vote/:teamId/:roundKey
// Players assign 3, 2, 1 points to three different teammates then submit.

import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getRounds } from '../db'
import { getVoteSession, submitVote, voteSessionId } from '../db.votes'
import { isValidVoteTeamId, resolveRoundIdFromKey } from '../voteUrl'

const MEDAL = {
  3: { label: '3 pts', tone: '#F1B434', fg: '#041C2C', eyebrow: 'Best on ground' },
  2: { label: '2 pts', tone: '#94A3B8', fg: '#ffffff', eyebrow: 'Second' },
  1: { label: '1 pt', tone: '#CD7F32', fg: '#ffffff', eyebrow: 'Third' },
}

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function Layout({ children, centre = false }) {
  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 ${centre ? 'flex items-center justify-center p-6' : ''}`}>
      {children}
    </div>
  )
}

export default function VotingPage() {
  const { teamId: teamIdParam, roundKey: roundKeyParam } = useParams()
  const teamId = teamIdParam ? decodeURIComponent(teamIdParam) : ''
  const roundKey = roundKeyParam ? decodeURIComponent(roundKeyParam) : ''

  const [resolvedRoundId, setResolvedRoundId] = useState(null)
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [votes, setVotes] = useState({ '3': null, '2': null, '1': null })
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSession(null)
    setResolvedRoundId(null)
    setSubmitted(false)
    setVotes({ '3': null, '2': null, '1': null })

    ;(async () => {
      try {
        const rounds = await getRounds()
        if (cancelled) return

        if (!isValidVoteTeamId(teamId)) {
          setError('Invalid voting link.')
          return
        }

        const rid = resolveRoundIdFromKey(roundKey, rounds)
        if (!rid) {
          setError('Voting session not found. Check the link or ask your team manager.')
          return
        }

        setResolvedRoundId(rid)

        const s = await getVoteSession(rid, teamId)
        if (cancelled) return

        if (!s) setError('Voting session not found. Check the link or ask your team manager.')
        else if (!s.isOpen) setError('Voting for this round has closed.')
        else setSession(s)
      } catch {
        if (!cancelled) setError('Failed to load voting session.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [teamId, roundKey])

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
    if (!ready || submitting || !resolvedRoundId) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitVote(voteSessionId(resolvedRoundId, teamId), { votes })
      setSubmitted(true)
    } catch {
      setSubmitError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Layout centre>
        <p className="text-sm text-slate-500">Loading…</p>
      </Layout>
    )
  }

  if (error) {
    return (
      <Layout centre>
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Voting unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </Layout>
    )
  }

  const match = session.matchContext || {}
  const players = Array.isArray(session.players) ? session.players : []
  const scoreReady = match.scoreFor != null && match.scoreAgainst != null
  const resultDetail = [
    match.result,
    scoreReady ? `${match.scoreFor}-${match.scoreAgainst}` : '',
  ].filter(Boolean).join(' ')
  const matchDetails = [
    formatDate(match.matchDate),
    match.time,
    match.venue,
    resultDetail,
  ].filter(Boolean)
  const scorers = Array.isArray(match.scorers)
    ? match.scorers.filter(scorer => scorer?.name && Number(scorer.goals) > 0)
    : []
  const scorerSummary = scorers
    .map(scorer => `${scorer.name}${Number(scorer.goals) > 1 ? ` x${Number(scorer.goals)}` : ''}`)
    .join(', ')
  const assignedIds = new Set(Object.values(votes).filter(Boolean).map(String))

  const slotMeta = MEDAL

  if (submitted) {
    return (
      <Layout centre>
        <div className="max-w-sm space-y-5 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">
            OK
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Vote submitted</h2>
            <p className="mt-2 text-sm text-slate-500">
              Your Best & Fairest votes have been recorded anonymously.
            </p>
          </div>
          <div className="space-y-2 text-left">
            {['3', '2', '1'].map((pts) => {
              const p = players.find(pl => String(pl.id) === String(votes[pts]))
              const meta = slotMeta[pts]
              return p ? (
                <div
                  key={pts}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="text-slate-800">{p.name}</span>
                  <span className="font-semibold" style={{ color: meta.tone }}>{meta.label}</span>
                </div>
              ) : null
            })}
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto min-h-screen w-full max-w-lg px-3 pb-36 pt-4 sm:px-4 sm:pt-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
            <div>
              <div className="text-sm font-semibold text-slate-900">Best & Fairest</div>
              <div className="text-xs text-slate-500">Mentone 2026</div>
            </div>
            <span className="rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              Anonymous
            </span>
          </div>

          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xs font-semibold text-blue-700">
                {match.roundLabel || session.roundLabel}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs font-medium text-slate-500">
                {match.teamName || session.teamId || teamId}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-tight text-slate-900">
              {match.opponent ? <>vs {match.opponent}</> : <>Vote for {session.teamId || teamId}</>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-slate-500">
              {matchDetails.length > 0 ? matchDetails.map((detail, index) => (
                <span key={`${detail}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 && <span className="text-slate-300">·</span>}
                  <span className={detail === resultDetail ? 'font-semibold text-slate-800' : ''}>{detail}</span>
                </span>
              )) : <span>Assign 3, 2 and 1 points</span>}
            </div>
            {scorerSummary && (
              <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
                <span className="font-semibold text-slate-800">Scorers:</span> {scorerSummary}
              </div>
            )}
          </div>

          <div className="px-4 py-4 sm:px-5">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Select your 3, 2 and 1
            </p>
            <div className="grid grid-cols-3 gap-2">
              {['3', '2', '1'].map(pts => {
                const player = players.find(p => String(p.id) === String(votes[pts]))
                const meta = slotMeta[pts]
                return (
                  <button
                    key={pts}
                    type="button"
                    onClick={() => player && clearVote(pts)}
                    className={`relative flex min-h-[78px] flex-col justify-between rounded-lg border p-2.5 text-left transition ${
                      player
                        ? 'border-transparent shadow-sm'
                        : 'border-slate-200 bg-slate-50 text-slate-400'
                    }`}
                    style={player ? { background: meta.tone, color: meta.fg, borderColor: meta.tone } : undefined}
                  >
                    <div className="text-base font-bold leading-none">{meta.label}</div>
                    <div>
                      {player ? (
                        <>
                          <div className="text-xs font-semibold leading-tight">{player.name.split(' ')[0]}</div>
                          <div className="mt-0.5 text-[11px] opacity-80">{player.name.split(' ').slice(1).join(' ')}</div>
                        </>
                      ) : (
                        <div className="text-[11px]">{meta.eyebrow}</div>
                      )}
                    </div>
                    {player && (
                      <div className="absolute right-2 top-1.5 text-[10px] font-semibold opacity-70">tap to clear</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="px-4 pb-2 text-xs leading-relaxed text-slate-500 sm:px-5">
            Tap a player to assign your next vote.
            {ready && <span className="font-medium text-blue-700"> All set. Submit below.</span>}
          </div>

          <div className="px-2 pb-4 sm:px-3">
            {players.length === 0 && (
              <div className="mx-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                No players are attached to this voting link yet. Regenerate the link from the planner to refresh the team list.
              </div>
            )}
            {players.map(player => {
              const pid = String(player.id)
              const assignedPts = Object.entries(votes).find(([, v]) => String(v) === pid)?.[0]
              const isAssigned = !!assignedPts
              const nextPts = ['3', '2', '1'].find(p => votes[p] === null)
              const allFull = assignedIds.size >= 3 && !isAssigned
              const meta = isAssigned ? slotMeta[assignedPts] : null

              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => {
                    if (isAssigned) clearVote(assignedPts)
                    else if (nextPts) assignVote(nextPts, pid)
                  }}
                  disabled={allFull}
                  className={`mb-1 flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition sm:py-3 ${
                    isAssigned ? 'border-slate-200' : 'border-transparent hover:bg-slate-50'
                  } ${allFull ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'}`}
                  style={isAssigned ? {
                    background:
                      assignedPts === '3' ? 'rgba(241,180,52,0.12)' :
                      assignedPts === '2' ? 'rgba(148,163,184,0.15)' :
                      'rgba(205,127,50,0.12)',
                    borderColor: meta.tone,
                  } : undefined}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    style={isAssigned ? { background: meta.tone, color: meta.fg } : { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}
                  >
                    {isAssigned ? assignedPts : player.name.charAt(0)}
                  </div>
                  <span className="flex-1 text-[15px] font-medium text-slate-800">{player.name}</span>
                  {isAssigned && (
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: meta.tone }}>
                      {meta.label}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div
          className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-lg">
            {submitError && <p className="mb-2 text-center text-xs text-red-600">{submitError}</p>}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!ready || submitting}
              className={`h-12 w-full rounded-lg text-sm font-semibold transition ${
                ready && !submitting
                  ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              {submitting ? 'Submitting…' : ready ? 'Submit votes' : `Pick ${3 - assignedIds.size} more`}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  )
}
