import { useState, useEffect } from 'react'

const TEAM_LABELS = {
  PL:    'VIC League 1',
  PLR:   'VIC League 1 Res',
  PB:    'Pennant B',
  PC:    'Pennant C',
  PE:    'Pennant E SE',
  Metro: 'Metro 2 South',
}

const BRACKETS = ['1–5 games', '6–10 games', '11–15 games', '16+ games']

const BRACKET_COLORS = {
  '1–5 games':   { bg: 'bg-orange-50', text: 'text-orange-700', bar: '#f97316' },
  '6–10 games':  { bg: 'bg-yellow-50', text: 'text-yellow-700', bar: '#eab308' },
  '11–15 games': { bg: 'bg-green-50',  text: 'text-green-700',  bar: '#22c55e' },
  '16+ games':   { bg: 'bg-blue-50',   text: 'text-blue-700',   bar: '#3b82f6' },
}

// ── Stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = 'text-gray-800', bg = 'bg-white' }) {
  return (
    <div className={`${bg} rounded-xl border border-gray-200 px-5 py-4`}>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

// ── Games histogram ──────────────────────────────────────────────────────
function GamesHistogram({ gamesDist }) {
  if (!gamesDist?.length) return null
  const max = Math.max(...gamesDist.map(d => d.count))

  const bucketColor = (games) => {
    if (games <= 5)  return '#f97316'
    if (games <= 10) return '#eab308'
    if (games <= 15) return '#22c55e'
    return '#3b82f6'
  }

  const chartHeight = 120
  const barWidth = 18
  const gap = 4

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Games Played Distribution — 2025</h3>
      <p className="text-xs text-gray-400 mb-4">How many games each returning player played last season</p>
      <div className="overflow-x-auto">
        <svg width={gamesDist.length * (barWidth + gap) + 40} height={chartHeight + 40} className="overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <g key={i}>
              <line x1={30} y1={chartHeight - pct * chartHeight} x2={gamesDist.length * (barWidth + gap) + 30} y2={chartHeight - pct * chartHeight} stroke="#f3f4f6" strokeWidth={1} />
              <text x={24} y={chartHeight - pct * chartHeight + 4} textAnchor="end" fontSize={9} fill="#9ca3af">{Math.round(pct * max)}</text>
            </g>
          ))}
          {gamesDist.map((d, i) => {
            const barH = max > 0 ? (d.count / max) * chartHeight : 0
            const x = 30 + i * (barWidth + gap)
            const y = chartHeight - barH
            return (
              <g key={d.games}>
                <rect x={x} y={y} width={barWidth} height={barH} fill={bucketColor(d.games)} rx={3} opacity={0.85} />
                {(d.games % 2 === 1 || i === gamesDist.length - 1) && (
                  <text x={x + barWidth / 2} y={chartHeight + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">{d.games}</text>
                )}
                {barH > 16 && (
                  <text x={x + barWidth / 2} y={y + 11} textAnchor="middle" fontSize={9} fill="white" fontWeight="600">{d.count}</text>
                )}
              </g>
            )
          })}
          <text x={30 + (gamesDist.length * (barWidth + gap)) / 2} y={chartHeight + 30} textAnchor="middle" fontSize={10} fill="#9ca3af">Games played</text>
        </svg>
      </div>
      <div className="flex gap-4 mt-2 flex-wrap">
        {[['#f97316','1–5'],['#eab308','6–10'],['#22c55e','11–15'],['#3b82f6','16+']].map(([color, label]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />{label} games
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Engagement donut (pure SVG) ──────────────────────────────────────────
function EngagementDonut({ overall }) {
  const { planning = 0, fill_in = 0, unsure = 0, unlikely = 0, not_heard = 0, not_returning = 0, new_reg = 0 } = overall
  const returning = overall.total - new_reg
  const slices = [
    { label: 'Planning',      value: planning,      color: '#22c55e' },
    { label: 'Fill-in pool',  value: fill_in,       color: '#3b82f6' },
    { label: 'Unsure',        value: unsure,        color: '#eab308' },
    { label: 'Unlikely',      value: unlikely,      color: '#a855f7' },
    { label: 'Not heard',     value: not_heard,     color: '#9ca3af' },
    { label: 'Not returning', value: not_returning, color: '#ef4444' },
  ]
  const total = slices.reduce((s, d) => s + d.value, 0)
  const cx = 80, cy = 80, r = 65, innerR = 40
  let cumAngle = -Math.PI / 2
  const toXY = (angle, radius) => ({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
  const paths = slices.map(slice => {
    if (slice.value === 0) return null
    const angle = (slice.value / total) * 2 * Math.PI
    const startAngle = cumAngle
    cumAngle += angle
    const endAngle = cumAngle
    const large = angle > Math.PI ? 1 : 0
    const o1 = toXY(startAngle, r), o2 = toXY(endAngle, r)
    const i1 = toXY(endAngle, innerR), i2 = toXY(startAngle, innerR)
    return {
      d: `M ${o1.x} ${o1.y} A ${r} ${r} 0 ${large} 1 ${o2.x} ${o2.y} L ${i1.x} ${i1.y} A ${innerR} ${innerR} 0 ${large} 0 ${i2.x} ${i2.y} Z`,
      color: slice.color, label: slice.label, value: slice.value,
    }
  }).filter(Boolean)
  const engaged = planning + fill_in + unsure
  const engagedPct = returning > 0 ? Math.round((engaged / returning) * 100) : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Returning Player Engagement</h3>
      <p className="text-xs text-gray-400 mb-4">How 2025 players are tracking for 2026</p>
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width={160} height={160}>
            {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={2} />)}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={22} fontWeight="700" fill="#1f2937">{engagedPct}%</text>
            <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#6b7280">engaged</text>
          </svg>
        </div>
        <div className="flex-1 space-y-2">
          {slices.map(s => (
            <div key={s.label} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-gray-600">{s.label}</span>
              </div>
              <span className="text-xs font-semibold text-gray-700">{s.value}</span>
            </div>
          ))}
          <div className="pt-1 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">New registrations</span>
            <span className="text-xs font-semibold text-gray-500">{new_reg}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Squad composition stacked bars ──────────────────────────────────────
function FillInPoolChart({ teams }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Squad Composition by Team</h3>
      <p className="text-xs text-gray-400 mb-5">Core vs casual vs at-risk vs lost, per 2025 squad</p>
      <div className="space-y-4">
        {teams.map(t => {
          const core   = t.core_engaged   || 0
          const casual = t.casual_engaged || 0
          const atRisk = (t.not_heard || 0) + (t.unlikely || 0)
          const lost   = t.not_returning  || 0
          const total  = t.total_2025     || 0
          const pct = v => total > 0 ? `${(v / total) * 100}%` : '0%'
          return (
            <div key={t.team}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-gray-700">{t.team} <span className="font-normal text-gray-400">— {TEAM_LABELS[t.team]}</span></span>
                <span className="text-xs text-gray-400">{total} players</span>
              </div>
              <div className="flex h-6 rounded-lg overflow-hidden gap-px">
                {core   > 0 && <div className="bg-green-500 flex items-center justify-center" style={{ width: pct(core) }}  title={`Core: ${core}`}  ><span className="text-white text-xs font-bold">{core}</span></div>}
                {casual > 0 && <div className="bg-orange-400 flex items-center justify-center" style={{ width: pct(casual) }} title={`Casual: ${casual}`}><span className="text-white text-xs font-bold">{casual}</span></div>}
                {atRisk > 0 && <div className="bg-gray-300 flex items-center justify-center" style={{ width: pct(atRisk) }} title={`At risk: ${atRisk}`}><span className="text-gray-600 text-xs font-bold">{atRisk}</span></div>}
                {lost   > 0 && <div className="bg-red-400 flex items-center justify-center" style={{ width: pct(lost) }}   title={`Lost: ${lost}`}   ><span className="text-white text-xs font-bold">{lost}</span></div>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-4 mt-5 pt-3 border-t border-gray-100 flex-wrap">
        {[['bg-green-500','Core (6+ games, engaged)'],['bg-orange-400','Casual (1–5 games)'],['bg-gray-300','At risk'],['bg-red-400','Not returning']].map(([cls, label]) => (
          <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-3 h-3 rounded-sm ${cls}`} />{label}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Team depth expandable row ────────────────────────────────────────────
function TeamDepthRow({ team, targetMin, expanded, onToggle }) {
  const {
    team: teamId, total_2025 = 0, planning = 0, fill_in = 0, unsure = 0,
    unlikely = 0, not_heard = 0, not_returning = 0,
    core_engaged = 0, casual_engaged = 0, assigned = 0, gap, brackets = []
  } = team

  const atRisk = not_heard + unlikely
  const ragClass = assigned >= targetMin
    ? 'text-green-700 bg-green-50 border-green-200'
    : assigned >= targetMin - 2
    ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200'
  const gapLabel = gap <= 0 ? `✓ ${Math.abs(gap)} over` : `${gap} short`
  const gapColor = gap <= 0 ? 'text-green-600' : gap <= 2 ? 'text-amber-600' : 'text-red-600'

  return (
    <>
      <tr className="hover:bg-gray-50 cursor-pointer border-b border-gray-100" onClick={onToggle}>
        <td className="px-4 py-3">
          <div className="font-semibold text-gray-800 text-sm">{teamId}</div>
          <div className="text-xs text-gray-400">{TEAM_LABELS[teamId]}</div>
        </td>
        <td className="px-4 py-3 text-center text-sm font-medium text-gray-700">{total_2025}</td>
        <td className="px-4 py-3 text-center text-sm font-semibold text-green-700">{core_engaged}</td>
        <td className="px-4 py-3 text-center text-sm font-medium text-orange-600">{casual_engaged}</td>
        <td className="px-4 py-3 text-center text-sm font-medium text-blue-600">{fill_in}</td>
        <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: atRisk > 3 ? '#dc2626' : '#6b7280' }}>{atRisk}</td>
        <td className="px-4 py-3 text-center text-sm font-medium" style={{ color: not_returning > 3 ? '#dc2626' : '#6b7280' }}>{not_returning}</td>
        <td className="px-4 py-3 text-center">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ragClass}`}>{assigned}</span>
        </td>
        <td className={`px-4 py-3 text-center text-sm font-semibold ${gapColor}`}>{gapLabel}</td>
        <td className="px-4 py-3 text-center text-gray-400 text-xs">{expanded ? '▲' : '▼'}</td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50 border-b border-gray-200">
          <td colSpan={10} className="px-4 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 pl-1">2025 game bracket breakdown</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {BRACKETS.map(bracket => {
                const b = brackets.find(r => r.bracket === bracket) || {}
                const { total = 0, planning: pl = 0, fill_in: fi = 0, unsure: un = 0,
                        unlikely: ul = 0, not_heard: nh = 0, not_returning: nr = 0 } = b
                const colors = BRACKET_COLORS[bracket]
                const engaged = pl + fi + un
                return (
                  <div key={bracket} className={`rounded-lg border p-3 ${colors.bg}`} style={{ borderColor: colors.bar + '40' }}>
                    <div className={`text-xs font-bold ${colors.text} mb-2`}>{bracket}</div>
                    <div className="text-2xl font-bold text-gray-800 mb-2">{total}</div>
                    <div className="space-y-1">
                      {pl > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Planning</span><span className="font-medium text-green-700">{pl}</span></div>}
                      {fi > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Fill-in</span><span className="font-medium text-blue-600">{fi}</span></div>}
                      {un > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Unsure</span><span className="font-medium text-yellow-600">{un}</span></div>}
                      {ul > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Unlikely</span><span className="font-medium text-purple-600">{ul}</span></div>}
                      {nh > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Not heard</span><span className="font-medium text-gray-500">{nh}</span></div>}
                      {nr > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Not returning</span><span className="font-medium text-red-600">{nr}</span></div>}
                      {total === 0 && <p className="text-xs text-gray-400 italic">No players</p>}
                    </div>
                    {total > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Engaged</span>
                          <span className="font-semibold text-gray-700">{engaged}/{total}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Analytics component ─────────────────────────────────────────────
export default function Analytics({ refreshKey }) {
  const [data, setData]         = useState(null)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    fetch('/api/analytics').then(r => r.json()).then(setData)
  }, [refreshKey])

  if (!data) return <div className="text-gray-400 text-sm">Loading analytics...</div>

  const { overall, teams, gamesDist, targetMin, targetMax } = data
  const returning    = overall.total - (overall.new_reg || 0)
  const engaged      = (overall.planning || 0) + (overall.fill_in || 0) + (overall.unsure || 0)
  const engagedPct   = returning > 0 ? Math.round((engaged / returning) * 100) : 0
  const atRisk       = (overall.not_heard || 0) + (overall.unlikely || 0)
  const toggle       = id => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Squad Analytics</h2>
        <p className="text-sm text-gray-400 mt-0.5">
          Based on 2025 season data · target {targetMin}–{targetMax} players per team per week
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="2025 Returning" value={returning} sub={`+ ${overall.new_reg} new registrations`} />
        <StatCard label="Engaged for 2026" value={`${engagedPct}%`} sub={`${engaged} of ${returning} players`} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Core squad" value={overall.planning} sub="Planning to play regularly" color="text-green-700" />
        <StatCard label="Fill-in pool" value={overall.fill_in} sub="Deliberate fill-ins (not a problem!)" color="text-blue-700" />
        <StatCard label="Need follow-up" value={atRisk} sub={`${overall.not_heard} not heard · ${overall.unlikely} unlikely`} color="text-amber-700" bg="bg-amber-50" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngagementDonut overall={overall} />
        <FillInPoolChart teams={teams} />
      </div>

      {/* Games histogram */}
      <GamesHistogram gamesDist={gamesDist} />

      {/* Squad depth table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Squad Depth by Team</h3>
          <p className="text-xs text-gray-400 mt-0.5">Click any row to expand the games bracket breakdown · target {targetMin}–{targetMax} players per week</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left   text-xs font-semibold text-gray-500">Team</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">2025 Squad</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-green-600">Core (6+ games)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-orange-500">Casual (1–5)</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-blue-500">Fill-in pool</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">At risk</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-red-500">Lost</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">2026 Assigned</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">vs Target</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {teams.map(team => (
                <TeamDepthRow
                  key={team.team}
                  team={team}
                  targetMin={targetMin}
                  expanded={!!expanded[team.team]}
                  onToggle={() => toggle(team.team)}
                />
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-3 text-xs font-bold text-gray-700">Total</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-gray-700">{teams.reduce((s,t) => s+(t.total_2025||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-green-700">{teams.reduce((s,t) => s+(t.core_engaged||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-orange-600">{teams.reduce((s,t) => s+(t.casual_engaged||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-blue-600">{teams.reduce((s,t) => s+(t.fill_in||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-gray-600">{teams.reduce((s,t) => s+(t.not_heard||0)+(t.unlikely||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-red-600">{teams.reduce((s,t) => s+(t.not_returning||0),0)}</td>
                <td className="px-4 py-3 text-center text-xs font-bold text-gray-700">{teams.reduce((s,t) => s+(t.assigned||0),0)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 text-center pb-2">
        "Core" = engaged with 6+ games in 2025 · "Casual" = engaged with 1–5 games · "At risk" = unlikely + not heard from · fill-in pool is a cross-team resource, not a per-team problem
      </p>
    </div>
  )
}
