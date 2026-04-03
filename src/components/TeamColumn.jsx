import { AVAILABILITY, POSITIONS, POSITION_STYLES } from './roundUtils'

export default function TeamColumn({
                                       team, state, actions, getters, duplicateIds, onSelectPlayer, setPickerOpen
                                   }) {
    const { allPlayers, roundUnavailability, draggedPlayer, dragOverInfo } = state

    const selections = getters.getTeamActiveSelections(team.id)
    const unavailSels = getters.getTeamUnavailableSelections(team.id)
    const match = getters.getMatchDetails(team.id)
    const counts = getters.getTeamCounts(team.id)
    const posCounts = getters.getPositionCounts(team.id)

    const KIT_COLOURS = {
        top_colour:   { label: '👕 Top',   options: ['', 'Blue', 'White'] },
        socks_colour: { label: '🧦 Socks', options: ['', 'Yellow', 'Blue'] },
    }

    const chipStyle = val => {
        const v = (val || '').toLowerCase()
        if (v === 'yellow') return { background: '#eab308', color: '#1e293b', borderColor: '#ca8a04' }
        if (v === 'blue')   return { background: '#1e3a8a', color: '#fff',    borderColor: '#1d4ed8' }
        if (v === 'white')  return { background: '#f1f5f9', color: '#1e293b', borderColor: '#94a3b8' }
        return { background: '#1e293b', color: '#64748b', borderColor: '#334155' }
    }

    return (
        <div
            data-team-id={team.id}
            className={`bg-white rounded-lg border overflow-hidden transition-colors ${
                draggedPlayer && draggedPlayer.fromTeamId !== team.id && dragOverInfo?.teamId === team.id
                    ? 'border-blue-400 ring-2 ring-blue-300'
                    : 'border-slate-200'
            }`}
            onDragOver={(e) => actions.handleDragOverColumn(e, team.id)}
            onDrop={(e) => actions.handleDrop(e, team.id, null)}
        >
            {/* ── Team Header ── */}
            <div className="text-white" style={{ background: '#0f172a' }}>
                <div style={{ background: '#eab308', height: '4px' }} />
                <div className="flex items-center justify-between px-3 py-2" style={{ background: '#1e3a8a' }}>
                    <div className="font-bold text-sm tracking-wide">{team.id}</div>
                    <div className="flex items-center gap-1.5 text-xs">
                        {counts.confirmed > 0 && <span className="text-green-300 font-medium">{counts.confirmed}✓</span>}
                        {counts.waiting > 0 && <span className="text-yellow-300 font-medium">{counts.waiting}?</span>}
                        {counts.unavailable > 0 && <span className="text-red-300 font-medium">{counts.unavailable}✕</span>}
                        {counts.unavailableBucket > 0 && <span className="text-slate-400 font-medium" title="In unavailable bucket">{counts.unavailableBucket}off</span>}
                        <span className={`font-bold ml-0.5 ${counts.total >= 11 && counts.total <= 16 ? 'text-white' : counts.total > 16 ? 'text-orange-300' : 'text-red-300'}`}>{counts.total}</span>
                    </div>
                </div>

                {/* ── Match Inline Details ── */}
                <div className="px-3 py-2 space-y-1.5" style={{ background: '#0f172a' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-xs w-10 flex-shrink-0">Date</span>
                        <input
                            type="date"
                            defaultValue={match.match_date || ''}
                            onBlur={e => actions.updateMatchDetails(team.id, { match_date: e.target.value })}
                            className="flex-1 bg-transparent text-white text-xs py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400"
                            style={{ colorScheme: 'dark' }}
                        />
                    </div>

                    {[
                        { key: 'time',      placeholder: 'Time' },
                        { key: 'arrive_at', placeholder: 'Arrive' },
                        { key: 'opponent',  placeholder: 'vs' },
                        { key: 'venue',     placeholder: 'Venue' },
                    ].map(({ key, placeholder }) => (
                        <input
                            key={key}
                            type="text"
                            defaultValue={match[key] || ''}
                            placeholder={placeholder}
                            onBlur={e => actions.updateMatchDetails(team.id, { [key]: e.target.value })}
                            className="w-full bg-transparent text-white placeholder-slate-500 text-xs px-0 py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400"
                        />
                    ))}

                    <div className="flex gap-2 pt-0.5">
                        {Object.entries(KIT_COLOURS).map(([key, { label, options }]) => {
                            const val = match[key] || ''
                            return (
                                <div key={key} className="flex-1">
                                    <select
                                        value={val}
                                        onChange={e => actions.updateMatchDetails(team.id, { [key]: e.target.value })}
                                        style={{ ...chipStyle(val), borderWidth: '1px', borderStyle: 'solid' }}
                                        className="w-full text-xs font-semibold rounded-full px-2 py-0.5 text-center appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                    >
                                        {options.map(o => <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>{o || label}</option>)}
                                    </select>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>

            {/* ── Player List ── */}
            <div className="min-h-[40px]" onDragOver={(e) => actions.handleDragOverEmpty(e, team.id)} onDrop={(e) => actions.handleDrop(e, team.id, null)}>
                {selections.map((sel, idx) => {
                    const avail = AVAILABILITY[sel.confirmed ?? 0]
                    const isDupe = duplicateIds.has(sel.player_id)
                    const isDragOver = dragOverInfo?.teamId === team.id && dragOverInfo?.playerId === sel.player_id
                    const posStyle = sel.position ? POSITION_STYLES[sel.position] : null

                    return (
                        <div
                            key={`${sel.team_id}-${sel.player_id}`}
                            data-player-id={sel.player_id}
                            data-team-id={team.id}
                            draggable
                            onDragStart={(e) => actions.handleDragStart(e, sel, team.id)}
                            onDragOver={(e) => actions.handleDragOverRow(e, team.id, sel.player_id)}
                            onDrop={(e) => actions.handleDrop(e, team.id, sel.player_id)}
                            onDragEnd={actions.handleDragEnd}
                            style={{
                                borderLeft: posStyle ? `3px solid ${posStyle.border}` : '3px solid transparent',
                                backgroundColor: posStyle ? posStyle.rowBg : undefined,
                                ...(draggedPlayer ? { userSelect: 'none' } : {}),
                            }}
                            className={`border-b border-slate-100 text-sm transition-colors ${!posStyle ? 'hover:bg-slate-50' : ''} ${isDragOver ? (dragOverInfo.position === 'above' ? 'border-t-2 border-t-blue-400' : 'border-b-2 border-b-blue-400') : ''}`}
                        >
                            <div className="flex items-center gap-2 px-3 py-2 w-full" style={{ pointerEvents: draggedPlayer ? 'none' : 'auto' }}>
                                <span className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 touch-none select-none" onTouchStart={(e) => actions.handleTouchStart(e, sel, team.id)} onTouchMove={actions.handleTouchMove} onTouchEnd={actions.handleTouchEnd}>⠿</span>
                                <span className="text-slate-400 text-xs w-4 text-center flex-shrink-0">{idx + 1}</span>
                                <button onClick={() => actions.toggleConfirmed(team.id, sel.player_id)} title={avail.title} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avail.bg} ${avail.border}`}>{avail.icon}</button>
                                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                    <span className="truncate cursor-pointer hover:text-blue-600" onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}>{sel.name}</span>
                                    {roundUnavailability[sel.player_id] ? <span className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400" /> : <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" />}
                                    {isDupe && <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded font-bold flex-shrink-0">2×</span>}
                                </div>
                                <select value={sel.position || ''} onChange={(e) => actions.updatePosition(sel.player_id, e.target.value)} className={`text-xs rounded px-1 py-0.5 w-14 flex-shrink-0 border font-medium ${posStyle ? posStyle.selectCls : 'border-slate-200 text-slate-400 bg-white'}`}>
                                    <option value="">Pos</option>
                                    {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                </select>
                                <button onClick={() => actions.removePlayer(team.id, sel.player_id)} aria-label={`Remove ${sel.name} from squad`} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )
                })}
                {draggedPlayer && draggedPlayer.fromTeamId !== team.id && (
                    <div className={`mx-2 my-1 rounded border-2 border-dashed text-xs text-center py-2 transition-colors ${dragOverInfo?.teamId === team.id ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-400'}`}>
                        {dragOverInfo?.teamId === team.id ? '↓ Drop here' : 'Drop to move here'}
                    </div>
                )}
            </div>

            {/* ── Unavailable Bucket ── */}
            {(unavailSels.length > 0 || (draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket)) && (
                <div data-bucket-team={team.id} className={`border-t-2 border-dashed transition-colors ${draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}`} onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }} onDrop={(e) => actions.handleDropToBucket(e, team.id)}>
                    <div className="flex items-center gap-1.5 px-3 py-1.5">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unavailable</span>
                        {unavailSels.length > 0 && <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">{unavailSels.length}</span>}
                    </div>
                    {unavailSels.map(sel => (
                        <div key={`unavail-${sel.team_id}-${sel.player_id}`} data-player-id={sel.player_id} data-team-id={team.id} draggable onDragStart={(e) => actions.handleDragStart(e, sel, team.id, true)} onDragEnd={actions.handleDragEnd} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 text-sm hover:bg-red-50 group">
                            <span className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none" onTouchStart={(e) => actions.handleTouchStart(e, sel, team.id, true)} onTouchMove={actions.handleTouchMove} onTouchEnd={actions.handleTouchEnd}>⠿</span>
                            <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                <span className="truncate text-slate-400 line-through text-xs cursor-pointer hover:text-blue-500 no-underline" onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}>{sel.name}</span>
                            </div>
                            <button onClick={() => actions.markSelectionUnavailable(team.id, sel.player_id, false)} className="text-slate-400 hover:text-blue-500 text-xs sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0">↑ squad</button>
                            <button onClick={() => actions.removePlayer(team.id, sel.player_id)} aria-label={`Remove ${sel.name} from unavailable bucket`} className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Add Player Footer ── */}
            {(() => {
                const hasAny = Object.keys(posCounts).length > 0
                if (!hasAny) return null
                return (
                    <div className="flex flex-wrap gap-1 px-3 py-1.5 border-t border-slate-100 bg-slate-50">
                        {POSITIONS.filter(p => posCounts[p.value]).map(p => (
                            <span key={p.value} className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${POSITION_STYLES[p.value].badge}`}>{p.label} {posCounts[p.value]}</span>
                        ))}
                    </div>
                )
            })()}
            <div className="p-2">
                <button onClick={() => setPickerOpen({ teamId: team.id })} className="w-full py-1.5 text-sm text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-slate-200 hover:border-blue-300 rounded transition-colors">+ Add player</button>
            </div>
        </div>
    )
}