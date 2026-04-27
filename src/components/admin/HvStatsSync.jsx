// src/components/admin/HvStatsSync.jsx
// HV Sync admin panel — master sync + individual parts, unmatched names, aliases, review

import { useState, useEffect } from 'react'
import { auth, db } from '../../firebase'
import { doc, updateDoc, deleteField, getDoc } from 'firebase/firestore'
import { getPlayers, getHvNameAliases, getHvUnmatchedNames, getRounds, saveHvAlias, resolveHvUnmatchedName, createPlayer, clearStatsLastSyncForHvName } from '../../db'
import { RefreshCw, ChevronDown, ChevronUp, Trash2, Check, Eye, Zap } from 'lucide-react'

const SYNC_HV_URL           = import.meta.env.VITE_SYNC_HV_URL
const SYNC_LADDER_URL       = import.meta.env.VITE_SYNC_LADDER_URL
const SYNC_PLAYER_STATS_URL = import.meta.env.VITE_SYNC_PLAYER_STATS_URL
const SS_KEY = 'admin-hv-sync-state'

// ── Persist sync results across navigation ────────────────────────────────────
function loadSyncState() {
  try { return JSON.parse(sessionStorage.getItem(SS_KEY)) || {} } catch { return {} }
}
function saveSyncState(s) {
  try { sessionStorage.setItem(SS_KEY, JSON.stringify(s)) } catch {}
}

