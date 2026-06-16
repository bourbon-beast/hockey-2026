// generateNonFinancialHtml.js
// Simple HTML list of non-financial players — same visual language as team sheets / email digest.

// ── Canvas image export ──────────────────────────────────────────────────────

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

export const buildNonFinancialCanvas = (players) => {
  const W = 480
  const PAD = 24
  const CLUB_H = 90
  const BAND_H = 68
  const ROW_H = 42
  const FOOTER_H = 34
  const totalH = CLUB_H + BAND_H + Math.max(players.length, 1) * ROW_H + FOOTER_H + 8

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = totalH
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 0, W, totalH)

  // Club header
  const clubGrad = ctx.createLinearGradient(0, 0, W, CLUB_H)
  clubGrad.addColorStop(0, '#071827')
  clubGrad.addColorStop(0.58, '#0f2f49')
  clubGrad.addColorStop(1, '#132f55')
  ctx.fillStyle = clubGrad
  ctx.fillRect(0, 0, W, CLUB_H)
  ctx.fillStyle = '#eab308'
  ctx.fillRect(0, 0, W, 4)
  const clubGlow = ctx.createRadialGradient(W - 70, -18, 8, W - 70, -18, 170)
  clubGlow.addColorStop(0, 'rgba(96,165,250,0.32)')
  clubGlow.addColorStop(1, 'rgba(96,165,250,0)')
  ctx.fillStyle = clubGlow
  ctx.fillRect(0, 0, W, CLUB_H)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif'
  ctx.fillText('MENTONE HOCKEY CLUB', PAD, 34)
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '15px system-ui, -apple-system, sans-serif'
  ctx.fillText("Men's Section  ·  2026 Player List", PAD, 58)
  ctx.fillStyle = 'rgba(226,232,240,0.62)'
  ctx.font = '13px system-ui, -apple-system, sans-serif'
  ctx.fillText('Non-financial players', PAD, 78)

  // Amber band
  const by = CLUB_H
  const bandGrad = ctx.createLinearGradient(0, by, W, by + BAND_H)
  bandGrad.addColorStop(0, '#d97706')
  bandGrad.addColorStop(1, '#b45309')
  ctx.fillStyle = bandGrad
  ctx.fillRect(0, by, W, BAND_H)
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(0, by, W, 1)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 30px system-ui, -apple-system, sans-serif'
  ctx.fillText('Non-financial', PAD, by + 34)
  ctx.fillStyle = '#fef3c7'
  ctx.font = '16px system-ui, -apple-system, sans-serif'
  ctx.fillText(`${players.length} player${players.length === 1 ? '' : 's'}  ·  not club-financial`, PAD, by + 56)

  // Player rows
  const pl_y = CLUB_H + BAND_H
  ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, pl_y); ctx.lineTo(W, pl_y); ctx.stroke()

  if (players.length === 0) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = 'italic 15px system-ui, -apple-system, sans-serif'
    ctx.fillText('No players marked non-financial', PAD, pl_y + 28)
  } else {
    players.forEach((p, i) => {
      const ry = pl_y + i * ROW_H
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#f8fafc'
      ctx.fillRect(0, ry, W, ROW_H)
      if (i > 0) {
        ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1
        ctx.beginPath(); ctx.moveTo(PAD, ry); ctx.lineTo(W - PAD, ry); ctx.stroke()
      }
      // Row number
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
      ctx.fillText(`${i + 1}`, PAD, ry + 27)
      // Name
      ctx.fillStyle = '#0f172a'
      ctx.font = 'bold 19px system-ui, -apple-system, sans-serif'
      ctx.fillText(p.name, PAD + 34, ry + 27)
      // $ badge
      const nameW = ctx.measureText(p.name).width
      ctx.fillStyle = '#d97706'
      ctx.font = 'bold 13px system-ui, -apple-system, sans-serif'
      ctx.fillText('$', PAD + 34 + nameW + 3, ry + 20)
    })
  }

  // Footer
  const ft_y = pl_y + Math.max(players.length, 1) * ROW_H + 8
  const generated = new Date().toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, ft_y, W, FOOTER_H)
  ctx.fillStyle = '#94a3b8'
  ctx.font = '11px system-ui, -apple-system, sans-serif'
  ctx.fillText(`Generated ${generated}`, PAD, ft_y + 22)

  return canvas
}

// ── HTML export ──────────────────────────────────────────────────────────────

const playerRows = (players) => {
  if (!players.length) {
    return `<tr><td colspan="2" style="padding:14px 16px;color:#94a3b8;font-style:italic;font-size:14px;">No players marked non-financial</td></tr>`
  }
  return players.map((p, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc'
    const borderTop = i > 0 ? 'border-top:1px solid #e2e8f0;' : ''
    return `<tr style="background:${bg};${borderTop}">
      <td style="padding:0 8px 0 12px;width:28px;color:#94a3b8;font-size:12px;font-weight:700;height:42px;white-space:nowrap;">${i + 1}</td>
      <td style="padding:0 16px 0 4px;color:#0f172a;font-size:17px;font-weight:700;word-break:break-word;">${p.name}<sup style="color:#d97706;font-weight:700;font-size:11px;margin-left:2px;">$</sup></td>
    </tr>`
  }).join('')
}

export const generateNonFinancialPlainText = (players) => {
  if (!players.length) return 'No players marked non-financial.'
  return players.map((p, i) => `${i + 1}. ${p.name}`).join('\n')
}

export const generateNonFinancialHtml = (players) => {
  const generated = new Date().toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MHC Non-financial Players</title>
</head>
<body style="margin:0;padding:12px;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="width:100%;max-width:480px;margin:0 auto;box-sizing:border-box;">

    <div style="background:#0f172a;padding:16px 16px 14px;border-radius:4px;margin-bottom:4px;">
      <div style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 3px;letter-spacing:0.01em;">MENTONE HOCKEY CLUB</div>
      <div style="color:#94a3b8;font-size:13px;margin:0 0 2px;">Men's Section &nbsp;·&nbsp; 2026 Player List</div>
      <div style="color:#475569;font-size:11px;">Non-financial players</div>
    </div>

    <div style="background:#ffffff;margin:12px 0;border:1px solid #cbd5e1;border-radius:4px;overflow:hidden;">
      <div style="background:#d97706;padding:12px 16px 14px;">
        <div style="color:#ffffff;font-size:22px;font-weight:700;margin:0 0 2px;">Non-financial</div>
        <div style="color:#fef3c7;font-size:14px;">${players.length} player${players.length === 1 ? '' : 's'} &nbsp;·&nbsp; not club-financial</div>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
        ${playerRows(players)}
      </table>
      <div style="padding:8px 16px 12px;background:#ffffff;">
        <span style="color:#94a3b8;font-size:10px;">Generated ${generated}</span>
      </div>
    </div>

  </div>
</body>
</html>`
}
