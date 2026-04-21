import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase'
import {
  getRounds, getPlayers,
  addUnavailability, removeUnavailability, updateUnavailabilityDays
} from '../db'

const fmtShort = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  : null

const toDays = (sat, sun) => {
  if (sat && sun) return 'both'
  if (sat) return 'sat'
  if (sun) return 'sun'
  return null
}

export default function UnavailabilityManager({ onSelectPlayer }) {
  const [rounds, setRounds]           = useState([])
  const [allPlayers, setAllPlayers]   = useState([])
  const [unavailMap, setUnavailMap]   = useState({}) // "playerId:roundId" → 'sat'|'sun'|'both'
  const [loading, setLoading]         = useState(true)

  const [pickerRound, setPickerRound]       = useState(null)
  const [pickerSearch, setPickerSearch]     = useState('')
  const [pickerSelected, setPickerSelected] = useState(new Set())
  const [pickerSat, setPickerSat]           = useState(true)
  const [pickerSun, setPickerSun]           = useState(true)
  const searchRef = useRef(null)

  useEffect(() => {
    // Load rounds + players once (static data)
    Promise.all([getRounds(), getPlayers(true)]).then(([r, p]) => {
      setRounds(r.filter(rd => rd.round_type === 'season'))
      setAllPlayers(p.filter(pl => pl.is_active === 1).sort((a, b) => a.name.localeCompare(b.name)))
      setLoading(false)
    })

    // Live listener on all playerUnavailability — updates instantly when
    // PlayerModal or sync writes to Firestore
    const unsub = onSnapshot(collection(db, 'playerUnavailability'), (snap) => {
      const map = {}
      snap.docs.forEach(d => {
        const data = d.data()
        map[`${data.playerId}:${data.roundId}`] = data.days || 'both'
      })
      setUnavailMap(map)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    if (pickerRound && searchRef.current) {
      searchRef.current.focus()
      setPickerSelected(new Set())
      setPickerSearch('')
      setPickerSat(true)
      setPickerSun(true)
    }
  }, [pickerRound])

  const toggleDay = async (playerId, roundId, day) => {
    const key     = `${playerId}:${roundId}`
    const current = unavailMap[key]
    const hasSat  = current === 'sat' || current === 'both'
    const hasSun  = current === 'sun' || current === 'both'
    const newSat  = day === 'sat' ? !hasSat : hasSat
    const newSun  = day === 'sun' ? !hasSun : hasSun
    const next    = toDays(newSat, newSun)

    setUnavailMap(prev => {
      const m = { ...prev }
      if (!next) delete m[key]
      else m[key] = next
      return m
    })

    if (!next)         await removeUnavailability(playerId, roundId)
    else if (!current) await addUnavailability({ player_id: playerId, round_id: roundId, days: next })
    else               await updateUnavailabilityDays(playerId, roundId, next)
  }

  const removeEntry = async (playerId, roundId) => {
    const key = `${playerId}:${roundId}`
    setUnavailMap(prev => { const m = { ...prev }; delete m[key]; return m })
    await removeUnavailability(playerId, roundId)
  }

  const confirmPicker = async () => {
    if (!pickerRound || pickerSelected.size === 0) return
    const days = toDays(pickerSat, pickerSun)
    if (!days) return
    const rid = pickerRound.id
    const updates = {}
    for (const pid of pickerSelected) { updates[`${pid}:${rid}`] = days }
    setUnavailMap(prev => ({ ...prev, ...updates }))
    setPickerRound(null)
    await Promise.all([...pickerSelected].map(pid => {
      const existing = unavailMap[`${pid}:${rid}`]
      if (!existing) return addUnavailability({ player_id: pid, round_id: rid, days })
      return updateUnavailabilityDays(pid, rid, days)
    }))
  }

  const row1 = rounds.slice(0, 11)
  const row2 = rounds.slice(11)

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  )

  // ── Round column ──────────────────────────────────────────────────────────
  const RoundColumn = ({ round }) => {
    const rid    = round.id
    const satStr = fmtShort(round.sat_date)
    const sunStr = fmtShort(round.sun_date)
    const dateStr = satStr && sunStr ? `${satStr} – ${sunStr}` : satStr || sunStr || '—'

    const unavailEntries = Object.entries(unavailMap)
      .filter(([k]) => k.endsWith(`:${rid}`))
      .map(([k, days]) => {
        const playerId = Number(k.split(':')[0])
        const player   = allPlayers.find(p => p.id === playerId)
        return player ? { player, days } : null
      })
      .filter(Boolean)
      .sort((a, b) => a.player.name.localeCompare(b.player.name))

    const count = unavailEntries.length

    return (
      <div className="w-full sm:flex-shrink-0 sm:w-52 border border-slate-200 rounded-lg overflow-hidden bg-white">

        {/* ── Fixed-height header ── */}
        <div className="bg-slate-800 text-white px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">
              {round.name || `Round ${round.round_number}`}
            </span>
            {/* Count badge — always reserve space */}
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ${
              count > 0 ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-700'
            }`}>
              {count > 0 ? count : '·'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">{dateStr}</div>
        </div>

        {/* ── Column sub-header: Name / Sat / Sun ── */}
        <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 border-b border-slate-200">
          <span className="flex-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Name</span>
          <span className="w-8 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Sat</span>
          <span className="w-8 text-center text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Sun</span>
          <span className="w-4" />
        </div>

        {/* ── Player rows ── */}
        <div className="divide-y divide-slate-100">
          {unavailEntries.map(({ player, days }) => {
            const hasSat = days === 'sat' || days === 'both'
            const hasSun = days === 'sun' || days === 'both'
            return (
              <div key={player.id}
                className="flex items-center gap-1 px-2 py-1.5 group hover:bg-slate-50 transition-colors">
                <button
                  onClick={() => onSelectPlayer && onSelectPlayer(player)}
                  className="flex-1 text-xs font-medium text-slate-700 hover:text-blue-600 text-left truncate"
                  title={player.name}
                >{player.name}</button>
                <button
                  onClick={() => toggleDay(player.id, rid, 'sat')}
                  className={`w-8 h-5 rounded text-[10px] font-bold border transition-colors ${
                    hasSat ? 'bg-orange-400 border-orange-400 text-white'
                           : 'bg-white border-slate-200 text-slate-300 hover:border-orange-300 hover:text-orange-400'
                  }`}
                >Sat</button>
                <button
                  onClick={() => toggleDay(player.id, rid, 'sun')}
                  className={`w-8 h-5 rounded text-[10px] font-bold border transition-colors ${
                    hasSun ? 'bg-amber-400 border-amber-400 text-white'
                           : 'bg-white border-slate-200 text-slate-300 hover:border-amber-300 hover:text-amber-400'
                  }`}
                >Sun</button>
                <button
                  onClick={() => removeEntry(player.id, rid)}
                  aria-label={`Remove ${player.name} from unavailability`}
                  className="w-4 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none p-0.5 rounded text-xs leading-none"
                  title="Remove"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            )
          })}
        </div>

        {/* ── Add button ── */}
        <div className="px-2 py-1.5 border-t border-slate-100">
          <button
            onClick={() => setPickerRound(round)}
            className="w-full text-xs text-slate-400 hover:text-blue-600 hover:bg-blue-50 py-1 rounded border border-dashed border-slate-200 hover:border-blue-300 transition-colors"
          >+ Add players</button>
        </div>
      </div>
    )
  }

  // ── Round row ─────────────────────────────────────────────────────────────
  const RoundRow = ({ roundSet }) => (
    <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
      {roundSet.map(r => <RoundColumn key={r.id} round={r} />)}
    </div>
  )

  return (
    <div className="p-3 sm:p-4 space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Unavailability</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Use <span className="font-medium">+ Add players</span> to mark unavailability per round.
            Toggle Sat / Sun independently per player.
          </p>
        </div>
        <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
          {Object.keys(unavailMap).length} entr{Object.keys(unavailMap).length !== 1 ? 'ies' : 'y'}
        </div>
      </div>

      {/* Row 1 — first 11 rounds */}
      <RoundRow roundSet={row1} />

      {/* Row 2 — remaining rounds */}
      {row2.length > 0 && <RoundRow roundSet={row2} />}

      {/* ── Picker modal ──────────────────────────────────────────────── */}
      {pickerRound && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">
                  {pickerRound.name || `Round ${pickerRound.round_number}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {[fmtShort(pickerRound.sat_date), fmtShort(pickerRound.sun_date)].filter(Boolean).join(' – ')}
                </p>
              </div>
              <button onClick={() => setPickerRound(null)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* Sat / Sun toggles for the bulk add */}
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Unavailable:</span>
              <button
                onClick={() => setPickerSat(v => !v)}
                className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                  pickerSat
                    ? 'bg-orange-400 border-orange-400 text-white'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-orange-300'
                }`}
              >Sat</button>
              <button
                onClick={() => setPickerSun(v => !v)}
                className={`px-3 py-1 rounded text-xs font-bold border transition-colors ${
                  pickerSun
                    ? 'bg-amber-400 border-amber-400 text-white'
                    : 'bg-white border-slate-200 text-slate-400 hover:border-amber-300'
                }`}
              >Sun</button>
              {!pickerSat && !pickerSun && (
                <span className="text-xs text-red-500">Select at least one day</span>
              )}
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-slate-100">
              <input ref={searchRef} value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Player list */}
            <div className="overflow-y-auto flex-1">
              {allPlayers
                .filter(p => !pickerSearch || p.name.toLowerCase().includes(pickerSearch.toLowerCase()))
                .map(p => {
                  const alreadySet = unavailMap[`${p.id}:${pickerRound.id}`]
                  const isSelected = pickerSelected.has(p.id)
                  return (
                    <div key={p.id}
                      onClick={() => setPickerSelected(prev => {
                        const next = new Set(prev)
                        isSelected ? next.delete(p.id) : next.add(p.id)
                        return next
                      })}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-slate-100 text-sm transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${
                        isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>{isSelected && '✓'}</div>
                      <span className="flex-1">{p.name}</span>
                      <span className="text-xs text-slate-400">{p.assigned_team_id_2026 || '—'}</span>
                      {alreadySet && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">
                          {alreadySet === 'both' ? 'Sat & Sun' : alreadySet === 'sat' ? 'Sat' : 'Sun'}
                        </span>
                      )}
                    </div>
                  )
                })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">{pickerSelected.size} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setPickerRound(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button
                  onClick={confirmPicker}
                  disabled={pickerSelected.size === 0 || (!pickerSat && !pickerSun)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add {pickerSelected.size > 0 ? `(${pickerSelected.size})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
