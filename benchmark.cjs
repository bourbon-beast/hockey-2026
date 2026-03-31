const { performance } = require('perf_hooks');

const N = 5000; // Teams
const M = 5000; // Prev Matches

// Generate mock data
const teams = Array.from({ length: N }, (_, i) => ({ id: `team_${i}` }));
// Shuffle prevMatches slightly or reverse to ensure worst case isn't always hit but still average case is O(N*M)
const prevMatches = Array.from({ length: M }, (_, i) => ({
  team_id: `team_${M - 1 - i}`, // Reverse order to make find work a bit harder on average
  time: `1${i}:00`,
  venue: `Venue ${i}`
}));

function baseline() {
  const start = performance.now();
  let dummyCount = 0;
  for (const t of teams) {
    const prevMatch = prevMatches.find(m => m.team_id === t.id) || {};
    if (prevMatch.time) dummyCount++;
  }
  const end = performance.now();
  return { time: end - start, dummyCount };
}

function optimized() {
  const start = performance.now();
  let dummyCount = 0;

  const prevMatchMap = new Map();
  for (const m of prevMatches) {
    prevMatchMap.set(m.team_id, m);
  }

  for (const t of teams) {
    const prevMatch = prevMatchMap.get(t.id) || {};
    if (prevMatch.time) dummyCount++;
  }
  const end = performance.now();
  return { time: end - start, dummyCount };
}

// Warmup
for (let i = 0; i < 5; i++) {
  baseline();
  optimized();
}

console.log(`Running benchmark with N=${N} teams, M=${M} previous matches...`);

let baseTotal = 0;
let optTotal = 0;
const iterations = 10;

for (let i = 0; i < iterations; i++) {
  baseTotal += baseline().time;
  optTotal += optimized().time;
}

const baseAvg = baseTotal / iterations;
const optAvg = optTotal / iterations;

console.log(`Baseline Average time: ${baseAvg.toFixed(2)} ms`);
console.log(`Optimized Average time: ${optAvg.toFixed(2)} ms`);
if (optAvg > 0) {
  console.log(`Improvement: ${(baseAvg / optAvg).toFixed(2)}x faster`);
}
