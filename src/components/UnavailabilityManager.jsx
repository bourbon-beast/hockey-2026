import { useState, useEffect, useRef } from 'react'
import { getRounds, getPlayers, getUnavailability, addUnavailability, removeUnavailability, updateUnavailabilityDays } from '../db'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_CYCLE = { undefined: 'sat', sat: 'sun', sun: 'both', both: null }
const DAY_LABEL = { sat: 'S', sun: 'N', both: 'SN' }
const DAY_TITLE = { sat: 'Sat only', sun: 'Sun only', both: 'Both days' }

const fmtShort = (d) => d
  ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
  : null

export default function UnavailabilityManager({ onSelectPlayer }) {
  const [rounds, setRounds] = useState([])
  const [allPlayers, setAllPlayers] = useState([])
  const [unavailMap, setUnavailMap] = useState({}) // "playerId:roundId" → 'sat'|'sun'|'both'
  const [loading, setLoading] = useState(true)

  // Picker state — opens when you click "+ Add" on a round column
  const [pickerRound, setPickerRound] = useState(null) // round object
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerSelected, setPickerSelected] = useState(new Set())
  const [pickerDay, setPickerDay] = useState('both') // default day for bulk-add
  const searchRef = useRef(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([getRounds(), getPlayers(true), getUnavailability()]).then(([r, p, u]) => {
      setRounds(r.filter(rd => rd.round_type === 'season'))
      setAllPlayers(p.filter(pl => pl.is_active === 1).sort((a, b) => a.name.localeCompare(b.name)))
      const map = {}
      u.forEach(rec => { map[`${rec.player_id}:${rec.round_id}`] = rec.days || 'both' })
      setUnavailMap(map)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (pickerRound && searchRef.current) {
      searchRef.current.focus()
      setPickerSelected(new Set())
      setPickerSearch('')
      setPickerDay('both')
    }
  }, [pickerRound])

  // ── Cell toggle (click cycles sat → sun → both → clear) ───────────────────

  const toggleCell = async (playerId, roundId) => {
    const key = `${playerId}:${roundId}`
    const current = unavailMap[key]
    const next = DAY_CYCLE[current] ?? DAY_CYCLE['undefined']

    // Optimistic
    setUnavailMap(prev => {
      const m = { ...prev }
      if (next === null) delete m[key]
      else m[key] = next
      return m
    })

    if (next === null) {
      await removeUnavailability(playerId, roundId)
    } else if (!current) {
      await addUnavailability({ player_id: playerId, round_id: roundId, days: next })
    } else {
      await updateUnavailabilityDays(playerId, roundId, next)
    }
  }

  // ── Picker: bulk-add players to a round ───────────────────────────────────

  const pickerPlayers = allPlayers.filter(p =>
    !pickerSearch || p.name.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  const confirmPicker = async () => {
    if (!pickerRound || pickerSelected.size === 0) return
    const rid = pickerRound.id
    const updates = {}
    for (const pid of pickerSelected) {
      const key = `${pid}:${rid}`
      updates[key] = pickerDay
    }
    // Optimistic
    setUnavailMap(prev => ({ ...prev, ...updates }))
    setPickerRound(null)
    // Write to Firestore
    await Promise.all([...pickerSelected].map(pid => {
      const key = `${pid}:${rid}`
      const existing = unavailMap[key]
      if (!existing) return addUnavailability({ player_id: pid, round_id: rid, days: pickerDay })
      return updateUnavailabilityDays(pid, rid, pickerDay)
    }))
  }

  // ── Split rounds into two rows ─────────────────────────────────────────────
  // Row 1: first 11 rounds, Row 2: remainder
  const row1 = rounds.slice(0, 11)
  const row2 = rounds.slice(11)

  // Players who have ANY unavailability — shown as rows
  const unavailPlayerIds = new Set(
    Object.keys(unavailMap).map(k => Number(k.split(':')[0]))
  )
  const unavailPlayers = allPlayers.filter(p => unavailPlayerIds.has(p.id))

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">Loading unavailability…</div>
  )

  // ── Round column header ────────────────────────────────────────────────────

  const RoundHeader = ({ round }) => {
    const satStr = fmtShort(round.sat_date)
    const sunStr = fmtShort(round.sun_date)
    const unavailCount = Object.keys(unavailMap).filter(k => k.endsWith(`:${round.id}`)).length
    return (
      <th className="text-center px-1 py-2 font-semibold text-xs text-slate-700 min-w-[52px] sticky top-0 bg-white z-10 border-b border-slate-200">
        <div className="text-slate-800 font-bold">R{round.round_number}</div>
        {satStr && <div className="text-slate-400 font-normal text-[10px] leading-tight">{satStr}</div>}
        {unavailCount > 0 && (
          <div className="mt-0.5">
            <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-semibold">{unavailCount}</span>
          </div>
        )}
        <button
          onClick={() => setPickerRound(round)}
          className="mt-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-700 transition-colors font-medium leading-none"
          title={`Add unavailable players to R${round.round_number}`}
        >+ Add</button>
      </th>
    )
  }

  // ── Cell ──────────────────────────────────────────────────────────────────

  const Cell = ({ playerId, round }) => {
    const key = `${playerId}:${round.id}`
    const days = unavailMap[key]
    if (!days) {
      return (
        <td className="text-center px-1 py-1.5">
          <button
            onClick={() => toggleCell(playerId, round.id)}
            className="w-8 h-6 rounded text-[10px] text-slate-200 hover:bg-red-50 hover:text-red-400 transition-colors"
            title="Click to mark unavailable"
          >—</button>
        </td>
      )
    }
    return (
      <td className="text-center px-1 py-1.5">
        <button
          onClick={() => toggleCell(playerId, round.id)}
          title={`${DAY_TITLE[days]} — click to cycle`}
          className={`w-8 h-6 rounded text-[10px] font-bold transition-colors ${
            days === 'both'
              ? 'bg-red-500 text-white hover:bg-red-600'
              : days === 'sat'
              ? 'bg-orange-400 text-white hover:bg-orange-500'
              : 'bg-amber-400 text-white hover:bg-amber-500'
          }`}
        >{DAY_LABEL[days]}</button>
      </td>
    )
  }

  // ── Round row (used twice — row1 and row2) ─────────────────────────────────

  const Grid = ({ roundSet }) => (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-white">
            <th className="text-left px-3 py-2 font-semibold text-xs text-slate-500 sticky left-0 bg-white z-20 border-b border-slate-200 min-w-[140px]">
              Player
            </th>
            {roundSet.map(r => <RoundHeader key={r.id} round={r} />)}
          </tr>
        </thead>
        <tbody>
          {unavailPlayers.length === 0 ? (
            <tr>
              <td colSpan={roundSet.length + 1} className="px-3 py-6 text-center text-slate-400 text-sm">
                No unavailability recorded yet — use the + Add buttons above to add players.
              </td>
            </tr>
          ) : (
            unavailPlayers.map((player, i) => (
              <tr key={player.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                <td className="px-3 py-1.5 sticky left-0 z-10 border-r border-slate-100"
                  style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                  <button
                    onClick={() => onSelectPlayer && onSelectPlayer(player)}
                    className="text-sm font-medium text-slate-700 hover:text-blue-600 text-left truncate max-w-[130px] block"
                    title={player.name}
                  >{player.name}</button>
                  <span className="text-[10px] text-slate-400">{player.assigned_team_id_2026 || '—'}</span>
                </td>
                {roundSet.map(r => <Cell key={r.id} playerId={player.id} round={r} />)}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="p-3 sm:p-4 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-800">Unavailability</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Click a cell to cycle: — → Sat → Sun → Both → clear.
            Use <span className="font-medium">+ Add</span> to bulk-add players to a round.
          </p>
        </div>
        <div className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded">
          {unavailPlayers.length} player{unavailPlayers.length !== 1 ? 's' : ''} affected
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span className="w-6 h-4 rounded bg-orange-400 inline-block" />Sat only</span>
        <span className="flex items-center gap-1"><span className="w-6 h-4 rounded bg-amber-400 inline-block" />Sun only</span>
        <span className="flex items-center gap-1"><span className="w-6 h-4 rounded bg-red-500 inline-block" />Both days</span>
      </div>

      {/* Row 1 — Rounds 1-11 */}
      <Grid roundSet={row1} />

      {/* Row 2 — Rounds 12+ */}
      {row2.length > 0 && <Grid roundSet={row2} />}

      {/* ── Picker modal ───────────────────────────────────────────────── */}
      {pickerRound && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800">Add unavailability — R{pickerRound.round_number}</h3>
                {fmtShort(pickerRound.sat_date) && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fmtShort(pickerRound.sat_date)}{pickerRound.sun_date ? ` – ${fmtShort(pickerRound.sun_date)}` : ''}
                  </p>
                )}
              </div>
              <button onClick={() => setPickerRound(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {/* Day selector */}
            <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Unavailable:</span>
              {['sat', 'sun', 'both'].map(d => (
                <button key={d} onClick={() => setPickerDay(d)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${
                    pickerDay === d
                      ? d === 'both' ? 'bg-red-500 text-white border-red-500'
                      : d === 'sat'  ? 'bg-orange-400 text-white border-orange-400'
                      : 'bg-amber-400 text-white border-amber-400'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >{d === 'sat' ? 'Sat' : d === 'sun' ? 'Sun' : 'Both days'}</button>
              ))}
            </div>

            {/* Search */}
            <div className="px-4 py-2 border-b border-slate-100">
              <input
                ref={searchRef}
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            {/* Player list */}
            <div className="overflow-y-auto flex-1">
              {pickerPlayers.map(p => {
                const alreadySet = unavailMap[`${p.id}:${pickerRound.id}`]
                const isSelected = pickerSelected.has(p.id)
                return (
                  <div key={p.id}
                    onClick={() => {
                      setPickerSelected(prev => {
                        const next = new Set(prev)
                        isSelected ? next.delete(p.id) : next.add(p.id)
                        return next
                      })
                    }}
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
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        alreadySet === 'both' ? 'bg-red-100 text-red-600'
                        : alreadySet === 'sat' ? 'bg-orange-100 text-orange-600'
                        : 'bg-amber-100 text-amber-600'
                      }`}>{DAY_LABEL[alreadySet]}</span>
                    )}
                  </div>
                )
              })}
              {pickerPlayers.length === 0 && (
                <div className="px-4 py-6 text-center text-slate-400 text-sm">No players found</div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">{pickerSelected.size} selected</span>
              <div className="flex gap-2">
                <button onClick={() => setPickerRound(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
                <button onClick={confirmPicker} disabled={pickerSelected.size === 0}
                  className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed">
                  Mark unavailable ({pickerSelected.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
