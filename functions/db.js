// functions/db.js — Turso client, credentials passed explicitly at first call
const { createClient } = require('@libsql/client')

let client = null

function init(url, token) {
  client = createClient({
    url: url.trim(),
    authToken: token.trim(),
  })
}

function getClient() {
  if (!client) throw new Error('Turso client not initialised — call db.init() first')
  return client
}

async function all(sql, params = []) {
  const result = await getClient().execute({ sql, args: params })
  return result.rows
}

async function get(sql, params = []) {
  const rows = await all(sql, params)
  return rows[0] || null
}

async function run(sql, params = []) {
  return getClient().execute({ sql, args: params })
}

module.exports = { init, all, get, run }
