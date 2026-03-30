import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'squad.db')

let db = null

export async function getDb() {
  if (db) return db
  
  const SQL = await initSqlJs()
  
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH)
    db = new SQL.Database(buffer)
    console.log('Loaded existing database from', DB_PATH)
  } else {
    db = new SQL.Database()
    console.log('Created new in-memory database')
  }
  
  return db
}

export function saveDb() {
  if (db) {
    const data = db.export()
    const buffer = Buffer.from(data)
    writeFileSync(DB_PATH, buffer)
    console.log('Database saved to', DB_PATH)
  }
}

// Helper to run queries and return results as array of objects
export function all(sql, params = []) {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    stmt.bind(params)
  }
  const results = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

export function get(sql, params = []) {
  const results = all(sql, params)
  return results[0] || null
}

export function run(sql, params = []) {
  try {
    db.run(sql, params)
    saveDb()
    console.log('Executed and saved:', sql.substring(0, 50) + '...')
  } catch (e) {
    console.error('Error executing SQL:', e)
    console.error('SQL:', sql)
    console.error('Params:', params)
    throw e
  }
}
