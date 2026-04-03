import { useState, useEffect } from 'react'
import { getPlayer, updatePlayer, getRounds, getUnavailability, addUnavailability, removeUnavailability, updateUnavailabilityDays } from '../db'

// ── Constants mirroring the survey ─────────────────────────────────────────
const PLAYER_TYPES = [
  { value: '',                   label: 'Not set' },
  { value: 'new',                label: '🏑 New to hockey' },
  { value: 'played_recently',    label: '🔄 Played recently' },
  { value: 'returning',          label: '👋 Returning after a break' },
]

const INTERESTED_IN = [
  { value: '',            label: 'Not set' },
  { value: 'competitive', label: '🏆 Competitive' },
  { value: 'social',      label: '😊 Bit more relaxed / Social' },
]

const UNSURE_REASONS = [
  { value: '',            label: 'Not set' },
  { value: 'work_study',  label: '💼 Work / Study' },
  { value: 'family',      label: '👨‍👩‍👧 Family commitments' },
  { value: 'injury',      label: '🤕 Injury / Fitness' },
  { value: 'motivation',  label: '😔 Motivation' },
  { value: 'other',       label: '❓ Other' },
]

const PREFERENCE_OPTIONS = [
  { value: '',           label: 'Not set' },
  { value: 'move_up',    label: '📈 Play the highest level I can' },
  { value: 'stay',       label: '👍 Happy where I was' },
  { value: 'step_back',  label: '😌 Step back / Play more social' },
]

// ── Helper ─────────────────────────────────────────────────────────────────
const Field = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {hint && <span className="ml-1 text-xs font-normal text-gray-400">{hint}</span>}
    </label>
    {children}
  </div>
)

