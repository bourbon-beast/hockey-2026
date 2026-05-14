export function getNextConfirmedState(current) {
  // Cycle: 0 (not contacted) → 1 (waiting) → 2 (confirmed) → 0
  // State 3 (unavailable) is removed — unavailable = drag below the line only
  if (current === 0) return 1
  if (current === 1) return 2
  return 0
}

export function checkClash(opponent) {
    if (!opponent) return { shirt: false, socks: false }
    const opp = opponent.toLowerCase()

    // Default blue shirt clashes with darker blues/purples/blacks
    // Default yellow socks clash with yellow/gold/orange socks
    return {
        shirt: opp.includes('maccabi') || opp.includes('waverley') || opp.includes('mornington'),
        socks: opp.includes('yv') || opp.includes('yarra') || opp.includes('frankston') || opp.includes('mhc')
    }
}
