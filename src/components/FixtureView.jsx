import { useState, useEffect, useCallback } from 'react'
import { getRounds, getRoundMatches, getHvSync } from '../db'

// ─── Result badge ─────────────────────────────────────────────────────────────
function ResultBadge({ result, scoreFor, scoreAgainst }) {
  if (!result) return null
  const cfg = {
    Win:  { bg: '#16a34a', label: 'W' },
    Loss: { bg: '#dc2626', label: 'L' },
    Draw: { bg: '#ca8a04', label: 'D' },
  }[result] || { bg: '#475569', label: '?' }
  // Always show Mentone score first
  const score = (scoreFor != null && scoreAgainst != null)
    ? ` ${scoreFor}–${scoreAgainst}` : ''
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-white px-2 py-0.5 rounded"
          style={{ background: cfg.bg }}>
      {cfg.label}{score}
    </span>
  )
}

// ─── Single team row ──────────────────────────────────────────────────────────
function TeamMatchRow({ team, match }) {
  const hasResult  = !!match?.result
  const hasFixture = !!match?.opponent
  const isHome     = match?.venue?.includes('Mentone')

  const venueShort = (match?.venue || '')
    .replace('Hockey Centre', 'HC')
    .replace('Playing Fields', 'Oval')
    .replace('Secondary College', 'SC')
    .replace('Grammar', 'Grammar')

  const dateNice = (() => {
    if (!match?.match_date) return null
    try {
      const d = new Date(match.match_date + 'T00:00:00')
      return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    } catch { return null }
  })()

  return (
    <div className="flex items-start gap-3 px-3 py-3 border-b border-slate-100 last:border-0">

      {/* Team pill */}
      <div className="w-12 flex-shrink-0 pt-0.5">
        <span className="inline-block text-xs font-bold text-white px-1.5 py-0.5 rounded"
              style={{ background: '#1e3a8a' }}>
          {team.id}
        </span>
      </div>

      {/* Match info */}
      <div className="flex-1 min-w-0">
        {!hasFixture ? (
          <span className="text-xs text-slate-400 italic">No fixture</span>
        ) : (
          <>
            {/* Line 1: opponent + result badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800">
                {isHome ? 'Home' : 'Away'} v {match.opponent}
              </span>
              {hasResult && (
                <ResultBadge result={match.result}
                             scoreFor={match.score_for}
                             scoreAgainst={match.score_against} />
              )}
            </div>
            {/* Line 2: date + time */}
            {(dateNice || match.time) && (
              <div className="text-xs text-slate-500 mt-0.5">
                {[dateNice, match.time].filter(Boolean).join(' @ ')}
              </div>
            )}
            {/* Line 3: venue */}
            {venueShort && (
              <div className="text-xs text-slate-400 mt-0.5">
                {venueShort}{match.field ? ` [${match.field}]` : ''}
              </div>
            )}
            {/* Scorers if available */}
            {match.scorers?.length > 0 && (
              <div className="text-xs text-slate-400 mt-0.5">
                Goals: {match.scorers.join(', ')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Round card ───────────────────────────────────────────────────────────────
function RoundCard({ round, teams, matches, isSelected, onClick }) {
  const dateLabel = round.sat_date
    ? new Date(round.sat_date + 'T00:00:00').toLocaleDateString('en-AU',
        { day: 'numeric', month: 'short' })
    : ''
  const anyResult  = matches?.some(m => m.result)
  const anyFixture = matches?.some(m => m.opponent)

  return (
    <div className={`rounded-lg border overflow-hidden cursor-pointer transition-all
                     ${isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200 hover:border-slate-300'}`}
         onClick={onClick}>
      {/* Round header */}
      <div className="px-3 py-2 text-white" style={{ background: '#1e3a8a' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">Round {round.round_number}</span>
          <span className="text-xs text-blue-200">{dateLabel}</span>
        </div>
      </div>

      {/* Team rows */}
      <div className="divide-y divide-slate-100">
        {matches
          ? teams.map(team => (
              <TeamMatchRow key={team.id} team={team}
                            match={matches.find(m => m.team_id === team.id)} />
            ))
          : (
            <div className="px-3 py-4 text-center text-xs text-slate-400">
              Loading...
            </div>
          )
        }
      </div>
    </div>
  )
}

// ─── Digest tab ───────────────────────────────────────────────────────────────
function DigestTab() {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied]   = useState(false)

  useEffect(() => {
    getHvSync()
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const handleCopy = async () => {
    if (!data) return
    try {
      // Copy as rich text (HTML) so Gmail preserves bold/formatting.
      // Falls back to plain text on platforms that don't support HTML clipboard.
      if (data.html && navigator.clipboard?.write) {
        const htmlBlob = new Blob([data.html], { type: 'text/html' })
        const textBlob = new Blob([data.text || ''], { type: 'text/plain' })
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ])
      } else {
        // Fallback: plain text
        await navigator.clipboard.writeText(data.text || '')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Last resort fallback for older mobile browsers
      const el = document.createElement('textarea')
      el.value = data.text || ''
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
      Loading digest...
    </div>
  )

  if (!data) return (
    <div className="text-center py-16 text-slate-400">
      <p className="text-lg mb-2">No sync data yet</p>
      <p className="text-sm">Run <code className="bg-slate-100 px-1 rounded">python sync_hv.py</code> to populate</p>
    </div>
  )

  const syncedAt = data.syncedAt
    ? new Date(data.syncedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-3">
        <span className="text-xs text-slate-500">Last synced: {syncedAt}</span>
        <button onClick={handleCopy}
                className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors
                            ${copied
                              ? 'bg-green-600 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {copied ? '✓ Copied!' : 'Copy to clipboard'}
        </button>
      </div>

      {/* HTML preview — matches what gets pasted into Gmail */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {data.html
          ? <div className="p-4" dangerouslySetInnerHTML={{ __html: data.html }} />
          : <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
              {data.text}
            </pre>
        }
      </div>
    </div>
  )
}

// ─── Fixture tab ──────────────────────────────────────────────────────────────
function FixtureTab({ teams }) {
  const [rounds, setRounds]             = useState([])
  const [matchCache, setMatchCache]     = useState({}) // roundId → matches[]
  const [selectedRoundId, setSelected]  = useState(null)
  const [loading, setLoading]           = useState(true)
  const [loadingMatches, setLoadingM]   = useState(false)

  // Determine the "current" round — first with no results, or last overall
  const guessCurrentRound = useCallback((roundList) => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = roundList.filter(r => r.round_date && r.round_date >= today)
    return upcoming[0]?.id || roundList[roundList.length - 1]?.id || null
  }, [])

  useEffect(() => {
    getRounds().then(all => {
      const season = all.filter(r => r.round_type === 'season')
      setRounds(season)
      const cur = guessCurrentRound(season)
      setSelected(cur)
      setLoading(false)
    })
  }, [guessCurrentRound])

  // Load matches for selected round
  useEffect(() => {
    if (!selectedRoundId) return
    if (matchCache[selectedRoundId]) return  // already loaded
    setLoadingM(true)
    getRoundMatches(selectedRoundId)
      .then(m => setMatchCache(prev => ({ ...prev, [selectedRoundId]: m })))
      .finally(() => setLoadingM(false))
  }, [selectedRoundId, matchCache])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
      Loading rounds...
    </div>
  )

  const selectedRound  = rounds.find(r => r.id === selectedRoundId)
  const selectedIdx    = rounds.findIndex(r => r.id === selectedRoundId)
  const prevRound      = rounds[selectedIdx - 1]
  const nextRound      = rounds[selectedIdx + 1]
  const currentMatches = matchCache[selectedRoundId] || null

  const satLabel = selectedRound?.sat_date
    ? new Date(selectedRound.sat_date + 'T00:00:00').toLocaleDateString('en-AU',
        { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const sunLabel = selectedRound?.sun_date
    ? new Date(selectedRound.sun_date + 'T00:00:00').toLocaleDateString('en-AU',
        { weekday: 'short', day: 'numeric', month: 'short' })
    : ''

  return (
    <div className="space-y-3">
      {/* Round navigator */}
      <div className="bg-white rounded-lg border border-slate-200 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => prevRound && setSelected(prevRound.id)}
                  disabled={!prevRound}
                  className="p-2 rounded-md text-slate-600 hover:bg-slate-100
                             disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none">
            ‹
          </button>

          {/* Mobile: dropdown */}
          <div className="flex-1 sm:hidden">
            <select value={selectedRoundId || ''}
                    onChange={e => setSelected(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-800 bg-transparent
                               border-0 focus:outline-none text-center">
              {rounds.map(r => (
                <option key={r.id} value={r.id}>
                  Round {r.round_number}
                  {r.sat_date ? ` — ${new Date(r.sat_date + 'T00:00:00')
                    .toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop: round info */}
          <div className="hidden sm:block text-center">
            <div className="text-base font-bold text-slate-800">
              Round {selectedRound?.round_number}
            </div>
            {(satLabel || sunLabel) && (
              <div className="text-xs text-slate-500 mt-0.5">
                {satLabel}{sunLabel ? ` – ${sunLabel}` : ''}
              </div>
            )}
          </div>

          <button onClick={() => nextRound && setSelected(nextRound.id)}
                  disabled={!nextRound}
                  className="p-2 rounded-md text-slate-600 hover:bg-slate-100
                             disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none">
            ›
          </button>
        </div>
      </div>

      {/* Mobile date label below navigator */}
      {(satLabel || sunLabel) && (
        <div className="sm:hidden text-center text-xs text-slate-500 -mt-2">
          {satLabel}{sunLabel ? ` – ${sunLabel}` : ''}
        </div>
      )}

      {/* Match list */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {loadingMatches ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading matches...</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {teams.map(team => (
              <TeamMatchRow key={team.id} team={team}
                            match={currentMatches?.find(m => m.team_id === team.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Quick-jump pill rail — desktop only, date order with midweek rounds marked */}
      <div className="hidden sm:flex flex-wrap gap-1.5 pt-1">
        {rounds.map(r => {
          const isMidweek = r.round_number >= 19 && r.round_number <= 22
          return (
            <button key={r.id}
                    onClick={() => setSelected(r.id)}
                    title={isMidweek ? `R${r.round_number} (midweek)` : `Round ${r.round_number}`}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors
                                ${r.id === selectedRoundId
                                  ? 'bg-blue-700 text-white'
                                  : isMidweek
                                    ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              R{r.round_number}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function FixtureView({ teams }) {
  const [tab, setTab] = useState('fixture')

  const TABS = [
    { id: 'fixture', label: 'Fixture' },
    { id: 'digest',  label: 'Weekly Digest' },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page header */}
      <div className="mb-4 rounded-lg overflow-hidden"
           style={{ background: '#0f172a' }}>
        <div style={{ background: '#eab308', height: '4px' }} />
        <div className="px-4 py-3" style={{ background: '#1e3a8a' }}>
          <h2 className="text-white font-bold text-base tracking-wide">
            Mentone Men's Hockey
          </h2>
          <p className="text-blue-200 text-xs mt-0.5">2026 Season Fixture & Results</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-white rounded-lg border border-slate-200 p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex-1 text-sm font-medium py-2 rounded-md transition-colors
                              ${tab === t.id
                                ? 'bg-blue-700 text-white'
                                : 'text-slate-600 hover:bg-slate-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'fixture' && <FixtureTab teams={teams} />}
      {tab === 'digest'  && <DigestTab />}
    </div>
  )
}
