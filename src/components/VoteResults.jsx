// src/components/VoteResults.jsx
// All-teams vote results dashboard for the current round (selector/admin only)

import { useState, useEffect } from 'react'
import { getVoteSession, getVoteResponses, tallyVotes } from '../db.votes'

export default function VoteResults({ roundId, teams, roundLabel, onClose }) {
  const [data, setData] = useState({})   // { teamId: { session, tally, count } }
  const [loading, setLoading] = useState(true)
  const [activeTeam, setActiveTeam] = useState(null)

  useEffect(() => {
    async function load() {
      const results = {}
      await Promise.all(teams.map(async t => {
        const session = await getVoteSession(roundId, t.id)
        if (!session) return
        const responses = await getVoteResponses(`${roundId}__${t.id}`)
        results[t.id] = {
          session,
          tally: tallyVotes(responses, session.players),
          count: responses.length,
        }
      }))
      setData(results)
      // Default to first team that has a session
      const first = teams.find(t => results[t.id])
      if (first) setActiveTeam(first.id)
      setLoading(false)
    }
    load()
  }, [roundId, teams])

  const medal = i => ['🥇', '🥈', '🥉'][i] ?? null
  const active = activeTeam ? data[activeTeam] : null
  const teamsWithSessions = teams.filter(t => data[t.id])

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">Vote Results</h3>
            <p className="text-xs text-slate-400 mt-0.5">{roundLabel}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-12">Loading…</div>
        ) : teamsWithSessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-12">
            No voting sessions created for this round yet.
          </div>
        ) : (
          <>
            {/* Team tabs */}
            <div className="flex gap-1 px-4 pt-3 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              {teamsWithSessions.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTeam(t.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    activeTeam === t.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {t.id}
                  {data[t.id]?.count > 0 && (
                    <span className={`ml-1.5 text-[10px] px-1 rounded-full ${
                      activeTeam === t.id ? 'bg-indigo-400 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {data[t.id].count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Results panel */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {active ? (
                active.count === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">No votes submitted yet.</p>
                ) : (
                  <div className="space-y-1">
                    {active.tally.filter(t => t.points > 0).map((t, i) => (
                      <div key={t.playerId}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                          i < 3 ? 'bg-slate-50' : ''
                        }`}
                      >
                        <span className="w-7 text-center text-lg flex-shrink-0">
                          {medal(i) || <span className="text-xs text-slate-300 font-mono">#{i + 1}</span>}
                        </span>
                        <span className="flex-1 text-sm font-medium text-slate-800">{t.name}</span>
                        <div className="flex items-center gap-1.5">
                          {t.votes3 > 0 && (
                            <span className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded font-semibold">
                              {t.votes3}×3
                            </span>
                          )}
                          {t.votes2 > 0 && (
                            <span className="text-[10px] bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">
                              {t.votes2}×2
                            </span>
                          )}
                          {t.votes1 > 0 && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                              {t.votes1}×1
                            </span>
                          )}
                          <span className="text-base font-bold text-slate-800 w-7 text-right">{t.points}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : null}
            </div>

            {/* Footer — vote count */}
            {active && (
              <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400">
                {active.count} vote{active.count !== 1 ? 's' : ''} submitted
                {active.session?.isOpen === false && (
                  <span className="ml-2 text-amber-500 font-medium">· Closed</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
