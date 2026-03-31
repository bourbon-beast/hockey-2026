export function getNextConfirmedState(current) {
  // Cycle: 0 → 1 → 2 → 3 → 0
  return typeof current === 'number' ? (current + 1) % 4 : 1
}
