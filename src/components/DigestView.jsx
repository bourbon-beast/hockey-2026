import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Copy, Images } from 'lucide-react'
import DOMPurify from 'dompurify'
import { getDigestHistory, getPlayers } from '../db'
import { exportDigestImageTriptych } from '../utils/digestExportImages'
import PageHeader from './PageHeader'

function cardPoints(stats) {
  if (!stats) return 0
  return (
    (stats.greenCards || 0) * 1 +
    (stats.yellowCards || 0) * 2 +
    (stats.redCards || 0) * 3
  )
}

function CardLetters({ yellow, green, red }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold">
      {Array.from({ length: yellow }, (_, i) => (
        <span key={`y-${i}`} className="text-amber-600">Y</span>
      ))}
      {Array.from({ length: green }, (_, i) => (
        <span key={`g-${i}`} className="text-green-700">G</span>
      ))}
      {Array.from({ length: red }, (_, i) => (
        <span key={`r-${i}`} className="text-red-600">R</span>
      ))}
    </span>
  )
}

function buildLeaderboards(players) {
  const active = players.filter(player => player.is_active !== 0)
  const scorers = active
    .filter(player => (player.stats_2026?.goals || 0) > 0)
    .map(player => ({
      id: player.id,
      name: player.name,
      goals: player.stats_2026?.goals || 0,
    }))
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, 8)

  const cards = active
    .filter(player => cardPoints(player.stats_2026) > 0)
    .map(player => {
      const stats = player.stats_2026 || {}
      return {
        id: player.id,
        name: player.name,
        green: stats.greenCards || 0,
        yellow: stats.yellowCards || 0,
        red: stats.redCards || 0,
        points: cardPoints(stats),
      }
    })
    .sort((a, b) => (
      b.points - a.points ||
      b.yellow - a.yellow ||
      b.red - a.red ||
      a.name.localeCompare(b.name)
    ))
    .slice(0, 8)

  return { scorers, cards }
}

function LeaderboardCard({ title, subtitle, emptyText, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {children || <p className="text-sm text-slate-400">{emptyText}</p>}
      </div>
    </div>
  )
}

function Leaderboards() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getPlayers(false)
      .then(rows => { if (!cancelled) setPlayers(rows) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const leaders = useMemo(() => buildLeaderboards(players), [players])

  if (loading) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400 shadow-sm">Loading leaders...</div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-400 shadow-sm">Loading leaders...</div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <LeaderboardCard title="Top Scorers" subtitle="Current season goals" emptyText="No goals recorded yet.">
        {leaders.scorers.length > 0 && leaders.scorers.map((player, index) => (
          <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
              <span className="truncate text-sm font-semibold text-slate-800">{player.name}</span>
            </div>
            <div className="text-right">
              <div className="text-lg font-black tabular-nums text-slate-900">{player.goals}</div>
              <div className="text-[10px] font-semibold uppercase text-slate-400">Goals</div>
            </div>
          </div>
        ))}
      </LeaderboardCard>

      <LeaderboardCard title="Cards of Shame" subtitle="Weighted card points" emptyText="No cards recorded yet.">
        {leaders.cards.length > 0 && leaders.cards.map((player, index) => (
          <div key={player.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xs font-bold text-white">{index + 1}</span>
              <span className="truncate text-sm font-semibold text-slate-800">{player.name}</span>
              <CardLetters yellow={player.yellow} green={player.green} red={player.red} />
            </div>
            <div className="text-right">
              <div className="text-lg font-black tabular-nums text-slate-900">{player.points}</div>
              <div className="text-[10px] font-semibold uppercase text-slate-400">Pts</div>
            </div>
          </div>
        ))}
      </LeaderboardCard>
    </div>
  )
}

function DigestPanel() {
  const [history, setHistory] = useState([])
  const [selected, setSelected] = useState(null)
  const [loadingHistory, setLoadingH] = useState(true)
  const [copied, setCopied] = useState(false)
  const [exportingImages, setExportingImages] = useState(false)

  useEffect(() => {
    setLoadingH(true)
    getDigestHistory()
      .then(items => {
        setHistory(items)
        if (items.length > 0) setSelected(items[0])
      })
      .finally(() => setLoadingH(false))
  }, [])

  const handleCopy = async () => {
    if (!selected) return
    try {
      if (selected.html && navigator.clipboard?.write) {
        const htmlBlob = new Blob([selected.html], { type: 'text/html' })
        const textBlob = new Blob([selected.text || ''], { type: 'text/plain' })
        await navigator.clipboard.write([
          new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob }),
        ])
      } else {
        await navigator.clipboard.writeText(selected.text || '')
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = selected.text || ''
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleExportImages = async () => {
    if (!selected?.html?.trim()) return
    setExportingImages(true)
    try {
      await exportDigestImageTriptych(selected.html, {
        roundNumber: selected.roundNumber ?? null,
      })
    } catch (e) {
      console.warn('Digest image export failed', e)
      alert('Could not generate digest images. Try Chrome or Safari, or check console.')
    } finally {
      setExportingImages(false)
    }
  }

  if (loadingHistory) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-400 shadow-sm">
        Loading digests...
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
        <p className="mb-1 text-base font-medium">No digests yet</p>
        <p className="text-sm">Run <code className="rounded bg-slate-100 px-1">syncHv</code> to generate one</p>
      </div>
    )
  }

  const generatedAt = selected?.generatedAt
    ? new Date(selected.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Weekly Digest</h2>
          <p className="mt-0.5 text-xs text-slate-500">Review latest or older digests, then copy or export images.</p>
          <div className="relative mt-3 max-w-md">
            <select
              value={selected?.id || ''}
              onChange={e => setSelected(history.find(h => h.id === e.target.value) || null)}
              className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
            >
              {history.map(h => (
                <option key={h.id} value={h.id}>
                  Round {h.roundNumber}
                  {h.generatedAt
                    ? `  ·  ${new Date(h.generatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : ''}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-xs text-slate-400 lg:mr-2">
            {generatedAt ? `Generated ${generatedAt}` : ''}
          </span>
          <button
            type="button"
            disabled={!selected?.html?.trim() || exportingImages}
            title="Downloads 3 PNGs: results, next round, season stats"
            onClick={handleExportImages}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              (!selected?.html?.trim() || exportingImages)
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-slate-700 text-white hover:bg-slate-800'
            }`}
          >
            <Images size={14} strokeWidth={2} className="flex-shrink-0" />
            {exportingImages ? 'Saving PNGs...' : 'Digest images'}
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              copied ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy to clipboard'}
          </button>
        </div>
      </div>

      {/* 🛡️ Sentinel: Sanitize HTML output with DOMPurify to prevent XSS vulnerabilities */}
      {selected && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
          {selected.html
            ? <div className="p-4 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selected.html) }} />
            : <pre className="whitespace-pre-wrap p-4 font-sans text-sm leading-relaxed text-slate-700">{selected.text}</pre>}
        </div>
      )}
    </div>
  )
}

export default function DigestView() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Digest & Leaders"
        description="Weekly digest history, copy/export tools, and current season leaderboards"
      />
      <Leaderboards />
      <DigestPanel />
    </div>
  )
}
