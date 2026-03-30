import { useState, useEffect } from 'react'

const STATUS_COLORS = {
  planning:      '#22c55e',
  unsure:        '#eab308',
  unlikely:      '#a855f7',
  fill_in:       '#3b82f6',
  new:           '#06b6d4',
  not_heard:     '#9ca3af',
  not_returning: '#ef4444',
}

const STATUS_LABELS = {
  planning:      'Planning to play',
  unsure:        'Unsure',
  unlikely:      'Unlikely',
  fill_in:       'Fill-in only',
  new:           'New / Restarting',
  not_heard:     'Not heard from',
  not_returning: 'Not returning',
}

const PLAYER_TYPE_LABELS = {
  new:             'New to hockey',
  played_recently: 'Played recently',
  returning:       'Returning after a break',
}

const INTERESTED_LABELS = {
  competitive: 'Competitive',
  social:      'Social / Relaxed',
}

// ── Small toggle switch ──────────────────────────────────────────────────
function Toggle({ value, onChange, colorOn = 'bg-amber-500' }) {
  return (
    <div
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer flex-shrink-0 ${value ? colorOn : 'bg-gray-200'}`}
    >
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </div>
  )
}

// ── Inline save helper ───────────────────────────────────────────────────
async function patchPlayer(id, fields) {
  await fetch(`/api/players/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
}

// ── New Registrations Table ──────────────────────────────────────────────
function NewRegistrations({ players, teams, statuses, onSelectPlayer, onRefresh }) {
  if (players.length === 0) {
    return <p className="text-sm text-gray-400 py-4">No new registrations yet.</p>
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Interested in</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Previous club</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">2026 Team</th>
            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">🌏 Intl</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {players.map(p => (
            <tr
              key={p.id}
              onClick={() => onSelectPlayer(p)}
              className="hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {PLAYER_TYPE_LABELS[p.player_type] || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {INTERESTED_LABELS[p.interested_in] || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {p.previous_club || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[p.status_id] }} />
                  {STATUS_LABELS[p.status_id] || p.status_id}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {p.assigned_team_id_2026 || <span className="text-gray-300">—</span>}
              </td>
              <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                <Toggle
                  value={!!p.is_international}
                  onChange={async val => {
                    await patchPlayer(p.id, { is_international: val, needs_visa: val ? p.needs_visa : false })
                    onRefresh()
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Internationals Table ─────────────────────────────────────────────────
function InternationalsTable({ players, teams, onSelectPlayer, onRefresh, intlByTeam }) {
  if (players.length === 0) {
    return <p className="text-sm text-gray-400 py-4">No international players flagged yet.</p>
  }

  // Group by assigned team
  const grouped = {}
  const unassigned = []
  players.forEach(p => {
    if (p.assigned_team_id_2026) {
      if (!grouped[p.assigned_team_id_2026]) grouped[p.assigned_team_id_2026] = []
      grouped[p.assigned_team_id_2026].push(p)
    } else {
      unassigned.push(p)
    }
  })

  const teamOrder = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']
  const sections = [
    ...teamOrder.filter(t => grouped[t]).map(t => ({ teamId: t, players: grouped[t] })),
    ...Object.keys(grouped).filter(t => !teamOrder.includes(t)).map(t => ({ teamId: t, players: grouped[t] })),
    ...(unassigned.length ? [{ teamId: null, players: unassigned }] : []),
  ]

  return (
    <div className="space-y-4">
      {sections.map(({ teamId, players: teamPlayers }) => {
        const count = teamPlayers.length
        const overLimit = count >= 3

        return (
          <div key={teamId || 'unassigned'} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Team header */}
            <div className={`flex items-center justify-between px-4 py-2.5 border-b ${overLimit ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
              <span className={`text-sm font-semibold ${overLimit ? 'text-red-700' : 'text-gray-700'}`}>
                {teamId || 'Unassigned'}
              </span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                overLimit
                  ? 'bg-red-100 text-red-700'
                  : count === 2
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {count} international{count !== 1 ? 's' : ''}
                {overLimit && ' ⚠️ over limit'}
              </span>
            </div>

            <table className="w-full">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">2025 Team</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Needs Visa</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {teamPlayers.map(p => (
                  <tr key={p.id} onClick={() => onSelectPlayer(p)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-2.5 font-medium text-gray-800 text-sm">{p.name}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{p.primary_team_id_2025 || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[p.status_id] }} />
                        {STATUS_LABELS[p.status_id] || p.status_id}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <Toggle
                        value={!!p.needs_visa}
                        onChange={async val => {
                          await patchPlayer(p.id, { needs_visa: val })
                          onRefresh()
                        }}
                        colorOn="bg-red-500"
                      />
                    </td>
                    <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={async () => {
                          await patchPlayer(p.id, { is_international: false, needs_visa: false })
                          onRefresh()
                        }}
                        className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                      >
                        Remove flag
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Recruitment Component ───────────────────────────────────────────
export default function Recruitment({ teams, statuses, onSelectPlayer, refreshKey, onRefresh }) {
  const [data, setData]   = useState(null)
  const [tab, setTab]     = useState('new')

  useEffect(() => {
    fetch('/api/recruitment').then(r => r.json()).then(setData)
  }, [refreshKey])

  if (!data) return <div className="text-gray-400 text-sm">Loading...</div>

  const { newPlayers, internationals, intlByTeam } = data
  const visaCount = internationals.filter(p => p.needs_visa).length
  const overLimitTeams = intlByTeam.filter(t => t.count >= 3)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Recruitment</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {newPlayers.length} new registration{newPlayers.length !== 1 ? 's' : ''} · {internationals.length} international{internationals.length !== 1 ? 's' : ''}{visaCount > 0 ? ` · ${visaCount} need visa` : ''}
            {overLimitTeams.length > 0 && (
              <span className="ml-2 text-red-600 font-medium">⚠️ {overLimitTeams.length} team{overLimitTeams.length > 1 ? 's' : ''} over international limit</span>
            )}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-5">
        {[
          { id: 'new',   label: `New Registrations`, count: newPlayers.length },
          { id: 'intl',  label: `Internationals`,    count: internationals.length, warn: overLimitTeams.length > 0 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              t.warn
                ? 'bg-red-100 text-red-700'
                : tab === t.id
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'new' && (
        <NewRegistrations
          players={newPlayers}
          teams={teams}
          statuses={statuses}
          onSelectPlayer={onSelectPlayer}
          onRefresh={onRefresh}
        />
      )}

      {tab === 'intl' && (
        <InternationalsTable
          players={internationals}
          teams={teams}
          onSelectPlayer={onSelectPlayer}
          onRefresh={onRefresh}
          intlByTeam={intlByTeam}
        />
      )}
    </div>
  )
}
