import { readFileSync } from 'fs'

const server = readFileSync('F:/Documents/Steve/Development/hockey-2026/server/index.js', 'utf8')
const dashboard = readFileSync('F:/Documents/Steve/Development/hockey-2026/src/components/Dashboard.jsx', 'utf8')

console.log('Server s_planning in query:', server.includes('s_planning') ? 'OK' : 'MISSING')
console.log('Server s_not_heard in query:', server.includes('s_not_heard') ? 'OK' : 'MISSING')
console.log('Server t.id != NEW filter:', server.includes("t.id != 'NEW'") ? 'OK' : 'MISSING')
console.log('Dashboard STATUSES array:', dashboard.includes('const STATUSES') ? 'OK' : 'MISSING')
console.log('Dashboard stacked bar:', dashboard.includes('STATUS_KEY') ? 'OK' : 'MISSING')
console.log('Dashboard per-team cards:', dashboard.includes('stats.byTeam.map') ? 'OK' : 'MISSING')
console.log('Dashboard response rate:', dashboard.includes('responseRate') ? 'OK' : 'MISSING')
