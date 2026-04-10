// roundUtils.js

export const TEAM_LABELS = {
    PL:    'Premier League',
    PLR:   'Premier League Reserves',
    PB:    'Pennant B',
    PC:    'Pennant C',
    PE:    'Pennant E SE',
    Metro: 'Metro 2 South',
}

export const TEAM_FULL_NAMES = {
    PL:    'Premier League',
    PLR:   'Premier League Reserves',
    PB:    'Pennant B',
    PC:    'Pennant C',
    PE:    'Pennant E SE',
    Metro: 'Metro 2 South',
}

export const AVAILABILITY = {
    0: { label: 'Not contacted', bg: 'bg-gray-200',  border: 'border-gray-300',   icon: null, title: 'Click — mark as waiting' },
    1: { label: 'Waiting',       bg: 'bg-yellow-400', border: 'border-yellow-400', icon: '?',  title: 'Click — mark as confirmed' },
    2: { label: 'Confirmed',     bg: 'bg-green-500',  border: 'border-green-500',  icon: '✓',  title: 'Click — reset to not contacted' },
}

export const POSITIONS = [
    { value: 'GK',  label: 'GK'  },
    { value: 'DEF', label: 'DEF' },
    { value: 'DM',  label: 'DM'  },
    { value: 'AM',  label: 'AM'  },
    { value: 'STR', label: 'STR' },
]

export const POSITION_STYLES = {
    GK:  { border: '#f59e0b', rowBg: '#fffbeb', badge: 'bg-amber-100 text-amber-700 border-amber-300',  selectCls: 'border-amber-400 text-amber-700 bg-amber-50'  },
    DEF: { border: '#3b82f6', rowBg: '#eff6ff', badge: 'bg-blue-100 text-blue-700 border-blue-300',     selectCls: 'border-blue-400 text-blue-700 bg-blue-50'     },
    DM:  { border: '#8b5cf6', rowBg: '#f5f3ff', badge: 'bg-violet-100 text-violet-700 border-violet-300', selectCls: 'border-violet-400 text-violet-700 bg-violet-50' },
    AM:  { border: '#10b981', rowBg: '#f0fdf4', badge: 'bg-emerald-100 text-emerald-700 border-emerald-300', selectCls: 'border-emerald-400 text-emerald-700 bg-emerald-50' },
    STR: { border: '#ef4444', rowBg: '#fef2f2', badge: 'bg-red-100 text-red-700 border-red-300',        selectCls: 'border-red-400 text-red-700 bg-red-50'        },
}

// ── Canvas Drawing Helpers ──
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

export const buildTeamCanvas = (tid, match, players, roundLabel, duplicateIds = new Set()) => {
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

    // Team name bar — no count badges
    const ty = CLUB_H
    ctx.fillStyle = '#1d4ed8'
    ctx.fillRect(0, ty, W, TEAM_H)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif'
    ctx.fillText(tid, PAD, ty + 34)
    ctx.fillStyle = '#bfdbfe'
    ctx.font = '16px system-ui, -apple-system, sans-serif'
    ctx.fillText(TEAM_FULL_NAMES[tid] || '', PAD, ty + 56)

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
    const topCol   = (match.top_colour   || 'blue').toLowerCase()
    const socksCol = (match.socks_colour || 'yellow').toLowerCase()

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
        // Label
        ctx.fillStyle = '#94a3b8'
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif'
        ctx.fillText(line.label, PAD, ly)
        // Value
        ctx.fillStyle = '#0f172a'
        ctx.font = 'bold 15px system-ui, -apple-system, sans-serif'
        ctx.fillText(line.value, PAD + LABEL_W, ly)
    })

    // Kit swatches
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
        const isDupe = duplicateIds.has(p.player_id ?? p.id)

        // Row bg — only red tint for unavailable, clean white/grey otherwise
        const rowBg = avail === 3
            ? (i % 2 === 0 ? '#fff1f2' : '#ffe4e6')
            : (i % 2 === 0 ? '#ffffff' : '#f8fafc')
        ctx.fillStyle = rowBg
        ctx.fillRect(0, ry, W, ROW_H)

        // Left accent bar — only for confirmed (green) or unavailable (red)
        if (avail === 2) { ctx.fillStyle = '#22c55e'; ctx.fillRect(0, ry, 4, ROW_H) }
        if (avail === 3) { ctx.fillStyle = '#ef4444'; ctx.fillRect(0, ry, 4, ROW_H) }

        if (i > 0) {
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1
            ctx.beginPath(); ctx.moveTo(PAD, ry); ctx.lineTo(W - PAD, ry); ctx.stroke()
        }

        // Row number
        ctx.fillStyle = '#94a3b8'
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
        ctx.fillText(`${i + 1}`, PAD, ry + 27)

        // Player name
        const isUnavail = avail === 3
        ctx.fillStyle = isUnavail ? '#94a3b8' : '#0f172a'
        ctx.font = `${isUnavail ? 'italic ' : ''}bold 19px system-ui, -apple-system, sans-serif`
        const nameSuffix = isUnavail ? ' (unavailable)' : ''
        ctx.fillText(p.name + nameSuffix, PAD + 34, ry + 27)

        // DU badge
        if (isDupe) {
            const duLabel = 'DU'
            ctx.font = 'bold 11px system-ui, -apple-system, sans-serif'
            const duW = ctx.measureText(duLabel).width + 10
            const duX = W - PAD - duW - 4
            cRR(ctx, duX, ry + 10, duW, 18, 4)
            ctx.fillStyle = '#ffedd5'; ctx.fill()
            ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 1; ctx.stroke()
            ctx.fillStyle = '#c2410c'
            ctx.fillText(duLabel, duX + 5, ry + 23)
        }
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