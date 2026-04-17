import { useState, useEffect } from 'react'
import { getPlayers, createPlayer } from '../db'

// ── Add Player Modal ────────────────────────────────────────────────────────
function AddPlayerModal({ teams, statuses, onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    status_id: 'new',
    assigned_team_id_2026: '',
    playing_preference: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    try {
      const player = await createPlayer({
        name: form.name.trim(),
        assigned_team_id_2026: form.assigned_team_id_2026 || null,
        notes: form.notes || null,
      })
      onSave(player)
    } catch (err) {
      setError('Failed to save player')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">Add New Player</h2>
            <span className="text-xs font-medium text-cyan-600">New Registration</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Full name..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status_id}
              onChange={e => set('status_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {statuses.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">2026 Team Assignment</label>
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
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Playing Preference</label>
            <input
              type="text"
              value={form.playing_preference}
              onChange={e => set('playing_preference', e.target.value)}
              placeholder="e.g. wants to play PL, happy at PB..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Add notes..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Player'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main AllPlayers Component ───────────────────────────────────────────────
export default function AllPlayers({ statuses, teams, onSelectPlayer, refreshKey, onRefresh }) {
  const [players, setPlayers]           = useState([])
  const [search, setSearch]                   = useState('')
  const [statusFilters, setStatusFilters]      = useState(new Set())
  const [sortBy, setSortBy]                    = useState('name')
  const [sortDir, setSortDir]           = useState('asc')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showInactive, setShowInactive] = useState(false)

  const loadPlayers = () => {
    getPlayers(showInactive).then(setPlayers)
  }

  useEffect(() => { loadPlayers() }, [refreshKey, showInactive])

  const filtered = players
    .filter(p => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilters.size > 0 && !statusFilters.has(p.status_id)) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name')   cmp = a.name.localeCompare(b.name)
      if (sortBy === 'team')   cmp = (a.assigned_team_id_2026 || '').localeCompare(b.assigned_team_id_2026 || '')
      if (sortBy === 'games')  cmp = (b.total_games_2026 || 0) - (a.total_games_2026 || 0)
      if (sortBy === 'goals')  cmp = (b.stats_2026?.goals || 0) - (a.stats_2026?.goals || 0)
      if (sortBy === 'status') cmp = a.status_id.localeCompare(b.status_id)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  const SortHeader = ({ col, children }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-3 text-left text-sm font-semibold text-gray-700 cursor-pointer hover:bg-gray-100"
    >
      {children}{sortBy === col && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )

  const handlePlayerAdded = (player) => {
    setShowAddModal(false)
    setStatusFilters(new Set())
    onRefresh?.()
  }

  const inactiveCount = players.filter(p => p.is_active === 0).length

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">All Players</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <span className="text-lg leading-none">+</span> Add Player
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />

        {/* Status chips — multi-select, empty = all */}
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(s => {
            const active = statusFilters.has(s.id)
            return (
              <button
                key={s.id}
                onClick={() => setStatusFilters(prev => {
                  const next = new Set(prev)
                  active ? next.delete(s.id) : next.add(s.id)
                  return next
                })}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}
                style={active ? { backgroundColor: s.color, borderColor: s.color } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: active ? 'white' : s.color }} />
                {s.label}
              </button>
            )
          })}
          {statusFilters.size > 0 && (
            <button onClick={() => setStatusFilters(new Set())} className="px-2 py-1 rounded-full text-xs text-gray-400 hover:text-gray-600 border border-gray-200">
              Clear
            </button>
          )}
        </div>

        {/* Inactive toggle */}
        <button
          onClick={() => setShowInactive(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            showInactive
              ? 'bg-gray-700 text-white border-gray-700'
              : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${showInactive ? 'bg-gray-300' : 'bg-gray-400'}`} />
          {showInactive ? `Inactive (${inactiveCount})` : 'Show inactive'}
        </button>

        <span className="text-sm text-gray-500 ml-auto">{filtered.length} players</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <SortHeader col="name">Name</SortHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
              <SortHeader col="team">2026 Team</SortHeader>
              <SortHeader col="games">GP</SortHeader>
              <SortHeader col="goals">Goals</SortHeader>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Cards</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(player => {
              const status   = statuses.find(s => s.id === player.status_id)
              const isInactive = player.is_active === 0
              const s26      = player.stats_2026
              const gp       = player.total_games_2026 || 0
              const hasCards = s26 && (s26.greenCards > 0 || s26.yellowCards > 0 || s26.redCards > 0)
              return (
                <tr
                  key={player.id}
                  onClick={() => onSelectPlayer(player)}
                  className={`cursor-pointer transition-colors ${isInactive ? 'opacity-50 bg-gray-50 hover:bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <div className="flex items-center gap-2">
                      {player.name}
                      {isInactive && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">Inactive</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: status?.color }} />
                      <span className="text-xs text-gray-600">{status?.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{player.assigned_team_id_2026 || '—'}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-gray-700 font-medium">{gp > 0 ? gp : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-gray-700">{s26?.goals > 0 ? s26.goals : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {hasCards ? (
                      <span className="flex items-center gap-1">
                        {s26.greenCards  > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-xs font-bold" style={{background:'#16a34a'}}>{s26.greenCards}</span>}
                        {s26.yellowCards > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-xs font-bold" style={{background:'#ca8a04'}}>{s26.yellowCards}</span>}
                        {s26.redCards    > 0 && <span className="inline-flex items-center justify-center w-5 h-5 rounded text-white text-xs font-bold" style={{background:'#dc2626'}}>{s26.redCards}</span>}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">No players match your filters</div>
        )}
      </div>

      {/* Add Player Modal */}
      {showAddModal && (
        <AddPlayerModal
          teams={teams}
          statuses={statuses}
          onSave={handlePlayerAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
