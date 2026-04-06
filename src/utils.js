export function getNextConfirmedState(current) {
  // Cycle: 0 (not contacted) → 1 (waiting) → 2 (confirmed) → 0
  // State 3 (unavailable) is removed — unavailable = drag below the line only
  if (current === 0) return 1
  if (current === 1) return 2
  return 0
}
