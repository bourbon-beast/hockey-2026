import { useState, useRef, useEffect } from 'react'
import { useRoundManager } from './useRoundManager'
import { buildTeamCanvas } from './roundUtils'
import TeamColumn from './TeamColumn'

export default function RoundPlanner({ statuses, onSelectPlayer }) {
  const { state, actions, getters } = useRoundManager()
  const {
    teams, allPlayers, currentRound, roundData, loading, roundUnavailability,
    seasonRounds, practiceRounds
  } = state

  // View States
  const [plannerMode, setPlannerMode] = useState('season')
  const [mobileTeamFilter, setMobileTeamFilter] = useState(null)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [pickerTeamFilter, setPickerTeamFilter] = useState(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [showUnavailableInPicker, setShowUnavailableInPicker] = useState(false)

  // Modals Forms & States
  const [showNewRoundModal, setShowNewRoundModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyAsType, setCopyAsType] = useState('season')
  const [newRoundForm, setNewRoundForm] = useState({ type: 'season', name: '', sat_date: '', sun_date: '' })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showCarryForwardModal, setShowCarryForwardModal] = useState(false)
  const [carryForwardTeams, setCarryForwardTeams] = useState([])
  const [carryForwardLoading, setCarryForwardLoading] = useState(false)
  const [carryForwardResult, setCarryForwardResult] = useState(null)
  const [showTeamSheetModal, setShowTeamSheetModal] = useState(false)
  const [teamSheetCanvases, setTeamSheetCanvases] = useState([])

  const searchRef = useRef(null)

  useEffect(() => {
    if (pickerOpen && searchRef.current) {
      searchRef.current.focus()
      setPickerTeamFilter(pickerOpen.teamId)
      setSelectedPlayerIds(new Set())
    }
  }, [pickerOpen])

  // Getters mapped
  const getStatusColor = (statusId) => statuses.find(s => s.id === statusId)?.color || '#6b7280'
  const duplicateIds = getters.getDuplicatePlayerIds()
  const playerTeamMap = roundData ? Object.fromEntries(roundData.selections.map(s => [s.player_id, s.team_id])) : {}

  const getAvailablePlayers = () => {
    const selected = new Set(roundData?.selections.filter(s => s.team_id === pickerOpen?.teamId).map(s => s.player_id))
    return allPlayers
        .filter(p => !selected.has(p.id))
        .filter(p => showUnavailableInPicker || !roundUnavailability[p.id])
        .filter(p => {
          if (!pickerTeamFilter) return true
          if (playerTeamMap[p.id] === pickerTeamFilter) return true
          if (Array.isArray(p.teams_played_2026) && p.teams_played_2026.includes(pickerTeamFilter)) return true
          if (p.assigned_team_id_2026 === pickerTeamFilter) return true
          return false
        })
        .filter(p => !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
          const aU = !!roundUnavailability[a.id]
          const bU = !!roundUnavailability[b.id]
          if (aU !== bU) return aU ? 1 : -1
          return a.name.localeCompare(b.name)
        })
  }

  // Action Wrappers for Modals
  const handleCreateRound = async (copyFromPrevious = false, typeOverride = null) => {
    const type = typeOverride || newRoundForm.type
    const body = {
      round_type: type,
      name: type === 'practice' ? (newRoundForm.name || currentRound?.name || 'Practice Match') : null,
      round_number: type === 'season'
          ? (seasonRounds.length > 0 ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1)
          : null,
      sat_date: newRoundForm.sat_date || null,
      sun_date: newRoundForm.sun_date || null,
    }
    if (copyFromPrevious && currentRound) body.copy_from_round_id = currentRound.id
    await actions.createRound(body)
    setShowNewRoundModal(false)
    setShowCopyModal(false)
    setShowAdvanceModal(false)
    setNewRoundForm({ type: 'season', name: '', sat_date: '', sun_date: '' })
  }

  const saveRename = async () => {
    if (!currentRound || !renameValue.trim()) return
    const body = currentRound.round_type === 'season'
        ? { round_number: parseInt(renameValue.replace(/\D/g, '')) || currentRound.round_number }
        : { name: renameValue.trim() }
    await actions.updateRound(body)
    setShowRenameModal(false)
  }

  const handleCarryForward = async () => {
    setCarryForwardLoading(true)
    const res = await actions.carryForward(carryForwardTeams)
    if (res) setCarryForwardResult({ success: true, copied: res.copied, nextLabel: res.nextLabel })
    else setCarryForwardResult({ success: false, error: 'Failed' })
    setCarryForwardLoading(false)
  }

  const openTeamSheetModal = () => {
    if (!roundData || !currentRound) return
    const roundLabel = currentRound.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound.name || 'Practice Match'
    const sheets = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro'].map(tid => {
      const match = (roundData.matches || []).find(m => m.team_id === tid) || {}
      const players = (roundData.selections || []).filter(s => s.team_id === tid && !s.is_unavailable).sort((a, b) => a.slot_number - b.slot_number)
      const canvas = buildTeamCanvas(tid, match, players, roundLabel)
      return { teamId: tid, dataUrl: canvas.toDataURL('image/png'), roundLabel }
    })
    setTeamSheetCanvases(sheets)
    setShowTeamSheetModal(true)
  }

  const downloadTeamSheet = (sheet) => {
    const link = document.createElement('a')
    link.download = `MHC-${sheet.roundLabel.replace(/\s+/g, '-')}-${sheet.teamId}.png`
    link.href = sheet.dataUrl
    link.click()
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading round data…</div>

  return (
      <div className="p-3 sm:p-4 space-y-3">
        {/* ── Navbar ── */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex rounded border border-slate-200 overflow-hidden flex-shrink-0">
            <button onClick={() => { setPlannerMode('season'); actions.setCurrentRound(seasonRounds[seasonRounds.length - 1]) }} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${plannerMode === 'season' ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Season</button>
            <button onClick={() => { setPlannerMode('practice'); actions.setCurrentRound(practiceRounds[0]) }} className={`px-3 py-1.5 text-xs font-semibold border-l border-slate-200 transition-colors ${plannerMode === 'practice' ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>Practice</button>
          </div>

          {plannerMode === 'season' && (() => {
            const idx = seasonRounds.findIndex(r => r.id === currentRound?.id)
            const prev = idx > 0 ? seasonRounds[idx - 1] : null
            const next = idx >= 0 && idx < seasonRounds.length - 1 ? seasonRounds[idx + 1] : null
            const nextNum = seasonRounds.length > 0 ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1
            const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null
            const satStr = fmtD(currentRound?.sat_date)
            const sunStr = fmtD(currentRound?.sun_date)
            const dateStr = satStr && sunStr ? `${satStr} – ${sunStr}` : satStr || sunStr || null
            const label = currentRound ? `R${currentRound.round_number}${dateStr ? ` · ${dateStr}` : ''}` : 'No rounds'
            return (
                <>
                  <button onClick={() => prev && actions.setCurrentRound(prev)} aria-label="Previous round" disabled={!prev} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-25 text-sm font-bold flex-shrink-0">‹</button>
                  <span className="text-sm font-semibold text-slate-800 truncate min-w-0">{label}</span>
                  {!next ? (
                      <button onClick={() => setShowAdvanceModal(true)} className="px-2.5 h-7 flex items-center rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex-shrink-0">R{nextNum} →</button>
                  ) : (
                      <button onClick={() => actions.setCurrentRound(next)} aria-label="Next round" className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm font-bold flex-shrink-0">›</button>
                  )}
                </>
            )
          })()}

          {plannerMode === 'practice' && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {practiceRounds.length === 0 ? <span className="text-xs text-slate-400">No practice rounds yet</span> : practiceRounds.map(r => (
                    <button key={r.id} onClick={() => actions.setCurrentRound(r)} className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${currentRound?.id === r.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>{r.name || 'Practice'}</button>
                ))}
              </div>
          )}

          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {currentRound && <button onClick={openTeamSheetModal} className="h-7 px-2.5 flex items-center rounded text-xs font-medium bg-slate-700 text-white hover:bg-slate-800">Sheet</button>}
            <div className="relative">
              <button onClick={() => setShowOverflowMenu(!showOverflowMenu)} aria-label="Round options menu" className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm">···</button>
              {showOverflowMenu && (
                  <div className="absolute right-0 top-8 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1" onMouseLeave={() => setShowOverflowMenu(false)}>
                    {currentRound && plannerMode === 'season' && <button onClick={() => { setShowOverflowMenu(false); setCarryForwardTeams(teams.map(t=>t.id)); setCarryForwardResult(null); setShowCarryForwardModal(true) }} className="w-full text-left px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">Carry forward →</button>}
                    {currentRound && <button onClick={() => { setShowOverflowMenu(false); setShowCopyModal(true) }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Copy to new round</button>}
                    <button onClick={() => { setShowOverflowMenu(false); setShowNewRoundModal(true) }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">New blank round</button>
                    {currentRound && (
                        <>
                          <button onClick={() => { setShowOverflowMenu(false); setRenameValue(currentRound.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound.name); setShowRenameModal(true) }} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Rename round</button>
                          <div className="border-t border-slate-100 my-1" />
                          <button onClick={() => { setShowOverflowMenu(false); setShowDeleteConfirm(true) }} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete round</button>
                        </>
                    )}
                  </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile Filter ── */}
        {currentRound && (
            <div className="flex items-center gap-1.5 overflow-x-auto sm:hidden pb-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              <button onClick={() => setMobileTeamFilter(null)} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${mobileTeamFilter === null ? 'bg-slate-800 text-white' : 'bg-white text-slate-600'}`}>All</button>
              {teams.map(t => (
                  <button key={t.id} onClick={() => setMobileTeamFilter(prev => prev === t.id ? null : t.id)} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border ${mobileTeamFilter === t.id ? 'bg-blue-900 text-white' : 'bg-white text-slate-600'}`}>{t.id}</button>
              ))}
            </div>
        )}

        {!currentRound && <div className="text-slate-500 text-sm">No rounds yet. Create one to get started.</div>}

        {/* ── Unavailability Banner ── */}
        {currentRound && Object.keys(roundUnavailability).length > 0 && (() => {
          const unavailPlayers = allPlayers.filter(p => roundUnavailability[p.id]).sort((a, b) => a.name.localeCompare(b.name))
          return (
              <div className="mb-3 rounded border border-red-200 bg-red-50 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
                  <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Unavailable</span>
                  <span className="text-xs bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">{unavailPlayers.length}</span>
                  {unavailPlayers.map(p => (
                      <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 text-red-700 rounded px-2 py-0.5 cursor-pointer hover:bg-red-100" onClick={() => onSelectPlayer && onSelectPlayer(p)}>
                      {p.name} <span className="text-red-400 font-medium">{roundUnavailability[p.id] === 'sat' ? 'Sat' : roundUnavailability[p.id] === 'sun' ? 'Sun' : 'Both days'}</span>
                    </span>
                  ))}
                </div>
              </div>
          )
        })()}

        {/* ── Grid Columns (This is where TeamColumn is used!) ── */}
        {currentRound && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {teams.filter(t => !mobileTeamFilter || t.id === mobileTeamFilter || window.innerWidth >= 640).map(team => (
                  <TeamColumn
                      key={team.id}
                      team={team}
                      state={state}
                      actions={actions}
                      getters={getters}
                      duplicateIds={duplicateIds}
                      onSelectPlayer={onSelectPlayer}
                      setPickerOpen={setPickerOpen}
                  />
              ))}
            </div>
        )}

        {/* ── Modals ── */}
        {pickerOpen && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">Add player — {pickerOpen.teamId}</h3>
                  <button onClick={() => setPickerOpen(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                </div>
                <div className="px-4 py-2 border-b border-slate-100">
                  <input ref={searchRef} value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search players…" className="w-full text-sm border border-slate-200 rounded px-3 py-2" />
                  <div className="flex gap-2 mt-2 flex-wrap items-center">
                    <button onClick={() => setPickerTeamFilter(null)} className={`text-xs px-2 py-1 rounded ${!pickerTeamFilter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
                    {teams.map(t => <button key={t.id} onClick={() => setPickerTeamFilter(t.id)} className={`text-xs px-2 py-1 rounded ${pickerTeamFilter === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.id}</button>)}
                    {Object.keys(roundUnavailability).length > 0 && (
                        <button onClick={() => setShowUnavailableInPicker(v => !v)} className={`ml-auto text-xs px-2 py-1 rounded flex items-center gap-1 ${showUnavailableInPicker ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                          {showUnavailableInPicker ? 'Hide' : 'Show'} unavailable
                        </button>
                    )}
                  </div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {getAvailablePlayers().map(p => {
                    const isSelected = selectedPlayerIds.has(p.id)
                    const isUnavail = !!roundUnavailability[p.id]
                    return (
                        <div key={p.id} onClick={() => { const next = new Set(selectedPlayerIds); isSelected ? next.delete(p.id) : next.add(p.id); setSelectedPlayerIds(next) }} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-slate-100 text-sm ${isSelected ? 'bg-blue-50' : isUnavail ? 'bg-red-50 opacity-60' : 'hover:bg-slate-50'}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{isSelected && '✓'}</div>
                          <span className={`flex-1 ${isUnavail ? 'line-through text-slate-400' : ''}`}>{p.name}</span>
                          {isUnavail && <span className="text-xs text-red-400">unavailable</span>}
                          {p.status_id && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusColor(p.status_id) }} />}
                        </div>
                    )
                  })}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{selectedPlayerIds.size} selected</span>
                  <div className="flex gap-2">
                    <button onClick={() => { setPickerOpen(null); setSearchTerm(''); setSelectedPlayerIds(new Set()) }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                    <button onClick={() => { actions.addPlayers(pickerOpen.teamId, [...selectedPlayerIds]); setPickerOpen(null); setSelectedPlayerIds(new Set()) }} disabled={selectedPlayerIds.size === 0} className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-40">Add</button>
                  </div>
                </div>
              </div>
            </div>
        )}

        {showCarryForwardModal && (() => {
          const idx = seasonRounds.findIndex(r => r.id === currentRound?.id)
          const nextRound = seasonRounds[idx + 1]
          const allTicked = carryForwardTeams.length === teams.length
          return (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold">Carry Forward</h3>
                    <p className="text-sm text-slate-500 mt-1">Copy selections from Round {currentRound?.round_number} into {nextRound ? `Round ${nextRound.round_number}` : '?'}</p>
                  </div>
                  {!nextRound ? (
                      <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">No next round found — create the next season round first.</p>
                  ) : carryForwardResult ? (
                      <div className={`px-3 py-3 rounded text-sm ${carryForwardResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {carryForwardResult.success ? `✓ Copied ${carryForwardResult.copied} players into ${carryForwardResult.nextLabel}.` : `Error: ${carryForwardResult.error}`}
                      </div>
                  ) : (
                      <div className="space-y-2">
                        <div className="flex justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-500">Select teams</span>
                          <button onClick={() => setCarryForwardTeams(allTicked ? [] : teams.map(t => t.id))} className="text-xs text-blue-600">{allTicked ? 'Deselect all' : 'Select all'}</button>
                        </div>
                        {teams.map(t => (
                            <label key={t.id} className="flex items-center gap-3 px-3 py-2 border rounded cursor-pointer">
                              <input type="checkbox" checked={carryForwardTeams.includes(t.id)} onChange={() => setCarryForwardTeams(prev => carryForwardTeams.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} className="w-4 h-4" />
                              <span className="text-sm">{t.id}</span>
                            </label>
                        ))}
                      </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    {carryForwardResult ? (
                        <button onClick={() => setShowCarryForwardModal(false)} className="flex-1 py-2 bg-blue-600 text-white rounded">Done</button>
                    ) : (
                        <>
                          <button onClick={handleCarryForward} disabled={!nextRound || carryForwardTeams.length===0 || carryForwardLoading} className="flex-1 py-2 bg-blue-600 text-white rounded disabled:opacity-40">{carryForwardLoading ? 'Copying…' : 'Carry forward'}</button>
                          <button onClick={() => setShowCarryForwardModal(false)} className="flex-1 py-2 border rounded">Cancel</button>
                        </>
                    )}
                  </div>
                </div>
              </div>
          )
        })()}

        {showAdvanceModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
                <h3 className="text-base font-semibold">Advance to Round {seasonRounds.length ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1}</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 w-8">Sat</label><input type="date" onChange={e => setNewRoundForm(f => ({ ...f, sat_date: e.target.value }))} className="flex-1 border rounded px-2 py-1.5 text-sm" /></div>
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 w-8">Sun</label><input type="date" onChange={e => setNewRoundForm(f => ({ ...f, sun_date: e.target.value }))} className="flex-1 border rounded px-2 py-1.5 text-sm" /></div>
                </div>
                <p className="text-sm text-slate-500">Copy all team selections from Round {currentRound?.round_number} into the new round?</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleCreateRound(true, 'season')} className="flex-1 py-2 bg-blue-600 text-white rounded text-sm">Yes, copy</button>
                  <button onClick={() => handleCreateRound(false, 'season')} className="flex-1 py-2 border rounded text-sm">No, start blank</button>
                </div>
                <button onClick={() => setShowAdvanceModal(false)} className="w-full text-xs text-slate-400">Cancel</button>
              </div>
            </div>
        )}

        {showNewRoundModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-lg">New Round</h3>
                <div className="flex gap-3">
                  {['season', 'practice'].map(type => (
                      <button key={type} onClick={() => setNewRoundForm(f => ({ ...f, type }))} className={`flex-1 py-2 rounded border text-sm ${newRoundForm.type === type ? 'bg-blue-600 text-white' : ''}`}>{type === 'season' ? 'Season' : 'Practice'}</button>
                  ))}
                </div>
                {newRoundForm.type === 'practice' && <input onChange={(e) => setNewRoundForm(f => ({ ...f, name: e.target.value }))} placeholder="Match name" className="w-full border rounded px-3 py-2 text-sm" />}
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 w-8">Sat</label><input type="date" onChange={e => setNewRoundForm(f => ({ ...f, sat_date: e.target.value }))} className="flex-1 border rounded px-2 py-1.5 text-sm" /></div>
                  <div className="flex items-center gap-2"><label className="text-xs text-slate-500 w-8">Sun</label><input type="date" onChange={e => setNewRoundForm(f => ({ ...f, sun_date: e.target.value }))} className="flex-1 border rounded px-2 py-1.5 text-sm" /></div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowNewRoundModal(false)} className="flex-1 py-2 border rounded">Cancel</button>
                  <button onClick={() => handleCreateRound(false)} className="flex-1 py-2 bg-blue-600 text-white rounded">Create</button>
                </div>
              </div>
            </div>
        )}

        {showCopyModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-lg">Copy to New Round</h3>
                <div className="flex gap-3">
                  {['season', 'practice'].map(type => (
                      <button key={type} onClick={() => setCopyAsType(type)} className={`flex-1 py-2 rounded border text-sm ${copyAsType === type ? 'bg-blue-600 text-white' : ''}`}>{type === 'season' ? 'Season' : 'Practice'}</button>
                  ))}
                </div>
                {copyAsType === 'practice' && <input onChange={(e) => setNewRoundForm(f => ({ ...f, name: e.target.value }))} placeholder="Match name" className="w-full border rounded px-3 py-2 text-sm" />}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowCopyModal(false)} className="flex-1 py-2 border rounded">Cancel</button>
                  <button onClick={() => handleCreateRound(true, copyAsType)} className="flex-1 py-2 bg-blue-600 text-white rounded">Copy</button>
                </div>
              </div>
            </div>
        )}

        {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                <h3 className="font-semibold text-lg">Delete Round?</h3>
                <p className="text-sm">This will permanently delete the round.</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 border rounded">Cancel</button>
                  <button onClick={() => { actions.deleteRound(); setShowDeleteConfirm(false) }} className="flex-1 py-2 bg-red-600 text-white rounded">Delete</button>
                </div>
              </div>
            </div>
        )}

        {showRenameModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl p-6 space-y-4">
                <h3 className="font-semibold">Rename Round</h3>
                <input value={renameValue} onChange={e=>setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveRename()} className="w-full border rounded px-3 py-2 text-sm" autoFocus />
                <div className="flex gap-2">
                  <button onClick={()=>setShowRenameModal(false)} className="flex-1 border rounded py-2 text-sm">Cancel</button>
                  <button onClick={saveRename} className="flex-1 bg-blue-600 text-white rounded py-2 text-sm">Save</button>
                </div>
              </div>
            </div>
        )}

        {showTeamSheetModal && (
            <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mt-4 mb-8">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                  <div>
                    <h3 className="font-semibold text-lg">Team Sheets</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => teamSheetCanvases.forEach((sheet, i) => setTimeout(() => downloadTeamSheet(sheet), i * 200))} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded">Download All</button>
                    <button onClick={() => setShowTeamSheetModal(false)} className="text-2xl leading-none">×</button>
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {teamSheetCanvases.map(sheet => (
                      <div key={sheet.teamId} className="flex flex-col gap-2">
                        <img src={sheet.dataUrl} alt="team sheet" className="w-full border rounded-lg shadow-sm" />
                        <button onClick={() => downloadTeamSheet(sheet)} className="w-full py-2 text-sm bg-slate-100 rounded font-medium">↓ Download {sheet.teamId}</button>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}
      </div>
  )
}