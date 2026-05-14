// useRoundManager.js
import React, { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import * as DB from '../db'
import { carryForwardSelections } from '../db'

export function useRoundManager() {
    const [teams, setTeams] = useState([])
    const [allPlayers, setAllPlayers] = useState([])
    const [rounds, setRounds] = useState([])
    const [currentRound, setCurrentRound] = useState(null)
    const [roundData, setRoundData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [roundUnavailability, setRoundUnavailability] = useState({})

    // Drag State
    const [draggedPlayer, setDraggedPlayer] = useState(null)
    const [dragOverInfo, setDragOverInfo] = useState(null)
    const touchDragRef = useRef(null)
    const touchScrollLocked = useRef(false)
    const touchScrollRAF = useRef(null)
    const unsubscribeSelectionsRef = useRef(null)   // live listener cleanup
    const unsubscribeUnavailRef    = useRef(null)   // live unavailability listener cleanup
    const allPlayersRef            = useRef([])     // always-current player map for snapshot callbacks

    // Keep allPlayersRef current so snapshot callbacks always see the latest players
    useEffect(() => { allPlayersRef.current = allPlayers }, [allPlayers])

    useEffect(() => {
        Promise.all([
            DB.getTeams(),
            DB.getPlayers(true),
            DB.getRounds()
        ]).then(([teamsData, playersData, roundsData]) => {
            setTeams(teamsData.filter(t => t.id !== 'NEW'))
            setAllPlayers(playersData)
            setRounds(roundsData)
            const today = new Date().toISOString().split('T')[0]
            const season = roundsData.filter(r => r.round_type === 'season')
            const upcoming = season.find(r => r.round_date && r.round_date >= today)
            setCurrentRound(upcoming || season[season.length - 1] || roundsData[roundsData.length - 1])
            setLoading(false)
        })
    }, [])

    useEffect(() => {
        // Tear down any previous listener
        if (unsubscribeSelectionsRef.current) {
            unsubscribeSelectionsRef.current()
            unsubscribeSelectionsRef.current = null
        }
        if (unsubscribeUnavailRef.current) {
            unsubscribeUnavailRef.current()
            unsubscribeUnavailRef.current = null
        }

        if (!currentRound) {
            setRoundData(null)
            setRoundUnavailability({})
            return
        }

        // One-time fetch for match details (venue, time, opponent — not real-time)
        DB.getRoundMatches(currentRound.id).then(matches => {
            setRoundData(prev => prev ? { ...prev, matches } : { matches, selections: [], bench: [] })
        })

        // Live listener on playerUnavailability for this round
        const unavailQuery = query(
            collection(db, 'playerUnavailability'),
            where('roundId', '==', String(currentRound.id))
        )
        unsubscribeUnavailRef.current = onSnapshot(unavailQuery, (snap) => {
            const map = {}
            snap.docs.forEach(d => {
                const data = d.data()
                map[Number(data.playerId)] = data.days || 'both'
            })
            setRoundUnavailability(map)
        })

        // Live listener on selections subcollection
        const selectionsRef = collection(db, 'rounds', String(currentRound.id), 'selections')

        unsubscribeSelectionsRef.current = onSnapshot(selectionsRef, (snap) => {
            // Build a fresh playerMap from the ref so newly-created players are included
            const currentPlayerMap = {}
            allPlayersRef.current.forEach(p => { currentPlayerMap[String(p.id)] = p })
            const selections = snap.docs.map(d => {
                const sel = d.data()
                const player = currentPlayerMap[sel.playerId] || {}
                return {
                    id: d.id,
                    round_id: currentRound.id,
                    team_id: sel.teamId,
                    player_id: Number(sel.playerId) || sel.playerId,
                    slot_number: sel.slotNumber,
                    position: sel.position || null,
                    confirmed: sel.confirmed ? (sel.confirmed === true ? 2 : sel.confirmed) : 0,
                    is_unavailable: sel.isUnavailable ? 1 : 0,
                    note: sel.note || null,
                    name: player.name || 'Unknown',
                    status_id: null,
                    primary_team_id_2025: player.primaryTeam2025 || null,
                    default_position: player.defaultPosition || null,
                }
            }).sort((a, b) => {
                if (a.team_id !== b.team_id) return a.team_id.localeCompare(b.team_id)
                return (a.slot_number || 0) - (b.slot_number || 0)
            })

            setRoundData(prev => prev ? { ...prev, selections } : { matches: [], selections, bench: [] })
        })

        // Cleanup on unmount or round change
        return () => {
            if (unsubscribeSelectionsRef.current) {
                unsubscribeSelectionsRef.current()
                unsubscribeSelectionsRef.current = null
            }
            if (unsubscribeUnavailRef.current) {
                unsubscribeUnavailRef.current()
                unsubscribeUnavailRef.current = null
            }
        }
    }, [currentRound]) // eslint-disable-line react-hooks/exhaustive-deps

    const seasonRounds = rounds.filter(r => r.round_type === 'season')
    const practiceRounds = rounds.filter(r => r.round_type === 'practice')

    // ── Database Actions ──
    const createRound = async (body) => {
        try {
            const newRound = await DB.createRound(body, teams)
            setRounds([...rounds, newRound])
            setCurrentRound(newRound)
        } catch (err) {
            alert(`Failed to create round: ${err.message}`)
        }
    }

    const deleteRound = async () => {
        if (!currentRound) return
        await DB.deleteRound(currentRound.id)
        const remaining = rounds.filter(r => r.id !== currentRound.id)
        setRounds(remaining)
        setCurrentRound(remaining.length > 0 ? remaining[remaining.length - 1] : null)
    }

    const updateRound = async (body) => {
        if (!currentRound) return
        const updated = await DB.updateRound(currentRound.id, body)
        setRounds(rounds.map(r => r.id === updated.id ? updated : r))
        setCurrentRound(updated)
    }

    const carryForward = async (carryForwardTeams) => {
        if (!currentRound || carryForwardTeams.length === 0) return null
        const idx = seasonRounds.findIndex(r => r.id === currentRound.id)
        const nextRound = seasonRounds[idx + 1]
        if (!nextRound) return null

        const result = await carryForwardSelections(currentRound.id, nextRound.id, carryForwardTeams)
        if (currentRound.id === nextRound.id) {
            const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
            setRoundData(fresh)
        }
        return { ...result, nextLabel: `Round ${nextRound.round_number}` }
    }

    const updateMatchDetails = async (teamId, data) => {
        if (!roundData) return
        await DB.updateMatchDetails(currentRound.id, teamId, data)
        setRoundData({
            ...roundData,
            matches: roundData.matches.map(m => m.team_id === teamId ? { ...m, ...data } : m)
        })
    }

    const getTeamSelectionsOrdered = (teamId) => {
        if (!roundData?.selections) return []
        return roundData.selections
            .filter(s => s.team_id === teamId)
            .sort((a, b) => a.slot_number - b.slot_number)
    }

    const addPlayers = async (teamId, selectedIdsArray) => {
        if (!currentRound || selectedIdsArray.length === 0) return
        const existingSels = getTeamSelectionsOrdered(teamId)
        let nextSlot = existingSels.length > 0 ? Math.max(...existingSels.map(s => s.slot_number || 0)) + 1 : 1

        const toAdd = selectedIdsArray.map(playerId => {
            const player = allPlayers.find(p => p.id === playerId) || { id: playerId, name: '?' }
            const entry = { team_id: teamId, player_id: playerId, slot_number: nextSlot++ }
            return { entry, player }
        })

        setRoundData(prev => {
            if (!prev) return prev
            const newSels = toAdd.map(({ entry, player }) => ({
                id: `optimistic-${entry.player_id}`, round_id: currentRound.id, team_id: teamId,
                player_id: entry.player_id, slot_number: entry.slot_number, position: null,
                confirmed: 0, is_unavailable: 0, name: player.name,
                default_position: player.default_position || null, status_id: null,
            }))
            return { ...prev, selections: [...prev.selections, ...newSels] }
        })

        try {
            await DB.addSelectionBatch(currentRound.id, toAdd.map(t => t.entry))
            const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
            setRoundData(fresh)
            // Optimistic: update games_played_2026 count so picker filters reflect immediately
            setAllPlayers(prev => prev.map(p => {
                const addEntry = toAdd.find(t => t.entry.player_id === p.id)
                if (!addEntry) return p
                const tId = addEntry.entry.team_id
                const already = Array.isArray(p.teams_played_2026) ? p.teams_played_2026 : []
                const gp = { ...(p.games_played_2026 || {}) }
                gp[tId] = (gp[tId] || 0) + 1
                return {
                    ...p,
                    teams_played_2026: already.includes(tId) ? already : [...already, tId],
                    games_played_2026: gp,
                }
            }))
        } catch (err) {
            console.error('Failed to add players', err)
            const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
            setRoundData(fresh)
        }
    }

    const createAndAddPlayer = async (teamId, playerData) => {
        if (!currentRound || !teamId || !playerData?.name?.trim()) return null

        const created = await DB.createPlayer({
            name: playerData.name.trim(),
            assigned_team_id_2026: playerData.assigned_team_id_2026 || teamId,
            notes: playerData.notes || null,
        })

        const newPlayer = {
            id: created.id,
            name: created.name,
            status_id: 'new',
            assigned_team_id_2026: playerData.assigned_team_id_2026 || teamId,
            notes: playerData.notes || null,
            default_position: null,
            is_active: 1,
            teams_played_2026: [],
            games_played_2026: {},
            total_games_2026: 0,
            stats_2026: null,
        }
        setAllPlayers(prev => [...prev, newPlayer])

        const existingSels = getTeamSelectionsOrdered(teamId)
        const nextSlot = existingSels.length > 0 ? Math.max(...existingSels.map(s => s.slot_number || 0)) + 1 : 1

        await DB.addSelection(currentRound.id, {
            team_id: teamId,
            player_id: created.id,
            slot_number: nextSlot,
        })

        setRoundData(prev => {
            if (!prev) return prev
            return {
                ...prev,
                selections: [
                    ...prev.selections,
                    {
                        id: `new-${created.id}-${Date.now()}`,
                        round_id: currentRound.id,
                        team_id: teamId,
                        player_id: created.id,
                        slot_number: nextSlot,
                        position: null,
                        confirmed: 0,
                        is_unavailable: 0,
                        note: null,
                        name: created.name,
                        status_id: null,
                        default_position: null,
                    },
                ],
            }
        })

        return created
    }

    const removePlayer = (teamId, playerId) => {
        if (!currentRound) return
        // Optimistic: remove from selections and decrement game count
        setRoundData(prev => {
            if (!prev) return prev
            const sels = prev.selections.filter(s => !(s.team_id === teamId && s.player_id === playerId))
            const teamSels = sels.filter(s => s.team_id === teamId).sort((a, b) => a.slot_number - b.slot_number)
            teamSels.forEach((s, i) => { s.slot_number = i + 1 })
            return { ...prev, selections: sels }
        })
        setAllPlayers(prev => prev.map(p => {
            if (p.id !== playerId) return p
            const gp = { ...(p.games_played_2026 || {}) }
            gp[teamId] = Math.max(0, (gp[teamId] || 0) - 1)
            return { ...p, games_played_2026: gp }
        }))
        DB.removeSelection(currentRound.id, teamId, playerId).catch(err => {
            console.error('Remove failed:', err)
            DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
        })
    }

    const markSelectionUnavailable = async (teamId, playerId, isUnavailable) => {
        if (!currentRound) return
        setRoundData(prev => ({
            ...prev,
            selections: prev.selections.map(s =>
                s.team_id === teamId && s.player_id === playerId
                    ? { ...s, is_unavailable: isUnavailable ? 1 : 0, ...(isUnavailable ? { confirmed: 0 } : {}) }
                    : s
            )
        }))
        await DB.updateSelectionUnavailable(currentRound.id, teamId, playerId, isUnavailable).catch(() => {
            DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
        })
    }

    const toggleConfirmed = async (teamId, playerId) => {
        if (!currentRound) return
        const confirmed = await DB.toggleSelectionConfirmed(currentRound.id, teamId, playerId)
        setRoundData(prev => ({
            ...prev,
            selections: prev.selections.map(s => s.team_id === teamId && s.player_id === playerId ? { ...s, confirmed } : s)
        }))
    }

    const updatePosition = async (teamId, playerId, position) => {
        if (!currentRound) return
        // Optimistic first — don't wait for Firestore round-trip
        setRoundData(prev => ({
            ...prev,
            selections: prev.selections.map(s => s.team_id === teamId && s.player_id === playerId ? { ...s, position: position || null } : s)
        }))
        await DB.updateSelectionPosition(currentRound.id, teamId, playerId, position)
    }

    const updateNote = async (selectionId, playerId, note) => {
        if (!currentRound) return
        // Optimistic update
        setRoundData(prev => ({
            ...prev,
            selections: prev.selections.map(s => s.id === selectionId ? { ...s, note } : s)
        }))
        await DB.updateSelectionNote(currentRound.id, selectionId, note)
    }

    // ── Drag & Drop Handlers ──
    const handleDragStart = (e, selection, fromTeamId, fromBucket = false) => {
        setDraggedPlayer({ playerId: selection.player_id, fromTeamId, fromBucket })
        e.dataTransfer.effectAllowed = 'move'
    }

    const handleDragOverRow = (e, teamId, playerId) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        const relY = e.clientY - rect.top
        const threshold = rect.height * 0.3
        if (relY > threshold && relY < rect.height - threshold) return
        const position = relY <= threshold ? 'above' : 'below'
        setDragOverInfo(prev => {
            if (prev?.teamId === teamId && prev?.playerId === playerId && prev?.position === position) return prev
            return { teamId, playerId, position }
        })
    }

    const handleDragOverEmpty = (e, teamId) => {
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        setDragOverInfo({ teamId, empty: true })
    }

    const handleDragOverColumn = (e, teamId) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (!dragOverInfo || dragOverInfo.teamId !== teamId) setDragOverInfo({ teamId, empty: true })
    }

    const handleDropToBucket = (e, teamId) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverInfo(null)
        if (!draggedPlayer || draggedPlayer.fromBucket) return
        if (draggedPlayer.fromTeamId !== teamId) return
        const { playerId } = draggedPlayer
        setDraggedPlayer(null)
        markSelectionUnavailable(teamId, playerId, true)
    }

    const handleDrop = (e, targetTeamId, targetPlayerId) => {
        e.preventDefault()
        e.stopPropagation()
        let insertAfter = true
        if (targetPlayerId !== null) {
            const rect = e.currentTarget.getBoundingClientRect()
            insertAfter = e.clientY >= rect.top + rect.height / 2
        }
        setDragOverInfo(null)
        if (!draggedPlayer || !currentRound) return
        const { playerId, fromTeamId } = draggedPlayer
        if (fromTeamId === targetTeamId && Number(playerId) === Number(targetPlayerId)) return

        if (draggedPlayer.fromBucket) {
            setDraggedPlayer(null)
            markSelectionUnavailable(fromTeamId, playerId, false)
            return
        }

        setDraggedPlayer(null)

        setRoundData(prev => {
            if (!prev) return prev
            const sels = [...prev.selections]
            const movingIdx = sels.findIndex(s => s.player_id === playerId && s.team_id === fromTeamId)
            if (movingIdx === -1) return prev
            const [moving] = sels.splice(movingIdx, 1)
            moving.team_id = targetTeamId

            const targetSels = sels.filter(s => s.team_id === targetTeamId).sort((a, b) => a.slot_number - b.slot_number)
            const otherSels  = sels.filter(s => !(s.team_id === targetTeamId))

            let insertIdx = targetSels.length
            if (targetPlayerId !== null) {
                const targetIdx = targetSels.findIndex(s => s.player_id === targetPlayerId)
                if (targetIdx !== -1) insertIdx = insertAfter ? targetIdx + 1 : targetIdx
            }

            targetSels.splice(insertIdx, 0, moving)
            targetSels.forEach((s, i) => { s.slot_number = i + 1 })
            if (fromTeamId !== targetTeamId) {
                const fromSels = otherSels.filter(s => s.team_id === fromTeamId).sort((a, b) => a.slot_number - b.slot_number)
                fromSels.forEach((s, i) => { s.slot_number = i + 1 })
            }

            return { ...prev, selections: [...otherSels, ...targetSels] }
        })

        DB.moveSelection(currentRound.id, {
            playerId, from_team_id: fromTeamId, target_team_id: targetTeamId,
            target_player_id: targetPlayerId || null, insert_after: insertAfter,
        }).catch(err => {
            console.error('Drop sync failed:', err)
            DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
        })
    }

    const moveSelectionByIndex = (teamId, fromIdx, toIdx) => {
        // Get ordered selections for this team
        const teamSels = roundData?.selections
            .filter(s => s.team_id === teamId && !s.is_unavailable)
            .sort((a, b) => a.slot_number - b.slot_number)
        if (!teamSels || fromIdx < 0 || toIdx < 0 || toIdx >= teamSels.length) return

        const moving       = teamSels[fromIdx]
        const targetPlayer = teamSels[toIdx]
        const insertAfter  = toIdx > fromIdx

        // Optimistic UI update
        setRoundData(prev => {
            if (!prev) return prev
            const sels    = [...prev.selections]
            const movingDoc  = sels.find(s => s.player_id === moving.player_id && s.team_id === teamId)
            const targetDoc  = sels.find(s => s.player_id === targetPlayer.player_id && s.team_id === teamId)
            if (!movingDoc || !targetDoc) return prev
            const tmpSlot          = movingDoc.slot_number
            movingDoc.slot_number  = targetDoc.slot_number
            targetDoc.slot_number  = tmpSlot
            return { ...prev, selections: sels }
        })

        // Persist
        DB.moveSelection(currentRound.id, {
            playerId:          moving.player_id,
            from_team_id:      teamId,
            target_team_id:    teamId,
            target_player_id:  targetPlayer.player_id,
            insert_after:      insertAfter,
        }).catch(() => DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData))
    }

    const handleDragEnd = () => {
        setDraggedPlayer(null)
        setDragOverInfo(null)
    }

    const createGhost = (name) => {
        const el = document.createElement('div')
        el.textContent = name
        el.style.cssText = `position:fixed; z-index:9999; pointer-events:none; background:#1e3a8a; color:#fff; font-size:13px; font-weight:600; padding:6px 14px; border-radius:20px; white-space:nowrap; box-shadow:0 4px 16px rgba(0,0,0,0.35); opacity:0.92; transform:translate(-50%,-50%);`
        document.body.appendChild(el)
        return el
    }

    const touchHoldTimer = useRef(null)

    const handleTouchStart = (e, selection, fromTeamId, fromBucket = false) => {
        if (e.target.closest('button, select')) return

        // Clear any existing timer
        if (touchHoldTimer.current) clearTimeout(touchHoldTimer.current)

        const touch = e.touches[0]
        const startX = touch.clientX
        const startY = touch.clientY

        // Only activate drag after 220ms hold — prevents iOS text selection conflict
        touchHoldTimer.current = setTimeout(() => {
            touchHoldTimer.current = null
            const ghostEl = createGhost(selection.name)
            ghostEl.style.left = startX + 'px'
            ghostEl.style.top  = startY + 'px'
            touchDragRef.current = { playerId: selection.player_id, fromTeamId, fromBucket, ghostEl }
            touchScrollLocked.current = false
            setDraggedPlayer({ playerId: selection.player_id, fromTeamId, fromBucket })
            // Haptic feedback on iOS if available
            if (navigator.vibrate) navigator.vibrate(30)
        }, 220)
    }

    const handleTouchMove = (e) => {
        // If the hold timer hasn't fired yet, cancel it — user is scrolling not dragging
        if (touchHoldTimer.current) {
            clearTimeout(touchHoldTimer.current)
            touchHoldTimer.current = null
            return
        }
        if (!touchDragRef.current) return
        const touch = e.touches[0]
        if (!touchScrollLocked.current) touchScrollLocked.current = true
        e.preventDefault()
        const { ghostEl } = touchDragRef.current
        if (ghostEl) {
            ghostEl.style.left = touch.clientX + 'px'
            ghostEl.style.top  = touch.clientY + 'px'
        }
        ghostEl.style.display = 'none'
        const elUnder = document.elementFromPoint(touch.clientX, touch.clientY)
        ghostEl.style.display = ''
        const playerRow = elUnder?.closest('[data-player-id]')
        const column    = elUnder?.closest('[data-team-id]')
        const bucket    = elUnder?.closest('[data-bucket-team]')

        if (bucket) {
            setDragOverInfo({ teamId: bucket.dataset.bucketTeam, bucket: true })
        } else if (playerRow) {
            const rect = playerRow.getBoundingClientRect()
            const position = touch.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
            setDragOverInfo({ teamId: playerRow.dataset.teamId, playerId: Number(playerRow.dataset.playerId), position })
        } else if (column) {
            setDragOverInfo({ teamId: column.dataset.teamId, empty: true })
        } else {
            setDragOverInfo(null)
        }

        // Auto-scroll when dragging near viewport edges
        const EDGE_ZONE = 60
        const MAX_SPEED = 12
        const y = touch.clientY
        const vh = window.innerHeight
        if (touchScrollRAF.current) { cancelAnimationFrame(touchScrollRAF.current); touchScrollRAF.current = null }
        if (y > vh - EDGE_ZONE) {
            const speed = Math.min(MAX_SPEED, ((y - (vh - EDGE_ZONE)) / EDGE_ZONE) * MAX_SPEED)
            const scroll = () => { window.scrollBy(0, speed); touchScrollRAF.current = requestAnimationFrame(scroll) }
            touchScrollRAF.current = requestAnimationFrame(scroll)
        } else if (y < EDGE_ZONE) {
            const speed = Math.min(MAX_SPEED, ((EDGE_ZONE - y) / EDGE_ZONE) * MAX_SPEED)
            const scroll = () => { window.scrollBy(0, -speed); touchScrollRAF.current = requestAnimationFrame(scroll) }
            touchScrollRAF.current = requestAnimationFrame(scroll)
        }
    }

    const handleTouchEnd = (e) => {
        // Cancel pending hold timer if finger lifted before drag activated
        if (touchHoldTimer.current) {
            clearTimeout(touchHoldTimer.current)
            touchHoldTimer.current = null
        }
        // Cancel auto-scroll
        if (touchScrollRAF.current) {
            cancelAnimationFrame(touchScrollRAF.current)
            touchScrollRAF.current = null
        }
        if (!touchDragRef.current) return
        const { ghostEl, playerId, fromTeamId, fromBucket } = touchDragRef.current
        if (ghostEl) ghostEl.remove()
        touchDragRef.current = null
        touchScrollLocked.current = false

        const info = dragOverInfo
        setDraggedPlayer(null)
        setDragOverInfo(null)

        if (!info) return
        if (info.bucket) {
            if (!fromBucket && info.teamId === fromTeamId) markSelectionUnavailable(fromTeamId, playerId, true)
            return
        }
        if (fromBucket) {
            markSelectionUnavailable(fromTeamId, playerId, false)
            return
        }

        const targetTeamId   = info.teamId
        const targetPlayerId = info.playerId || null
        const insertAfter    = info.position === 'below' || info.empty

        if (fromTeamId === targetTeamId && Number(playerId) === Number(targetPlayerId)) return

        setRoundData(prev => {
            if (!prev) return prev
            const sels = [...prev.selections]
            const movingIdx = sels.findIndex(s => s.player_id === playerId && s.team_id === fromTeamId)
            if (movingIdx === -1) return prev
            const [moving] = sels.splice(movingIdx, 1)
            moving.team_id = targetTeamId
            const targetSels = sels.filter(s => s.team_id === targetTeamId).sort((a, b) => a.slot_number - b.slot_number)
            const otherSels  = sels.filter(s => s.team_id !== targetTeamId)
            let insertIdx = targetSels.length
            if (targetPlayerId !== null) {
                const ti = targetSels.findIndex(s => s.player_id === targetPlayerId)
                if (ti !== -1) insertIdx = insertAfter ? ti + 1 : ti
            }
            targetSels.splice(insertIdx, 0, moving)
            targetSels.forEach((s, i) => { s.slot_number = i + 1 })
            if (fromTeamId !== targetTeamId) {
                const fromSels = otherSels.filter(s => s.team_id === fromTeamId).sort((a, b) => a.slot_number - b.slot_number)
                fromSels.forEach((s, i) => { s.slot_number = i + 1 })
            }
            return { ...prev, selections: [...otherSels, ...targetSels] }
        })

        DB.moveSelection(currentRound.id, {
            playerId, from_team_id: fromTeamId, target_team_id: targetTeamId,
            target_player_id: targetPlayerId, insert_after: insertAfter,
        }).catch(() => {
            DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
        })
    }

    // ── Getters (Memoized) ──
    const derivedMaps = React.useMemo(() => {
        const teamActiveSels = {}
        const teamUnavailSels = {}
        const matchMap = {}
        const teamCountsMap = {}
        const posCountsMap = {}
        const duplicateIdsSet = new Set()

        if (roundData) {
            (roundData.matches || []).forEach(m => {
                matchMap[m.team_id] = m
            })

            const playerCounts = {}
            ;(roundData.selections || []).forEach(s => {
                const tid = s.team_id
                if (!teamActiveSels[tid]) teamActiveSels[tid] = []
                if (!teamUnavailSels[tid]) teamUnavailSels[tid] = []
                if (!teamCountsMap[tid]) teamCountsMap[tid] = { total: 0, active: 0, confirmed: 0, waiting: 0, uncontacted: 0, unavailableBucket: 0 }
                if (!posCountsMap[tid]) posCountsMap[tid] = {}

                playerCounts[s.player_id] = (playerCounts[s.player_id] || 0) + 1

                teamCountsMap[tid].total++

                if (s.is_unavailable) {
                    teamUnavailSels[tid].push(s)
                    teamCountsMap[tid].unavailableBucket++
                } else {
                    teamActiveSels[tid].push(s)
                    teamCountsMap[tid].active++
                    const conf = s.confirmed ?? 0
                    if (conf === 2) teamCountsMap[tid].confirmed++
                    else if (conf === 1) teamCountsMap[tid].waiting++
                    else if (conf === 0) teamCountsMap[tid].uncontacted++
                }

                if (s.position) {
                    posCountsMap[tid][s.position] = (posCountsMap[tid][s.position] || 0) + 1
                }
            })

            Object.keys(teamActiveSels).forEach(tid => {
                teamActiveSels[tid].sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0))
            })
            Object.keys(teamUnavailSels).forEach(tid => {
                teamUnavailSels[tid].sort((a, b) => (a.slot_number || 0) - (b.slot_number || 0))
            })

            Object.entries(playerCounts).forEach(([id, count]) => {
                if (count > 1) duplicateIdsSet.add(Number(id))
            })
        }

        return { teamActiveSels, teamUnavailSels, matchMap, teamCountsMap, posCountsMap, duplicateIdsSet }
    }, [roundData])

    const getTeamCounts = (teamId) => derivedMaps.teamCountsMap[teamId] || { total: 0, active: 0, confirmed: 0, waiting: 0, uncontacted: 0, unavailableBucket: 0 }
    const getPositionCounts = (teamId) => derivedMaps.posCountsMap[teamId] || {}
    const getDuplicatePlayerIds = () => derivedMaps.duplicateIdsSet
    const getTeamActiveSelections = (teamId) => derivedMaps.teamActiveSels[teamId] || []
    const getTeamUnavailableSelections = (teamId) => derivedMaps.teamUnavailSels[teamId] || []
    const getMatchDetails = (teamId) => derivedMaps.matchMap[teamId] || {}

    return {
        state: {
            teams, allPlayers, rounds, currentRound, roundData, loading, roundUnavailability,
            draggedPlayer, dragOverInfo, seasonRounds, practiceRounds
        },
        actions: {
            setCurrentRound, createRound, deleteRound, updateRound, carryForward, updateMatchDetails,
            addPlayers, removePlayer, markSelectionUnavailable, toggleConfirmed, updatePosition,
            createAndAddPlayer,
            updateNote,
            handleDragStart, handleDragOverRow, handleDragOverEmpty, handleDragOverColumn,
            handleDropToBucket, handleDrop, handleDragEnd, handleTouchStart, handleTouchMove, handleTouchEnd,
            moveSelectionByIndex
        },
        getters: {
            getTeamCounts, getPositionCounts, getDuplicatePlayerIds, getTeamActiveSelections,
            getTeamUnavailableSelections, getMatchDetails
        }
    }
}