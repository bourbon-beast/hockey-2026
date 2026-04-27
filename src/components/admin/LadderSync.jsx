// Admin panel — Ladder Sync
// Calls syncLadder, writes to hvSync/ladders + hvSync/latest, displays results.

import { useState, useEffect } from 'react'
import { auth } from '../../firebase'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

const SYNC_LADDER_URL = import.meta.env.VITE_SYNC_LADDER_URL

const TEAM_NAMES = {
  PL:    'Premier League',
  PLR:   'PL Reserves',
  PB:    'Pennant B',
  PC:    'Pennant C',
  PE:    'Pennant E',
  Metro: 'Metro',
}

function ordinal(n) {
  if (!n) return '—'
  const s = ['th','st','nd','rd'], v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export default function LadderSync() {
  const [phase, setPhase]       = useState('idle')  // idle | syncing | done | error
  const [log, setLog]           = useState([])
  const [showLog, setShowLog]   = useState(false)
  const [ladders, setLadders]   = useState(null)    // last sync result
  const [syncedAt, setSyncedAt] = useState(null)
  const [loadingExisting, setLoadingExisting] = useState(true)

  // Load existing ladder data from Firestore on mount
  useEffect(() => {
    getDoc(doc(db, 'hvSync', 'ladders'))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data()
          setLadders(d.ladders || null)
          setSyncedAt(d.syncedAt || null)
        }
      })
      .finally(() => setLoadingExisting(false))
  }, [])

  const runSync = async () => {
    if (!SYNC_LADDER_URL) {
      setPhase('error')
      setLog(['SYNC_LADDER_URL not configured'])
      return
    }
    setPhase('syncing')
    setLog([])
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res  = await fetch(SYNC_LADDER_URL, {
        method: 'POST',
        headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {},
      })
      const data = await res.json()
      setLog(data.log || [])
      if (data.ok) {
        setPhase('done')
        // Reload ladder data from Firestore to show fresh results
        getDoc(doc(db, 'hvSync', 'ladders')).then(snap => {
          if (snap.exists()) {
            const d = snap.data()
            setLadders(d.ladders || null)
            setSyncedAt(d.syncedAt || null)
          }
        })
      } else {
        setPhase('error')
      }
    } catch (e) {
      setPhase('error')
      setLog([`Network error: ${e.message}`])
    }
  }

  const syncedAtLabel = syncedAt
    ? new Date(syncedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">

      {/* ── Sync button + status ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={runSync}
          disabled={phase === 'syncing'}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg
                     bg-blue-600 text-white hover:bg-blue-700
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={14} className={phase === 'syncing' ? 'animate-spin' : ''} strokeWidth={2.5} />
          {phase === 'syncing' ? 'Syncing…' : 'Sync Ladder'}
        </button>
        {phase === 'done'  && <span className="text-sm text-green-600 font-medium">✓ Ladder updated</span>}
        {phase === 'error' && <span className="text-sm text-red-600 font-medium">✕ Sync failed</span>}
        {syncedAtLabel && phase === 'idle' && (
          <span className="text-xs text-slate-400">Last synced {syncedAtLabel}</span>
        )}
      </div>

      {/* ── Ladder results table ── */}
      {loadingExisting ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : ladders ? (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Current Positions
          </p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-1.5 px-2 text-xs text-slate-400 font-medium">Team</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">Pos</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">W</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">D</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">L</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">Pts</th>
                <th className="text-center py-1.5 px-2 text-xs text-slate-400 font-medium">Finals</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ladders).map(([teamId, data], i) => {
                if (data.error) return (
                  <tr key={teamId} className={i % 2 === 0 ? 'bg-slate-50' : ''}>
                    <td className="py-1.5 px-2 font-medium">{TEAM_NAMES[teamId] || teamId}</td>
                    <td colSpan={6} className="py-1.5 px-2 text-xs text-red-500">{data.error}</td>
                  </tr>
                )
                const m = data.mentone
                return (
                  <tr key={teamId} className={i % 2 === 0 ? 'bg-slate-50' : ''}>
                    <td className="py-1.5 px-2 font-medium text-slate-700">{TEAM_NAMES[teamId] || teamId}</td>
                    <td className="py-1.5 px-2 text-center font-bold" style={{ color: data.inFinals ? '#16a34a' : '#64748b' }}>
                      {ordinal(data.position)}<span className="text-slate-300 font-normal">/{data.total}</span>
                    </td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{m?.wins ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{m?.draws ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center text-slate-600">{m?.losses ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center font-semibold text-slate-700">{m?.points ?? '—'}</td>
                    <td className="py-1.5 px-2 text-center text-lg">{data.inFinals ? '🟢' : '⚪'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-400">No ladder data yet — run a sync.</p>
      )}

      {/* ── Log output ── */}
      {log.length > 0 && (
        <div>
          <button
            onClick={() => setShowLog(v => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {showLog ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showLog ? 'Hide log' : 'Show log'}
          </button>
          {showLog && (
            <div className="mt-2 bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
              {log.map((line, i) => (
                <p key={i} className="text-xs font-mono text-slate-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
