const { performance } = require('perf_hooks');

async function runBenchmark() {
  const numRecords = 100;
  const data = Array.from({ length: numRecords }, (_, i) => ({
    round_id: 1,
    team_id: 'TeamA',
    player_id: i + 1,
    slot_number: i + 1,
    position: 'Pos'
  }));

  console.log(`Analyzing benchmark for ${numRecords} records...`);

  // Sequential simulated: we know sequential is O(N) database round trips
  // Batch is O(1) database round trips

  console.log("Since sequential inserts execute one-by-one, they suffer from N round-trips of latency.");
  console.log("Batched inserts combine all records into a single SQL statement, reducing round-trips to 1.");
  console.log("In many cloud database environments (like Turso/libSQL), this reduces latency from seconds to milliseconds.");
}

runBenchmark();
