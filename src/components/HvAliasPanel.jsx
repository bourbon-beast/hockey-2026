import { useState, useEffect } from 'react'
import { getHvUnmatchedNames, getHvNameAliases, saveHvAlias, resolveHvUnmatchedName, getPlayers } from '../db'

/**
 * HvAliasPanel
 *
 * Shows HV player names that couldn't be auto-matched on the last syncHv run.
 * For each name, the admin picks the matching player from a dropdown.
 * On save: writes to config/hvNameAliases so future syncs auto-resolve.
 *
 * Designed to sit inside the Fixture / admin area as a collapsible panel.
 */
export default function HvAliasPanel() {
  const [open, setOpen]               = useState(false)
  const [unmatched, setUnmatched]     = useState([])   // raw HV name strings
  const [players, setPlayers]         = useState([])
  const [selections, setSelections]   = useState({})   // { hvName: playerId }
  const [saving, setSaving]           = useState({})   // { hvName: bool }
  const [saved, setSaved]             = useState({})   // { hvName: bool } — flash confirmation
  const [loading, setLoading]         = useState(false)

  const load = async () => {
    setLoading(true)
    const [names, allPlayers] = await Promise.all([
      getHvUnmatchedNames(),
      getPlayers(true),
    ])
    setUnmatched(names)
    setPlayers(allPlayers.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
  }, [open])

  const handleSave = async (hvName) => {
    const playerId = selections[hvName]
    if (!playerId) return
    setSaving(s => ({ ...s, [hvName]: true }))
    await saveHvAlias(hvName, playerId)
    await resolveHvUnmatchedName(hvName)
    setSaved(s => ({ ...s, [hvName]: true }))
    setSaving(s => ({ ...s, [hvName]: false }))
    // Remove from list after short delay so user sees the tick
    setTimeout(() => {
      setUnmatched(prev => prev.filter(n => n !== hvName))
      setSaved(s => { const next = { ...s }; delete next[hvName]; return next })
    }, 1200)
  }

  const pendingCount = unmatched.length

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">HV Name Aliases</span>
          {pendingCount > 0 && !open && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold">
              {pendingCount}
            </span>
          )}
          {pendingCount === 0 && !open && (
            <span className="text-xs text-slate-400">all resolved</span>
          )}
        </div>
        <span className="text-slate-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          {loading && (
            <p className="text-sm text-slate-400">Loading…</p>
          )}

          {!loading && unmatched.length === 0 && (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <span>✓</span> All HV player names are resolved
            </div>
          )}

          {!loading && unmatched.length > 0 && (
            <>
              <p className="text-xs text-slate-500">
                These names appeared on HV game pages but couldn't be matched to a player record.
                Select the correct player and save — they'll auto-match on future syncs.
              </p>
              <div className="space-y-2">
                {unmatched.map(hvName => (
                  <div key={hvName} className="flex items-center gap-2 flex-wrap">
                    {/* HV name pill */}
                    <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-sm font-mono min-w-[160px]">
                      {hvName}
                    </span>
                    <span className="text-slate-400 text-sm">→</span>
                    {/* Player dropdown */}
                    <select
                      value={selections[hvName] || ''}
                      onChange={e => setSelections(s => ({ ...s, [hvName]: e.target.value }))}
                      className="flex-1 min-w-[160px] px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">— select player —</option>
                      {players.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    {/* Save button */}
                    <button
                      onClick={() => handleSave(hvName)}
                      disabled={!selections[hvName] || saving[hvName]}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                        saved[hvName]
                          ? 'bg-green-500 text-white'
                          : selections[hvName]
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {saved[hvName] ? '✓ Saved' : saving[hvName] ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="pt-1">
            <button
              onClick={load}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
