import { useState, useEffect, useCallback } from 'react'
import { Clock, MapPin, ChevronDown, Copy, Check } from 'lucide-react'
import { getRounds, getRoundMatches, getDigestHistory } from '../db'

// ── Team display names ────────────────────────────────────────────────────────
const TEAM_NAMES = {
  PL:    'Premier League',
  PLR:   'Premier League Reserves',
  PB:    'Pennant B',
  PC:    'Pennant C',
  PE:    'Pennant E',
  Metro: 'Metro',
}

function formatOpponentLabel(match) {
  if (!match?.opponent) return ''
  const isHome = match?.is_home ?? match?.venue?.toLowerCase().includes('mentone') ?? false
  return `${match.opponent} (${isHome ? 'Home' : 'Away'})`
}

// ── Format a single match as a fixture line ───────────────────────────────────
function formatFixtureLine(teamId, match) {
  if (!match?.opponent) return null
  const name    = TEAM_NAMES[teamId] || teamId
  const dateStr = match.match_date
    ? new Date(match.match_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long' })
    : ''
  // Normalise time: "13:30" → "1:30pm", "12:00" → "12pm", "9:00" → "9am" etc.
  const fmtTime = (t) => {
    if (!t) return ''
    const [hStr, mStr] = t.split(':')
    const h = parseInt(hStr, 10)
    const m = parseInt(mStr || '0', 10)
    const suffix = h >= 12 ? 'pm' : 'am'
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, '0')}${suffix}`
  }
  const time    = fmtTime(match.time)
  const when    = [dateStr, time].filter(Boolean).join(' ')
  const venue   = (match.venue || '')
    .replace('Hockey Centre', 'HC')
    .replace('Playing Fields', 'Oval')
    .replace('Secondary College', 'SC')
  // State Hockey Centre is a shared venue — show actual name even when is_home is true
  const isStateHC = venue.toLowerCase().includes('state')
  const loc     = (match.is_home && !isStateHC) ? 'Home' : (venue || '')
  const parts   = [formatOpponentLabel(match), loc ? `@ ${loc}` : ''].filter(Boolean).join(' ')
  return `${name} – ${when ? `${when} ` : ''}${parts}`
}

// ── Format all matches for a round ───────────────────────────────────────────
function formatRoundText(round, teams, matches) {
  const label = `ROUND ${round?.round_number} Fixtures`
  const lines = teams
    .map(t => formatFixtureLine(t.id, matches?.find(m => m.team_id === t.id)))
    .filter(Boolean)
  return [label, ...lines].join('\n')
}


// ── Helpers ───────────────────────────────────────────────────────────────────
const TEAM_ACCENT = {
  PL:    '#1d4ed8',
  PLR:   '#2563eb',
  PB:    '#0891b2',
  PC:    '#0d9488',
  PE:    '#7c3aed',
  Metro: '#db2777',
}

function fmtDate(dateStr, opts) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', opts)
  } catch { return '' }
}

// ── Result badge ──────────────────────────────────────────────────────────────
function ResultBadge({ result, scoreFor, scoreAgainst }) {
  if (!result) return null
  const cfg = {
    Win:  { bg: '#16a34a', text: '#fff', label: 'W' },
    Loss: { bg: '#dc2626', text: '#fff', label: 'L' },
    Draw: { bg: '#ca8a04', text: '#fff', label: 'D' },
  }[result] || { bg: '#475569', text: '#fff', label: '?' }
  const score = (scoreFor != null && scoreAgainst != null) ? `${scoreFor}–${scoreAgainst}` : ''
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: cfg.bg, color: cfg.text }}>
      {score && <span>{score}</span>}
      <span>{cfg.label}</span>
    </span>
  )
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({ team, match }) {
  const accent    = TEAM_ACCENT[team.id] || '#1e3a8a'
  const hasData   = !!match?.opponent
  const hasResult = !!match?.result
  const [copied, setCopied] = useState(false)

  const dateLabel  = fmtDate(match?.match_date, { weekday: 'short', day: 'numeric', month: 'short' })
  const venueShort = (match?.venue || '')
    .replace('Hockey Centre', 'HC')
    .replace('Playing Fields', 'Oval')
    .replace('Secondary College', 'SC')

  const handleCopy = async () => {
    const line = formatFixtureLine(team.id, match)
    if (!line) return
    try { await navigator.clipboard.writeText(line) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-stretch gap-0 bg-white rounded-xl border border-slate-100
                    shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Left accent bar + team label */}
      <div className="flex flex-col items-center justify-center px-3 py-3 flex-shrink-0 w-14"
           style={{ background: accent + '15', borderRight: `3px solid ${accent}` }}>
        <span className="text-xs font-bold" style={{ color: accent }}>{team.id}</span>
      </div>

      {/* Match body */}
      <div className="flex-1 min-w-0 px-3 py-2.5">
        {!hasData ? (
          <span className="text-xs text-slate-400 italic">No fixture</span>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-800 truncate">
                {formatOpponentLabel(match)}
              </span>
              {hasResult && (
                <ResultBadge result={match.result}
                             scoreFor={match.score_for}
                             scoreAgainst={match.score_against} />
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
              {(dateLabel || match.time) && (
                <span className="flex items-center gap-1">
                  <Clock size={11} className="text-slate-400 flex-shrink-0" strokeWidth={2} />
                  {[dateLabel, match.time ? `@ ${match.time}` : ''].filter(Boolean).join(' ')}
                </span>
              )}
              {venueShort && (
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin size={11} className="flex-shrink-0" strokeWidth={2} />
                  {venueShort}
                </span>
              )}
            </div>
            {match.scorers?.length > 0 && (
              <div className="text-xs text-slate-400 mt-0.5">
                Goals: {match.scorers.join(', ')}
              </div>
            )}
          </>
        )}
      </div>

      {/* Copy button — only when there's fixture data */}
      {hasData && (
        <button
          onClick={handleCopy}
          title="Copy fixture line"
          className={`flex items-center justify-center w-9 flex-shrink-0 border-l transition-colors
                      ${copied
                        ? 'bg-green-50 border-green-200 text-green-600'
                        : 'border-slate-100 text-slate-300 hover:text-blue-500 hover:bg-blue-50 hover:border-blue-100'}`}
        >
          {copied ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />}
        </button>
      )}
    </div>
  )
}

// ── Fixture panel ─────────────────────────────────────────────────────────────
function FixturePanel({ teams }) {
  const [rounds, setRounds]             = useState([])
  const [matchCache, setMatchCache]     = useState({})
  const [selectedRoundId, setSelected]  = useState(null)
  const [loading, setLoading]           = useState(true)
  const [loadingMatches, setLoadingM]   = useState(false)
  const [copiedAll, setCopiedAll]       = useState(false)

  const guessCurrentRound = useCallback((list) => {
    const today = new Date().toISOString().slice(0, 10)
    const upcoming = list.filter(r => r.round_date && r.round_date >= today)
    return upcoming[0]?.id || list[list.length - 1]?.id || null
  }, [])

  useEffect(() => {
    getRounds().then(all => {
      const season = all.filter(r => r.round_type === 'season')
      setRounds(season)
      setSelected(guessCurrentRound(season))
      setLoading(false)
    })
  }, [guessCurrentRound])

  useEffect(() => {
    if (!selectedRoundId || matchCache[selectedRoundId]) return
    setLoadingM(true)
    getRoundMatches(selectedRoundId)
      .then(m => setMatchCache(prev => ({ ...prev, [selectedRoundId]: m })))
      .finally(() => setLoadingM(false))
  }, [selectedRoundId, matchCache])

  if (loading) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">Loading…</div>
  )

  const selectedRound  = rounds.find(r => r.id === selectedRoundId)
  const selectedIdx    = rounds.findIndex(r => r.id === selectedRoundId)
  const prevRound      = rounds[selectedIdx - 1]
  const nextRound      = rounds[selectedIdx + 1]
  const currentMatches = matchCache[selectedRoundId] || null

  const satLabel = fmtDate(selectedRound?.sat_date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const sunLabel = fmtDate(selectedRound?.sun_date,  { weekday: 'short', day: 'numeric', month: 'short' })

  const handleCopyAll = async () => {
    if (!selectedRound || !currentMatches) return
    const text = formatRoundText(selectedRound, teams, currentMatches)
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2500)
  }

  return (
    <div className="space-y-3">
      {/* Round navigator */}
      <div className="flex items-center gap-2">
        <button onClick={() => prevRound && setSelected(prevRound.id)}
                disabled={!prevRound}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200
                           bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 text-base font-bold flex-shrink-0">
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-base font-bold text-slate-800">
            Round {selectedRound?.round_number}
          </div>
          {(satLabel || sunLabel) && (
            <div className="text-xs text-slate-500">
              {satLabel}{sunLabel ? ` – ${sunLabel}` : ''}
            </div>
          )}
        </div>
        {/* Copy all fixtures for this round */}
        {currentMatches && (
          <button
            onClick={handleCopyAll}
            title="Copy all fixtures"
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 h-8 rounded-lg border transition-colors flex-shrink-0
                        ${copiedAll
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'bg-white border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50'}`}
          >
            {copiedAll ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2} />}
            {copiedAll ? 'Copied!' : 'Copy all'}
          </button>
        )}
        <button onClick={() => nextRound && setSelected(nextRound.id)}
                disabled={!nextRound}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200
                           bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-30 text-base font-bold flex-shrink-0">
          ›
        </button>
      </div>

      {/* Match cards */}
      {loadingMatches ? (
        <div className="py-8 text-center text-sm text-slate-400">Loading matches…</div>
      ) : (
        <div className="space-y-1.5">
          {teams.map(team => (
            <MatchCard key={team.id} team={team}
                       match={currentMatches?.find(m => m.team_id === team.id)} />
          ))}
        </div>
      )}

      {/* Quick-jump pill rail */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {rounds.map(r => {
          const isMidweek = r.round_number >= 19 && r.round_number <= 22
          return (
            <button key={r.id} onClick={() => setSelected(r.id)}
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

// ── Digest panel ──────────────────────────────────────────────────────────────
function DigestPanel() {
  const [history, setHistory]         = useState([])
  const [selected, setSelected]       = useState(null)
  const [loadingHistory, setLoadingH] = useState(true)
  const [copied, setCopied]           = useState(false)

  const loadHistory = () => {
    setLoadingH(true)
    getDigestHistory()
      .then(items => {
        setHistory(items)
        if (items.length > 0) setSelected(items[0])
      })
      .finally(() => setLoadingH(false))
  }

  useEffect(() => { loadHistory() }, [])

  const handleCopy = async () => {
    if (!selected) return
    try {
      if (selected.html && navigator.clipboard?.write) {
        const htmlBlob = new Blob([selected.html], { type: 'text/html' })
        const textBlob = new Blob([selected.text || ''], { type: 'text/plain' })
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ])
      } else {
        await navigator.clipboard.writeText(selected.text || '')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = selected.text || ''
      document.body.appendChild(el); el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (loadingHistory) return (
    <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
      Loading digests…
    </div>
  )

  if (history.length === 0) return (
    <div className="text-center py-16 text-slate-400">
      <p className="text-base font-medium mb-1">No digests yet</p>
      <p className="text-sm">Run <code className="bg-slate-100 px-1 rounded">syncHv</code> to generate one</p>
    </div>
  )

  const generatedAt = selected?.generatedAt
    ? new Date(selected.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className="space-y-3">

      {/* History selector */}
      <div className="relative">
        <select
          value={selected?.id || ''}
          onChange={e => setSelected(history.find(h => h.id === e.target.value) || null)}
          className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200
                     rounded-lg px-3 py-2 pr-8 appearance-none cursor-pointer
                     focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
        >
          {history.map(h => (
            <option key={h.id} value={h.id}>
              Round {h.roundNumber}
              {h.generatedAt
                ? '  ·  ' + new Date(h.generatedAt).toLocaleDateString('en-AU',
                    { day: 'numeric', month: 'short', year: 'numeric' })
                : ''}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>

      {/* Toolbar — generated timestamp + copy */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-400">
          {generatedAt ? `Generated ${generatedAt}` : ''}
        </span>
        <button onClick={handleCopy}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors
                            ${copied
                              ? 'bg-green-600 text-white'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'}`}>
          {copied ? '✓ Copied' : 'Copy to clipboard'}
        </button>
      </div>

      {/* Preview */}
      {selected && (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
          {selected.html
            ? <div className="p-4 text-sm leading-relaxed"
                   dangerouslySetInnerHTML={{ __html: selected.html }} />
            : <pre className="p-4 text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                {selected.text}
              </pre>
          }
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function FixtureView({ teams, isAdmin }) {
  // Mobile-only tab state — desktop always shows both
  const [mobileTab, setMobileTab] = useState('fixture')

  return (
    <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto">

      {/* ── Page header — subtle ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Fixture &amp; Results</h2>
          <p className="text-xs text-slate-400 mt-0.5">2026 Season · Mentone Men's Hockey</p>
        </div>
      </div>

      {/* ── Mobile tab switcher ── */}
      <div className="flex sm:hidden gap-1 bg-slate-100 rounded-lg p-1">
        {[
          { id: 'fixture', label: 'Fixture' },
          { id: 'digest',  label: 'Weekly Digest' },
        ].map(t => (
          <button key={t.id} onClick={() => setMobileTab(t.id)}
                  className={`flex-1 text-sm font-medium py-1.5 rounded-md transition-colors
                              ${mobileTab === t.id
                                ? 'bg-white text-slate-800 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Layout ── */}
      {/* Desktop: side by side. Mobile: single panel via tab. */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">

        {/* Fixture — full on desktop, conditional on mobile */}
        <div className={`w-full sm:flex-1 sm:min-w-0 ${mobileTab !== 'fixture' ? 'hidden sm:block' : ''}`}>
          <FixturePanel teams={teams} />
        </div>

        {/* Divider — desktop only */}
        <div className="hidden sm:block w-px bg-slate-200 self-stretch flex-shrink-0" />

        {/* Digest — desktop sidebar, conditional on mobile */}
        <div className={`w-full sm:w-96 flex-shrink-0 ${mobileTab !== 'digest' ? 'hidden sm:block' : ''}`}>
          {/* Desktop section heading */}
          <div className="hidden sm:flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-600">Weekly Digest</h3>
            <div className="flex-1 h-px bg-slate-200" />
          </div>
          <DigestPanel />
        </div>

      </div>
    </div>
  )
}
