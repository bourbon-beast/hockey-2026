// Run this to add rounds tables without wiping existing data
// Usage: node server/migrate-rounds.js

import { getDb, run, all } from './db.js'

async function migrate() {
  await getDb()
  
  // ── Always run these regardless of table state ──

  // Add default_position to players
  try {
    run('ALTER TABLE players ADD COLUMN default_position TEXT')
    console.log('Added default_position to players')
  } catch (e) {
    console.log('default_position already exists on players')
  }

  // Add position to round_selections
  try {
    run('ALTER TABLE round_selections ADD COLUMN position TEXT')
    console.log('Added position to round_selections')
  } catch (e) {
    console.log('position already exists on round_selections')
  }

  // Fix rounds.round_number NOT NULL constraint — practice rounds don't have one
  try {
    const rows = all("SELECT sql FROM sqlite_master WHERE type='table' AND name='rounds'")
    const sql = rows[0]?.sql || ''
    if (sql.includes('round_number INTEGER NOT NULL') || !sql.includes('round_number INTEGER')) {
      console.log('Fixing rounds table to allow NULL round_number...')
      run('ALTER TABLE rounds RENAME TO rounds_old')
      run(`
        CREATE TABLE rounds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_number INTEGER,
          name TEXT,
          round_type TEXT DEFAULT 'season',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `)
      run('INSERT INTO rounds SELECT * FROM rounds_old')
      run('DROP TABLE rounds_old')
      console.log('Done — rounds table fixed.')
    } else {
      console.log('rounds table already allows NULL round_number')
    }
  } catch (e) {
    console.log('rounds migration error:', e.message)
  }

  // Add confirmed flag to round_selections
  try {
    run('ALTER TABLE round_selections ADD COLUMN confirmed INTEGER DEFAULT 0')
    console.log('Added confirmed to round_selections')
  } catch (e) {
    console.log('confirmed already exists on round_selections')
  }

  // Remove UNIQUE(round_id, player_id) so players can appear in multiple teams per round
  // SQLite can't DROP CONSTRAINT, so rebuild the table
  try {
    const rows = all("SELECT sql FROM sqlite_master WHERE type='table' AND name='round_selections'")
    const sql = rows[0]?.sql || ''
    if (sql.includes('UNIQUE(round_id, player_id)')) {
      console.log('Removing UNIQUE(round_id, player_id) from round_selections...')
      run('ALTER TABLE round_selections RENAME TO round_selections_old')
      run(`
        CREATE TABLE round_selections (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id INTEGER NOT NULL,
          team_id TEXT NOT NULL,
          player_id INTEGER NOT NULL,
          slot_number INTEGER NOT NULL,
          position TEXT,
          FOREIGN KEY (round_id) REFERENCES rounds(id),
          FOREIGN KEY (team_id) REFERENCES teams(id),
          FOREIGN KEY (player_id) REFERENCES players(id),
          UNIQUE(round_id, team_id, slot_number)
        )
      `)
      run('INSERT INTO round_selections SELECT * FROM round_selections_old')
      run('DROP TABLE round_selections_old')
      console.log('Done — data preserved, constraint removed.')
    } else {
      console.log('round_selections already clean')
    }
  } catch (e) {
    console.log('Constraint migration error:', e.message)
  }

  // ── Rounds table setup ──
  const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name='rounds'")
  
  if (tables.length > 0) {
    console.log('Rounds tables already exist')
    
    // Check if we need to add new columns
    try {
      run('ALTER TABLE rounds ADD COLUMN name TEXT')
      console.log('Added name column to rounds')
    } catch (e) {
      console.log('name column already exists')
    }
    
    try {
      run('ALTER TABLE rounds ADD COLUMN round_type TEXT DEFAULT "season"')
      console.log('Added round_type column to rounds')
    } catch (e) {
      console.log('round_type column already exists')
    }

    return
  }

  // Add default_position to players
  try {
    run('ALTER TABLE players ADD COLUMN default_position TEXT')
    console.log('Added default_position to players')
  } catch (e) {
    console.log('default_position already exists on players')
  }

  // Add position to round_selections
  try {
    run('ALTER TABLE round_selections ADD COLUMN position TEXT')
    console.log('Added position to round_selections')
  } catch (e) {
    console.log('position already exists on round_selections')
  }
  
  console.log('Creating rounds tables...')
  
  // Rounds table - one row per round
  // round_type: 'season' for R1, R2 etc, 'practice' for named rounds
  run(`
    CREATE TABLE rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_number INTEGER,
      name TEXT,
      round_type TEXT DEFAULT 'season',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  
  // Round matches - fixture details per team per round
  run(`
    CREATE TABLE round_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      team_id TEXT NOT NULL,
      match_date TEXT,
      time TEXT,
      venue TEXT,
      opponent TEXT,
      FOREIGN KEY (round_id) REFERENCES rounds(id),
      FOREIGN KEY (team_id) REFERENCES teams(id)
    )
  `)
  
  // Round selections - which players are selected for which team in which round
  run(`
    CREATE TABLE round_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      team_id TEXT NOT NULL,
      player_id INTEGER NOT NULL,
      slot_number INTEGER NOT NULL,
      FOREIGN KEY (round_id) REFERENCES rounds(id),
      FOREIGN KEY (team_id) REFERENCES teams(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(round_id, team_id, slot_number),
      UNIQUE(round_id, player_id)
    )
  `)
  
  console.log('Migration complete!')
}

migrate().catch(console.error)
