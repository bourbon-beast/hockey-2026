// generateEmailHtml.js
// Generates a full HTML email string from round data, matching the MHC team sheet design.

import { TEAM_FULL_NAMES } from '../components/roundUtils'

const TEAM_ORDER = ['PL', 'PLR', 'PB', 'PC', 'PE', 'Metro']

const cCap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : ''

const formatRoundDate = (match) => {
  if (!match?.match_date) return '—'
  const d = new Date(match.match_date + 'T00:00:00')
  const day = d.getDate()
  const ord = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  const weekday = d.toLocaleDateString('en-AU', { weekday: 'long' })
  return `${weekday} ${day}${ord}`
}

const kitSwatches = (match) => {
  const top = (match?.top_colour || 'blue').toLowerCase()
  const socks = (match?.socks_colour || 'yellow').toLowerCase()
  const topBg = top === 'white' ? '#e2e8f0' : '#2563eb'
  const topBorder = top === 'white' ? 'border:1px solid #cbd5e1;' : ''
  const socksBg = socks === 'yellow' ? '#facc15' : '#2563eb'
  return `<span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${topBg};${topBorder}vertical-align:middle;margin-left:8px;"></span><span style="display:inline-block;width:16px;height:16px;border-radius:4px;background:${socksBg};vertical-align:middle;margin-left:4px;"></span>`
}

const infoRows = (match) => {
  const top = (match?.top_colour || 'blue').toLowerCase()
  const socks = (match?.socks_colour || 'yellow').toLowerCase()
  const rows = [
    { label: 'DATE',   value: formatRoundDate(match) },
    { label: 'TIME',   value: match?.time || '—' },
    { label: 'ARRIVE', value: match?.arrive_at || '—' },
    { label: 'VS',     value: match?.opponent || '—' },
    { label: 'VENUE',  value: match?.venue || '—' },
    { label: 'KIT',    value: `${cCap(top)} top &nbsp;·&nbsp; ${cCap(socks)} socks`, swatches: true },
  ]
  return rows.map((r, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
    const val = r.swatches ? `${r.value}${kitSwatches(match)}` : r.value
    return `<tr style="background:${bg};">
      <td style="padding:7px 12px 7px 16px;color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:0.05em;white-space:nowrap;width:1%;">${r.label}</td>
      <td style="padding:7px 16px 7px 8px;color:#0f172a;font-size:14px;font-weight:700;">${val}</td>
    </tr>`
  }).join('')
}

const playerRows = (players, duplicateIds) => {
  if (!players.length) {
    return `<tr><td colspan="3" style="padding:14px 16px;color:#94a3b8;font-style:italic;font-size:14px;">No players selected</td></tr>`
  }
  return players.map((p, i) => {
    const avail = Number(p.confirmed ?? 0)
    const isDupe = duplicateIds.has(p.player_id ?? p.id)
    const bg = avail === 3
      ? (i % 2 === 0 ? '#fff1f2' : '#ffe4e6')
      : (i % 2 === 0 ? '#ffffff' : '#f8fafc')
    const accentColor = avail === 2 ? '#22c55e' : avail === 3 ? '#ef4444' : 'transparent'
    const nameColor = avail === 3 ? '#94a3b8' : '#0f172a'
    const nameStyle = avail === 3 ? 'font-style:italic;' : ''
    const borderTop = i > 0 ? 'border-top:1px solid #e2e8f0;' : ''
    const duBadge = isDupe
      ? `<span style="font-size:11px;font-weight:700;color:#c2410c;background:#ffedd5;border:1px solid #fb923c;border-radius:4px;padding:2px 5px;margin-left:6px;white-space:nowrap;">DU</span>`
      : ''
    return `<tr style="background:${bg};${borderTop}">
      <td style="width:4px;padding:0;background:${accentColor};line-height:42px;">&nbsp;</td>
      <td style="padding:0 8px 0 12px;width:28px;color:#94a3b8;font-size:12px;font-weight:700;height:42px;white-space:nowrap;">${i + 1}</td>
      <td style="padding:0 16px 0 4px;color:${nameColor};font-size:17px;font-weight:700;${nameStyle}word-break:break-word;">${p.name}${duBadge}</td>
    </tr>`
  }).join('')
}

const teamBlock = (tid, match, players, duplicateIds) => {
  const fullName = TEAM_FULL_NAMES[tid] || tid
  return `
<div style="background:#ffffff;margin:12px 0;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
  <div style="background:#1d4ed8;padding:12px 16px 14px;">
    <div style="color:#ffffff;font-size:26px;font-weight:700;margin:0 0 2px;">${tid}</div>
    <div style="color:#bfdbfe;font-size:14px;">${fullName}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;border-bottom:2px solid #cbd5e1;">
    ${infoRows(match)}
  </table>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
    ${playerRows(players, duplicateIds)}
  </table>
  <div style="padding:8px 16px 12px;background:#ffffff;">
    <span style="color:#94a3b8;font-size:10px;">Generated ${new Date().toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
  </div>
</div>`
}

const fixturesBlock = (teams, roundData) => {
  const lines = TEAM_ORDER
    .filter(tid => teams.some(t => t.id === tid))
    .map(tid => {
      const match = (roundData.matches || []).find(m => m.team_id === tid) || {}
      const dateStr = formatRoundDate(match)
      const time = match.time ? ` ${match.time}` : ''
      const opp = match.opponent || '—'
      const venue = match.venue || '—'
      const fullName = TEAM_FULL_NAMES[tid] || tid
      return `<p style="margin:0 0 6px;font-size:13px;color:#334155;line-height:1.5;"><strong style="color:#1d4ed8;">${fullName}</strong> &mdash; ${dateStr}${time} vs ${opp} @ ${venue}</p>`
    }).join('')
  return `
<div style="background:#ffffff;margin:12px 0;border:1px solid #cbd5e1;border-top:3px solid #1d4ed8;border-radius:4px;padding:16px;">
  <p style="margin:0 0 10px;color:#0f172a;font-size:15px;font-weight:700;">Fixtures @ a glance:</p>
  ${lines}
</div>`
}

export const generateEmailHtml = (roundData, currentRound, teams, duplicateIds = new Set()) => {
  const roundLabel = currentRound?.round_type === 'season'
    ? `Round ${currentRound.round_number}`
    : currentRound?.name || 'Practice Match'

  const teamBlocks = TEAM_ORDER
    .filter(tid => teams.some(t => t.id === tid))
    .map(tid => {
      const match = (roundData.matches || []).find(m => m.team_id === tid) || {}
      const players = (roundData.selections || [])
        .filter(s => s.team_id === tid && !s.is_unavailable)
        .sort((a, b) => a.slot_number - b.slot_number)
      return teamBlock(tid, match, players, duplicateIds)
    }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MHC ${roundLabel} Team Sheets</title>
</head>
<body style="margin:0;padding:12px;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="width:100%;max-width:480px;margin:0 auto;box-sizing:border-box;">

    <div style="background:#0f172a;padding:16px 16px 14px;border-radius:4px;margin-bottom:4px;">
      <div style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 3px;letter-spacing:0.01em;">MENTONE HOCKEY CLUB</div>
      <div style="color:#94a3b8;font-size:13px;margin:0 0 2px;">Men's Section &nbsp;·&nbsp; ${roundLabel}</div>
      <div style="color:#475569;font-size:11px;">Team Sheet</div>
    </div>

    ${teamBlocks}
    ${fixturesBlock(teams, roundData)}

  </div>
</body>
</html>`
}
