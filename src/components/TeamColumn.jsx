import { useState, useEffect, useRef } from 'react'
import { ArrowUpDown, AlertTriangle, MapPin, MessageSquare, MessageSquareText } from 'lucide-react'
import { AVAILABILITY, POSITIONS, POSITION_STYLES } from './roundUtils'
import { checkClash } from '../kitClashes'

// ── Note Popover ─────────────────────────────────────────────────────────────
// Renders fixed to viewport so it escapes overflow:hidden on the team column
function NotePopover({ sel, anchorRef, onSave, onClose }) {
    const [text, setText] = useState(sel.note || '')
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const popoverRef = useRef(null)
    const textareaRef = useRef(null)

    useEffect(() => {
        if (anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect()
            const popW = 256
            const vw = window.innerWidth
            let left = rect.left
            if (left + popW > vw - 8) left = vw - popW - 8
            if (left < 8) left = 8
            setPos({ top: rect.bottom + 4, left })
        }
        textareaRef.current?.focus()
    }, [anchorRef])

    useEffect(() => {
        const handler = (e) => {
            if (
                popoverRef.current && !popoverRef.current.contains(e.target) &&
                anchorRef?.current && !anchorRef.current.contains(e.target)
            ) onClose()
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [onClose, anchorRef])

    const handleSave = () => { onSave(text.trim()); onClose() }
    const handleClear = () => { onSave(''); onClose() }

    return (
        <div ref={popoverRef}
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-3 w-64"
            style={{ top: pos.top, left: pos.left }}
            onMouseDown={e => e.stopPropagation()}>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Round note</p>
            <textarea
                ref={textareaRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
                    if (e.key === 'Escape') onClose()
                }}
                rows={3}
                placeholder="e.g. limited minutes – sore hammy"
                className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 resize-none focus:outline-none focus:border-blue-400 text-slate-700"
            />
            <div className="flex gap-2 mt-2">
                <button onClick={handleSave}
                    className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded py-1.5 font-semibold transition-colors">
                    Save
                </button>
                {sel.note && (
                    <button onClick={handleClear}
                        className="text-xs text-slate-400 hover:text-red-500 px-2 transition-colors">
                        Clear
                    </button>
                )}
                <button onClick={onClose}
                    className="text-xs text-slate-400 hover:text-slate-600 px-2 transition-colors">
                    Cancel
                </button>
            </div>
        </div>
    )
}

export default function TeamColumn({
    team, state, actions, getters, duplicateIds, onSelectPlayer, setPickerOpen
}) {
    const { allPlayers, roundUnavailability, draggedPlayer, dragOverInfo, currentRound } = state

    // Derive availability dot colour for a player in this team
    // Green = available, Purple = unavailable other day only, Red = unavailable this day
    const getAvailDot = (playerId) => {
        const unavail = roundUnavailability[playerId]
        if (!unavail) return 'green'
        if (unavail === 'both') return 'red'
        // Work out which day this team plays
        const matchDay = match.match_date === currentRound?.sat_date ? 'sat'
                       : match.match_date === currentRound?.sun_date ? 'sun'
                       : null
        if (!matchDay) return 'red' // no match date set — safe fallback
        return unavail === matchDay ? 'red' : 'purple'
    }
    const [sortMode, setSortMode] = useState(false)
    const [noteOpenId, setNoteOpenId] = useState(null) // selectionId of open popover

    const selections  = getters.getTeamActiveSelections(team.id)
    const unavailSels = getters.getTeamUnavailableSelections(team.id)
    const match       = getters.getMatchDetails(team.id)
    const counts      = getters.getTeamCounts(team.id)
    const posCounts   = getters.getPositionCounts(team.id)
    // is_home comes from Firestore (seeded from fixture JSON)
    // Fall back to venue name check if not set
    const isHome  = match.is_home ?? match.venue?.toLowerCase().includes('mentone') ?? false
    const clash   = !isHome ? checkClash(match.opponent) : { shirt: false, socks: false }

    // Auto-apply kit defaults when opponent is already set (e.g. seeded from fixture)
    // Only fires when opponent changes and kit is still on default values
    useEffect(() => {
        if (!match.opponent) return
        const isHomeGame = match.is_home ?? match.venue?.toLowerCase().includes('mentone') ?? false
        const { shirt, socks } = isHomeGame ? { shirt: false, socks: false } : checkClash(match.opponent)
        const updates = {}
        const currentTop   = (match.top_colour   || 'blue').toLowerCase()
        const currentSocks = (match.socks_colour || 'yellow').toLowerCase()
        // Only auto-set if still on default — don't override a manual change
        if (currentTop === 'blue' || currentTop === 'white') {
            const correct = shirt ? 'White' : 'Blue'
            if (currentTop !== correct.toLowerCase()) updates.top_colour = correct
        }
        if (currentSocks === 'yellow' || currentSocks === 'blue') {
            const correct = socks ? 'Blue' : 'Yellow'
            if (currentSocks !== correct.toLowerCase()) updates.socks_colour = correct
        }
        if (Object.keys(updates).length > 0) {
            actions.updateMatchDetails(team.id, updates)
        }
    }, [match.opponent, match.venue]) // eslint-disable-line react-hooks/exhaustive-deps

    const KIT_COLOURS = {
        top_colour:   { options: ['Blue', 'White'],  label: 'Top' },
        socks_colour: { options: ['Yellow', 'Blue'], label: 'Socks' },
    }

    // Format date as "Sat 11 Apr"
    const fmtMatchDate = d => {
        if (!d) return null
        const dt = new Date(d + 'T00:00:00')
        const day = dt.toLocaleDateString('en-AU', { weekday: 'short' })
        const num = dt.toLocaleDateString('en-AU', { day: 'numeric' })
        const mon = dt.toLocaleDateString('en-AU', { month: 'short' })
        return `${day} ${num} ${mon}`
    }
    const matchDateLabel = fmtMatchDate(match.match_date)

    // Derive kit colour for border highlight
    const kitColourMap = { white: '#e2e8f0', blue: '#3b82f6', yellow: '#eab308' }

    return (
        <div
            data-team-id={team.id}
            className={`relative bg-white rounded-lg border overflow-hidden transition-colors ${
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
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs">
                            {counts.confirmed > 0 && <span className="text-green-300 font-medium">{counts.confirmed}✓</span>}
                            {counts.waiting > 0 && <span className="text-yellow-300 font-medium">{counts.waiting}?</span>}
                            {counts.uncontacted > 0 && <span className="text-slate-400 font-medium">{counts.uncontacted}–</span>}
                            <span className={`font-bold ml-0.5 ${counts.active >= 11 && counts.active <= 16 ? 'text-white' : counts.active > 16 ? 'text-orange-300' : 'text-red-300'}`}>
                                {counts.active}
                            </span>
                        </div>
                        {/* Sort mode toggle — mobile only */}
                        <button
                            onClick={() => setSortMode(m => !m)}
                            className={`sm:hidden w-7 h-7 flex items-center justify-center rounded transition-colors flex-shrink-0
                                ${sortMode ? 'bg-yellow-400 text-slate-900' : 'bg-white/10 text-white/60 hover:bg-white/20'}`}
                            title={sortMode ? 'Exit sort mode' : 'Sort players'}
                        >
                            <ArrowUpDown size={13} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* ── Match Inline Details ── */}
                <div className="px-3 pt-2.5 pb-2 space-y-1.5" style={{ background: '#1e293b' }}>

                    {/* Venue with map pin icon */}
                    <div className="flex items-center gap-1.5">
                        <MapPin size={11} className="text-slate-500 flex-shrink-0" strokeWidth={2} />
                        <input type="text" defaultValue={match.venue || ''} placeholder="Venue"
                            onBlur={e => actions.updateMatchDetails(team.id, { venue: e.target.value })}
                            className="flex-1 bg-transparent text-slate-200 placeholder-slate-600 text-xs font-medium px-0 py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400" />
                    </div>

                    {/* Date · Time · Arrive — all on one row */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                        {/* Hidden native date input; show formatted label */}
                        <div className="relative flex items-baseline gap-1 flex-none">
                            {matchDateLabel
                                ? <span className="text-slate-300 text-xs font-medium">{matchDateLabel}</span>
                                : <span className="text-slate-600 text-xs">Date</span>
                            }
                            <input type="date" defaultValue={match.match_date || ''}
                                onBlur={e => actions.updateMatchDetails(team.id, { match_date: e.target.value })}
                                className="absolute inset-0 opacity-0 w-full cursor-pointer"
                                style={{ colorScheme: 'dark' }} />
                        </div>
                        <span className="text-slate-700 text-xs flex-none">·</span>
                        <input type="text" defaultValue={match.time || ''} placeholder="Time"
                            onBlur={e => actions.updateMatchDetails(team.id, { time: e.target.value })}
                            className="w-16 flex-none bg-transparent text-white placeholder-slate-600 text-sm font-semibold tabular-nums px-0 py-0.5 border-0 border-b border-slate-600 focus:outline-none focus:border-yellow-400" />
                        <span className="text-slate-600 text-xs flex-none">arr</span>
                        <input type="text" defaultValue={match.arrive_at || ''} placeholder="–"
                            onBlur={e => actions.updateMatchDetails(team.id, { arrive_at: e.target.value })}
                            className="w-12 flex-none bg-transparent text-slate-400 placeholder-slate-700 text-xs px-0 py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400" />
                    </div>

                    {/* Opponent — clearly labelled */}
                    <div className="flex items-baseline gap-1.5">
                        <span className="text-slate-500 text-xs flex-none font-medium">vs</span>
                        <input
                            type="text"
                            defaultValue={match.opponent || ''}
                            placeholder="Opponent"
                            onBlur={e => {
                                const opponent = e.target.value
                                const updates = { opponent }
                                const isHomeGame = match.is_home ?? match.venue?.toLowerCase().includes('mentone') ?? false
                                const { shirt, socks } = isHomeGame ? { shirt: false, socks: false } : checkClash(opponent)
                                const currentTop   = (match.top_colour   || 'blue').toLowerCase()
                                const currentSocks = (match.socks_colour || 'yellow').toLowerCase()
                                if (currentTop === 'blue' || currentTop === 'white')
                                    updates.top_colour = shirt ? 'White' : 'Blue'
                                if (currentSocks === 'yellow' || currentSocks === 'blue')
                                    updates.socks_colour = socks ? 'Blue' : 'Yellow'
                                actions.updateMatchDetails(team.id, updates)
                            }}
                            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm font-semibold px-0 py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400"
                        />
                    </div>

                    {/* Kit row — label + colour select, clash icon inside button */}
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-700/50">
                        {Object.entries(KIT_COLOURS).map(([key, { options, label }]) => {
                            const defaults = { top_colour: 'Blue', socks_colour: 'Yellow' }
                            const raw = match[key] || defaults[key]
                            const val = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
                            const isClash = (key === 'top_colour' && clash.shirt) ||
                                            (key === 'socks_colour' && clash.socks)
                            const kitHex = kitColourMap[val.toLowerCase()] || '#64748b'
                            return (
                                <div key={key} className="relative flex-1">
                                    <select
                                        value={val}
                                        onChange={e => actions.updateMatchDetails(team.id, { [key]: e.target.value })}
                                        style={{ borderColor: isClash ? '#fbbf24' : kitHex, color: 'transparent' }}
                                        className="w-full text-xs rounded px-2 py-1 appearance-none cursor-pointer focus:outline-none bg-transparent border transition-colors"
                                    >
                                        {options.map(o => (
                                            <option key={o} value={o}
                                                    style={{ background: '#1e293b', color: '#fff' }}>
                                                {label} – {o}
                                            </option>
                                        ))}
                                    </select>
                                    {/* Overlay label — sole visible text, pointer-events-none so select still works */}
                                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-xs">
                                        {isClash && <AlertTriangle size={9} className="text-amber-400 flex-shrink-0" strokeWidth={2.5} />}
                                        <span className={isClash ? 'text-amber-300' : 'text-slate-300'}>
                                            {label} – {val}
                                        </span>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            </div>


            {/* ── Player List ── */}
            <div className="min-h-[40px]" onDragOver={(e) => actions.handleDragOverEmpty(e, team.id)} onDrop={(e) => actions.handleDrop(e, team.id, null)}>
                {selections.map((sel, idx) => {
                    const avail     = AVAILABILITY[sel.confirmed ?? 0]
                    const isDupe    = duplicateIds.has(sel.player_id)
                    const isDragOver = dragOverInfo?.teamId === team.id && dragOverInfo?.playerId === sel.player_id
                    const posStyle  = sel.position ? POSITION_STYLES[sel.position] : null

                    return (
                        <div
                            key={`${sel.team_id}-${sel.player_id}`}
                            data-player-id={sel.player_id}
                            data-team-id={team.id}
                            draggable={!sortMode}
                            onDragStart={!sortMode ? (e) => actions.handleDragStart(e, sel, team.id) : undefined}
                            onDragOver={!sortMode ? (e) => actions.handleDragOverRow(e, team.id, sel.player_id) : undefined}
                            onDrop={!sortMode ? (e) => actions.handleDrop(e, team.id, sel.player_id) : undefined}
                            onDragEnd={!sortMode ? actions.handleDragEnd : undefined}
                            style={{
                                borderLeft: posStyle ? `3px solid ${posStyle.border}` : '3px solid transparent',
                                backgroundColor: posStyle ? posStyle.rowBg : (sortMode ? '#eff6ff' : undefined),
                                ...(draggedPlayer ? { userSelect: 'none' } : {}),
                            }}
                            className={`border-b border-slate-100 text-sm transition-colors
                                ${!posStyle && !sortMode ? 'hover:bg-slate-50' : ''}
                                ${isDragOver && !sortMode ? (dragOverInfo.position === 'above' ? 'border-t-2 border-t-blue-400' : 'border-b-2 border-b-blue-400') : ''}`}
                        >
                            <div className={`flex items-center gap-2 px-3 w-full ${sortMode ? 'py-3' : 'py-2'}`}>

                                {/* Sort mode: ↑↓ buttons (mobile) vs drag handle (desktop always, mobile when not in sort mode) */}
                                {sortMode ? (
                                    <div className="flex flex-col gap-0.5 flex-shrink-0 -my-1">
                                        <button
                                            onClick={() => idx > 0 && actions.moveSelectionByIndex(team.id, idx, idx - 1)}
                                            disabled={idx === 0}
                                            className="w-8 h-7 flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-100 disabled:opacity-20 transition-colors font-bold text-base"
                                        >↑</button>
                                        <button
                                            onClick={() => idx < selections.length - 1 && actions.moveSelectionByIndex(team.id, idx, idx + 1)}
                                            disabled={idx === selections.length - 1}
                                            className="w-8 h-7 flex items-center justify-center rounded text-slate-500 hover:text-blue-600 hover:bg-blue-100 disabled:opacity-20 transition-colors font-bold text-base"
                                        >↓</button>
                                    </div>
                                ) : (
                                    <span
                                        className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none select-none"
                                        style={{ padding: '12px 10px', margin: '-12px -4px', fontSize: '16px', lineHeight: 1 }}
                                        draggable
                                        onDragStart={(e) => {
                                            const row = e.target.closest('[data-player-id]')
                                            if (row) e.dataTransfer.setDragImage(row, 0, row.offsetHeight / 2)
                                            actions.handleDragStart(e, sel, team.id)
                                        }}
                                        onDragEnd={actions.handleDragEnd}
                                        onTouchStart={(e) => actions.handleTouchStart(e, sel, team.id)}
                                        onTouchMove={actions.handleTouchMove}
                                        onTouchEnd={actions.handleTouchEnd}
                                    >⠿</span>
                                )}

                                <span className="text-slate-400 text-xs w-4 text-center flex-shrink-0">{idx + 1}</span>
                                <button onClick={() => actions.toggleConfirmed(team.id, sel.player_id)} title={avail.title}
                                    aria-label={`Toggle availability for ${sel.name}. Current state: ${avail.title}`}
                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avail.bg} ${avail.border} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1`}>
                                    <span aria-hidden="true">{avail.icon}</span>
                                </button>
                                <div className="flex-1 flex items-center gap-1.5 min-w-0">
                                    <span className="cursor-pointer hover:text-blue-600 leading-tight"
                                        onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}>
                                        {sel.name}
                                    </span>
                                    {(() => {
                                        const dot = getAvailDot(sel.player_id)
                                        const cls = dot === 'red' ? 'bg-red-400' : dot === 'purple' ? 'bg-purple-400' : 'bg-green-400'
                                        const tip = dot === 'red' ? 'Unavailable this day' : dot === 'purple' ? 'Available this day (unavailable other day)' : 'Available'
                                        return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cls}`} title={tip} />
                                    })()}
                                    {isDupe && <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded font-bold flex-shrink-0">DU</span>}
                                    {/* Note icon — elevated badge style when note exists */}
                                    <div className="relative flex-shrink-0">
                                        <button
                                            ref={el => { if (el) el._selId = sel.id }}
                                            onClick={e => setNoteOpenId(noteOpenId === sel.id ? null : sel.id)}
                                            data-note-btn={sel.id}
                                            title={sel.note || 'Add note'}
                                            aria-label={sel.note ? `Edit note for ${sel.name}` : `Add note for ${sel.name}`}
                                            className={`flex items-center justify-center rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 p-0.5 ${
                                                sel.note
                                                    ? 'w-5 h-5 bg-yellow-400 text-white shadow-sm hover:bg-yellow-500'
                                                    : 'w-5 h-5 text-slate-300 hover:text-slate-500'
                                            }`}
                                        >
                                            {sel.note ? (
                                                <MessageSquareText size={12} strokeWidth={2.2} aria-hidden="true" />
                                            ) : (
                                                <MessageSquare size={13} strokeWidth={2} aria-hidden="true" />
                                            )}
                                        </button>
                                        {noteOpenId === sel.id && (
                                            <NotePopover
                                                sel={sel}
                                                anchorRef={{ current: document.querySelector(`[data-note-btn="${sel.id}"]`) }}
                                                onSave={(note) => actions.updateNote(sel.id, sel.player_id, note)}
                                                onClose={() => setNoteOpenId(null)}
                                            />
                                        )}
                                    </div>
                                </div>
                                {!sortMode && (
                                    <select value={sel.position || ''} onChange={(e) => actions.updatePosition(team.id, sel.player_id, e.target.value)}
                                        className={`text-xs rounded px-1 py-0.5 w-14 flex-shrink-0 border font-medium ${posStyle ? posStyle.selectCls : 'border-slate-200 text-slate-400 bg-white'}`}>
                                        <option value="">Pos</option>
                                        {POSITIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                    </select>
                                )}
                                <button onClick={() => actions.removePlayer(team.id, sel.player_id)}
                                    aria-label={`Remove ${sel.name} from squad`}
                                    className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 p-0.5 rounded">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
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
            <div
                data-bucket-team={team.id}
                className={`border-t-2 border-dashed transition-colors duration-150
                    ${unavailSels.length === 0 && !(draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket)
                        ? 'hidden'
                        : draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket
                            ? 'border-red-300 bg-red-50'
                            : 'border-slate-200 bg-slate-50'
                    }`}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => actions.handleDropToBucket(e, team.id)}
            >
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Unavailable</span>
                    {unavailSels.length > 0 && <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">{unavailSels.length}</span>}
                </div>
                {unavailSels.map(sel => (
                    <div key={`unavail-${sel.team_id}-${sel.player_id}`}
                        data-player-id={sel.player_id} data-team-id={team.id}
                        draggable onDragStart={(e) => actions.handleDragStart(e, sel, team.id, true)} onDragEnd={actions.handleDragEnd}
                        className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 text-sm hover:bg-red-50 group">
                        <span
                            className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none select-none"
                            style={{ padding: '12px 10px', margin: '-12px -4px', fontSize: '16px', lineHeight: 1 }}
                            draggable
                            onDragStart={(e) => {
                                const row = e.target.closest('[data-player-id]')
                                if (row) e.dataTransfer.setDragImage(row, 0, row.offsetHeight / 2)
                                actions.handleDragStart(e, sel, team.id, true)
                            }}
                            onDragEnd={actions.handleDragEnd}
                            onTouchStart={(e) => actions.handleTouchStart(e, sel, team.id, true)}
                            onTouchMove={actions.handleTouchMove}
                            onTouchEnd={actions.handleTouchEnd}
                        >⠿</span>
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-red-400 text-xs cursor-pointer hover:text-blue-500"
                                onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}>
                                {sel.name}
                            </span>
                        </div>
                        <button onClick={() => actions.markSelectionUnavailable(team.id, sel.player_id, false)}
                            aria-label={`Move ${sel.name} back to squad`}
                            className="text-slate-400 hover:text-blue-500 text-xs sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 p-0.5 rounded flex-shrink-0">↑ squad</button>
                        <button onClick={() => actions.removePlayer(team.id, sel.player_id)}
                            aria-label={`Remove ${sel.name} from squad completely`}
                            className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 p-0.5 rounded">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>

            {/* ── Position summary + Add player ── */}
            {(() => {
                const hasAny = Object.keys(posCounts).length > 0
                if (!hasAny) return null
                return (
                    <div className="flex flex-wrap gap-1 px-3 py-1.5 border-t border-slate-100 bg-slate-50">
                        {POSITIONS.filter(p => posCounts[p.value]).map(p => (
                            <span key={p.value} className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${POSITION_STYLES[p.value].badge}`}>
                                {p.label} {posCounts[p.value]}
                            </span>
                        ))}
                    </div>
                )
            })()}
            <div className="p-2">
                <button onClick={() => setPickerOpen({ teamId: team.id })}
                    className="w-full py-1.5 text-sm text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-slate-200 hover:border-blue-300 rounded transition-colors">
                    + Add player
                </button>
            </div>
        </div>
    )
}