const Select = ({ value, onChange, options, className = '', style }) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    style={style}
    className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${className}`}
  >
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

// ── Section wrapper with subtle heading ────────────────────────────────────
const Section = ({ title, children }) => (
  <div className="space-y-3">
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{title}</p>
    {children}
  </div>
)

// ── Divider ────────────────────────────────────────────────────────────────
const Divider = () => <hr className="border-gray-100" />


export default function PlayerModal({ player, teams, statuses, onClose, onPlayerUpdated }) {
  const [form, setForm] = useState({
    name:                  player.name,
    is_active:             player.is_active === 0 ? false : true,
    status_id:             player.status_id,
    assigned_team_id_2026: player.assigned_team_id_2026 || '',
    notes:                 player.notes || '',
    is_new_registration:   player.is_new_registration === 1,
    is_international:      player.is_international === 1,
    needs_visa:            player.needs_visa === 1,
    // Survey fields
    player_type:           player.player_type || '',
    interested_in:         player.interested_in || '',
    previous_club:         player.previous_club || '',
    follow_up_ok:          player.follow_up_ok === null ? '' : (player.follow_up_ok ? 'yes' : 'no'),
    unsure_reason:         player.unsure_reason || '',
    playing_preference:    player.playing_preference || '',
  })
  const [history, setHistory] = useState([])
  const [saving, setSaving] = useState(false)
  const [rounds, setRounds] = useState([])
  const [unavailMap, setUnavailMap] = useState({}) // roundId → 'sat'|'sun'|'both'

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    getPlayer(player.id)
      .then(data => setHistory(data?.history || []))
    getRounds()
      .then(setRounds)
    getUnavailability({ player_id: player.id })
      .then(data => {
        const map = {}
        // Use string keys to match r.id (which may be a Firestore string auto-ID)
        data.forEach(u => { map[String(u.round_id)] = u.days || 'both' })
        setUnavailMap(map)
      })
  }, [player.id])

  // Toggle a day for a round. day = 'sat' | 'sun'
  // Logic: if no record → add with that day. If record exists, toggle that day in/out.
  // If both days removed → delete the record entirely.
  const toggleDay = async (roundId, day) => {
    const current = unavailMap[roundId] // undefined | 'sat' | 'sun' | 'both'

    let next // what the new value should be, or null = remove record
    if (!current) {
      next = day
    } else if (current === 'both') {
      next = day === 'sat' ? 'sun' : 'sat'
    } else if (current === day) {
      next = null // removing the only day → fully available
    } else {
      next = 'both' // was 'sat', clicking 'sun' → both
    }

    // Optimistic update
    setUnavailMap(prev => {
      const m = { ...prev }
      if (next === null) delete m[roundId]
      else m[roundId] = next
      return m
    })

    if (next === null) {
      await removeUnavailability(player.id, roundId)
    } else if (!current) {
      await addUnavailability({ player_id: player.id, round_id: roundId, days: next })
    } else {
      await updateUnavailabilityDays(player.id, roundId, next)
    }
  }

  // ── Conditional display logic — mirrors the actual survey exactly ──────
  // Source of truth is status_id, not the is_new_registration toggle
  const isNew         = form.status_id === 'new'          // "New to club/restarting"
  const isPlanning    = form.status_id === 'planning'
  const isFillIn      = form.status_id === 'fill_in'
  const isUnsure      = form.status_id === 'unsure'
  const isUnlikely    = form.status_id === 'unlikely'
  const notHeard      = form.status_id === 'not_heard'
  const notReturning  = form.status_id === 'not_returning'

  // Follow up shown for: unsure, unlikely only
  const showFollowUp  = isUnsure || isUnlikely

  // Unsure reason shown only for unsure
  const showUnsureReason = isUnsure

  // Playing preference shown for planning only
  const showPref      = isPlanning

  // New registration survey block — only when status = new
  const showPlayerType   = isNew
  const showInterestedIn = isNew
  const showPrevClub     = isNew && (form.player_type === 'played_recently' || form.player_type === 'returning')

  // No survey fields at all for: not_heard, not_returning
  const hasSurveyFields = !notHeard && !notReturning

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    await updatePlayer(player.id, {
      name:                  form.name.trim(),
      is_active:             form.is_active,
      status_id:             form.status_id || null,
      assigned_team_id_2026: form.assigned_team_id_2026 || null,
      notes:                 form.notes || null,
      default_position:      player.default_position || null,
      is_new_registration:   form.is_new_registration,
      is_international:      form.is_international,
      needs_visa:            form.needs_visa,
      player_type:           form.player_type || null,
      interested_in:         form.interested_in || null,
      previous_club:         form.previous_club || null,
      follow_up_ok:          form.follow_up_ok === 'yes' ? true : form.follow_up_ok === 'no' ? false : null,
      unsure_reason:         form.unsure_reason || null,
      playing_preference:    form.playing_preference || null,
    })
    setSaving(false)
    onPlayerUpdated?.()
    onClose()
  }

  const currentStatus = statuses.find(s => s.id === form.status_id)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10">
          <div className="flex-1 mr-4">
            {/* Editable name */}
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="text-xl font-semibold text-gray-800 w-full border-0 border-b-2 border-transparent focus:border-blue-400 focus:outline-none bg-transparent pb-0.5 transition-colors"
            />
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {/* Active / Inactive toggle */}
              <button
                onClick={() => set('is_active', !form.is_active)}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  form.is_active
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${form.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                {form.is_active ? 'Active' : 'Inactive'}
              </button>
              {isNew && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700">New Registration</span>
              )}
              {form.is_international && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">🌏 International</span>
              )}
              {form.needs_visa && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">Needs Visa</span>
              )}
            </div>
            {!form.is_active && (
              <p className="text-xs text-gray-400 mt-1">This player won't appear in selection lists</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none flex-shrink-0">×</button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5">

          {/* ── 2026 Status & Assignment ── */}
          <Section title="2026 Season">
            <Field label="Status">
              <Select
                value={form.status_id}
                onChange={v => set('status_id', v)}
                options={statuses.map(s => ({ value: s.id, label: s.label }))}
                className="border-l-4"
                style={{ borderLeftColor: currentStatus?.color }}
              />
            </Field>

            <Field label="2026 Team Assignment">
              <select
                value={form.assigned_team_id_2026}
                onChange={e => set('assigned_team_id_2026', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Not assigned</option>
                {teams.filter(t => t.id !== 'NEW').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
          </Section>

          <Divider />

          {/* ── International ── */}
          <Section title="International">
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  role="switch"
                  aria-checked={form.is_international}
                  tabIndex={0}
                  onClick={() => set('is_international', !form.is_international)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      set('is_international', !form.is_international);
                    }
                  }}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${form.is_international ? 'bg-amber-500' : 'bg-gray-200'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_international ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-sm font-medium text-gray-700">International player</span>
              </label>

              {form.is_international && (
                <label className="flex items-center gap-3 cursor-pointer ml-1">
                  <div
                    role="switch"
                    aria-checked={form.needs_visa}
                    tabIndex={0}
                    onClick={() => set('needs_visa', !form.needs_visa)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        set('needs_visa', !form.needs_visa);
                      }
                    }}
                    className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${form.needs_visa ? 'bg-red-500' : 'bg-gray-200'}`}
                  >
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.needs_visa ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Needs visa</span>
                </label>
              )}
            </div>
          </Section>

          <Divider />
          {hasSurveyFields && (
            <>
              <Section title="Survey Responses">

                {/* New to club/restarting path */}
                {showPlayerType && (
                  <Field label="What best describes you?">
                    <Select
                      value={form.player_type}
                      onChange={v => set('player_type', v)}
                      options={PLAYER_TYPES}
                    />
                  </Field>
                )}

                {showInterestedIn && (
                  <Field label="Interested in playing">
                    <Select
                      value={form.interested_in}
                      onChange={v => set('interested_in', v)}
                      options={INTERESTED_IN}
                    />
                  </Field>
                )}

                {showPrevClub && (
                  <Field label="Club and level last played">
                    <input
                      type="text"
                      value={form.previous_club}
                      onChange={e => set('previous_club', e.target.value)}
                      placeholder="e.g. Mentone, PL..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                )}

                {/* Playing preference — planning + fill-in returning players only */}
                {showPref && (
                  <Field label="Playing preference">
                    <Select
                      value={form.playing_preference}
                      onChange={v => set('playing_preference', v)}
                      options={PREFERENCE_OPTIONS}
                    />
                  </Field>
                )}

                {/* Unsure reason — unsure only */}
                {showUnsureReason && (
                  <Field label="Main reason for being unsure">
                    <Select
                      value={form.unsure_reason}
                      onChange={v => set('unsure_reason', v)}
                      options={UNSURE_REASONS}
                    />
                  </Field>
                )}

                {/* Follow up — unsure + unlikely only */}
                {showFollowUp && (
                  <Field label="Happy for a follow up?">
                    <div className="flex gap-3">
                      {['yes', 'no', ''].map((v, i) => (
                        <button
                          key={i}
                          onClick={() => set('follow_up_ok', v)}
                          className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                            form.follow_up_ok === v
                              ? v === 'yes' ? 'bg-green-600 text-white border-green-600'
                              : v === 'no'  ? 'bg-red-500 text-white border-red-500'
                              : 'bg-gray-200 text-gray-600 border-gray-200'
                              : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                          }`}
                        >
                          {v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Not set'}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}

              </Section>
              <Divider />
            </>
          )}

          {/* ── 2025 History ── */}
          {!isNew && (
            <>
              <Section title="2025 Season">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Primary team: <span className="font-medium">{player.primary_team_id_2025 || 'N/A'}</span></p>
                    <p>Total games: <span className="font-medium">{player.total_games_2025 || 0}</span></p>
                  </div>
                  {history.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-sm text-gray-500 mb-1">Team breakdown:</p>
                      <ul className="text-sm text-gray-600 space-y-0.5">
                        {history.map((h, i) => (
                          <li key={i} className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${h.role === 'main_squad' ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {h.team_id} — {h.games_played} games
                            <span className="text-gray-400">({h.role === 'main_squad' ? 'main' : 'fill-in'})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
              <Divider />
            </>
          )}

          {/* ── Unavailability ── */}
          <Section title="Round Unavailability">
            {rounds.length === 0
              ? <p className="text-sm text-gray-400">No rounds found</p>
              : (
                <div className="space-y-1">
                  {rounds.filter(r => r.round_type === 'season').map(r => {
                    const rid = String(r.id)
                    const days = unavailMap[rid] // undefined | 'sat' | 'sun' | 'both'
                    const satUnavail = days === 'sat' || days === 'both'
                    const sunUnavail = days === 'sun' || days === 'both'
                    const anyUnavail = !!days

                    const fmtDate = (d) => d
                      ? new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                      : null
                    const satStr = fmtDate(r.sat_date)
                    const sunStr = fmtDate(r.sun_date)

                    return (
                      <div
                        key={rid}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          anyUnavail ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'
                        }`}
                      >
                        {/* Round label */}
                        <span className={`w-10 font-semibold flex-shrink-0 text-xs ${anyUnavail ? 'text-red-700' : 'text-gray-500'}`}>
                          R{r.round_number}
                        </span>

                        {/* Sat button */}
                        <button
                          onClick={() => toggleDay(rid, 'sat')}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors flex-shrink-0 ${
                            satUnavail
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500'
                          }`}
                        >
                          Sat{satStr ? ` ${satStr}` : ''}
                        </button>

                        {/* Sun button — only show if round has a Sunday */}
                        {r.sun_date ? (
                          <button
                            onClick={() => toggleDay(rid, 'sun')}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors flex-shrink-0 ${
                              sunUnavail
                                ? 'bg-red-500 border-red-500 text-white'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-500'
                            }`}
                          >
                            Sun {sunStr}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300 flex-shrink-0">Sun —</span>
                        )}

                        {/* Status label */}
                        <span className={`ml-auto text-xs flex-shrink-0 ${anyUnavail ? 'text-red-500 font-medium' : 'text-gray-300'}`}>
                          {days === 'both' ? 'whole round' : days === 'sat' ? 'Sat only' : days === 'sun' ? 'Sun only' : 'available'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            }
            {Object.keys(unavailMap).length > 0 && (
              <p className="text-xs text-red-500 mt-2">
                Unavailable for {Object.keys(unavailMap).length} round{Object.keys(unavailMap).length !== 1 ? 's' : ''}
              </p>
            )}
          </Section>
          <Divider />

          {/* ── Notes ── */}
          <Section title="Notes">
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Anything else I should know..."
            />
          </Section>

        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl sticky bottom-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
