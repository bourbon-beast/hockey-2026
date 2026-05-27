// Split weekly digest HTML (from Firebase format_html) into three logical sections and render PNGs via html2canvas.

import html2canvas from 'html2canvas'

/** Target ~phone column width; pngs reflow taller rather than wide desktop strips */
const EXPORT_WIDTH_PX = 448
/** top right bottom left — extra right inset so html2canvas doesn’t clip badge edges */
const EXPORT_PAD = '18px 28px 18px 18px'

/** @returns {HTMLElement[]} */
function getDigestRootChildren(htmlString) {
  const doc = new DOMParser().parseFromString(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlString}</body></html>`,
    'text/html'
  )
  const root = doc.body.firstElementChild
  if (!root || root.tagName !== 'DIV') return []
  return Array.from(root.children)
}

/**
 * Locate section boundaries matching functions/main.py format_html output.
 * @returns {{ header: HTMLElement[], results: HTMLElement[], nextRound: HTMLElement[], seasonStats: HTMLElement[] }}
 */
export function splitDigestSections(htmlString) {
  const kids = getDigestRootChildren(htmlString).map(el => /** @type {HTMLElement} */ (el.cloneNode(true)))
  const idxResultsP = kids.findIndex(
    el => el.tagName === 'P' && el.textContent.trim() === 'Results'
  )
  if (idxResultsP < 0) {
    return { header: [], results: [...kids], nextRound: [], seasonStats: [] }
  }

  const header = kids.slice(0, idxResultsP)

  const findHrBefore = (predicate) => {
    for (let i = idxResultsP + 1; i < kids.length; i++) {
      const el = kids[i]
      if (el.tagName !== 'HR') continue
      const next = kids[i + 1]
      if (next && predicate(next)) return i
    }
    return -1
  }

  const hrBeforeNextIdx = findHrBefore(
    next => next.tagName === 'P' && next.textContent.trim().startsWith('Next Round')
  )
  const hrBeforeStatsIdx = findHrBefore(
    next => next.tagName === 'P' && next.textContent.includes('Season Stats')
  )

  let resultsEnd = kids.length
  if (hrBeforeNextIdx >= 0) resultsEnd = hrBeforeNextIdx
  else if (hrBeforeStatsIdx >= 0) resultsEnd = hrBeforeStatsIdx

  const results = kids.slice(idxResultsP, resultsEnd)

  let nextRound = []
  let seasonStats = []
  const idxNextP = kids.findIndex(
    (el, i) =>
      i > idxResultsP &&
      el.tagName === 'P' &&
      el.textContent.trim().startsWith('Next Round')
  )

  const idxStatsP = kids.findIndex(
    (el, i) =>
      i > idxResultsP &&
      el.tagName === 'P' &&
      el.textContent.includes('Season Stats')
  )

  if (idxNextP >= 0) {
    const nextEnd =
      hrBeforeStatsIdx >= 0 && hrBeforeStatsIdx > idxNextP ? hrBeforeStatsIdx : kids.length
    nextRound = kids.slice(idxNextP, nextEnd)
  }

  if (idxStatsP >= 0) {
    seasonStats = kids.slice(idxStatsP)
  }

  return { header, results, nextRound, seasonStats }
}

/** Omit spreadsheet link from PNG headers (not clickable); HTML/email unchanged. */
function headerElementsForImageExport(headerEls) {
  return headerEls.filter(el => {
    if (el.tagName !== 'P') return true
    const hasSheet = el.querySelector('a[href*="docs.google.com/spreadsheets"]')
    const txt = (el.textContent || '').toLowerCase()
    if (hasSheet && txt.includes('unavailability')) return false
    return true
  })
}

/** For non-results images: keep only the "Week ending" subtitle and any HR divider. */
function minimalHeaderForPng(headerEls) {
  return headerEls.filter(el => {
    if (el.tagName === 'HR') return true
    if (el.tagName === 'P' && el.textContent.trim().toLowerCase().startsWith('week ending')) return true
    return false
  })
}

function assembleClone(headerEls, bodyEls) {
  const inner = document.createElement('div')
  inner.style.cssText =
    'box-sizing:border-box;width:100%;max-width:100%;color:#1e293b;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;'
  headerEls.forEach(el => inner.appendChild(el.cloneNode(true)))
  bodyEls.forEach(el => inner.appendChild(el.cloneNode(true)))
  return inner
}

/**
 * @param {HTMLElement} inner Root content to rasterise (cloned off-DOM ok)
 */
async function rasterise(inner) {
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;left:-12000px;top:0;width:${EXPORT_WIDTH_PX}px;padding:${EXPORT_PAD};` +
    'box-sizing:border-box;background:#ffffff;font-family:Arial,sans-serif;font-size:14px;overflow:visible;'
  host.appendChild(inner)
  document.body.appendChild(host)

  try {
    await new Promise(requestAnimationFrame)
    const canvas = await html2canvas(host, {
      scale: Math.min(2, window.devicePixelRatio || 2),
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    })
    return canvas
  } finally {
    document.body.removeChild(host)
  }
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a')
  link.download = filename
  link.href = canvas.toDataURL('image/png')
  link.click()
}

/**
 * @param {string} digestHtml -
 * @param {{ roundNumber?: number|null }} opts -
 * @param {{ delayBetweenMs?: number }} timing -
 */
export async function exportDigestImageTriptych(digestHtml, opts = {}, timing = {}) {
  const { roundNumber } = opts
  const delayBetweenMs = timing.delayBetweenMs ?? 350

  const { header, results, nextRound, seasonStats } = splitDigestSections(digestHtml)
  const rLabel =
    roundNumber != null ? `Round-${roundNumber}` : `Round-unknown`

  const emptyPlaceholder = msg => {
    const p = document.createElement('p')
    p.style.cssText = 'font-size:13px;color:#94a3b8;font-style:italic;margin:12px 0 0 0'
    p.textContent = msg
    return [p]
  }

  const fullHeader = headerElementsForImageExport(header)
  const minHeader = minimalHeaderForPng(fullHeader)

  const parts = [
    {
      slug: `${rLabel}-weekly-results`,
      header: fullHeader,
      body: results.length ? results : emptyPlaceholder('No results in this digest.'),
    },
    {
      slug: `${rLabel}-next-round`,
      header: minHeader,
      body: nextRound.length ? nextRound : emptyPlaceholder('No next-round fixtures in this digest.'),
    },
    {
      slug: `${rLabel}-season-stats`,
      header: minHeader,
      body:
        seasonStats.length ? seasonStats : emptyPlaceholder('No season stats in this digest.'),
    },
  ]

  for (let i = 0; i < parts.length; i++) {
    const inner = assembleClone(parts[i].header, parts[i].body)
    const canvas = await rasterise(inner)
    downloadCanvas(canvas, `MHC-Digest-${parts[i].slug}.png`)
    if (i < parts.length - 1) await new Promise(res => setTimeout(res, delayBetweenMs))
  }
}