export default function HvStatsSync() {
  const [subTab, setSubTab]           = useState('sync')
  const [phase, setPhase]             = useState(() => loadSyncState().phase || 'idle')
  const [log, setLog]                 = useState(() => loadSyncState().log || [])
  const [unmatched, setUnmatched]     = useState(() => loadSyncState().unmatched || [])
  const [showLog, setShowLog]         = useState(false)
  const [allPlayers, setAllPlayers]   = useState([])
  const [aliases, setAliases]         = useState({})
  const [resolutions, setResolutions] = useState({})
  const [saving, setSaving]           = useState({})
  const [saved, setSaved]             = useState({})
  const [weeklyNotes, setWeeklyNotes] = useState('')
  // Individual sync states
  const [ladderPhase, setLadderPhase]           = useState('idle')
  const [playerStatsPhase, setPlayerStatsPhase] = useState('idle')

  useEffect(() => {
    getPlayers(true).then(p => setAllPlayers(p.sort((a, b) => a.name.localeCompare(b.name))))
    loadAliases()
    // Load unmatched names from Firestore on mount — these persist across sessions
    // and survive navigation. Merge with any names already in sessionStorage so we
    // don't lose names resolved mid-session before a page reload.
    getHvUnmatchedNames().then(names => {
      const clean = names.filter(n => n && n.trim() && n !== 'Fill-ins')
      setUnmatched(prev => {
        // Union: keep any from sessionStorage not yet in Firestore (just resolved)
        // plus everything from Firestore
        const merged = [...new Set([...clean, ...prev])]
        return merged
      })
    })
  }, [])

  // Persist phase/log/unmatched to sessionStorage whenever they change
  useEffect(() => {
    saveSyncState({ phase, log, unmatched })
  }, [phase, log, unmatched])

  const loadAliases = async () => {
    setAliases(await getHvNameAliases())
  }

  const runSync = async () => {
    if (!SYNC_HV_URL) { setPhase('error'); setLog(['VITE_SYNC_HV_URL not configured']); return }
    setPhase('running'); setLog([]); setUnmatched([]); setSaved({}); setResolutions({})
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const res  = await fetch(SYNC_HV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ weeklyNotes: weeklyNotes.trim() || undefined }),
      })
      const data = await res.json()
      const rawLog = data.log || []
      const rawUnmatched = (data.unmatchedHvNames || []).filter(n => n && n.trim() && n !== 'Fill-ins')
      setLog(rawLog)
      setUnmatched(rawUnmatched)
      setPhase(data.ok ? 'done' : 'error')
    } catch (e) {
      setLog([`Network error: ${e.message}`]); setPhase('error')
    }
  }

  // Helper: fire a single URL and return { ok, log }
  const _callSync = async (url) => {
    const idToken = await auth.currentUser?.getIdToken()
    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
    })
    return res.json()
  }

  // Master sync: ladder first (so digest has fresh positions), then HV
  const runMasterSync = async () => {
    setPhase('running'); setLadderPhase('running')
    setLog([]); setUnmatched([]); setSaved({}); setResolutions({})
    console.log(SYNC_HV_URL)
    try {
      // Step 1: Ladder sync first so hvSync/ladders is fresh for the digest
      const ladderData = await _callSync(SYNC_LADDER_URL)
      setLadderPhase(ladderData.ok ? 'done' : 'error')
      if (!ladderData.ok) { setPhase('idle'); return }

      // Step 2: HV sync (results, fixtures, player stats, digest — reads fresh ladder)
      const idToken = await auth.currentUser?.getIdToken()
      const hvRes = await fetch(SYNC_HV_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
        body: JSON.stringify({ weeklyNotes: weeklyNotes.trim() || undefined }),
      })
      const hvData = await hvRes.json()
      const rawLog       = hvData.log || []
      const rawUnmatched = (hvData.unmatchedHvNames || []).filter(n => n && n.trim() && n !== 'Fill-ins')
      setLog(rawLog)
      setUnmatched(rawUnmatched)
      setPhase(hvData.ok ? 'done' : 'error')
    } catch (e) {
      setLog(l => [...l, `Network error: ${e.message}`])
      setPhase('error'); setLadderPhase('error')
    }
  }

  // Individual: player stats only
  const runPlayerStatsSync = async () => {
    setPlayerStatsPhase('running')
    try {
      const data = await _callSync(SYNC_PLAYER_STATS_URL)
      setPlayerStatsPhase(data.ok ? 'done' : 'error')
    } catch (e) {
      setPlayerStatsPhase('error')
    } finally {
      setTimeout(() => setPlayerStatsPhase('idle'), 4000)
    }
  }

  // Individual: ladder only
  const runLadderSync = async () => {
    setLadderPhase('running')
    try {
      const data = await _callSync(SYNC_LADDER_URL)
      setLadderPhase(data.ok ? 'done' : 'error')
    } catch (e) {
      setLadderPhase('error')
    } finally {
      setTimeout(() => setLadderPhase('idle'), 4000)
    }
  }

  const handleSaveAlias = async (hvName) => {
    const playerId = resolutions[hvName]
    if (!playerId) return
    setSaving(s => ({ ...s, [hvName]: true }))
    await saveHvAlias(hvName, playerId)
    await resolveHvUnmatchedName(hvName)
    // Clear statsLastSync on match docs that had this name unmatched
    // so the next syncHv re-scrapes and applies the new alias
    await clearStatsLastSyncForHvName(hvName)
    setAliases(a => ({ ...a, [hvName]: playerId }))
    setSaved(s => ({ ...s, [hvName]: true }))
    setSaving(s => ({ ...s, [hvName]: false }))
    setTimeout(() => {
      setUnmatched(u => u.filter(n => n !== hvName))
      setSaved(s => { const n = {...s}; delete n[hvName]; return n })
    }, 1500)
  }

  const handleDeleteAlias = async (hvName) => {
    if (!confirm(`Remove alias for "${hvName}"?`)) return
    await updateDoc(doc(db, 'config', 'hvNameAliases'), { [hvName]: deleteField() })
    setAliases(a => { const n = {...a}; delete n[hvName]; return n })
  }

  return (
    <div className="space-y-3">

      {/* Sub-tab bar */}
      <div className="flex gap-0.5 bg-slate-100 p-1 rounded-lg">
        {[['sync', 'Sync & Results', RefreshCw], ['review', 'Review data', Eye]].map(([id, label, Icon]) => (
          <button key={id} onClick={() => setSubTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              subTab === id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {subTab === 'sync' && (
        <SyncPanel
          phase={phase} log={log} unmatched={unmatched} showLog={showLog}
          setShowLog={setShowLog} allPlayers={allPlayers} aliases={aliases}
          resolutions={resolutions} setResolutions={setResolutions}
          saving={saving} saved={saved}
          onMasterSync={runMasterSync}
          onRun={runSync}
          onLadderSync={runLadderSync}
          onPlayerStatsSync={runPlayerStatsSync}
          ladderPhase={ladderPhase}
          playerStatsPhase={playerStatsPhase}
          onSaveAlias={handleSaveAlias}
          onDeleteAlias={handleDeleteAlias} onReloadAliases={loadAliases}
          weeklyNotes={weeklyNotes} setWeeklyNotes={setWeeklyNotes}
        />
      )}

      {subTab === 'review' && (
        <ReviewPanel allPlayers={allPlayers} />
      )}

    </div>
  )
}

// ── SyncPanel ─────────────────────────────────────────────────────────────────

function SyncPanel({ phase, log, unmatched, showLog, setShowLog, allPlayers, aliases,
                     resolutions, setResolutions, saving, saved,
                     onMasterSync, onRun, onLadderSync, onPlayerStatsSync,
                     ladderPhase, playerStatsPhase,
                     onSaveAlias, onDeleteAlias, onReloadAliases,
                     weeklyNotes, setWeeklyNotes }) {

  const isBusy = phase === 'running' || ladderPhase === 'running' || playerStatsPhase === 'running'

  // Parse scraped match summary from log lines
  const scrapedMatches = []
  let cur = null
  for (const line of log) {
    const m1 = line.match(/Scraping stats: R(\d+) (\w+)/)
    if (m1) { cur = { round: m1[1], team: m1[2], players: 0, unmatched: 0 }; scrapedMatches.push(cur) }
    const m2 = line.match(/Stored stats for (\d+) players.*?(\d+) unmatched/)
    if (m2 && cur) { cur.players = +m2[1]; cur.unmatched = +m2[2] }
  }

  return (
    <>
      {/* ── Weekly notes ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block">
          Weekly notes <span className="text-slate-400 font-normal normal-case">(optional — added to top of digest)</span>
        </label>
        <textarea
          value={weeklyNotes}
          onChange={e => setWeeklyNotes(e.target.value)}
          disabled={isBusy}
          placeholder="e.g. Ned scored his first goal! Also a magical slide tackle from Tom…"
          rows={3}
          className="w-full text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg
                     px-3 py-2 resize-none focus:outline-none focus:border-blue-400 focus:ring-1
                     focus:ring-blue-100 placeholder-slate-400 disabled:opacity-50"
        />
      </div>

      {/* ── Master sync button ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onMasterSync} disabled={isBusy}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isBusy ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}>
            <Zap size={14} className={isBusy ? 'animate-pulse' : ''} />
            {isBusy ? 'Syncing…' : 'Master Sync'}
          </button>
          <span className="text-xs text-slate-400">Results · Fixtures · Player stats · Digest · Ladder</span>
          {log.length > 0 && (
            <button onClick={() => setShowLog(v => !v)}
              className="ml-auto text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              Log {showLog ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
            </button>
          )}
        </div>

        {/* Master sync status */}
        <div className="flex items-center gap-4 flex-wrap">
          <SyncStatus label="Results & Digest" phase={phase} />
          <SyncStatus label="Ladder" phase={ladderPhase} />
        </div>

        {/* Individual sync buttons */}
        <div className="border-t border-slate-100 pt-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium mr-1">Individual:</span>
          <IndividualSyncBtn label="Results & Digest" phase={phase}     disabled={isBusy} onClick={onRun} />
          <IndividualSyncBtn label="Player Stats"     phase={playerStatsPhase} disabled={isBusy} onClick={onPlayerStatsSync} />
          <IndividualSyncBtn label="Ladder"           phase={ladderPhase}      disabled={isBusy} onClick={onLadderSync} />
        </div>
      </div>

      {/* Log */}
      {showLog && log.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-4 max-h-64 overflow-y-auto">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{log.join('\n')}</pre>
        </div>
      )}

      {/* Scraped matches summary */}
      {scrapedMatches.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Newly scraped</span>
            <span className="text-xs text-slate-400">{scrapedMatches.length} match{scrapedMatches.length !== 1 ? 'es' : ''}</span>
            <span className="text-xs text-green-600 font-medium ml-auto">
              {scrapedMatches.reduce((s, t) => s + t.players, 0)} players matched
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {scrapedMatches.map((t, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="text-xs font-semibold text-slate-400 w-7">R{t.round}</span>
                <span className="font-medium text-slate-700 w-14">{t.team}</span>
                <span className="text-xs text-green-600">{t.players} matched</span>
                {t.unmatched > 0 && <span className="text-xs text-amber-600">{t.unmatched} unmatched</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched names */}
      {unmatched.length > 0 && (
        <UnmatchedPanel
          unmatched={unmatched}
          allPlayers={allPlayers}
          resolutions={resolutions}
          setResolutions={setResolutions}
          saving={saving}
          saved={saved}
          onSaveAlias={onSaveAlias}
          onDismiss={hvName => setResolutions(r => ({ ...r, [hvName]: '__dismiss__' }))}
        />
      )}

      {/* Alias manager */}
      <AliasManager aliases={aliases} allPlayers={allPlayers} onDelete={onDeleteAlias} onReload={onReloadAliases} />
    </>
  )
}

// ── SyncStatus — small inline status indicator ────────────────────────────────
function SyncStatus({ label, phase }) {
  if (phase === 'idle') return null
  return (
    <span className={`text-xs font-medium flex items-center gap-1 ${
      phase === 'running' ? 'text-blue-500' :
      phase === 'done'    ? 'text-green-600' : 'text-red-500'
    }`}>
      {phase === 'running' && <RefreshCw size={11} className="animate-spin" />}
      {phase === 'done'    && <Check size={11} />}
      {phase === 'error'   && '✕ '}
      {label}: {phase === 'running' ? 'syncing…' : phase === 'done' ? 'done' : 'failed'}
    </span>
  )
}

// ── IndividualSyncBtn — small secondary button ────────────────────────────────
function IndividualSyncBtn({ label, phase, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled || phase === 'running'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
        phase === 'done'    ? 'border-green-300 text-green-600 bg-green-50' :
        phase === 'error'   ? 'border-red-300 text-red-500 bg-red-50' :
        phase === 'running' ? 'border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed' :
        disabled            ? 'border-slate-200 text-slate-300 cursor-not-allowed' :
        'border-slate-200 text-slate-600 bg-white hover:border-blue-300 hover:text-blue-600'
      }`}>
      <RefreshCw size={10} className={phase === 'running' ? 'animate-spin' : ''} />
      {phase === 'done' ? `${label} ✓` : phase === 'error' ? `${label} ✕` : label}
    </button>
  )
}

// ── ReviewPanel ───────────────────────────────────────────────────────────────
// Browse stored playerStats for any round/team directly from Firestore

function ReviewPanel({ allPlayers }) {
  const [rounds, setRounds]         = useState([])
  const [selectedRound, setSelectedRound] = useState(null)
  const [selectedTeam, setSelectedTeam]   = useState(null)
  const [stats, setStats]           = useState(null)   // playerStats array from match doc
  const [loading, setLoading]       = useState(false)
  const [noData, setNoData]         = useState(false)
  const [lastSync, setLastSync]     = useState(null)

  const TEAMS = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']

  useEffect(() => {
    getRounds().then(rs => {
      const season = rs
        .filter(r => r.round_type === 'season')
        .sort((a, b) => {
          const ad = a.sat_date || a.round_date || ''
          const bd = b.sat_date || b.round_date || ''
          return ad.localeCompare(bd) || (a.round_number || 0) - (b.round_number || 0)
        })
      setRounds(season)
    })
  }, [])

  const loadStats = async (round, team) => {
    setSelectedRound(round)
    setSelectedTeam(team)
    setStats(null); setNoData(false); setLoading(true); setLastSync(null)
    try {
      const matchRef  = doc(db, 'rounds', String(round.id), 'matches', team)
      const matchSnap = await getDoc(matchRef)
      if (!matchSnap.exists()) { setNoData(true); setLoading(false); return }
      const data = matchSnap.data()
      const ps   = data.playerStats || []
      setLastSync(data.statsLastSync || null)
      setStats(ps.length > 0 ? ps : null)
      setNoData(ps.length === 0)
    } catch (e) {
      setNoData(true)
    }
    setLoading(false)
  }

  const playerName = id => allPlayers.find(p => String(p.id) === String(id))?.name || `ID:${id}`

  const fmtDate = iso => {
    if (!iso) return null
    try { return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  const attended  = (stats || []).filter(p => p.attended)
  const absent    = (stats || []).filter(p => !p.attended)

  return (
    <div className="space-y-3">

      {/* Round selector */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Select round</span>
        </div>
        {rounds.length === 0 ? (
          <div className="px-4 py-3 text-xs text-slate-400">Loading…</div>
        ) : (
          <div className="flex gap-1.5 px-4 py-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {rounds.map(r => (
              <button key={r.id}
                onClick={() => { setSelectedRound(r); setSelectedTeam(null); setStats(null); setNoData(false) }}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  selectedRound?.id === r.id
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}>
                R{r.round_number}
                {r.sat_date && (
                  <span className="ml-1 opacity-50 font-normal hidden sm:inline">
                    {new Date(r.sat_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Team selector — only when round picked */}
      {selectedRound && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Select team</span>
            <span className="text-xs text-slate-400">Round {selectedRound.round_number}</span>
          </div>
          <div className="flex gap-2 px-4 py-3 flex-wrap">
            {TEAMS.map(t => (
              <button key={t} onClick={() => loadStats(selectedRound, t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  selectedTeam === t
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats display */}
      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center text-slate-400 text-sm">
          Loading…
        </div>
      )}

      {!loading && noData && selectedTeam && (
        <div className="bg-white rounded-xl border border-slate-200 px-4 py-8 text-center">
          <p className="text-sm text-slate-400">No stats stored for R{selectedRound?.round_number} {selectedTeam}</p>
          <p className="text-xs text-slate-300 mt-1">Run HV Sync to scrape this match</p>
        </div>
      )}

      {!loading && stats && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-700">
                R{selectedRound?.round_number} — {selectedTeam}
              </span>
              <span className="text-xs text-green-600 font-medium">{attended.length} attended</span>
              {absent.length > 0 && <span className="text-xs text-slate-400">{absent.length} absent</span>}
            </div>
            {lastSync && (
              <span className="text-xs text-slate-400">Synced {fmtDate(lastSync)}</span>
            )}
          </div>

          {/* Attended players */}
          {attended.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-green-50 border-b border-green-100">
                <span className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">Attended</span>
              </div>
              <div className="divide-y divide-slate-100">
                {attended.map(p => (
                  <div key={p.playerId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex-1 text-sm text-slate-800">{playerName(p.playerId)}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {p.goals      > 0 && <span className="text-xs text-blue-600 font-semibold">{p.goals}g</span>}
                      {p.greenCards > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-[10px] font-bold" style={{background:'#16a34a'}}>{p.greenCards}</span>}
                      {p.yellowCards > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-[10px] font-bold" style={{background:'#ca8a04'}}>{p.yellowCards}</span>}
                      {p.redCards   > 0 && <span className="inline-flex items-center justify-center w-4 h-4 rounded text-white text-[10px] font-bold" style={{background:'#dc2626'}}>{p.redCards}</span>}
                      {p.gk         > 0 && <span className="text-[10px] text-slate-400 font-medium">GK</span>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Absent players — listed on match card but didn't attend */}
          {absent.length > 0 && (
            <>
              <div className="px-4 py-1.5 bg-slate-50 border-t border-b border-slate-100">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Named but absent</span>
              </div>
              <div className="divide-y divide-slate-100">
                {absent.map(p => (
                  <div key={p.playerId} className="flex items-center gap-3 px-4 py-2 opacity-40">
                    <span className="flex-1 text-sm text-slate-500 line-through">{playerName(p.playerId)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── UnmatchedPanel ────────────────────────────────────────────────────────────
// Each unmatched HV name can be:
//   A) Matched to an existing player → save alias
//   B) Used to create a new player   → create + save alias
//   C) Dismissed (e.g. it's a fill-in from another club not in our system)

function UnmatchedPanel({ unmatched, allPlayers, resolutions, setResolutions, saving, saved, onSaveAlias }) {
  const [creating, setCreating]   = useState({})  // { hvName: bool } — in-flight create
  const [createForm, setCreateForm] = useState({}) // { hvName: { name, team } }
  const [mode, setMode]           = useState({})   // { hvName: 'alias' | 'create' | 'dismiss' }

  // Parse HV name format "Surname, Firstname" → "Firstname Surname"
  const hvToDisplay = hvName => {
    if (!hvName.includes(',')) return hvName
    const [last, first] = hvName.split(',').map(s => s.trim())
    return `${first} ${last}`
  }

  const handleCreateAndAlias = async (hvName) => {
    const form = createForm[hvName] || {}
    const name = (form.name || hvToDisplay(hvName)).trim()
    if (!name) return
    setCreating(c => ({ ...c, [hvName]: true }))
    try {
      const created = await createPlayer({
        name,
        status_id: 'new',
        assigned_team_id_2026: form.team || null,
      })
      await saveHvAlias(hvName, created.id)
      await resolveHvUnmatchedName(hvName)
      // Clear statsLastSync so next sync re-scrapes and applies the new alias
      await clearStatsLastSyncForHvName(hvName)
      // Trigger the parent's saved flash + removal
      setResolutions(r => ({ ...r, [hvName]: String(created.id) }))
      onSaveAlias(hvName)
    } catch (e) {
      console.error('Create player failed', e)
    }
    setCreating(c => ({ ...c, [hvName]: false }))
  }

  const TEAMS = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']

  return (
    <div className="bg-white rounded-xl border border-amber-200 overflow-hidden">
      <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Unmatched names</span>
        <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded font-bold">{unmatched.length}</span>
        <span className="text-xs text-amber-600 ml-1">Match to existing player, create new, or dismiss</span>
      </div>

      <div className="divide-y divide-slate-100">
        {unmatched.map(hvName => {
          const currentMode  = mode[hvName] || 'alias'
          const isSaved      = saved[hvName]
          const isSaving     = saving[hvName] || creating[hvName]
          const displayName  = hvToDisplay(hvName)

          return (
            <div key={hvName} className="px-4 py-3 space-y-2">

              {/* HV name + mode tabs */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm bg-slate-100 text-slate-700 px-2.5 py-1 rounded">
                  {hvName}
                </span>
                <span className="text-slate-300 text-xs">→</span>
                <div className="flex gap-1 ml-auto">
                  {[['alias', 'Match existing'], ['create', 'New player'], ['dismiss', 'Dismiss']].map(([m, label]) => (
                    <button key={m} onClick={() => setMode(prev => ({ ...prev, [hvName]: m }))}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        currentMode === m
                          ? m === 'dismiss' ? 'bg-slate-500 text-white'
                          : m === 'create'  ? 'bg-emerald-600 text-white'
                          : 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Match existing player */}
              {currentMode === 'alias' && (
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={resolutions[hvName] || ''}
                    onChange={e => setResolutions(r => ({ ...r, [hvName]: e.target.value }))}
                    className="flex-1 min-w-[180px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
                    <option value="">— select player —</option>
                    {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button onClick={() => onSaveAlias(hvName)}
                    disabled={!resolutions[hvName] || isSaving}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 transition-colors ${
                      isSaved ? 'bg-green-500 text-white'
                      : resolutions[hvName] ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}>
                    {isSaved ? '✓ Saved' : isSaving ? 'Saving…' : 'Save alias'}
                  </button>
                </div>
              )}

              {/* Create new player */}
              {currentMode === 'create' && (
                <div className="space-y-2 bg-emerald-50 rounded-lg px-3 py-2.5 border border-emerald-100">
                  <p className="text-xs text-emerald-700 font-medium">
                    Will create a new player and save alias automatically
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      value={createForm[hvName]?.name ?? displayName}
                      onChange={e => setCreateForm(f => ({ ...f, [hvName]: { ...f[hvName], name: e.target.value } }))}
                      placeholder="Player name"
                      className="flex-1 min-w-[160px] px-3 py-1.5 border border-emerald-200 rounded-lg text-sm bg-white"
                    />
                    <select
                      value={createForm[hvName]?.team || ''}
                      onChange={e => setCreateForm(f => ({ ...f, [hvName]: { ...f[hvName], team: e.target.value } }))}
                      className="px-3 py-1.5 border border-emerald-200 rounded-lg text-sm bg-white">
                      <option value="">No team</option>
                      {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => handleCreateAndAlias(hvName)}
                      disabled={isSaving}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium flex-shrink-0 transition-colors ${
                        isSaved ? 'bg-green-500 text-white'
                        : isSaving ? 'bg-slate-200 text-slate-400'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}>
                      {isSaved ? '✓ Created' : isSaving ? 'Creating…' : 'Create & alias'}
                    </button>
                  </div>
                </div>
              )}

              {/* Dismiss */}
              {currentMode === 'dismiss' && (
                <div className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-200">
                  <span className="text-xs text-slate-500 flex-1">
                    Will remove from unmatched list — no alias saved. Use for fill-ins from other clubs.
                  </span>
                  <button
                    onClick={async () => {
                      await resolveHvUnmatchedName(hvName)
                      onSaveAlias(hvName) // reuse the removal animation
                    }}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 flex-shrink-0">
                    Dismiss
                  </button>
                </div>
              )}

            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── AliasManager ──────────────────────────────────────────────────────────────

function AliasManager({ aliases, allPlayers, onDelete, onReload }) {
  const [open, setOpen] = useState(false)
  const entries    = Object.entries(aliases).sort((a, b) => a[0].localeCompare(b[0]))
  const playerName = id => allPlayers.find(p => String(p.id) === String(id))?.name || `ID:${id}`

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">Name Aliases</span>
          <span className="text-xs text-slate-400">{entries.length} saved</span>
        </div>
        {open ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
      </button>
      {open && (
        <div className="border-t border-slate-100">
          {entries.length === 0 ? (
            <p className="px-4 py-4 text-xs text-slate-400">No aliases saved yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {entries.map(([hvName, playerId]) => (
                <div key={hvName} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex-shrink-0">{hvName}</span>
                  <span className="text-slate-300 text-xs flex-shrink-0">→</span>
                  <span className="text-sm text-slate-700 flex-1">{playerName(playerId)}</span>
                  <button onClick={() => onDelete(hvName)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                    <Trash2 size={13}/>
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-2.5 border-t border-slate-100">
            <button onClick={onReload} className="text-xs text-slate-400 hover:text-slate-600 underline">Refresh</button>
          </div>
        </div>
      )}
    </div>
  )
}
