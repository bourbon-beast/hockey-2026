import { useState, useEffect, useRef } from 'react'
import * as DB from '../db'
import { carryForwardSelections } from '../db'

export default function RoundPlanner({ statuses, onSelectPlayer }) {
  const [teams, setTeams] = useState([])
  const [allPlayers, setAllPlayers] = useState([])
  const [rounds, setRounds] = useState([])
  const [currentRound, setCurrentRound] = useState(null)
  const [roundData, setRoundData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [pickerTeamFilter, setPickerTeamFilter] = useState(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [draggedPlayer, setDraggedPlayer] = useState(null)
  const [dragOverInfo, setDragOverInfo] = useState(null)
  const [showNewRoundModal, setShowNewRoundModal] = useState(false)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyAsType, setCopyAsType] = useState('season')
  const [newRoundForm, setNewRoundForm] = useState({ type: 'season', name: '', sat_date: '', sun_date: '' })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showTeamSheetModal, setShowTeamSheetModal] = useState(false)
  const [teamSheetCanvases, setTeamSheetCanvases] = useState([])
  const [matchEditTeam, setMatchEditTeam] = useState(null)  // teamId currently being edited
  const [matchEditForm, setMatchEditForm] = useState({})
  const [mobileTeamFilter, setMobileTeamFilter] = useState(null) // null = show all
  const [roundUnavailability, setRoundUnavailability] = useState({}) // { playerId: 'sat'|'sun'|'both' }
  const [showUnavailableInPicker, setShowUnavailableInPicker] = useState(false)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const [showAdvanceModal, setShowAdvanceModal] = useState(false)
  const [showCarryForwardModal, setShowCarryForwardModal] = useState(false)
  const [carryForwardTeams, setCarryForwardTeams] = useState([])   // team ids ticked in modal
  const [carryForwardLoading, setCarryForwardLoading] = useState(false)
  const [carryForwardResult, setCarryForwardResult] = useState(null)
  const [plannerMode, setPlannerMode] = useState('season') // 'season' | 'practice'
  const searchRef = useRef(null)
  // Touch drag — refs to avoid re-renders mid-gesture
  const touchDragRef = useRef(null)  // { playerId, fromTeamId, fromBucket, ghostEl }
  const touchScrollLocked = useRef(false)

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
    if (currentRound) {
      DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
      DB.getUnavailability({ round_id: currentRound.id })
        .then(data => {
          const map = {}
          data.forEach(u => { map[Number(u.player_id)] = u.days || 'both' })
          setRoundUnavailability(map)
        })
    } else {
      setRoundData(null)
      setRoundUnavailability({})
    }
  }, [currentRound])

  useEffect(() => {
    if (pickerOpen && searchRef.current) {
      searchRef.current.focus()
      setPickerTeamFilter(pickerOpen.teamId)
      setSelectedPlayerIds(new Set())
    }
  }, [pickerOpen])

  const seasonRounds = rounds.filter(r => r.round_type === 'season')
  const practiceRounds = rounds.filter(r => r.round_type === 'practice')

  // ── Round management ──────────────────────────────────────────────────

  const createRound = async (copyFromPrevious = false, typeOverride = null) => {
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
    try {
      const newRound = await DB.createRound(body, teams)
      setRounds([...rounds, newRound])
      setCurrentRound(newRound)
      setShowNewRoundModal(false)
      setShowCopyModal(false)
      setNewRoundForm({ type: 'season', name: '', sat_date: '', sun_date: '' })
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
    setShowDeleteConfirm(false)
  }

  const openRenameModal = () => {
    if (!currentRound) return
    setRenameValue(
      currentRound.round_type === 'season'
        ? `Round ${currentRound.round_number}`
        : currentRound.name || 'Practice Match'
    )
    setShowRenameModal(true)
  }

  const saveRename = async () => {
    if (!currentRound || !renameValue.trim()) return
    const body = currentRound.round_type === 'season'
      ? { round_number: parseInt(renameValue.replace(/\D/g, '')) || currentRound.round_number }
      : { name: renameValue.trim() }
    const updated = await DB.updateRound(currentRound.id, body)
    setRounds(rounds.map(r => r.id === updated.id ? updated : r))
    setCurrentRound(updated)
    setShowRenameModal(false)
  }

  const openCarryForwardModal = () => {
    // Pre-tick all teams by default
    setCarryForwardTeams(teams.map(t => t.id))
    setCarryForwardResult(null)
    setShowCarryForwardModal(true)
  }

  const carryForward = async () => {
    if (!currentRound || carryForwardTeams.length === 0) return
    const idx = seasonRounds.findIndex(r => r.id === currentRound.id)
    const nextRound = seasonRounds[idx + 1]
    if (!nextRound) return
    setCarryForwardLoading(true)
    try {
      const result = await carryForwardSelections(currentRound.id, nextRound.id, carryForwardTeams)
      setCarryForwardResult({ success: true, copied: result.copied, nextLabel: `Round ${nextRound.round_number}` })
      // Refresh if we're already viewing the next round
      if (currentRound.id === nextRound.id) {
        const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
        setRoundData(fresh)
      }
    } catch (err) {
      setCarryForwardResult({ success: false, error: err.message })
    } finally {
      setCarryForwardLoading(false)
    }
  }

  // ── Match details ─────────────────────────────────────────────────────

  const updateMatchDetails = async (teamId, field, value) => {
    if (!roundData) return
    await DB.updateMatchDetails(currentRound.id, teamId, { [field]: value })
    setRoundData({
      ...roundData,
      matches: roundData.matches.map(m => m.team_id === teamId ? { ...m, [field]: value } : m)
    })
  }

  // ── Player picker ─────────────────────────────────────────────────────

  const togglePickerPlayer = (playerId) => {
    setSelectedPlayerIds(prev => {
      const next = new Set(prev)
      next.has(playerId) ? next.delete(playerId) : next.add(playerId)
      return next
    })
  }

  const addSelectedPlayers = async () => {
    if (!pickerOpen || !currentRound || selectedPlayerIds.size === 0) return
    const { teamId } = pickerOpen

    // Build the list of new selections with slot numbers
    const existingSels = getTeamSelectionsOrdered(teamId)
    let nextSlot = existingSels.length > 0
      ? Math.max(...existingSels.map(s => s.slot_number || 0)) + 1
      : 1
    const toAdd = [...selectedPlayerIds].map(playerId => {
      const player = allPlayers.find(p => p.id === playerId) || { id: playerId, name: '?' }
      const entry = { team_id: teamId, player_id: playerId, slot_number: nextSlot }
      nextSlot++
      return { entry, player }
    })

    // ── Optimistic update — close picker and show players immediately ──
    setPickerOpen(null)
    setSearchTerm('')
    setSelectedPlayerIds(new Set())
    setRoundData(prev => {
      if (!prev) return prev
      const newSels = toAdd.map(({ entry, player }) => ({
        id: `optimistic-${entry.player_id}`,
        round_id: currentRound.id,
        team_id: teamId,
        player_id: entry.player_id,
        slot_number: entry.slot_number,
        position: null,
        confirmed: 0,
        is_unavailable: 0,
        name: player.name,
        default_position: player.default_position || null,
        status_id: null,
      }))
      return { ...prev, selections: [...prev.selections, ...newSels] }
    })

    // ── Background write — single batch commit ──
    try {
      await DB.addSelectionBatch(currentRound.id, toAdd.map(t => t.entry))
      // Refresh round data to get real Firestore IDs (replaces optimistic entries)
      const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
      setRoundData(fresh)
      // Also patch local allPlayers so the picker team filter reflects the new squad membership
      // immediately without a full page reload (teams_played_2026 was updated in Firestore by addSelectionBatch)
      setAllPlayers(prev => prev.map(p => {
        if (!toAdd.find(t => t.entry.player_id === p.id)) return p
        const already = Array.isArray(p.teams_played_2026) ? p.teams_played_2026 : []
        if (already.includes(teamId)) return p
        return { ...p, teams_played_2026: [...already, teamId] }
      }))
    } catch (err) {
      console.error('Failed to add players', err)
      // Rollback optimistic update
      const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
      setRoundData(fresh)
    }
  }

  const addBenchPlayer = async (teamId, playerId) => {
    if (!currentRound) return
    const selections = getTeamSelections(teamId)
    const occupiedSlots = Object.keys(selections).map(Number)
    let nextSlot = occupiedSlots.length > 0 ? Math.max(...occupiedSlots) + 1 : 1
    while (selections[nextSlot]) nextSlot++
    try {
      await DB.addSelection(currentRound.id, { team_id: teamId, player_id: playerId, slot_number: nextSlot })
      const updated = await DB.getRoundDetail(currentRound.id, allPlayers)
      setRoundData(updated)
    } catch (err) { alert('Failed to add player') }
  }

  const removePlayer = (teamId, playerId) => {
    if (!currentRound) return
    // Optimistic: remove immediately from UI
    setRoundData(prev => {
      if (!prev) return prev
      const sels = prev.selections
        .filter(s => !(s.team_id === teamId && s.player_id === playerId))
      // Re-number remaining slots for that team
      const teamSels = sels.filter(s => s.team_id === teamId).sort((a, b) => a.slot_number - b.slot_number)
      teamSels.forEach((s, i) => { s.slot_number = i + 1 })
      return { ...prev, selections: sels }
    })
    DB.removeSelection(currentRound.id, teamId, playerId)
      .catch(err => {
        console.error('Remove failed:', err)
        DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
      })
  }

  // Move a player into / out of the unavailable bucket for a specific team+round
  const markSelectionUnavailable = async (teamId, playerId, isUnavailable) => {
    if (!currentRound) return
    // Optimistic
    setRoundData(prev => ({
      ...prev,
      selections: prev.selections.map(s =>
        s.team_id === teamId && s.player_id === playerId
          ? { ...s, is_unavailable: isUnavailable ? 1 : 0 }
          : s
      )
    }))
    await DB.updateSelectionUnavailable(currentRound.id, teamId, playerId, isUnavailable)
      .catch(() => {
        DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
      })
  }

  // ── Availability ──────────────────────────────────────────────────────
  // 0 = unconfirmed, 1 = waiting, 2 = confirmed, 3 = unavailable

  const AVAILABILITY = {
    0: { label: 'Unconfirmed', bg: 'bg-gray-200',  border: 'border-gray-300',   icon: null, title: 'Click — mark as waiting' },
    1: { label: 'Waiting',     bg: 'bg-yellow-400', border: 'border-yellow-400', icon: '?',  title: 'Click — mark as confirmed' },
    2: { label: 'Confirmed',   bg: 'bg-green-500',  border: 'border-green-500',  icon: '✓',  title: 'Click — mark as unavailable' },
    3: { label: 'Unavailable', bg: 'bg-red-500',    border: 'border-red-500',    icon: '✕',  title: 'Click — reset' },
  }

  const toggleConfirmed = async (teamId, playerId) => {
    if (!currentRound) return
    const confirmed = await DB.toggleSelectionConfirmed(currentRound.id, teamId, playerId)
    setRoundData(prev => ({
      ...prev,
      selections: prev.selections.map(s =>
        s.team_id === teamId && s.player_id === playerId ? { ...s, confirmed } : s
      )
    }))
  }

  // ── Team header counts ────────────────────────────────────────────────

  const getTeamCounts = (teamId) => {
    if (!roundData) return { total: 0, confirmed: 0, waiting: 0, unavailable: 0, unavailableBucket: 0 }
    const sels = roundData.selections.filter(s => s.team_id === teamId)
    const activeSels = sels.filter(s => !s.is_unavailable)
    return {
      total:            activeSels.length,
      confirmed:        activeSels.filter(s => (s.confirmed ?? 0) === 2).length,
      waiting:          activeSels.filter(s => (s.confirmed ?? 0) === 1).length,
      unavailable:      activeSels.filter(s => (s.confirmed ?? 0) === 3).length,
      unavailableBucket: sels.filter(s => s.is_unavailable).length,
    }
  }

  const getPositionCounts = (teamId) => {
    if (!roundData) return {}
    const counts = {}
    roundData.selections
      .filter(s => s.team_id === teamId && s.position)
      .forEach(s => { counts[s.position] = (counts[s.position] || 0) + 1 })
    return counts
  }

  const getDuplicatePlayerIds = () => {
    if (!roundData) return new Set()
    const counts = {}
    roundData.selections.forEach(s => { counts[s.player_id] = (counts[s.player_id] || 0) + 1 })
    return new Set(Object.entries(counts).filter(([, c]) => c > 1).map(([id]) => Number(id)))
  }

  // ── Position ──────────────────────────────────────────────────────────

  const POSITIONS = [
    { value: 'GK',  label: 'GK'  },
    { value: 'DEF', label: 'DEF' },
    { value: 'DM',  label: 'DM'  },
    { value: 'AM',  label: 'AM'  },
    { value: 'STR', label: 'STR' },
  ]

  // Colour scheme per position — left border accent + faint row bg + badge colours
  const POSITION_STYLES = {
    GK:  { border: '#f59e0b', rowBg: '#fffbeb', badge: 'bg-amber-100 text-amber-700 border-amber-300',  selectCls: 'border-amber-400 text-amber-700 bg-amber-50'  },
    DEF: { border: '#3b82f6', rowBg: '#eff6ff', badge: 'bg-blue-100 text-blue-700 border-blue-300',     selectCls: 'border-blue-400 text-blue-700 bg-blue-50'     },
    DM:  { border: '#8b5cf6', rowBg: '#f5f3ff', badge: 'bg-violet-100 text-violet-700 border-violet-300', selectCls: 'border-violet-400 text-violet-700 bg-violet-50' },
    AM:  { border: '#10b981', rowBg: '#f0fdf4', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', selectCls: 'border-emerald-400 text-emerald-700 bg-emerald-50' },
    STR: { border: '#ef4444', rowBg: '#fef2f2', badge: 'bg-red-100 text-red-700 border-red-300',        selectCls: 'border-red-400 text-red-700 bg-red-50'        },
  }

  const updatePosition = async (playerId, position) => {
    if (!currentRound) return
    await DB.updateSelectionPosition(currentRound.id, playerId, position)
    setRoundData(prev => ({
      ...prev,
      selections: prev.selections.map(s => s.player_id === playerId ? { ...s, position } : s)
    }))
  }

  // ── Drag and drop ────────────────────────────────────────────────────

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
    // Dead-zone in the middle 40% — only commit above/below in the outer 30% each side
    // This stops jitter when dragging through the midpoint
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
    // Only fires when not over a row or the player-list div (those stopPropagation)
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    // Don't overwrite row-level info if already set for this team
    if (!dragOverInfo || dragOverInfo.teamId !== teamId) {
      setDragOverInfo({ teamId, empty: true })
    }
  }

  // Drop onto the unavailable bucket — marks the dragged active player as unavailable
  const handleDropToBucket = (e, teamId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverInfo(null)
    if (!draggedPlayer || draggedPlayer.fromBucket) return
    if (draggedPlayer.fromTeamId !== teamId) return // cross-team goes through normal drop
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

    // Bucket player dropped onto active area → restore to active squad (appended to end)
    if (draggedPlayer.fromBucket) {
      setDraggedPlayer(null)
      markSelectionUnavailable(fromTeamId, playerId, false)
      return
    }

    setDraggedPlayer(null)

    // ── Optimistic update: reorder local state immediately ──────────────
    setRoundData(prev => {
      if (!prev) return prev
      const sels = [...prev.selections]

      // Pull out the moving player
      const movingIdx = sels.findIndex(s => s.player_id === playerId && s.team_id === fromTeamId)
      if (movingIdx === -1) return prev
      const [moving] = sels.splice(movingIdx, 1)
      moving.team_id = targetTeamId

      // Find insert position in target team
      const targetSels = sels.filter(s => s.team_id === targetTeamId).sort((a, b) => a.slot_number - b.slot_number)
      const otherSels  = sels.filter(s => !(s.team_id === targetTeamId))

      let insertIdx = targetSels.length // default: end
      if (targetPlayerId !== null) {
        const targetIdx = targetSels.findIndex(s => s.player_id === targetPlayerId)
        if (targetIdx !== -1) insertIdx = insertAfter ? targetIdx + 1 : targetIdx
      }

      targetSels.splice(insertIdx, 0, moving)

      // Re-number slots
      targetSels.forEach((s, i) => { s.slot_number = i + 1 })
      if (fromTeamId !== targetTeamId) {
        const fromSels = otherSels.filter(s => s.team_id === fromTeamId).sort((a, b) => a.slot_number - b.slot_number)
        fromSels.forEach((s, i) => { s.slot_number = i + 1 })
      }

      return { ...prev, selections: [...otherSels, ...targetSels] }
    })

    // ── Fire API in background — no await, no refetch ───────────────────
    DB.moveSelection(currentRound.id, {
      playerId,
      from_team_id: fromTeamId,
      target_team_id: targetTeamId,
      target_player_id: targetPlayerId || null,
      insert_after: insertAfter,
    }).catch(err => {
      console.error('Drop sync failed:', err)
      DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
    })
  }

  const handleDragEnd = () => {
    setDraggedPlayer(null)
    setDragOverInfo(null)
  }

  // ── Touch drag-and-drop ───────────────────────────────────────────────

  const createGhost = (name) => {
    const el = document.createElement('div')
    el.textContent = name
    el.style.cssText = `
      position:fixed; z-index:9999; pointer-events:none;
      background:#1e3a8a; color:#fff; font-size:13px; font-weight:600;
      padding:6px 14px; border-radius:20px; white-space:nowrap;
      box-shadow:0 4px 16px rgba(0,0,0,0.35); opacity:0.92;
      transform:translate(-50%,-50%);
    `
    document.body.appendChild(el)
    return el
  }

  const handleTouchStart = (e, selection, fromTeamId, fromBucket = false) => {
    // Don't intercept taps on buttons/selects inside the row
    if (e.target.closest('button, select')) return
    const touch = e.touches[0]
    const ghostEl = createGhost(selection.name)
    ghostEl.style.left = touch.clientX + 'px'
    ghostEl.style.top  = touch.clientY + 'px'
    touchDragRef.current = { playerId: selection.player_id, fromTeamId, fromBucket, ghostEl }
    touchScrollLocked.current = false
    setDraggedPlayer({ playerId: selection.player_id, fromTeamId, fromBucket })
  }

  const handleTouchMove = (e) => {
    if (!touchDragRef.current) return
    // Lock scroll once we clearly start dragging (moved > 5px vertical)
    const touch = e.touches[0]
    if (!touchScrollLocked.current) {
      touchScrollLocked.current = true
      // Prevent page scroll while dragging
    }
    e.preventDefault()
    const { ghostEl } = touchDragRef.current
    if (ghostEl) {
      ghostEl.style.left = touch.clientX + 'px'
      ghostEl.style.top  = touch.clientY + 'px'
    }
    // Hit-test: find the element under the touch point
    ghostEl.style.display = 'none'
    const elUnder = document.elementFromPoint(touch.clientX, touch.clientY)
    ghostEl.style.display = ''
    // Find closest player row or column
    const playerRow = elUnder?.closest('[data-player-id]')
    const column    = elUnder?.closest('[data-team-id]')
    const bucket    = elUnder?.closest('[data-bucket-team]')
    if (bucket) {
      setDragOverInfo({ teamId: bucket.dataset.bucketTeam, bucket: true })
    } else if (playerRow) {
      const rect = playerRow.getBoundingClientRect()
      const position = touch.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
      setDragOverInfo({
        teamId: playerRow.dataset.teamId,
        playerId: Number(playerRow.dataset.playerId),
        position,
      })
    } else if (column) {
      setDragOverInfo({ teamId: column.dataset.teamId, empty: true })
    } else {
      setDragOverInfo(null)
    }
  }

  const handleTouchEnd = (e) => {
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
      // Drop to unavailable bucket
      if (!fromBucket && info.teamId === fromTeamId) {
        markSelectionUnavailable(fromTeamId, playerId, true)
      }
      return
    }

    if (fromBucket) {
      // Restore from bucket
      markSelectionUnavailable(fromTeamId, playerId, false)
      return
    }

    // Normal reorder / cross-team drop — reuse existing handleDrop logic
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
      playerId,
      from_team_id: fromTeamId,
      target_team_id: targetTeamId,
      target_player_id: targetPlayerId,
      insert_after: insertAfter,
    }).catch(() => {
      DB.getRoundDetail(currentRound.id, allPlayers).then(setRoundData)
    })
  }

  // ── Match details edit ────────────────────────────────────────────────

  const openMatchEdit = (team, match) => {
    setMatchEditTeam(team.id)
    setMatchEditForm({
      match_date:   match.match_date   || '',
      time:         match.time         || '',
      opponent:     match.opponent     || '',
      venue:        match.venue        || '',
      top_colour:   match.top_colour   || '',
      socks_colour: match.socks_colour || '',
    })
  }

  const saveMatchEdit = async () => {
    if (!currentRound || !matchEditTeam) return
    await DB.updateMatchDetails(currentRound.id, matchEditTeam, matchEditForm)
    const updated = await DB.getRoundDetail(currentRound.id, allPlayers)
    setRoundData(updated)
    setMatchEditTeam(null)
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  const getStatusColor = (statusId) => {
    const status = statuses.find(s => s.id === statusId)
    return status?.color || '#6b7280'
  }

  const getSelectedPlayerIds = (forTeamId) => {
    if (!roundData) return new Set()
    return new Set(roundData.selections.filter(s => s.team_id === forTeamId).map(s => s.player_id))
  }

  // Build a map of playerId → teamId from current round selections
  // This reflects where players are placed in THIS round
  const playerTeamMap = roundData
    ? Object.fromEntries(roundData.selections.map(s => [s.player_id, s.team_id]))
    : {}

  const getAvailablePlayers = () => {
    const selected = getSelectedPlayerIds(pickerOpen?.teamId)
    return allPlayers
      .filter(p => !selected.has(p.id))
      .filter(p => showUnavailableInPicker || !roundUnavailability[p.id])
      .filter(p => {
        if (!pickerTeamFilter) return true
        // Check current round placement first
        if (playerTeamMap[p.id] === pickerTeamFilter) return true
        // Check all teams player has played for this season (carry-forward history)
        if (Array.isArray(p.teams_played_2026) && p.teams_played_2026.includes(pickerTeamFilter)) return true
        // Fall back to assigned team
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

  const getTeamSelections = (teamId) => {
    if (!roundData) return {}
    const map = {}
    roundData.selections.filter(s => s.team_id === teamId).forEach(s => { map[s.slot_number] = s })
    return map
  }

  const getTeamSelectionsOrdered = (teamId) => {
    if (!roundData?.selections) return []
    return roundData.selections
      .filter(s => s.team_id === teamId)
      .sort((a, b) => a.slot_number - b.slot_number)
  }

  // Active squad — excludes players dragged to the unavailable bucket
  const getTeamActiveSelections = (teamId) => {
    if (!roundData?.selections) return []
    return roundData.selections
      .filter(s => s.team_id === teamId && !s.is_unavailable)
      .sort((a, b) => a.slot_number - b.slot_number)
  }

  // Unavailable bucket — players explicitly marked unavailable for this round/team
  const getTeamUnavailableSelections = (teamId) => {
    if (!roundData?.selections) return []
    return roundData.selections
      .filter(s => s.team_id === teamId && s.is_unavailable)
      .sort((a, b) => a.slot_number - b.slot_number)
  }

  const getTeamBench = (teamId) => {
    if (!roundData?.bench) return []
    return roundData.bench.filter(b => b.team_id === teamId)
  }

  const getMatchDetails = (teamId) => {
    if (!roundData) return {}
    return roundData.matches.find(m => m.team_id === teamId) || {}
  }

  // ── Team sheet PNG export — one image per team, 480px wide ────────────

  const TEAM_FULL_NAMES = {
    PL:    'Premier League',
    PLR:   'Premier League Reserves',
    PB:    'Pennant B',
    PC:    'Pennant C',
    PE:    'Pennant E SE',
    Metro: 'Metro 2 South',
  }

  const cRR = (ctx, x, y, w, h, r) => {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + r)
    ctx.lineTo(x + w, y + h - r)
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    ctx.lineTo(x + r, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - r)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
  }

  const cCap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

  const buildTeamCanvas = (tid, match, players, roundLabel) => {
    const W = 480
    const PAD = 24
    const CLUB_H = 90
    const TEAM_H = 68
    const INFO_LINE_H = 30
    const INFO_H = INFO_LINE_H * 6 + 24
    const ROW_H = 42
    const FOOTER_H = 34
    const totalH = CLUB_H + TEAM_H + INFO_H + Math.max(players.length, 1) * ROW_H + FOOTER_H + 8

    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = totalH
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, W, totalH)

    // Club header
    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, W, CLUB_H)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
    ctx.fillText('MENTONE HOCKEY CLUB', PAD, 34)
    ctx.fillStyle = '#94a3b8'
    ctx.font = '15px system-ui, -apple-system, sans-serif'
    ctx.fillText(`Men's Section  ·  ${roundLabel}`, PAD, 58)
    ctx.fillStyle = '#475569'
    ctx.font = '13px system-ui, -apple-system, sans-serif'
    ctx.fillText('Team Sheet', PAD, 78)

    // Team name bar
    const ty = CLUB_H
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(0, ty, W, TEAM_H)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif'
    ctx.fillText(tid, PAD, ty + 34)
    ctx.fillStyle = '#bfdbfe'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText(TEAM_FULL_NAMES[tid] || '', PAD, ty + 56)

    // Availability counts in header
    const confirmedCount   = players.filter(p => Number(p.confirmed ?? 0) === 2).length
    const waitingCount     = players.filter(p => Number(p.confirmed ?? 0) === 1).length
    const unconfirmedCount = players.filter(p => Number(p.confirmed ?? 0) === 0).length
    const unavailCount     = players.filter(p => Number(p.confirmed ?? 0) === 3).length

    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
    let bx = W - PAD
    const drawBadge = (label, bg, fg) => {
      const bw = ctx.measureText(label).width + 12
      bx -= bw + 4
      cRR(ctx, bx, ty + 20, bw, 20, 10); ctx.fillStyle = bg; ctx.fill()
      ctx.fillStyle = fg; ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
      ctx.fillText(label, bx + 6, ty + 34)
    }
    if (unavailCount  > 0) drawBadge(`${unavailCount}✕`,  '#ef4444', '#ffffff')
    if (waitingCount  > 0) drawBadge(`${waitingCount}?`,   '#facc15', '#1e293b')
    if (unconfirmedCount > 0) drawBadge(`${unconfirmedCount}–`, '#94a3b8', '#ffffff')
    if (confirmedCount > 0) drawBadge(`${confirmedCount}✓`, '#22c55e', '#ffffff')

    // Player count badge
    const countLabel = `${players.length} players`
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif'
    const cw = ctx.measureText(countLabel).width + 16
    const badgeCol = players.length >= 11 && players.length <= 16 ? '#16a34a'
      : players.length > 16 ? '#dc2626' : '#d97706'
    ctx.fillStyle = badgeCol
    cRR(ctx, W - PAD - cw, ty + 18, cw, 24, 12); ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.fillText(countLabel, W - PAD - cw + 8, ty + 34)

    // Match info block
    const mi_y = CLUB_H + TEAM_H
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, mi_y, W, INFO_H)
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, mi_y); ctx.lineTo(W, mi_y); ctx.stroke()

    const dateStr = (() => {
      if (!match.match_date) return '—'
      const d = new Date(match.match_date + 'T00:00:00')
      const day = d.getDate()
      const ord = day % 10 === 1 && day !== 11 ? 'st'
                : day % 10 === 2 && day !== 12 ? 'nd'
                : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
      const weekday = d.toLocaleDateString('en-AU', { weekday: 'long' })
      return `${weekday} ${day}${ord}`
    })()
    const topCol = match.top_colour || 'blue'
    const socksCol = match.socks_colour || 'yellow'

    const infoLines = [
      { label: 'DATE',   value: dateStr },
      { label: 'TIME',   value: match.time || '—' },
      { label: 'ARRIVE', value: match.arrive_at || '—' },
      { label: 'VS',     value: match.opponent || '—' },
      { label: 'VENUE',  value: match.venue || '—' },
      { label: 'KIT',    value: `${cCap(topCol)} top  ·  ${cCap(socksCol)} socks` },
    ]

    const LABEL_W = 62
    infoLines.forEach((line, i) => {
      const ly = mi_y + 20 + i * INFO_LINE_H
      // Alternating subtle row bg
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc'
      ctx.fillRect(0, mi_y + i * INFO_LINE_H, W, INFO_LINE_H)
      // Label — muted grey, same style as before
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 10px system-ui, -apple-system, sans-serif'
      ctx.fillText(line.label, PAD, ly)
      // Value — larger + dark
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 15px system-ui, -apple-system, sans-serif'
      ctx.fillText(line.value, PAD + LABEL_W, ly)
    })

    // Kit swatches — positioned at bottom-right of info block
    const kitY = mi_y + INFO_H - 18
    ctx.fillStyle = topCol === 'blue' ? '#2563eb' : '#e2e8f0'
    cRR(ctx, W - PAD - 42, kitY - 12, 17, 17, 4); ctx.fill()
    if (topCol === 'white') { ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.stroke() }
    ctx.fillStyle = socksCol === 'yellow' ? '#facc15' : '#2563eb'
    cRR(ctx, W - PAD - 21, kitY - 12, 17, 17, 4); ctx.fill()

    // Player rows
    const pl_y = mi_y + INFO_H
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, pl_y); ctx.lineTo(W, pl_y); ctx.stroke()

    players.forEach((p, i) => {
      const ry = pl_y + i * ROW_H
      const avail = Number(p.confirmed ?? 0)
      // Unconfirmed (0) or waiting (1) → subtle yellow tint; unavailable → light red tint
      const rowBg = avail === 0 || avail === 1
        ? (i % 2 === 0 ? '#fefce8' : '#fef9c3')   // yellow-50 / yellow-100
        : avail === 3
          ? (i % 2 === 0 ? '#fff1f2' : '#ffe4e6')  // rose tint
          : (i % 2 === 0 ? '#ffffff' : '#f8fafc')  // normal
      ctx.fillStyle = rowBg
      ctx.fillRect(0, ry, W, ROW_H)
      // Left accent strip for unconfirmed/waiting
      if (avail === 0 || avail === 1) {
        ctx.fillStyle = avail === 1 ? '#facc15' : '#d1d5db'
        ctx.fillRect(0, ry, 4, ROW_H)
      }
      if (i > 0) {
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(PAD, ry); ctx.lineTo(W - PAD, ry); ctx.stroke()
      }
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${i + 1}`, PAD, ry + 27)
      const isUnavail = avail === 3
      const isUnconf  = avail === 0
      const isWaiting = avail === 1
      ctx.fillStyle = isUnavail ? '#94a3b8' : isUnconf ? '#78716c' : '#0f172a'
      ctx.font = `${isUnavail ? 'italic ' : ''}bold 19px system-ui, -apple-system, sans-serif`
      const nameSuffix = isUnavail ? ' (unavailable)' : isWaiting ? ' ?' : isUnconf ? ' –' : ''
      ctx.fillText(p.name + nameSuffix, PAD + 34, ry + 27)
    })

    if (players.length === 0) {
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'italic 15px system-ui, -apple-system, sans-serif'
      ctx.fillText('No players selected', PAD, pl_y + 28)
    }

    // Footer
    const ft_y = pl_y + Math.max(players.length, 1) * ROW_H + 8
    ctx.fillStyle = '#94a3b8'
    ctx.font = '11px system-ui, -apple-system, sans-serif'
    const now = new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    ctx.fillText(`Generated ${now}  ·  MHC Squad Tracker`, PAD, ft_y + 14)

    return canvas
  }

  const openTeamSheetModal = () => {
    if (!roundData || !currentRound) return
    const roundLabel = currentRound.round_type === 'season'
      ? `Round ${currentRound.round_number}`
      : currentRound.name || 'Practice Match'
    const sheets = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro'].map(tid => {
      const match = (roundData.matches || []).find(m => m.team_id === tid) || {}
      const players = (roundData.selections || [])
        .filter(s => s.team_id === tid && !s.is_unavailable)
        .sort((a, b) => a.slot_number - b.slot_number)
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

  const downloadAllTeamSheets = () => {
    teamSheetCanvases.forEach((sheet, i) => {
      setTimeout(() => downloadTeamSheet(sheet), i * 200)
    })
  }


  // ── Team label helper ─────────────────────────────────────────────────

  const TEAM_LABELS = {
    PL:    'Premier League',
    PLR:   'Premier League Reserves',
    PB:    'Pennant B',
    PC:    'Pennant C',
    PE:    'Pennant E SE',
    Metro: 'Metro 2 South',
  }

  const duplicateIds = getDuplicatePlayerIds()

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">Loading round data…</div>
  )

  return (
    <div className="p-3 sm:p-4 space-y-3">

      {/* ── Mode toggle + nav ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0">

        {/* Season / Practice toggle */}
        <div className="flex rounded border border-slate-200 overflow-hidden flex-shrink-0">
          <button
            onClick={() => {
              setPlannerMode('season')
              const last = seasonRounds[seasonRounds.length - 1]
              if (last) setCurrentRound(last)
            }}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
              plannerMode === 'season'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >Season</button>
          <button
            onClick={() => {
              setPlannerMode('practice')
              const first = practiceRounds[0]
              if (first) setCurrentRound(first)
            }}
            className={`px-3 py-1.5 text-xs font-semibold border-l border-slate-200 transition-colors ${
              plannerMode === 'practice'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >Practice</button>
        </div>

        {/* Season mode — ‹ Round N › nav */}
        {plannerMode === 'season' && (() => {
          const idx = seasonRounds.findIndex(r => r.id === currentRound?.id)
          const prev = idx > 0 ? seasonRounds[idx - 1] : null
          const next = idx >= 0 && idx < seasonRounds.length - 1 ? seasonRounds[idx + 1] : null
          const nextNum = seasonRounds.length > 0
            ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1
          const fmtD = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : null
          const satStr = fmtD(currentRound?.sat_date)
          const sunStr = fmtD(currentRound?.sun_date)
          const dateStr = satStr && sunStr ? `${satStr} – ${sunStr}` : satStr || sunStr || null
          const label = currentRound
            ? `R${currentRound.round_number}${dateStr ? ` · ${dateStr}` : ''}`
            : 'No rounds'

          return (
            <>
              <button onClick={() => prev && setCurrentRound(prev)} disabled={!prev}
                className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-25 disabled:cursor-not-allowed text-sm font-bold flex-shrink-0"
              >‹</button>
              <span className="text-sm font-semibold text-slate-800 truncate min-w-0">{label}</span>
              {!next ? (
                <button onClick={() => setShowAdvanceModal(true)}
                  className="px-2.5 h-7 flex items-center rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex-shrink-0"
                >R{nextNum} →</button>
              ) : (
                <button onClick={() => setCurrentRound(next)}
                  className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm font-bold flex-shrink-0"
                >›</button>
              )}
            </>
          )
        })()}

        {/* Practice mode — pill list */}
        {plannerMode === 'practice' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {practiceRounds.length === 0
              ? <span className="text-xs text-slate-400">No practice rounds yet</span>
              : practiceRounds.map(r => (
                <button key={r.id} onClick={() => setCurrentRound(r)}
                  className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                    currentRound?.id === r.id
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 hover:text-purple-700'
                  }`}
                >{r.name || 'Practice'}</button>
              ))
            }
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
        {/* Sheet */}
        {currentRound && (
          <button onClick={openTeamSheetModal}
            className="h-7 px-2.5 flex items-center rounded text-xs font-medium bg-slate-700 text-white hover:bg-slate-800 flex-shrink-0"
          >Sheet</button>
        )}

        {/* ··· overflow */}
        <div className="relative flex-shrink-0">
          <button onClick={() => setShowOverflowMenu(v => !v)}
            className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm leading-none tracking-tight"
          >···</button>
          {showOverflowMenu && (
            <div className="absolute right-0 top-8 z-50 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
              onMouseLeave={() => setShowOverflowMenu(false)}>
              {currentRound && plannerMode === 'season' && (
                <button onClick={() => { setShowOverflowMenu(false); openCarryForwardModal() }}
                  className="w-full text-left px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >Carry forward →</button>
              )}
              {currentRound && (
                <button onClick={() => { setShowOverflowMenu(false); setShowCopyModal(true) }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >Copy to new round</button>
              )}
              <button onClick={() => { setShowOverflowMenu(false); setShowNewRoundModal(true) }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >New blank round</button>
              {currentRound && (
                <>
                  <button onClick={() => { setShowOverflowMenu(false); openRenameModal() }}
                    className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >Rename round</button>
                  <div className="border-t border-slate-100 my-1" />
                  <button onClick={() => { setShowOverflowMenu(false); setShowDeleteConfirm(true) }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >Delete round</button>
                </>
              )}
            </div>
          )}
        </div>
        </div> {/* end ml-auto group */}
      </div>

      {/* ── Mobile team filter ─────────────────────────────────────────── */}
      {currentRound && (
        <div className="flex items-center gap-1.5 overflow-x-auto sm:hidden pb-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <button
            onClick={() => setMobileTeamFilter(null)}
            className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              mobileTeamFilter === null ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
            }`}
          >
            All
          </button>
          {teams.map(t => (
            <button
              key={t.id}
              onClick={() => setMobileTeamFilter(prev => prev === t.id ? null : t.id)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                mobileTeamFilter === t.id ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200'
              }`}
              style={mobileTeamFilter === t.id ? { background: '#1e3a8a' } : {}}
            >
              {t.id}
            </button>
          ))}
        </div>
      )}

      {!currentRound && (
        <div className="text-slate-500 text-sm">No rounds yet. Create one to get started.</div>
      )}

      {/* ── Unavailability panel ─────────────────────────────────────── */}
      {currentRound && Object.keys(roundUnavailability).length > 0 && (() => {
        const unavailPlayers = allPlayers
          .filter(p => roundUnavailability[p.id])
          .sort((a, b) => a.name.localeCompare(b.name))
        const dayLabel = (days) => days === 'sat' ? 'Sat' : days === 'sun' ? 'Sun' : 'Both days'
        return (
          <div className="mb-3 rounded border border-red-200 bg-red-50 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wide flex-shrink-0">
                Unavailable
              </span>
              <span className="text-xs bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold flex-shrink-0">
                {unavailPlayers.length}
              </span>
              {unavailPlayers.map(p => {
                const days = roundUnavailability[p.id]
                const teamTag = roundData?.selections
                  ?.filter(s => String(s.player_id) === String(p.id))
                  ?.map(s => s.team_id)
                  ?.filter((v, i, a) => a.indexOf(v) === i)
                  ?.join('/') || null
                return (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 text-red-700 rounded px-2 py-0.5 cursor-pointer hover:bg-red-100 transition-colors"
                    onClick={() => onSelectPlayer && onSelectPlayer(p)}
                    title="Click to view player"
                  >
                    {p.name}
                    <span className="text-red-400 font-medium">{dayLabel(days)}</span>
                    {teamTag && <span className="text-red-300">{teamTag}</span>}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Team columns ──────────────────────────────────────────────── */}
      {currentRound && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {teams
            .filter(team => !mobileTeamFilter || team.id === mobileTeamFilter || window.innerWidth >= 640)
            .map(team => {
            const selections = getTeamActiveSelections(team.id)
            const unavailSels = getTeamUnavailableSelections(team.id)
            const match = getMatchDetails(team.id)
            const counts = getTeamCounts(team.id)

            return (
              <div
                key={team.id}
                data-team-id={team.id}
                className={`bg-white rounded-lg border overflow-hidden transition-colors ${
                  draggedPlayer && draggedPlayer.fromTeamId !== team.id && dragOverInfo?.teamId === team.id
                    ? 'border-blue-400 ring-2 ring-blue-300'
                    : 'border-slate-200'
                }`}
                onDragOver={(e) => handleDragOverColumn(e, team.id)}
                onDrop={(e) => handleDrop(e, team.id, null)}
              >

                {/* Team header */}
                <div className="text-white" style={{ background: '#0f172a' }}>
                  {/* Yellow accent bar */}
                  <div style={{ background: '#eab308', height: '4px' }} />
                  {/* Navy top bar — team name + counts */}
                  <div className="flex items-center justify-between px-3 py-2" style={{ background: '#1e3a8a' }}>
                    <div className="font-bold text-sm tracking-wide">{team.id}</div>
                    <div className="flex items-center gap-1.5 text-xs">
                      {counts.confirmed > 0 && (
                        <span className="text-green-300 font-medium">{counts.confirmed}✓</span>
                      )}
                      {counts.waiting > 0 && (
                        <span className="text-yellow-300 font-medium">{counts.waiting}?</span>
                      )}
                      {counts.unavailable > 0 && (
                        <span className="text-red-300 font-medium">{counts.unavailable}✕</span>
                      )}
                      {counts.unavailableBucket > 0 && (
                        <span className="text-slate-400 font-medium" title="In unavailable bucket">{counts.unavailableBucket}off</span>
                      )}
                      <span className={`font-bold ml-0.5 ${
                        counts.total >= 11 && counts.total <= 16 ? 'text-white' :
                        counts.total > 16 ? 'text-orange-300' : 'text-red-300'
                      }`}>{counts.total}</span>
                    </div>
                  </div>

                  {/* Inline match detail fields — darker navy section */}
                  <div className="px-3 py-2 space-y-1.5" style={{ background: '#0f172a' }}>

                    {/* Date — native date picker */}
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-xs w-10 flex-shrink-0">Date</span>
                      <input
                        type="date"
                        defaultValue={match.match_date || ''}
                        onBlur={async e => {
                          await DB.updateMatchDetails(currentRound.id, team.id, { match_date: e.target.value })
                          const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
                          setRoundData(fresh)
                        }}
                        className="flex-1 bg-transparent text-white text-xs py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400"
                        style={{ colorScheme: 'dark' }}
                      />
                    </div>

                    {/* Text fields: time, arrive_at, opponent, venue */}
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
                        onBlur={async e => {
                          await DB.updateMatchDetails(currentRound.id, team.id, { [key]: e.target.value })
                          const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
                          setRoundData(fresh)
                        }}
                        className="w-full bg-transparent text-white placeholder-slate-500 text-xs px-0 py-0.5 border-0 border-b border-slate-700 focus:outline-none focus:border-yellow-400"
                      />
                    ))}

                    {/* Kit colour chips */}
                    {(() => {
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
                        <div className="flex gap-2 pt-0.5">
                          {Object.entries(KIT_COLOURS).map(([key, { label, options }]) => {
                            const val = match[key] || ''
                            const cs = chipStyle(val)
                            return (
                              <div key={key} className="flex-1">
                                <select
                                  value={val}
                                  onChange={async e => {
                                    await DB.updateMatchDetails(currentRound.id, team.id, { [key]: e.target.value })
                                    const fresh = await DB.getRoundDetail(currentRound.id, allPlayers)
                                    setRoundData(fresh)
                                  }}
                                  style={{ ...cs, borderWidth: '1px', borderStyle: 'solid' }}
                                  className="w-full text-xs font-semibold rounded-full px-2 py-0.5 text-center appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-yellow-400"
                                >
                                  {options.map(o => (
                                    <option key={o} value={o} style={{ background: '#1e293b', color: '#fff' }}>
                                      {o || label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}

                  </div>
                </div>

                {/* Player list */}
                <div
                  className="min-h-[40px]"
                  onDragOver={(e) => handleDragOverEmpty(e, team.id)}
                  onDrop={(e) => handleDrop(e, team.id, null)}
                >
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
                        onDragStart={(e) => handleDragStart(e, sel, team.id)}
                        onDragOver={(e) => handleDragOverRow(e, team.id, sel.player_id)}
                        onDrop={(e) => handleDrop(e, team.id, sel.player_id)}
                        onDragEnd={handleDragEnd}
                        style={{
                          borderLeft: posStyle ? `3px solid ${posStyle.border}` : '3px solid transparent',
                          backgroundColor: posStyle ? posStyle.rowBg : undefined,
                          // While dragging, make children transparent to pointer events so
                          // dragover always fires on the row div (prevents jitter + wrong targets)
                          ...(draggedPlayer ? { userSelect: 'none' } : {}),
                        }}
                        className={`border-b border-slate-100 text-sm transition-colors ${
                          !posStyle ? 'hover:bg-slate-50' : ''
                        } ${
                          isDragOver
                            ? dragOverInfo.position === 'above'
                              ? 'border-t-2 border-t-blue-400'
                              : 'border-b-2 border-b-blue-400'
                            : ''
                        }`}
                      >
                        {/* Inner wrapper — pointer-events:none while dragging so the row div
                            is always the dragover target, preventing jitter from child elements */}
                        <div className="flex items-center gap-2 px-3 py-2 w-full" style={{ pointerEvents: draggedPlayer ? 'none' : 'auto' }}>
                        {/* Drag handle — touch drag only activates from here */}
                        <span
                          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 touch-none select-none"
                          style={{ touchAction: 'none' }}
                          onTouchStart={(e) => handleTouchStart(e, sel, team.id)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          title="Drag to reorder"
                        >
                          ⠿
                        </span>

                        <span className="text-slate-400 text-xs w-4 text-center flex-shrink-0">{idx + 1}</span>

                        {/* Availability dot */}
                        <button
                          onClick={() => toggleConfirmed(team.id, sel.player_id)}
                          title={avail.title}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${avail.bg} ${avail.border}`}
                        >
                          {avail.icon}
                        </button>

                        {/* Player name + status dot */}
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <span
                            className="truncate cursor-pointer hover:text-blue-600"
                            onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}
                          >
                            {sel.name}
                          </span>
                          {roundUnavailability[sel.player_id]
                            ? <span
                                className="w-2 h-2 rounded-full flex-shrink-0 bg-red-400"
                                title={roundUnavailability[sel.player_id] === 'sat' ? 'Unavailable Saturday' : roundUnavailability[sel.player_id] === 'sun' ? 'Unavailable Sunday' : 'Unavailable this round'}
                              />
                            : <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-400" title="Available this round" />
                          }
                          {isDupe && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-1 rounded font-bold flex-shrink-0">2×</span>
                          )}
                        </div>

                        {/* Position selector — colour-coded when a position is set */}
                        <select
                          value={sel.position || ''}
                          onChange={(e) => updatePosition(sel.player_id, e.target.value)}
                          className={`text-xs rounded px-1 py-0.5 w-14 flex-shrink-0 border font-medium ${
                            posStyle ? posStyle.selectCls : 'border-slate-200 text-slate-400 bg-white'
                          }`}
                        >
                          <option value="">Pos</option>
                          {POSITIONS.map(p => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>

                        {/* Remove button */}
                        <button
                          onClick={() => removePlayer(team.id, sel.player_id)}
                          className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                          title="Remove player"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                        </div>{/* end inner pointer-events wrapper */}
                      </div>
                    )
                  })}

                  {/* Cross-team drop zone strip — visible when dragging from another team */}
                  {draggedPlayer && draggedPlayer.fromTeamId !== team.id && (
                    <div
                      className={`mx-2 my-1 rounded border-2 border-dashed text-xs text-center py-2 transition-colors ${
                        dragOverInfo?.teamId === team.id
                          ? 'border-blue-400 bg-blue-50 text-blue-600'
                          : 'border-slate-200 text-slate-400'
                      }`}
                    >
                      {dragOverInfo?.teamId === team.id ? '↓ Drop here' : 'Drop to move here'}
                    </div>
                  )}
                </div>

                {/* ── Unavailable bucket ─────────────────────────────── */}
                {(unavailSels.length > 0 || (draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket)) && (
                  <div
                    data-bucket-team={team.id}
                    className={`border-t-2 border-dashed transition-colors ${
                      draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket
                        ? 'border-red-300 bg-red-50'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                    onDrop={(e) => handleDropToBucket(e, team.id)}
                  >
                    <div className="flex items-center gap-1.5 px-3 py-1.5">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                        Unavailable
                      </span>
                      {unavailSels.length > 0 && (
                        <span className="text-xs bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-semibold">
                          {unavailSels.length}
                        </span>
                      )}
                      {draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket && (
                        <span className="text-xs text-red-400 ml-auto">↓ drop to mark unavailable</span>
                      )}
                    </div>

                    {unavailSels.map(sel => (
                      <div
                        key={`unavail-${sel.team_id}-${sel.player_id}`}
                        data-player-id={sel.player_id}
                        data-team-id={team.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, sel, team.id, true)}
                        onDragEnd={handleDragEnd}
                        className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 text-sm hover:bg-red-50 group"
                      >
                        {/* Drag handle — touch only */}
                        <span
                          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0 px-0.5 select-none"
                          style={{ touchAction: 'none' }}
                          onTouchStart={(e) => handleTouchStart(e, sel, team.id, true)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={handleTouchEnd}
                          title="Drag to reorder"
                        >
                          ⠿
                        </span>

                        {/* Player name — muted + strikethrough */}
                        <div className="flex-1 flex items-center gap-1.5 min-w-0">
                          <span
                            className="truncate text-slate-400 line-through text-xs cursor-pointer hover:text-blue-500 no-underline"
                            style={{ textDecoration: 'line-through' }}
                            onClick={() => onSelectPlayer && onSelectPlayer(allPlayers.find(p => p.id === sel.player_id) || { id: sel.player_id, name: sel.name })}
                          >
                            {sel.name}
                          </span>
                        </div>

                        {/* Restore button — always visible on touch, hover-revealed on desktop */}
                        <button
                          onClick={() => markSelectionUnavailable(team.id, sel.player_id, false)}
                          title="Move back to squad"
                          className="text-slate-400 hover:text-blue-500 transition-colors text-xs sm:opacity-0 sm:group-hover:opacity-100 flex-shrink-0"
                        >
                          ↑ squad
                        </button>

                        {/* Remove entirely */}
                        <button
                          onClick={() => removePlayer(team.id, sel.player_id)}
                          className="text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                          title="Remove player"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}

                    {/* Empty bucket hint when dragging */}
                    {unavailSels.length === 0 && draggedPlayer?.fromTeamId === team.id && !draggedPlayer?.fromBucket && (
                      <div className="px-3 pb-2 text-xs text-red-300 italic">
                        Drop player here to mark as unavailable
                      </div>
                    )}
                  </div>
                )}

                {/* Position summary bar */}
                {(() => {
                  const posCounts = getPositionCounts(team.id)
                  const hasAny = Object.keys(posCounts).length > 0
                  if (!hasAny) return null
                  return (
                    <div className="flex flex-wrap gap-1 px-3 py-1.5 border-t border-slate-100 bg-slate-50">
                      {POSITIONS.filter(p => posCounts[p.value]).map(p => {
                        const ps = POSITION_STYLES[p.value]
                        return (
                          <span
                            key={p.value}
                            className={`text-xs px-1.5 py-0.5 rounded border font-semibold ${ps.badge}`}
                          >
                            {p.label} {posCounts[p.value]}
                          </span>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Add player button */}
                <div className="p-2">
                  <button
                    onClick={() => setPickerOpen({ teamId: team.id })}
                    className="w-full py-1.5 text-sm text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-dashed border-slate-200 hover:border-blue-300 rounded transition-colors"
                  >
                    + Add player
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Player picker modal ───────────────────────────────────────── */}
      {pickerOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">Add player — {pickerOpen.teamId}</h3>
              <button onClick={() => setPickerOpen(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <div className="px-4 py-2 border-b border-slate-100">
              <input
                ref={searchRef}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search players…"
                className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <div className="flex gap-2 mt-2 flex-wrap items-center">
                <button
                  onClick={() => setPickerTeamFilter(null)}
                  className={`text-xs px-2 py-1 rounded ${!pickerTeamFilter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                >
                  All
                </button>
                {teams.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setPickerTeamFilter(t.id)}
                    className={`text-xs px-2 py-1 rounded ${pickerTeamFilter === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {t.id}
                  </button>
                ))}
                {Object.keys(roundUnavailability).length > 0 && (
                  <button
                    onClick={() => setShowUnavailableInPicker(v => !v)}
                    className={`ml-auto text-xs px-2 py-1 rounded flex items-center gap-1 ${
                      showUnavailableInPicker ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {showUnavailableInPicker ? 'Hide' : 'Show'} unavailable
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {getAvailablePlayers().map(p => {
                const isSelected  = selectedPlayerIds.has(p.id)
                const isUnavail   = !!roundUnavailability[p.id]
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      const next = new Set(selectedPlayerIds)
                      isSelected ? next.delete(p.id) : next.add(p.id)
                      setSelectedPlayerIds(next)
                    }}
                    className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-slate-100 text-sm ${
                      isSelected ? 'bg-blue-50' : isUnavail ? 'bg-red-50 opacity-60' : ''
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'
                    }`}>
                      {isSelected && '✓'}
                    </div>
                    <span className={`flex-1 ${isUnavail ? 'line-through text-slate-400' : ''}`}>{p.name}</span>
                    {isUnavail && <span className="text-xs text-red-400 flex-shrink-0">unavailable</span>}
                    {p.status_id && (
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusColor(p.status_id) }} />
                    )}
                    <span className="text-xs text-slate-400 flex-shrink-0">{playerTeamMap[p.id] || p.assigned_team_id_2026 || '—'}</span>
                  </div>
                )
              })}
              {getAvailablePlayers().length === 0 && (
                <div className="px-4 py-6 text-center text-slate-400 text-sm">No players found</div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500">{selectedPlayerIds.size} selected</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPickerOpen(null); setSearchTerm(''); setSelectedPlayerIds(new Set()) }}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={addSelectedPlayers}
                  disabled={selectedPlayerIds.size === 0}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Add {selectedPlayerIds.size > 0 ? `(${selectedPlayerIds.size})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Carry forward modal ───────────────────────────────────────── */}
      {showCarryForwardModal && (() => {
        const idx = seasonRounds.findIndex(r => r.id === currentRound?.id)
        const nextRound = seasonRounds[idx + 1]
        const fromLabel = `Round ${currentRound?.round_number}`
        const toLabel = nextRound ? `Round ${nextRound.round_number}` : null
        const allTicked = carryForwardTeams.length === teams.length
        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Carry Forward</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Copy selections from <span className="font-medium text-slate-700">{fromLabel}</span> into{' '}
                  <span className="font-medium text-slate-700">{toLabel || '?'}</span>.
                  Players already in the target are skipped. Availability resets.
                </p>
              </div>

              {!nextRound ? (
                <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded">
                  No next round found — create the next season round first.
                </p>
              ) : carryForwardResult ? (
                /* Result state */
                <div className={`px-3 py-3 rounded text-sm ${carryForwardResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {carryForwardResult.success
                    ? `✓ Copied ${carryForwardResult.copied} player${carryForwardResult.copied !== 1 ? 's' : ''} into ${carryForwardResult.nextLabel}.`
                    : `Error: ${carryForwardResult.error}`
                  }
                </div>
              ) : (
                /* Team selection */
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select teams to carry over</span>
                    <button
                      onClick={() => setCarryForwardTeams(allTicked ? [] : teams.map(t => t.id))}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >{allTicked ? 'Deselect all' : 'Select all'}</button>
                  </div>
                  {teams.map(t => {
                    const ticked = carryForwardTeams.includes(t.id)
                    // Count players in current round for this team
                    const count = roundData?.selections?.filter(s => s.team_id === t.id && !s.is_unavailable).length ?? 0
                    return (
                      <label key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                        ticked ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}>
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold transition-colors ${
                          ticked ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                        }`}>
                          {ticked && '✓'}
                        </div>
                        <span className={`flex-1 text-sm font-medium ${ticked ? 'text-slate-800' : 'text-slate-600'}`}>{t.id}</span>
                        <span className="text-xs text-slate-400">{count} players</span>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={ticked}
                          onChange={() => {
                            setCarryForwardTeams(prev =>
                              ticked ? prev.filter(id => id !== t.id) : [...prev, t.id]
                            )
                          }}
                        />
                      </label>
                    )
                  })}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {carryForwardResult ? (
                  <button
                    onClick={() => setShowCarryForwardModal(false)}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >Done</button>
                ) : (
                  <>
                    <button
                      onClick={carryForward}
                      disabled={!nextRound || carryForwardTeams.length === 0 || carryForwardLoading}
                      className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    >{carryForwardLoading ? 'Copying…' : `Carry forward (${carryForwardTeams.length})`}</button>
                    <button
                      onClick={() => setShowCarryForwardModal(false)}
                      className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                    >Cancel</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Advance to next round modal ───────────────────────────────── */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
            <h3 className="text-base font-semibold text-slate-800">
              Advance to Round {seasonRounds.length > 0 ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1}
            </h3>
            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-8 flex-shrink-0">Sat</label>
                <input
                  type="date"
                  value={newRoundForm.sat_date}
                  onChange={e => setNewRoundForm(f => ({ ...f, sat_date: e.target.value }))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-8 flex-shrink-0">Sun</label>
                <input
                  type="date"
                  value={newRoundForm.sun_date}
                  onChange={e => setNewRoundForm(f => ({ ...f, sun_date: e.target.value }))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <p className="text-sm text-slate-500">Copy all team selections from{' '}
              <span className="font-medium text-slate-700">
                {currentRound?.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound?.name || 'this round'}
              </span>{' '}into the new round?
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowAdvanceModal(false); createRound(true, 'season') }}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >Yes, copy teams</button>
              <button
                onClick={() => { setShowAdvanceModal(false); createRound(false, 'season') }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
              >No, start blank</button>
            </div>
            <button
              onClick={() => setShowAdvanceModal(false)}
              className="w-full text-xs text-slate-400 hover:text-slate-600 text-center"
            >Cancel</button>
          </div>
        </div>
      )}

      {/* ── New round modal ───────────────────────────────────────────── */}
      {showNewRoundModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">New Round</h3>
            <div className="flex gap-3">
              {['season', 'practice'].map(type => (
                <button
                  key={type}
                  onClick={() => setNewRoundForm(f => ({ ...f, type }))}
                  className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${
                    newRoundForm.type === type
                      ? type === 'season' ? 'bg-blue-600 text-white border-blue-600' : 'bg-purple-600 text-white border-purple-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type === 'season' ? 'Season Round' : 'Practice Match'}
                </button>
              ))}
            </div>
            {newRoundForm.type === 'practice' && (
              <input
                value={newRoundForm.name}
                onChange={(e) => setNewRoundForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Match name (e.g. Pre-season friendly)"
                className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
            {/* Dates */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-8 flex-shrink-0">Sat</label>
                <input
                  type="date"
                  value={newRoundForm.sat_date}
                  onChange={e => setNewRoundForm(f => ({ ...f, sat_date: e.target.value }))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-8 flex-shrink-0">Sun</label>
                <input
                  type="date"
                  value={newRoundForm.sun_date}
                  onChange={e => setNewRoundForm(f => ({ ...f, sun_date: e.target.value }))}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowNewRoundModal(false)} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={() => createRound(false)} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Copy round modal ──────────────────────────────────────────── */}
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">Copy to New Round</h3>
            <p className="text-sm text-slate-600">Copy all player selections from this round into a new round.</p>
            <div className="flex gap-3">
              {['season', 'practice'].map(type => (
                <button
                  key={type}
                  onClick={() => setCopyAsType(type)}
                  className={`flex-1 py-2 rounded border text-sm font-medium transition-colors ${
                    copyAsType === type
                      ? type === 'season' ? 'bg-blue-600 text-white border-blue-600' : 'bg-purple-600 text-white border-purple-600'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {type === 'season' ? 'Season Round' : 'Practice Match'}
                </button>
              ))}
            </div>
            {copyAsType === 'practice' && (
              <input
                value={newRoundForm.name}
                onChange={(e) => setNewRoundForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Match name"
                className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowCopyModal(false)} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={() => createRound(true, copyAsType)} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Copy & Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">Delete Round?</h3>
            <p className="text-sm text-slate-600">
              This will permanently delete{' '}
              <strong>{currentRound?.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound?.name}</strong>{' '}
              and all its selections. This cannot be undone.
            </p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={deleteRound} className="flex-1 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Match details edit modal ──────────────────────────────────── */}
      {matchEditTeam && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">
              {TEAM_LABELS[matchEditTeam] || matchEditTeam} — Match Details
            </h3>
            <div className="space-y-3">
              {[
                { key: 'match_date',   label: 'Date',         placeholder: 'e.g. 14 Mar' },
                { key: 'time',         label: 'Time',         placeholder: 'e.g. 10:30am' },
                { key: 'opponent',     label: 'Opponent',     placeholder: 'e.g. Hawthorn' },
                { key: 'venue',        label: 'Venue',        placeholder: 'e.g. Boss James Reserve' },
                { key: 'top_colour',   label: 'Top Colour',   placeholder: 'e.g. Blue' },
                { key: 'socks_colour', label: 'Socks Colour', placeholder: 'e.g. Yellow' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input
                    type="text"
                    value={matchEditForm[key] || ''}
                    onChange={e => setMatchEditForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setMatchEditTeam(null)} className="flex-1 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={saveMatchEdit} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rename modal ──────────────────────────────────────────────── */}
      {showRenameModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-semibold text-slate-800 text-lg">Rename Round</h3>
            <input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveRename()}
              className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
              autoFocus
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowRenameModal(false)} className="flex-1 py-2 text-sm text-slate-600 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
              <button onClick={saveRename} className="flex-1 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Team Sheet modal ──────────────────────────────────────────── */}
      {showTeamSheetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl mt-4 mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h3 className="font-semibold text-slate-800 text-lg">Team Sheets</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentRound?.round_type === 'season'
                    ? `Round ${currentRound.round_number}`
                    : currentRound?.name || 'Practice Match'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={downloadAllTeamSheets}
                  className="px-4 py-2 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 transition-colors"
                >
                  Download All
                </button>
                <button
                  onClick={() => setShowTeamSheetModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {teamSheetCanvases.map(sheet => (
                <div key={sheet.teamId} className="flex flex-col gap-2">
                  <img
                    src={sheet.dataUrl}
                    alt={`${sheet.teamId} team sheet`}
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                  <button
                    onClick={() => downloadTeamSheet(sheet)}
                    className="w-full py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors font-medium"
                  >
                    ↓ Download {sheet.teamId}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
