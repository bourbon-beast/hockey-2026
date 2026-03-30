const Database = require('better-sqlite3')
const db = new Database('./squad.db')

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()
console.log('Tables:', tables.map(t => t.name))

tables.forEach(({ name }) => {
  const cols = db.prepare('PRAGMA table_info(' + name + ')').all()
  const count = db.prepare('SELECT COUNT(*) as c FROM ' + name).get()
  console.log('\n' + name + ' (' + count.c + ' rows): ' + cols.map(c => c.name).join(', '))
})
