import { createClient } from '@libsql/client';
import fs from 'fs';
import { performance } from 'perf_hooks';

const DB_FILE = 'benchmark.db';

// Clean up previous run
if (fs.existsSync(DB_FILE)) {
  fs.unlinkSync(DB_FILE);
}

const client = createClient({
  url: `file:${DB_FILE}`,
});

async function setup() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS round_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER,
      team_id TEXT,
      player_id INTEGER,
      slot_number INTEGER,
      position TEXT,
      confirmed INTEGER
    )
  `);
}

async function sequentialInserts(data) {
  const start = performance.now();
  for (const s of data) {
    await client.execute({
      sql: 'INSERT INTO round_selections (round_id, team_id, player_id, slot_number, position, confirmed) VALUES (?, ?, ?, ?, ?, 0)',
      args: [s.round_id, s.team_id, s.player_id, s.slot_number, s.position]
    });
  }
  const end = performance.now();
  return end - start;
}

async function batchedInserts(data) {
  if (data.length === 0) return 0;
  const start = performance.now();

  const placeholders = data.map(() => '(?, ?, ?, ?, ?, 0)').join(', ');
  const sql = `INSERT INTO round_selections (round_id, team_id, player_id, slot_number, position, confirmed) VALUES ${placeholders}`;
  const args = [];
  for (const s of data) {
    args.push(s.round_id, s.team_id, s.player_id, s.slot_number, s.position);
  }

  await client.execute({ sql, args });

  const end = performance.now();
  return end - start;
}

async function runBenchmark() {
  await setup();

  const numRecords = 100;
  const data = Array.from({ length: numRecords }, (_, i) => ({
    round_id: 1,
    team_id: 'TeamA',
    player_id: i + 1,
    slot_number: i + 1,
    position: 'Pos'
  }));

  console.log(`Running benchmark with ${numRecords} records...`);

  // Sequential
  const seqTime = await sequentialInserts(data);
  console.log(`Sequential inserts: ${seqTime.toFixed(2)}ms`);

  // Clear table
  await client.execute('DELETE FROM round_selections');

  // Batched
  const batchTime = await batchedInserts(data);
  console.log(`Batched inserts: ${batchTime.toFixed(2)}ms`);

  if (seqTime > 0) {
    console.log(`Improvement: ${((seqTime - batchTime) / seqTime * 100).toFixed(2)}%`);
  }

  process.exit(0);
}

runBenchmark().catch(err => {
    console.error(err);
    process.exit(1);
});
