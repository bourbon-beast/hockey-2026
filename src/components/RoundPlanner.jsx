import { useState, useRef, useEffect, useMemo } from 'react'
import { useRoundManager } from './useRoundManager'
import { buildTeamCanvas } from './roundUtils'
import TeamColumn from './TeamColumn'
import { generateEmailHtml } from '../utils/generateEmailHtml'
import { auth } from '../firebase'
import VoteResults from './VoteResults'
import { createVoteSession, getVoteSession } from '../db.votes'
import {
  ChevronRight, ArrowLeftRight, Plus, Copy, Pencil, Trash2,
  Image, FileText, Mail, Vote
} from 'lucide-react'

export default function RoundPlanner({ statuses, onSelectPlayer, isAdmin }) {
  const { state, actions, getters } = useRoundManager()
  const {
    teams, allPlayers, currentRound, roundData, loading, roundUnavailability,
    seasonRounds, practiceRounds
  } = state

  // View States
  const [plannerMode, setPlannerMode] = useState('season')
  const lastSeasonRound = useRef(null)
  const lastPracticeRound = useRef(null)
  const searchRef = useRef(null)
  const [teamFilter, setTeamFilter] = useState(new Set())
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [pickerTeamFilter, setPickerTeamFilter] = useState(null)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState(new Set())
  const [showUnavailableInPicker, setShowUnavailableInPicker] = useState(false)
  const [notInRoundFilter, setNotInRoundFilter] = useState(false)
  const [activeChips, setActiveChips] = useState(new Set(['playing']))
  const [showQuickAddPlayer, setShowQuickAddPlayer] = useState(false)
  const [quickAddName, setQuickAddName] = useState('')
  const [quickAddNotes, setQuickAddNotes] = useState('')
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAddError, setQuickAddError] = useState('')

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
  const [showTxtModal, setShowTxtModal] = useState(false)
  const [txtTeams, setTxtTeams] = useState([])
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailHtml, setEmailHtml] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState(null)
  const [unavailOpen, setUnavailOpen] = useState(false)
  const [showVoteModal, setShowVoteModal] = useState(false)
  const [voteTeam, setVoteTeam] = useState(null)          // teamId being set up
  const [voteLink, setVoteLink] = useState(null)           // generated URL
  const [voteCreating, setVoteCreating] = useState(false)
  const [showVoteResults, setShowVoteResults] = useState(null) // { teamId }
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncStaged, setSyncStaged] = useState(null)   // { staged, unmatched, new_count }
  const [syncConfirming, setSyncConfirming] = useState(false)
  const [syncAliases, setSyncAliases] = useState({})   // unmatched resolutions
  const [columnCount, setColumnCount] = useState(() => {
    const saved = localStorage.getItem('mhc-planner-columns')
    return saved ? parseInt(saved) : 6
  })

  // Remember last viewed round per mode so switching back restores position
  useEffect(() => {
    if (!currentRound) return
    if (plannerMode === 'season') lastSeasonRound.current = currentRound
    if (plannerMode === 'practice') lastPracticeRound.current = currentRound
  }, [currentRound, plannerMode])

  const switchToSeason = () => {
    setPlannerMode('season')
    actions.setCurrentRound(lastSeasonRound.current || seasonRounds[seasonRounds.length - 1])
  }

  const switchToPractice = () => {
    setPlannerMode('practice')
    actions.setCurrentRound(lastPracticeRound.current || practiceRounds[0])
  }

  useEffect(() => {
    if (!pickerOpen) return
    setPickerTeamFilter(pickerOpen.teamId)
    setSelectedPlayerIds(new Set())
    setNotInRoundFilter(true)
    setActiveChips(new Set(['playing']))
    setShowQuickAddPlayer(false)
    setQuickAddName('')
    setQuickAddNotes('')
    setQuickAddError('')
  }, [pickerOpen])

  const handleQuickAddPlayer = async () => {
    if (!pickerOpen?.teamId) return
    if (!quickAddName.trim()) {
      setQuickAddError('Name is required')
      return
    }
    setQuickAddSaving(true)
    setQuickAddError('')
    try {
      await actions.createAndAddPlayer(pickerOpen.teamId, {
        name: quickAddName.trim(),
        notes: quickAddNotes.trim() || null,
        assigned_team_id_2026: pickerOpen.teamId,
      })
      setQuickAddName('')
      setQuickAddNotes('')
      setShowQuickAddPlayer(false)
      setPickerOpen(null)
      setSearchTerm('')
      setSelectedPlayerIds(new Set())
    } catch (e) {
      setQuickAddError('Failed to create player')
    } finally {
      setQuickAddSaving(false)
    }
  }

  // Getters mapped
  const getStatusColor = (statusId) => statuses.find(s => s.id === statusId)?.color || '#6b7280'
  const duplicateIds = getters.getDuplicatePlayerIds()
  const playerTeamMap = useMemo(() => roundData ? Object.fromEntries(roundData.selections.map(s => [s.player_id, s.team_id])) : {}, [roundData])

  // ⚡ Bolt: Memoize available players to prevent expensive O(N) recalculations on every render
  const availablePlayers = useMemo(() => {
    if (!pickerOpen) return []
    const selected = new Set(roundData?.selections.filter(s => s.team_id === pickerOpen.teamId).map(s => s.player_id))
    const allSelectedInRound = new Set(roundData?.selections.map(s => s.player_id))
    return allPlayers
        .filter(p => p.is_active !== 0)                                          // always hide inactive
        .filter(p => p.status_id !== 'not_returning')                            // always hide not returning
        .filter(p => !selected.has(p.id))
        .filter(p => {
          const unavail = roundUnavailability[p.id]
          if (!unavail) return true                          // fully available — always show
          if (showUnavailableInPicker) return true           // user has toggled "show unavailable"
          if (unavail === 'both') return false               // unavailable all weekend — hide
          // Partial unavailability — check if the team's match day conflicts
          const teamMatch = roundData?.matches?.find(m => m.team_id === pickerOpen.teamId)
          const matchDay = teamMatch?.match_date === currentRound?.sat_date ? 'sat'
                         : teamMatch?.match_date === currentRound?.sun_date ? 'sun'
                         : null
          if (!matchDay) return false                        // no match date set — safe fallback, hide
          return unavail !== matchDay                        // only show if unavail is the OTHER day
        })
        .filter(p => !notInRoundFilter || !allSelectedInRound.has(p.id))
        .filter(p => {
          if (activeChips.size === 0) return true
          if (activeChips.has('playing') && ['planning', 'new', 'fill_in'].includes(p.status_id)) return true
          if (activeChips.has('games') && Object.values(p.games_played_2026 || {}).reduce((a, b) => a + b, 0) > 0) return true
          return false
        })
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
  }, [
    allPlayers, roundData, pickerOpen?.teamId, currentRound, roundUnavailability,
    showUnavailableInPicker, notInRoundFilter, activeChips, pickerTeamFilter,
    searchTerm, playerTeamMap
  ])

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
      const canvas = buildTeamCanvas(tid, match, players, roundLabel, duplicateIds)
      return { teamId: tid, dataUrl: canvas.toDataURL('image/png'), roundLabel }
    })
    setTeamSheetCanvases(sheets)
    setShowTeamSheetModal(true)
  }

  const openEmailModal = () => {
    if (!roundData || !currentRound) return
    const html = generateEmailHtml(roundData, currentRound, teams, duplicateIds)
    setEmailHtml(html)
    setEmailSending(false)
    setEmailSent(false)
    setEmailError(null)
    setShowEmailModal(true)
  }

  const sendToGmailDraft = async () => {
    setEmailSending(true)
    setEmailError(null)
    try {
      const roundLabel = currentRound?.round_type === 'season'
        ? `Round ${currentRound.round_number}`
        : currentRound?.name || 'Practice Match'
      const fnUrl = import.meta.env.VITE_CREATE_GMAIL_DRAFT_URL
      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `MHC ${roundLabel} — Team Sheets`,
          htmlBody: emailHtml,
        }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      setEmailSent(true)
      setTimeout(() => setEmailSent(false), 4000)
    } catch (err) {
      setEmailError(`Failed to save draft: ${err.message}`)
    } finally {
      setEmailSending(false)
    }
  }

  const downloadTeamTxt = (teamId) => {
    if (!roundData || !currentRound) return
    const roundLabel = currentRound.round_type === 'season'
      ? `R${currentRound.round_number}`
      : (currentRound.name || 'Practice').replace(/\s+/g, '-')
    const players = roundData.selections
      .filter(s => s.team_id === teamId && !s.is_unavailable)
      .sort((a, b) => a.slot_number - b.slot_number)
      .map(s => s.name)
    const content = players.join('\n')
    const link = document.createElement('a')
    link.download = `${teamId}-${roundLabel}.txt`
    link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const downloadAllTxt = () => {
    if (!roundData || !currentRound) return
    const roundLabel = currentRound.round_type === 'season'
      ? `R${currentRound.round_number}`
      : (currentRound.name || 'Practice').replace(/\s+/g, '-')
    teams.forEach((team, i) => setTimeout(() => downloadTeamTxt(team.id), i * 100))
  }

  const handleCreateVoteLink = async () => {
    if (!currentRound || !voteTeam) return
    setVoteCreating(true)
    try {
      const roundLabel = currentRound.round_type === 'season'
        ? `Round ${currentRound.round_number}`
        : currentRound.name || 'Practice Match'

      // Check if session already exists
      let session = await getVoteSession(currentRound.id, voteTeam)
      if (!session) {
        const players = (roundData?.selections || [])
          .filter(s => s.team_id === voteTeam && !s.is_unavailable)
          .sort((a, b) => a.slot_number - b.slot_number)
          .map(s => ({ id: s.player_id, name: s.name }))
        await createVoteSession(currentRound.id, voteTeam, { roundLabel, players })
      }
      const baseUrl = window.location.origin
      setVoteLink(`${baseUrl}/vote/${currentRound.id}/${voteTeam}`)
    } catch (e) {
      console.error('Failed to create vote session', e)
    }
    setVoteCreating(false)
  }

  const downloadTeamSheet = (sheet) => {
    const link = document.createElement('a')
    link.download = `MHC-${sheet.roundLabel.replace(/\s+/g, '-')}-${sheet.teamId}.png`
    link.href = sheet.dataUrl
    link.click()
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading round data…</div>

  // ── Shared navbar derived values ──────────────────────────────────────────
  const seasonIdx = seasonRounds.findIndex(r => r.id === currentRound?.id)
  const prevSeason = seasonIdx > 0 ? seasonRounds[seasonIdx - 1] : null
  const nextSeason = seasonIdx >= 0 && seasonIdx < seasonRounds.length - 1 ? seasonRounds[seasonIdx + 1] : null
  const nextSeasonNum = seasonRounds.length > 0 ? Math.max(...seasonRounds.map(r => r.round_number)) + 1 : 1
  const fmtDay = d => {
    if (!d) return null
    const dt = new Date(d + 'T00:00:00')
    const dayName = dt.toLocaleDateString('en-AU', { weekday: 'short' })
    const dayNum  = dt.toLocaleDateString('en-AU', { day: 'numeric' })
    const mon     = dt.toLocaleDateString('en-AU', { month: 'short' })
    return `${dayName} ${dayNum} ${mon}`
  }
  const satStr = fmtDay(currentRound?.sat_date)
  const sunStr = fmtDay(currentRound?.sun_date)
  const dateStr = satStr && sunStr ? `${satStr} – ${sunStr}` : satStr || sunStr || null
  const roundWord = currentRound ? `Round ${currentRound.round_number}` : 'No rounds'
  const seasonLabel = currentRound ? `${roundWord}${dateStr ? `  ·  ${dateStr}` : ''}` : 'No rounds'

  // ── Shared ··· overflow menu ──────────────────────────────────────────────
  const MenuItem = ({ onClick, Icon, label, colour = 'text-slate-700', mobileHide = false }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors
                  ${colour} ${mobileHide ? 'hidden sm:flex' : ''}`}
    >
      <Icon size={15} strokeWidth={1.75} className="flex-shrink-0 opacity-60" />
      {label}
    </button>
  )

  const overflowMenu = (
    <div className="relative">
      <button
        onClick={() => setShowOverflowMenu(!showOverflowMenu)}
        className="w-9 h-9 sm:w-7 sm:h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm"
      >···</button>

      {showOverflowMenu && (
        <div
          className="absolute right-0 top-10 sm:top-8 z-50 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
          onMouseLeave={() => setShowOverflowMenu(false)}
        >

          {/* ── Export ── */}
          <div className="px-4 pt-2 pb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Export</span>
          </div>
          {currentRound && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); openTeamSheetModal() }}
              Icon={Image}
              label="Team Sheets"
            />
          )}
          {currentRound && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); openEmailModal() }}
              Icon={Mail}
              label="Email Digest"
            />
          )}
          {currentRound && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); setTxtTeams(teams.map(t => t.id)); setShowTxtModal(true) }}
              Icon={FileText}
              label="Player Lists"
            />
          )}

          {/* ── Voting ── */}
          {currentRound && isAdmin && (
            <>
              <div className="border-t border-slate-100 mt-1" />
              <div className="px-4 pt-2 pb-1">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Voting</span>
              </div>
              <MenuItem
                onClick={() => { setShowOverflowMenu(false); setVoteTeam(null); setVoteLink(null); setShowVoteModal(true) }}
                Icon={Vote}
                label="Voting links"
                colour="text-indigo-600"
              />
              <MenuItem
                onClick={() => { setShowOverflowMenu(false); setShowVoteResults(true) }}
                Icon={Vote}
                label="Vote results"
                colour="text-indigo-400"
              />
            </>
          )}

          {/* ── Rounds ── */}
          <div className="border-t border-slate-100 mt-1" />
          <div className="px-4 pt-2 pb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rounds</span>
          </div>
          {currentRound && plannerMode === 'season' && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); setCarryForwardTeams(teams.map(t => t.id)); setCarryForwardResult(null); setShowCarryForwardModal(true) }}
              Icon={ArrowLeftRight}
              label="Carry forward"
              colour="text-blue-700"
            />
          )}
          {plannerMode === 'season'
            ? <MenuItem onClick={() => { setShowOverflowMenu(false); switchToPractice() }} Icon={ChevronRight} label="Practice rounds" colour="text-purple-600" />
            : <MenuItem onClick={() => { setShowOverflowMenu(false); switchToSeason() }} Icon={ChevronRight} label="Season rounds" />
          }
          {currentRound && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); setShowCopyModal(true) }}
              Icon={Copy}
              label="Copy to new round"
            />
          )}
          <MenuItem
            onClick={() => { setShowOverflowMenu(false); setShowNewRoundModal(true) }}
            Icon={Plus}
            label="New blank round"
          />
          {currentRound && (
            <MenuItem
              onClick={() => { setShowOverflowMenu(false); setRenameValue(currentRound.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound.name); setShowRenameModal(true) }}
              Icon={Pencil}
              label="Rename round"
            />
          )}

          {/* ── Danger ── */}
          {currentRound && (
            <>
              <div className="border-t border-slate-100 mt-1" />
              <MenuItem
                onClick={() => { setShowOverflowMenu(false); setShowDeleteConfirm(true) }}
                Icon={Trash2}
                label="Delete round"
                colour="text-red-600"
              />
            </>
          )}
        </div>
      )}
    </div>
  )

  // ── Unavailability Sync ───────────────────────────────────────────────────
  const handleSyncUnavailability = async () => {
    setSyncLoading(true)
    setSyncStaged(null)
    setSyncAliases({})
    setShowSyncModal(true)
    try {
      const idToken = await auth.currentUser?.getIdToken()
      const url = import.meta.env.VITE_SYNC_UNAVAIL_URL
      const res = await fetch(url, {
        headers: idToken ? { 'Authorization': `Bearer ${idToken}` } : {},
      })
      const data = await res.json()
      if (data.ok) setSyncStaged(data)
      else setSyncStaged({ error: data.error || 'Sync failed' })
    } catch (e) {
      setSyncStaged({ error: e.message })
    }
    setSyncLoading(false)
  }

  const handleConfirmSync = async () => {
    if (!syncStaged?.staged) return
    setSyncConfirming(true)
    try {
      // Include new matched entries + any unmatched that the user has resolved via the alias dropdown
      const resolvedUnmatched = (syncStaged.unmatched || [])
        .filter(u => syncAliases[u.sheet_name] && syncAliases[u.sheet_name] !== '')
        .map(u => {
          const player = allPlayers.find(p => p.name === syncAliases[u.sheet_name])
          if (!player) return null
          return { player_id: player.id, round_id: u.round_id, day: u.day, sheet_name: u.sheet_name }
        })
        .filter(Boolean)
      const entries = [
        ...syncStaged.staged.filter(s => s.is_new).map(s => ({
          player_id: s.player_id, round_id: s.round_id, day: s.day, sheet_name: s.sheet_name
        })),
        ...resolvedUnmatched,
      ]
      const idToken = await auth.currentUser?.getIdToken()
      const res = await fetch(import.meta.env.VITE_CONFIRM_UNAVAIL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ entries, aliases: syncAliases }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowSyncModal(false)
        setSyncStaged(null)
        // Unavailability listener will auto-update the planner
      }
    } catch (e) {
      console.error('Confirm sync failed', e)
    }
    setSyncConfirming(false)
  }

  return (
      <div className="p-3 sm:p-4 space-y-3">
        {/* ── Navbar ── */}

        {/* Desktop — single row (unchanged feel) */}
        <div className="hidden sm:flex items-center gap-2 min-w-0">
          {plannerMode === 'season' ? (
            <>
              <button onClick={() => prevSeason && actions.setCurrentRound(prevSeason)} disabled={!prevSeason} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-25 text-sm font-bold flex-shrink-0">‹</button>
              <span className="text-lg font-bold text-slate-800 truncate min-w-0">{seasonLabel}</span>
              {!nextSeason ? (
                <button onClick={() => setShowAdvanceModal(true)} className="px-2.5 h-7 flex items-center rounded border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-semibold flex-shrink-0">Round {nextSeasonNum} →</button>
              ) : (
                <button onClick={() => actions.setCurrentRound(nextSeason)} className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-sm font-bold flex-shrink-0">›</button>
              )}

            </>
          ) : (
            <>
              <button onClick={switchToSeason} className="px-2.5 h-7 flex items-center rounded border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 text-xs font-medium flex-shrink-0">← Season</button>
              {practiceRounds.length === 0
                ? <span className="text-xs text-slate-400">No practice rounds yet</span>
                : practiceRounds.map(r => (
                  <button key={r.id} onClick={() => actions.setCurrentRound(r)} className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${currentRound?.id === r.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>{r.name || 'Practice'}</button>
                ))
              }
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
            {/* Unavailability sync button — admin only, desktop only */}
            {isAdmin && currentRound && (
              <button
                onClick={handleSyncUnavailability}
                className="hidden sm:flex items-center gap-1.5 text-xs border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 bg-white rounded px-2.5 h-7 transition-colors font-medium"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
                Sync unavailability
              </button>
            )}
            {/* Column count toggle — desktop only */}
            <div className="hidden sm:flex items-center gap-1.5">
              <span className="text-xs text-slate-400 font-medium">Teams</span>
            <div className="flex items-center gap-0.5 border border-slate-200 rounded bg-white p-0.5">
              {[3, 4, 5, 6].map(n => (
                <button
                  key={n}
                  onClick={() => { setColumnCount(n); localStorage.setItem('mhc-planner-columns', n) }}
                  className={`w-7 h-6 text-xs font-semibold rounded transition-colors ${columnCount === n ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-700'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            </div>
            {overflowMenu}
          </div>
        </div>

        {/* Mobile — round nav row */}
        <div className="flex sm:hidden items-center gap-2 min-w-0">
          {plannerMode === 'season' ? (
            <>
              <button onClick={() => prevSeason && actions.setCurrentRound(prevSeason)} disabled={!prevSeason} className="w-9 h-9 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 disabled:opacity-25 text-base font-bold flex-shrink-0">‹</button>
              <span className="flex-1 text-sm font-bold text-slate-800 text-center truncate">{seasonLabel}</span>
              {!nextSeason ? (
                <button onClick={() => setShowAdvanceModal(true)} className="px-2.5 h-9 flex items-center rounded border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold flex-shrink-0">Round {nextSeasonNum}→</button>
              ) : (
                <button onClick={() => actions.setCurrentRound(nextSeason)} className="w-9 h-9 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 text-base font-bold flex-shrink-0">›</button>
              )}

            </>
          ) : (
            <>
              <button onClick={switchToSeason} className="px-2.5 h-9 flex items-center rounded border border-slate-200 bg-white text-slate-600 text-xs font-medium flex-shrink-0">← Season</button>
              <div className="flex-1 flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                {practiceRounds.map(r => (
                  <button key={r.id} onClick={() => actions.setCurrentRound(r)} className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-medium border ${currentRound?.id === r.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-slate-600 border-slate-200'}`}>{r.name || 'Practice'}</button>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {overflowMenu}
          </div>
        </div>

        {/* ── Team Filter ── */}
        {currentRound && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              <button onClick={() => setTeamFilter(new Set())} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${teamFilter.size === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>All</button>
              {teams.map(t => (
                  <button key={t.id} onClick={() => setTeamFilter(prev => {
                    const next = new Set(prev)
                    next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                    return next
                  })} className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${teamFilter.has(t.id) ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-200'}`}>{t.id}</button>
              ))}
            </div>
        )}

        {!currentRound && <div className="text-slate-500 text-sm">No rounds yet. Create one to get started.</div>}

        {/* ── Unavailability Banner (collapsible) ── */}
        {currentRound && Object.keys(roundUnavailability).length > 0 && (() => {
          const unavailPlayers = allPlayers.filter(p => roundUnavailability[p.id]).sort((a, b) => a.name.localeCompare(b.name))
          const autoOpen = unavailPlayers.length <= 3
          const isOpen = unavailOpen !== null ? unavailOpen : autoOpen
          return (
            <div className="rounded border border-red-200 bg-red-50 overflow-hidden">
              <button
                onClick={() => setUnavailOpen(v => v === null ? !autoOpen : !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left"
              >
                <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">Unavailable</span>
                <span className="text-xs bg-red-200 text-red-700 px-1.5 py-0.5 rounded font-semibold">{unavailPlayers.length}</span>
                <span className="ml-auto text-red-400 text-xs">{isOpen ? '▲' : '▼'}</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                  {unavailPlayers.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 text-xs bg-white border border-red-200 text-red-700 rounded px-2 py-0.5 cursor-pointer hover:bg-red-100" onClick={() => onSelectPlayer && onSelectPlayer(p)}>
                      {p.name} <span className="text-red-400 font-medium">{roundUnavailability[p.id] === 'sat' ? 'Sat' : roundUnavailability[p.id] === 'sun' ? 'Sun' : 'Both'}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })()}

        {/* ── Grid Columns (This is where TeamColumn is used!) ── */}
        {currentRound && (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: window.innerWidth < 640 ? '1fr' : `repeat(${columnCount}, minmax(0, 1fr))` }}
              onDragOver={e => {
                // Delegate to the column under the cursor — critical for second-row columns
                // where the drag can slip into the grid gap area between rows and bypass
                // each column's own onDragOver, leaving dragOverInfo stale.
                e.preventDefault()
                const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-team-id]')
                if (col) {
                  const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-player-id]')
                  if (row) {
                    actions.handleDragOverRow(e, col.dataset.teamId, row.dataset.playerId)
                  } else {
                    actions.handleDragOverColumn(e, col.dataset.teamId)
                  }
                }
              }}
              onDrop={e => {
                // Fallback drop handler — delegates to correct column/row using elementFromPoint
                const col = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-team-id]')
                if (col) {
                  const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-player-id]')
                  actions.handleDrop(e, col.dataset.teamId, row?.dataset.playerId ?? null)
                } else {
                  e.preventDefault()
                  actions.handleDragEnd()
                }
              }}
            >
              {teams.filter(t => teamFilter.size === 0 || teamFilter.has(t.id)).map(team => (
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
            <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
              <div className="bg-white rounded-t-xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                  <h3 className="font-semibold text-slate-800">Add player — {pickerOpen.teamId}</h3>
                  <button onClick={() => setPickerOpen(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
                </div>
                <div className="px-4 py-2 border-b border-slate-100">
                  <input ref={searchRef} value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} placeholder="Search players…" className="w-full text-sm border border-slate-200 rounded px-3 py-2" />
                  {/* Team filter row */}
                  <div className="flex gap-2 mt-2 flex-wrap items-center">
                    <button onClick={() => setPickerTeamFilter(null)} className={`text-xs px-2 py-1 rounded ${!pickerTeamFilter ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>All</button>
                    {teams.map(t => <button key={t.id} onClick={() => setPickerTeamFilter(t.id)} className={`text-xs px-2 py-1 rounded ${pickerTeamFilter === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.id}</button>)}
                    {Object.keys(roundUnavailability).length > 0 && (
                        <button onClick={() => setShowUnavailableInPicker(v => !v)} className={`ml-auto text-xs px-2 py-1 rounded flex items-center gap-1 ${showUnavailableInPicker ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'}`}>
                          {showUnavailableInPicker ? 'Hide' : 'Show'} unavailable
                        </button>
                    )}
                  </div>
                  {/* Status chips — OR logic, click to toggle */}
                  <div className="flex gap-2 mt-1.5 flex-wrap items-center">
                    {[
                      {
                        key: 'playing',
                        label: 'Playing',
                        icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>,
                      },
                      {
                        key: 'games',
                        label: 'Has games',
                        icon: <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>,
                      },
                    ].map(f => {
                      const active = activeChips.has(f.key)
                      return (
                        <button key={f.key} onClick={() => setActiveChips(prev => {
                          const next = new Set(prev)
                          active ? next.delete(f.key) : next.add(f.key)
                          return next
                        })} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-100 text-slate-600 border-transparent'}`}>
                          {f.icon}{f.label}
                        </button>
                      )
                    })}
                    <button onClick={() => setNotInRoundFilter(v => !v)} className={`ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded font-medium ${notInRoundFilter ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z"/></svg>
                      Not in round
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1">
                  {availablePlayers.map(p => {
                    const isSelected = selectedPlayerIds.has(p.id)
                    const unavail = roundUnavailability[p.id]
                    const teamMatch = roundData?.matches?.find(m => m.team_id === pickerOpen?.teamId)
                    const matchDay = teamMatch?.match_date === currentRound?.sat_date ? 'sat'
                                   : teamMatch?.match_date === currentRound?.sun_date ? 'sun'
                                   : null
                    const unavailStatus = !unavail ? null
                                       : unavail === 'both' ? 'red'
                                       : matchDay && unavail !== matchDay ? 'purple'
                                       : 'red'
                    const unavailLabel = unavailStatus === 'purple'
                                       ? (unavail === 'sat' ? 'Sun only' : 'Sat only')
                                       : unavailStatus === 'red' ? 'unavailable' : null
                    return (
                        <div key={p.id} onClick={() => { const next = new Set(selectedPlayerIds); isSelected ? next.delete(p.id) : next.add(p.id); setSelectedPlayerIds(next) }} className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-slate-100 text-sm ${isSelected ? 'bg-blue-50' : unavailStatus === 'red' ? 'bg-red-50 opacity-60' : unavailStatus === 'purple' ? 'bg-purple-50' : 'hover:bg-slate-50'}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300'}`}>{isSelected && '✓'}</div>
                          <span className={`flex-1 ${unavailStatus === 'red' ? 'line-through text-slate-400' : ''}`}>{p.name}</span>
                          {unavailLabel && <span className={`text-xs ${unavailStatus === 'purple' ? 'text-purple-500' : 'text-red-400'}`}>{unavailLabel}</span>}
                          {p.status_id && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: getStatusColor(p.status_id) }} />}
                        </div>
                    )
                  })}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs text-slate-500">{selectedPlayerIds.size} selected</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowQuickAddPlayer(true)
                        setQuickAddError('')
                        setQuickAddName('')
                        setQuickAddNotes('')
                      }}
                      className="px-3 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    >
                      + Add new player
                    </button>
                    <button onClick={() => { setPickerOpen(null); setSearchTerm(''); setSelectedPlayerIds(new Set()) }} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
                    <button onClick={() => { actions.addPlayers(pickerOpen.teamId, [...selectedPlayerIds]); setPickerOpen(null); setSelectedPlayerIds(new Set()) }} disabled={selectedPlayerIds.size === 0} className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-40">Add</button>
                  </div>
                </div>
              </div>
            </div>
        )}

        {showQuickAddPlayer && pickerOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-800">Add new player</h3>
                <button
                  onClick={() => setShowQuickAddPlayer(false)}
                  className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>
              <p className="text-xs text-slate-500">Create and add directly to {pickerOpen.teamId} for this round.</p>
              {quickAddError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2.5 py-1.5">
                  {quickAddError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Name</label>
                <input
                  autoFocus
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleQuickAddPlayer()
                    }
                  }}
                  placeholder="Player name"
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Notes (optional)</label>
                <textarea
                  value={quickAddNotes}
                  onChange={(e) => setQuickAddNotes(e.target.value)}
                  rows={3}
                  placeholder="Any context for this player"
                  className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setShowQuickAddPlayer(false)}
                  className="px-4 py-2 text-sm text-slate-600"
                  disabled={quickAddSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuickAddPlayer}
                  disabled={quickAddSaving}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
                >
                  {quickAddSaving ? 'Adding…' : 'Create + Add'}
                </button>
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

        {showTxtModal && (() => {
          const allTicked = txtTeams.length === teams.length
          return (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold">Export player lists</h3>
                  <p className="text-sm text-slate-500 mt-1">Downloads one .txt file per selected team</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-500">Select teams</span>
                    <button onClick={() => setTxtTeams(allTicked ? [] : teams.map(t => t.id))} className="text-xs text-blue-600">{allTicked ? 'Deselect all' : 'Select all'}</button>
                  </div>
                  {teams.map(t => {
                    const count = roundData?.selections.filter(s => s.team_id === t.id && !s.is_unavailable).length || 0
                    return (
                      <label key={t.id} className="flex items-center gap-3 px-3 py-2 border rounded cursor-pointer">
                        <input type="checkbox" checked={txtTeams.includes(t.id)} onChange={() => setTxtTeams(prev => prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id])} className="w-4 h-4" />
                        <span className="text-sm flex-1">{t.id}</span>
                        <span className="text-xs text-slate-400">{count} players</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { txtTeams.forEach((tid, i) => setTimeout(() => downloadTeamTxt(tid), i * 100)); setShowTxtModal(false) }} disabled={txtTeams.length === 0} className="flex-1 py-2 bg-blue-600 text-white rounded disabled:opacity-40">Download</button>
                  <button onClick={() => setShowTxtModal(false)} className="flex-1 py-2 border rounded">Cancel</button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Email Digest Modal ── */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mt-4 mb-8">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h3 className="font-semibold text-lg">Email Digest</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Preview below — copy and paste into your email client</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([emailHtml], { type: 'text/html' }) })])
                        .then(() => setEmailSent(true))
                        .catch(() => {})
                    }}
                    className={`px-4 py-2 text-sm rounded font-medium transition-colors flex items-center gap-2 ${
                      emailSent ? 'bg-green-600 text-white' : 'bg-blue-700 text-white hover:bg-blue-800'
                    }`}
                  >
                    {emailSent ? '✓ Copied!' : '⎘ Copy to Clipboard'}
                  </button>
                  <button onClick={() => { setShowEmailModal(false); setEmailSent(false) }} className="text-2xl leading-none text-slate-400 hover:text-slate-600">×</button>
                </div>
              </div>

              {/* Error */}
              {emailError && (
                <div className="mx-6 mt-4 px-4 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {emailError}
                </div>
              )}

              {/* iframe preview */}
              <div className="p-4">
                <iframe
                  srcDoc={emailHtml}
                  title="Email Preview"
                  className="w-full border border-slate-200 rounded-lg"
                  style={{ height: '60vh' }}
                  sandbox="allow-same-origin"
                />
              </div>

            </div>
          </div>
        )}

        {/* ── Team Sheet Modal ── */}
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

        {/* ── Unavailability Sync Modal ── */}
        {showSyncModal && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <h3 className="font-semibold text-slate-800">Unavailability Sync</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Review before importing</p>
                  </div>
                  <button onClick={() => setShowSyncModal(false)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">×</button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

                  {/* Loading */}
                  {syncLoading && (
                    <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Reading sheet…
                    </div>
                  )}

                  {/* Error */}
                  {syncStaged?.error && (
                    <div className="bg-red-50 border border-red-200 rounded px-4 py-3 text-sm text-red-700">
                      {syncStaged.error}
                    </div>
                  )}

                  {/* Results */}
                  {syncStaged && !syncStaged.error && (
                    <>
                      {/* Summary bar */}
                      <div className="flex items-center gap-3 text-sm">
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-semibold">
                          🆕 {syncStaged.new_count} new
                        </span>
                        <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                          {syncStaged.total_count - syncStaged.new_count} already imported
                        </span>
                        {syncStaged.unmatched?.length > 0 && (
                          <span className="bg-red-100 text-red-600 px-2.5 py-1 rounded-full">
                            ⚠️ {syncStaged.unmatched.length} unmatched
                          </span>
                        )}
                      </div>

                      {/* New entries */}
                      {syncStaged.staged?.filter(s => s.is_new).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">New since last sync</p>
                          <div className="border border-slate-200 rounded overflow-hidden">
                            {syncStaged.staged.filter(s => s.is_new).map((s, i) => (
                              <div key={i} className={`flex items-center gap-3 px-3 py-2 text-sm ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                                <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                                <span className="flex-1 font-medium text-slate-800">{s.player_name}</span>
                                <span className="text-slate-400 text-xs">{s.round_label}</span>
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${s.day === 'both' ? 'bg-red-100 text-red-600' : s.day === 'sat' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {s.day === 'both' ? 'Both' : s.day === 'sat' ? 'Sat' : 'Sun'}
                                </span>
                                {s.confidence === 'fuzzy' && (
                                  <span className="text-xs text-purple-500" title={`Sheet: "${s.fuzzy_from}"`}>~fuzzy</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Already imported — collapsed */}
                      {syncStaged.staged?.filter(s => !s.is_new).length > 0 && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            Already imported ({syncStaged.staged.filter(s => !s.is_new).length})
                          </summary>
                          <div className="mt-2 border border-slate-100 rounded overflow-hidden">
                            {syncStaged.staged.filter(s => !s.is_new).map((s, i) => (
                              <div key={i} className={`flex items-center gap-3 px-3 py-2 text-sm text-slate-400 ${i > 0 ? 'border-t border-slate-100' : ''}`}>
                                <span className="w-2 h-2 rounded-full bg-slate-300 flex-shrink-0" />
                                <span className="flex-1">{s.player_name}</span>
                                <span className="text-xs">{s.round_label}</span>
                                <span className="text-xs">{s.day}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}

                      {/* Unmatched names */}
                      {syncStaged.unmatched?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2">⚠️ Unmatched names — link manually or skip</p>
                          <div className="border border-red-200 rounded overflow-hidden">
                            {syncStaged.unmatched.map((u, i) => (
                              <div key={i} className={`flex items-center gap-3 px-3 py-2 text-sm ${i > 0 ? 'border-t border-red-100' : ''}`}>
                                <span className="flex-1 text-red-500 font-medium">{u.sheet_name}</span>
                                <span className="text-slate-400 text-xs">{u.date} {u.day}</span>
                                <select
                                  value={syncAliases[u.sheet_name] || ''}
                                  onChange={e => setSyncAliases(prev => ({ ...prev, [u.sheet_name]: e.target.value }))}
                                  className="text-xs border border-slate-200 rounded px-2 py-1 max-w-[140px]"
                                >
                                  <option value="">Skip</option>
                                  {allPlayers.filter(p => p.is_active !== 0).sort((a,b) => a.name.localeCompare(b.name)).map(p => (
                                    <option key={p.id} value={p.name}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {syncStaged.new_count === 0 && syncStaged.unmatched?.length === 0 && (
                        <div className="text-center text-slate-500 text-sm py-6">
                          ✅ All entries already imported — nothing new to add.
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Footer */}
                {syncStaged && !syncStaged.error && syncStaged.new_count > 0 && (
                  <div className="px-5 py-4 border-t flex items-center justify-between gap-3">
                    <span className="text-xs text-slate-400">{syncStaged.new_count} new entries will be imported</span>
                    <div className="flex gap-2">
                      <button onClick={() => setShowSyncModal(false)} className="px-4 py-2 text-sm text-slate-600 border rounded hover:bg-slate-50">Cancel</button>
                      <button
                        onClick={handleConfirmSync}
                        disabled={syncConfirming}
                        className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-40 font-medium"
                      >
                        {syncConfirming ? 'Importing…' : `Import ${syncStaged.new_count} new`}
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
        )}

        {/* ── Vote Results Modal ── */}
        {showVoteResults && currentRound && (
          <VoteResults
            roundId={currentRound.id}
            teams={teams}
            roundLabel={currentRound.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound.name || 'Practice'}
            onClose={() => setShowVoteResults(null)}
          />
        )}

        {/* ── Create Voting Link Modal ── */}
        {showVoteModal && currentRound && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-lg">Voting links</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {currentRound.round_type === 'season' ? `Round ${currentRound.round_number}` : currentRound.name}
                </p>
              </div>

              {/* Team picker */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Select team</p>
                <div className="grid grid-cols-3 gap-2">
                  {teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setVoteTeam(t.id); setVoteLink(null) }}
                      className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        voteTeam === t.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      {t.id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Link area */}
              {voteTeam && (
                voteLink ? (
                  <div className="space-y-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600 break-all font-mono">
                      {voteLink}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(voteLink)}
                      className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium"
                    >
                      Copy link
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleCreateVoteLink}
                    disabled={voteCreating}
                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {voteCreating ? 'Creating…' : `Generate link for ${voteTeam}`}
                  </button>
                )
              )}

              <button
                onClick={() => { setShowVoteModal(false); setVoteLink(null); setVoteTeam(null) }}
                className="w-full py-2 border rounded-lg text-sm text-slate-600"
              >
                Close
              </button>
            </div>
          </div>
        )}

      </div>
  )
}