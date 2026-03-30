import { useState, useEffect } from 'react'

const STATUSES = [
  { id: 'planning',      label: 'Planning to play',  color: '#22c55e' },
  { id: 'unsure',        label: 'Unsure',             color: '#eab308' },
  { id: 'unlikely',      label: 'Unlikely',           color: '#a855f7' },
  { id: 'fill_in',       label: 'Fill-in only',       color: '#3b82f6' },
  { id: 'new',           label: 'New / Restarting',   color: '#06b6d4' },
  { id: 'not_heard',     label: 'Not heard from',     color: '#9ca3af' },
  { id: 'not_returning', label: 'Not returning',      color: '#ef4444' },
]
const STATUS_KEY = {
  planning: 's_planning', unsure: 's_unsure', unlikely: 's_unlikely',
  fill_in: 's_fill_in', new: 's_new', not_heard: 's_not_heard', not_returning: 's_not_returning',
}
const HEADLINE_STATUSES = ['planning', 'unlikely', 'fill_in', 'unconfirmed', 'not_returning']
const STATUS_BG = {
  planning: 'bg-green-50 border-green-200', unlikely: 'bg-purple-50 border-purple-200',
  fill_in: 'bg-blue-50 border-blue-200', unconfirmed: 'bg-gray-50 border-gray-200',
  not_returning: 'bg-red-50 border-red-200',
}
const HEADLINE_META = {
  planning:      { label: 'Planning to play', color: '#22c55e' },
  unlikely:      { label: 'Unlikely',         color: '#a855f7' },
  fill_in:       { label: 'Fill-in only',     color: '#3b82f6' },
  unconfirmed:   { label: 'Unconfirmed',      color: '#9ca3af' },
  not_returning: { label: 'Not returning',    color: '#ef4444' },
}

export default function RegistrationDashboard({ refreshKey }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(setStats)
  }, [refreshKey])

  if (!stats) return <div className="text-gray-500">Loading...</div>

  const totalPlayers = stats.totalPlayers
  const assigned2026 = stats.assigned2026
  const newPlayers   = stats.newRegistrations || []

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">2026 Registration</h2>
      <p className="text-sm text-gray-400 mb-6">{totalPlayers} total · {assigned2026} assigned to 2026</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 mb-6">
        {HEADLINE_STATUSES.map(sid => {
          const meta = HEADLINE_META[sid]
          let count = sid === 'unconfirmed'
            ? (stats.byStatus.find(b => b.status_id === 'unsure')?.count || 0) +
              (stats.byStatus.find(b => b.status_id === 'not_heard')?.count || 0)
            : stats.byStatus.find(b => b.status_id === sid)?.count || 0
          const pct = totalPlayers > 0 ? ((count / totalPlayers) * 100).toFixed(1) : '0.0'
          return (
            <div key={sid} className={`rounded-lg border p-4 ${STATUS_BG[sid]}`}>
              <div className="flex items-end justify-between mb-1">
                <span className="text-4xl font-bold" style={{ color: meta.color }}>{count}</span>
                <span className="text-lg font-semibold pb-1" style={{ color: meta.color, opacity: 0.7 }}>{pct}%</span>
              </div>
              <div className="text-sm font-medium text-gray-600">{meta.label}</div>
              {sid === 'unconfirmed' && <div className="text-xs text-gray-400 mt-0.5">Unsure + not heard</div>}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="sm:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-600 mb-4">All Players — Status Breakdown</h3>
          <div className="flex h-3 rounded-full overflow-hidden mb-4 bg-gray-100">
            {STATUSES.map(s => {
              const count = stats.byStatus.find(b => b.status_id === s.id)?.count || 0
              const pct = totalPlayers > 0 ? (count / totalPlayers) * 100 : 0
              if (!pct) return null
              return <div key={s.id} style={{ width: `${pct}%`, backgroundColor: s.color }} title={`${s.label}: ${count}`} />
            })}
          </div>
          <div className="flex flex-wrap gap-3">
            {STATUSES.map(s => {
              const count = stats.byStatus.find(b => b.status_id === s.id)?.count || 0
              if (!count) return null
              const pct = totalPlayers > 0 ? ((count / totalPlayers) * 100).toFixed(1) : '0.0'
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm text-gray-600">{s.label}</span>
                  <span className="text-sm font-semibold text-gray-800">{count}</span>
                  <span className="text-xs text-gray-400">({pct}%)</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-cyan-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-600">New to Club</h3>
            <span className="text-2xl font-bold" style={{ color: '#06b6d4' }}>{newPlayers.length}</span>
          </div>
          <p className="text-xs text-gray-400 mb-3">Not in the 2025 squad of {totalPlayers - newPlayers.length}</p>
          <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: '180px' }}>
            {newPlayers.map(p => {
              const s = STATUSES.find(x => x.id === p.status_id)
              return (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 truncate">{p.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s?.color || '#9ca3af' }} />
                    <span className="text-xs text-gray-400">{s?.label || p.status_id}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-gray-600 mb-3">By Team (2025 squad)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.byTeam.map(t => {
          const total = t.main_squad || 0
          const responded = total - (t.s_not_heard || 0)
          const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0
          return (
            <div key={t.team_id} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-800">{t.team_id}</span>
                <span className="text-xs text-gray-400">{t.main_squad} main {t.fill_ins > 0 ? `· ${t.fill_ins} fill-ins` : ''}</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-gray-100">
                {STATUSES.map(s => {
                  const count = t[STATUS_KEY[s.id]] || 0
                  const pct = total > 0 ? (count / total) * 100 : 0
                  if (!pct) return null
                  return <div key={s.id} style={{ width: `${pct}%`, backgroundColor: s.color }} />
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                {STATUSES.map(s => {
                  const count = t[STATUS_KEY[s.id]] || 0
                  if (!count) return null
                  return (
                    <div key={s.id} className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-xs text-gray-500">{s.label} <strong>{count}</strong></span>
                    </div>
                  )
                })}
              </div>
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <span>{responseRate}% responded</span>
                <span className="font-medium text-blue-600">{t.assigned_2026} assigned '26</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
