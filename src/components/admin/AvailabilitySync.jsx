import { useState, useEffect } from 'react'
import { addDoc, collection, doc, getDoc, limit, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore'
import { db, auth } from '../../firebase'
import { getPlayers } from '../../db'
import { RefreshCw, X, UserX, Check, AlertTriangle, ChevronDown, ChevronUp, Clock, Sheet } from 'lucide-react'

const SYNC_UNAVAIL_URL    = import.meta.env.VITE_SYNC_UNAVAIL_URL
const CONFIRM_UNAVAIL_URL = import.meta.env.VITE_CONFIRM_UNAVAIL_URL

const emailLinkDocId = (email) =>
  String(email || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')

const formatDays = (days) =>
  days === 'both' ? 'Sat & Sun' : days === 'sat' ? 'Sat' : days === 'sun' ? 'Sun' : days

const formatSyncedAt = (value) => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const SOURCE_LABELS = {
  auto_sync:      { label: 'Auto sync',      cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  sheet_sync:     { label: 'Manual sync',    cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  manual_resolve: { label: 'Queue resolved', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  public_form:    { label: 'Form matched',   cls: 'bg-violet-50 text-violet-700 border-violet-100' },
}

async function appendSyncLog(payload) {
  await addDoc(collection(db, 'unavailabilitySyncLog'), {
    ...payload,
    syncedAt: new Date().toISOString(),
  })
}

// ── AvailabilitySync ──────────────────────────────────────────────────────────
// Admin panel tab — two sections:
//   1. Auto-sync queue: names from Apps Script trigger that didn't match a player
//   2. Manual sync: same flow as RoundPlanner but lives here permanently

export default function AvailabilitySync() {
  const [players, setPlayers]         = useState([])
  const [queue, setQueue]             = useState([])  // config/unavailUnmatchedNames
  const [ignored, setIgnored]         = useState([])  // config/unavailIgnoredNames
  const [queueLoading, setQueueLoading] = useState(true)
  const [resolutions, setResolutions] = useState({})  // sheet_name → player.name
  const [saving, setSaving]           = useState({})  // sheet_name → bool
  const [formSubmissions, setFormSubmissions] = useState([])
  const [formLoading, setFormLoading] = useState(true)
  const [formError, setFormError] = useState('')
  const [formResolutions, setFormResolutions] = useState({}) // submissionId -> player.name
  const [recentSubmissions, setRecentSubmissions] = useState([])
  const [recentLoading, setRecentLoading] = useState(true)
  const [recentError, setRecentError] = useState('')
  const [showRecent, setShowRecent] = useState(true)
  const [syncLog, setSyncLog] = useState([])
  const [syncLogLoading, setSyncLogLoading] = useState(true)
  const [syncLogError, setSyncLogError] = useState('')
  const [showSyncLog, setShowSyncLog] = useState(true)

  // Manual sync state
  const [syncLoading, setSyncLoading]       = useState(false)
  const [syncStaged, setSyncStaged]         = useState(null)
  const [syncAliases, setSyncAliases]       = useState({})
  const [syncConfirming, setSyncConfirming] = useState(false)
  const [syncDone, setSyncDone]             = useState(false)

  // ── Load players + live queue listener ───────────────────────────────────
  useEffect(() => {
    getPlayers(true).then(p =>
      setPlayers(p.filter(pl => pl.is_active !== 0).sort((a, b) => a.name.localeCompare(b.name)))
    )
    const unsubQueue = onSnapshot(doc(db, 'config', 'unavailUnmatchedNames'), snap => {
      setQueue(snap.exists() ? (snap.data().names || []) : [])
      setQueueLoading(false)
    })
    const toMillis = (value) => {
      if (!value) return 0
      if (typeof value?.toMillis === 'function') return value.toMillis()
      if (typeof value === 'number') return value
      const parsed = Date.parse(String(value))
      return Number.isNaN(parsed) ? 0 : parsed
    }
    const sortByNewest = (a, b) => {
      const aTs = toMillis(a.submittedAt) || toMillis(a.updatedAt) || 0
      const bTs = toMillis(b.submittedAt) || toMillis(b.updatedAt) || 0
      return bTs - aTs
    }
    const unsubSubmissions = onSnapshot(
      query(collection(db, 'unavailabilitySubmissions'), limit(200)),
      snap => {
        const allRows = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(sortByNewest)
        setFormSubmissions(allRows.filter(row => row.status === 'pending'))
        setRecentSubmissions(allRows.slice(0, 30))
        setFormError('')
        setRecentError('')
        setFormLoading(false)
        setRecentLoading(false)
      },
      (err) => {
        const message = err?.code === 'permission-denied'
          ? 'You can open Admin, but this account cannot read form submissions (admin role required).'
          : (err?.message || 'Could not load submissions.')
        setFormError(message)
        setRecentError(message)
        setFormLoading(false)
        setRecentLoading(false)
      }
    )
    getDoc(doc(db, 'config', 'unavailIgnoredNames')).then(snap => {
      setIgnored(snap.exists() ? (snap.data().names || []) : [])
    })
    const unsubSyncLog = onSnapshot(
      query(collection(db, 'unavailabilitySyncLog'), orderBy('syncedAt', 'desc'), limit(50)),
      snap => {
        setSyncLog(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setSyncLogError('')
        setSyncLogLoading(false)
      },
      (err) => {
        setSyncLogError(err?.code === 'permission-denied'
          ? 'Admin role required to view sync activity.'
          : (err?.message || 'Could not load sync activity.'))
        setSyncLogLoading(false)
      }
    )
    return () => {
      unsubQueue()
      unsubSubmissions()
      unsubSyncLog()
    }
  }, [])

  // ── Queue actions ─────────────────────────────────────────────────────────

  // Resolve: match ALL entries for a sheet_name to a player (one per round)
  const handleResolve = async (sheetName) => {
    const playerName = resolutions[sheetName]
    if (!playerName) return
    const player = players.find(p => p.name === playerName)
    if (!player) return
    setSaving(prev => ({ ...prev, [sheetName]: true }))
    try {
      const entries = queue.filter(e => e.sheet_name === sheetName)
      await Promise.all(entries.map(entry => {
        const roundId  = entry.round_id || 'unknown'
        const playerId = String(player.id)
        return setDoc(doc(db, 'playerUnavailability', `${roundId}_${playerId}`), {
          playerId, roundId,
          days:     entry.day || 'both',
          source:   'manual_resolve',
          syncedAt: new Date().toISOString(),
          sheetName: sheetName,
        }, { merge: true })
      }))
      await Promise.all(entries.map(entry => appendSyncLog({
        playerId: String(player.id),
        playerName: player.name,
        sheetName,
        roundId: entry.round_id || 'unknown',
        roundLabel: entry.round_id ? `Round ${entry.round_id}` : null,
        days: entry.day || 'both',
        source: 'manual_resolve',
        eventType: 'new',
      })))
      await _removeAllFromQueue(sheetName)
    } finally {
      setSaving(prev => ({ ...prev, [sheetName]: false }))
    }
  }

  // Ignore: permanently suppress — removes all entries + adds to ignored list
  const handleIgnore = async (sheetName) => {
    setSaving(prev => ({ ...prev, [sheetName]: true }))
    try {
      const newIgnored = [...new Set([...ignored, sheetName])]
      await setDoc(doc(db, 'config', 'unavailIgnoredNames'), { names: newIgnored }, { merge: true })
      setIgnored(newIgnored)
      await _removeAllFromQueue(sheetName)
    } finally {
      setSaving(prev => ({ ...prev, [sheetName]: false }))
    }
  }

  // Dismiss: remove from queue without resolving or ignoring
  const handleDismiss = async (sheetName) => {
    setSaving(prev => ({ ...prev, [sheetName]: true }))
    try {
      await _removeAllFromQueue(sheetName)
    } finally {
      setSaving(prev => ({ ...prev, [sheetName]: false }))
    }
  }

  const _removeAllFromQueue = async (sheetName) => {
    const updated = queue.filter(e => e.sheet_name !== sheetName)
    await setDoc(doc(db, 'config', 'unavailUnmatchedNames'), { names: updated }, { merge: true })
    setResolutions(prev => { const r = { ...prev }; delete r[sheetName]; return r })
  }

  // ── Public form submissions ───────────────────────────────────────────────
  const handleConfirmFormMatch = async (submission) => {
    const playerName = formResolutions[submission.id] || submission.suggestedPlayerName
    if (!playerName) return
    const player = players.find(p => p.name === playerName)
    if (!player) return

    setSaving(prev => ({ ...prev, [`form:${submission.id}`]: true }))
    try {
      const playerId = String(player.id)
      const entries = Array.isArray(submission.entries) ? submission.entries : []
      await Promise.all(entries.map(entry => {
        const roundId = String(entry.round_id)
        return setDoc(doc(db, 'playerUnavailability', `${roundId}_${playerId}`), {
          playerId,
          roundId,
          days: entry.days || 'both',
          notes: submission.notes || null,
          source: 'public_form',
          submittedByName: submission.name || null,
          submittedByEmail: submission.emailLower || submission.email || null,
          publicSubmissionId: submission.id,
          syncedAt: new Date().toISOString(),
        }, { merge: true })
      }))
      await Promise.all(entries.map(entry => appendSyncLog({
        playerId,
        playerName: player.name,
        sheetName: submission.name || null,
        roundId: String(entry.round_id),
        roundLabel: entry.round_label || `Round ${entry.round_id}`,
        days: entry.days || 'both',
        source: 'public_form',
        eventType: 'new',
      })))
      const submittedEmail = submission.emailLower || submission.email || ''
      if (submittedEmail) {
        await setDoc(doc(db, 'unavailabilitySubmitterLinks', emailLinkDocId(submittedEmail)), {
          emailLower: String(submittedEmail).toLowerCase(),
          name: submission.name || null,
          playerId,
          playerName: player.name,
          source: 'public_form_match',
          linkedAt: new Date().toISOString(),
          linkedBy: auth.currentUser?.email || null,
        }, { merge: true })
      }
      await updateDoc(doc(db, 'unavailabilitySubmissions', submission.id), {
        status: 'matched',
        playerId,
        playerName: player.name,
        reviewedAt: new Date().toISOString(),
        reviewedBy: auth.currentUser?.email || null,
      })
      setFormResolutions(prev => { const r = { ...prev }; delete r[submission.id]; return r })
    } finally {
      setSaving(prev => ({ ...prev, [`form:${submission.id}`]: false }))
    }
  }

  // ── Manual sync ───────────────────────────────────────────────────────────
  const handleManualSync = async () => {
    setSyncLoading(true)
    setSyncStaged(null)
    setSyncAliases({})
    setSyncDone(false)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch(SYNC_UNAVAIL_URL, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      })
      const data = await res.json()
      setSyncStaged(data.ok ? data : { error: data.error || 'Sync failed' })
    } catch (e) {
      setSyncStaged({ error: e.message })
    }
    setSyncLoading(false)
  }

  const handleConfirmSync = async () => {
    if (!syncStaged?.staged) return
    setSyncConfirming(true)
    try {
      const resolvedUnmatched = (syncStaged.unmatched || [])
        .filter(u => syncAliases[u.sheet_name])
        .map(u => {
          const player = players.find(p => p.name === syncAliases[u.sheet_name])
          if (!player) return null
          return { player_id: player.id, round_id: u.round_id, day: u.day, sheet_name: u.sheet_name }
        })
        .filter(Boolean)
      const entries = [
        ...syncStaged.staged.filter(s => s.is_new).map(s => ({
          player_id: s.player_id, round_id: s.round_id, day: s.day, sheet_name: s.sheet_name,
        })),
        ...resolvedUnmatched,
      ]
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch(CONFIRM_UNAVAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ entries, aliases: syncAliases }),
      })
      if (res.ok) {
        setSyncStaged(null)
        setSyncDone(true)
        setTimeout(() => setSyncDone(false), 4000)
      }
    } finally {
      setSyncConfirming(false)
    }
  }

  // ── Unique names for queue display (grouped by sheet_name) ───────────────
  const uniqueQueueNames = [...new Map(queue.map(e => [e.sheet_name, e])).values()]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Section 0: Public form submissions ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Player Form Submissions</p>
            <p className="text-xs text-slate-400 mt-0.5">No-login unavailability entries from /unavailable, awaiting player match confirmation</p>
          </div>
          {formSubmissions.length > 0 && (
            <span className="text-xs font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
              {formSubmissions.length}
            </span>
          )}
        </div>

        {formLoading ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</div>
        ) : formError ? (
          <div className="px-4 py-6 text-sm text-red-600 text-center">{formError}</div>
        ) : formSubmissions.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center flex items-center justify-center gap-2">
            <Check size={14} className="text-green-500" />
            No pending form submissions
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {formSubmissions.map(submission => {
              const entries = Array.isArray(submission.entries) ? submission.entries : []
              const isSaving = saving[`form:${submission.id}`]
              return (
                <div key={submission.id} className="px-4 py-3 space-y-2">
                  <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{submission.name}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {submission.emailLower || submission.email || 'No email'}
                        {submission.submittedAt && ` · ${new Date(submission.submittedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>

                    <select
                      value={formResolutions[submission.id] || submission.suggestedPlayerName || ''}
                      onChange={e => setFormResolutions(prev => ({ ...prev, [submission.id]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-600 bg-white w-full sm:w-44"
                      disabled={isSaving}
                    >
                      <option value="">Match player...</option>
                      {players.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>

                    <button
                      onClick={() => handleConfirmFormMatch(submission)}
                      disabled={!(formResolutions[submission.id] || submission.suggestedPlayerName) || isSaving || entries.length === 0}
                      className="text-xs px-2.5 py-1.5 rounded bg-green-600 text-white font-medium disabled:opacity-40 hover:bg-green-700 transition-colors whitespace-nowrap"
                    >
                      {isSaving ? '...' : 'Confirm match'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {submission.suggestedPlayerName && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">
                        Suggested: {submission.suggestedPlayerName}{submission.suggestedMatchConfidence === 'fuzzy' ? ' (fuzzy)' : ''}
                      </span>
                    )}
                    {entries.map((entry, index) => (
                      <span key={`${submission.id}-${entry.round_id}-${index}`} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        {entry.round_label || `Round ${entry.round_id}`} · {entry.days === 'both' ? 'Sat & Sun' : entry.days === 'sat' ? 'Sat' : 'Sun'}
                      </span>
                    ))}
                  </div>

                  {submission.notes && (
                    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded px-2 py-1">
                      {submission.notes}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 0b: Recent submission activity ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <button
          onClick={() => setShowRecent(v => !v)}
          className="w-full px-4 py-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-left">
            <Clock size={14} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Recent Submissions</p>
              <p className="text-xs text-slate-400 mt-0.5">Activity log — last 30 form submissions across all statuses</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!recentLoading && recentSubmissions.length > 0 && (
              <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {recentSubmissions.length}
              </span>
            )}
            {showRecent ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </button>
        <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/70">
          Admin review history: most recent 30 submissions across pending, matched, and withdrawn.
        </div>

        {showRecent && (
          recentLoading ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</div>
          ) : recentError ? (
            <div className="px-4 py-6 text-sm text-red-600 text-center">{recentError}</div>
          ) : recentSubmissions.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No submissions yet</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentSubmissions.map(sub => {
                const entries = Array.isArray(sub.entries) ? sub.entries : []
                const status  = sub.status || 'pending'
                const statusConfig = {
                  pending:   { label: 'Pending',   cls: 'bg-blue-50 text-blue-600 border-blue-100' },
                  matched:   { label: 'Matched',   cls: 'bg-green-50 text-green-700 border-green-100' },
                  approved:  { label: 'Matched',   cls: 'bg-green-50 text-green-700 border-green-100' }, // legacy docs
                  withdrawn: { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
                }[status] || { label: status, cls: 'bg-slate-100 text-slate-500 border-slate-200' }

                const submittedAt = sub.submittedAt
                  ? new Date(sub.submittedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : null
                const reviewedAt = sub.reviewedAt
                  ? new Date(sub.reviewedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : null

                return (
                  <div key={sub.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-700">{sub.name}</p>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${statusConfig.cls}`}>
                            {statusConfig.label}
                          </span>
                          {sub.suggestedMatchConfidence === 'fuzzy' && status === 'pending' && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700 border border-yellow-100">fuzzy match</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 truncate mt-0.5">
                          {sub.emailLower || sub.email || 'No email'}
                          {submittedAt && <span className="ml-1.5">· submitted {submittedAt}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {entries.map((entry, i) => (
                        <span key={i} className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {entry.round_label || `Round ${entry.round_id}`} · {entry.days === 'both' ? 'Sat & Sun' : entry.days === 'sat' ? 'Sat' : 'Sun'}
                        </span>
                      ))}
                    </div>

                    {sub.notes && (
                      <p className="text-xs text-slate-500 italic">"{sub.notes}"</p>
                    )}

                    {(status === 'matched' || status === 'approved') && (
                      <p className="text-[11px] text-slate-400">
                        <>Matched to <span className="font-semibold text-slate-600">{sub.playerName}</span></>
                        {reviewedAt && <> · {reviewedAt}</>}
                        {sub.reviewedBy && <> by {sub.reviewedBy}</>}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── Section 1: Unmatched queue ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-700">Auto-sync Queue</p>
            <p className="text-xs text-slate-400 mt-0.5">Names from the unavailability sheet that couldn't be matched automatically</p>
          </div>
          {uniqueQueueNames.length > 0 && (
            <span className="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
              {uniqueQueueNames.length}
            </span>
          )}
        </div>

        {queueLoading ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center">Loading…</div>
        ) : uniqueQueueNames.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center flex items-center justify-center gap-2">
            <Check size={14} className="text-green-500" />
            Queue is clear
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {uniqueQueueNames.map(entry => {
              const roundCount = queue.filter(e => e.sheet_name === entry.sheet_name).length
              const isSaving   = saving[entry.sheet_name]
              return (
                <div key={entry.sheet_name} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3">

                  {/* Name + round count */}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{entry.sheet_name}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {roundCount === 1
                        ? `${entry.date}${entry.day ? ` · ${entry.day}` : ''}`
                        : `${roundCount} rounds`}
                      {entry.queuedAt && ` · queued ${new Date(entry.queuedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>

                  {/* Player match dropdown */}
                  <select
                    value={resolutions[entry.sheet_name] || ''}
                    onChange={e => setResolutions(prev => ({ ...prev, [entry.sheet_name]: e.target.value }))}
                    className="text-xs border border-slate-200 rounded px-2 py-1.5 text-slate-600 bg-white w-44"
                    disabled={isSaving}
                  >
                    <option value="">Match player…</option>
                    {players.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>

                  {/* Save button */}
                  <button
                    onClick={() => handleResolve(entry.sheet_name)}
                    disabled={!resolutions[entry.sheet_name] || isSaving}
                    className="text-xs px-2.5 py-1.5 rounded bg-blue-600 text-white font-medium disabled:opacity-40 hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    {isSaving ? '…' : 'Save'}
                  </button>

                  {/* Ignore button */}
                  <button
                    onClick={() => handleIgnore(entry.sheet_name)}
                    disabled={isSaving}
                    title="Permanently ignore this name"
                    className="text-xs px-2.5 py-1.5 rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 transition-colors flex items-center gap-1 whitespace-nowrap"
                  >
                    <UserX size={12} /> Ignore
                  </button>

                  {/* Dismiss button */}
                  <button
                    onClick={() => handleDismiss(entry.sheet_name)}
                    disabled={isSaving}
                    title="Remove from queue without ignoring"
                    className="text-slate-300 hover:text-slate-500 transition-colors"
                  >
                    <X size={14} />
                  </button>

                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Section 1b: Sheet sync activity log ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <button
          onClick={() => setShowSyncLog(v => !v)}
          className="w-full px-4 py-3 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2 text-left">
            <Sheet size={14} className="text-slate-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Sync Activity</p>
              <p className="text-xs text-slate-400 mt-0.5">When players were picked up from the sheet or confirmed into the roster</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!syncLogLoading && syncLog.length > 0 && (
              <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                {syncLog.length}
              </span>
            )}
            {showSyncLog ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
          </div>
        </button>
        <div className="px-4 py-2 text-[11px] text-slate-400 border-b border-slate-100 bg-slate-50/70">
          Timestamps are when the sync detected the entry — e.g. if someone updates the sheet at 1:30pm Friday, the next auto-sync should show that time.
        </div>

        {showSyncLog && (
          syncLogLoading ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">Loading...</div>
          ) : syncLogError ? (
            <div className="px-4 py-6 text-sm text-red-600 text-center">{syncLogError}</div>
          ) : syncLog.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400 text-center">No sync activity yet — entries appear here when the sheet auto-sync or manual sync picks someone up</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {syncLog.map(row => {
                const source = SOURCE_LABELS[row.source] || { label: row.source || 'Sync', cls: 'bg-slate-100 text-slate-500 border-slate-200' }
                const pickedUp = formatSyncedAt(row.syncedAt)
                const isUpdate = row.eventType === 'updated'
                return (
                  <div key={row.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-700">{row.playerName || row.sheetName || 'Unknown'}</p>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${source.cls}`}>
                            {source.label}
                          </span>
                          {isUpdate && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">updated</span>
                          )}
                        </div>
                        {row.sheetName && row.playerName && row.sheetName !== row.playerName && (
                          <p className="text-xs text-slate-400 truncate mt-0.5">Sheet: {row.sheetName}</p>
                        )}
                      </div>
                      {pickedUp && (
                        <p className="text-xs text-slate-500 whitespace-nowrap shrink-0">{pickedUp}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                        {row.roundLabel || `Round ${row.roundId}`} · {formatDays(row.days)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* ── Section 2: Manual sync ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">Manual Sync</p>
          <p className="text-xs text-slate-400 mt-0.5">Force a full re-read of the unavailability sheet and review before writing</p>
        </div>

        <div className="px-4 py-4 space-y-4">

          <button
            onClick={handleManualSync}
            disabled={syncLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={syncLoading ? 'animate-spin' : ''} />
            {syncLoading ? 'Syncing…' : 'Sync from sheet'}
          </button>

          {syncDone && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check size={14} /> Sync confirmed
            </div>
          )}

          {syncStaged?.error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle size={14} /> {syncStaged.error}
            </div>
          )}

          {syncStaged && !syncStaged.error && (
            <div className="space-y-3">

              {/* Summary */}
              <div className="text-xs text-slate-500 flex gap-4">
                <span><strong className="text-slate-700">{syncStaged.staged?.filter(s => s.is_new).length ?? 0}</strong> new</span>
                <span><strong className="text-slate-700">{syncStaged.staged?.filter(s => !s.is_new).length ?? 0}</strong> already synced</span>
                <span><strong className="text-orange-600">{syncStaged.unmatched?.length ?? 0}</strong> unmatched</span>
              </div>

              {/* New matches */}
              {syncStaged.staged?.filter(s => s.is_new).length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-600">New matches to write</p>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {syncStaged.staged.filter(s => s.is_new).map((s, i) => (
                      <div key={i} className="px-3 py-2 flex items-center justify-between">
                        <span className="text-xs text-slate-700">{s.player_name || s.sheet_name}</span>
                        <span className="text-xs text-slate-400">{s.day} · {s.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unmatched */}
              {syncStaged.unmatched?.length > 0 && (
                <div className="border border-orange-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-orange-50 border-b border-orange-100">
                    <p className="text-xs font-semibold text-orange-700">Unmatched — resolve or skip</p>
                  </div>
                  <div className="divide-y divide-orange-50">
                    {syncStaged.unmatched.map((u, i) => (
                      <div key={i} className="px-3 py-2 flex items-center gap-3">
                        <span className="flex-1 text-xs text-slate-700">{u.sheet_name}</span>
                        <select
                          value={syncAliases[u.sheet_name] || ''}
                          onChange={e => setSyncAliases(prev => ({ ...prev, [u.sheet_name]: e.target.value }))}
                          className="text-xs border border-slate-200 rounded px-2 py-1 text-slate-600 bg-white w-40"
                        >
                          <option value="">Skip…</option>
                          {players.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Confirm */}
              <button
                onClick={handleConfirmSync}
                disabled={syncConfirming || (syncStaged.staged?.filter(s => s.is_new).length === 0 && Object.keys(syncAliases).length === 0)}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 transition-colors"
              >
                <Check size={14} />
                {syncConfirming ? 'Saving…' : 'Confirm & write'}
              </button>

            </div>
          )}
        </div>
      </div>

    </div>
  )
}
