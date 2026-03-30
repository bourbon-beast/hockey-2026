import { readFileSync } from 'fs'

const server = readFileSync('F:/Documents/Steve/Development/hockey-2026/server/index.js', 'utf8')
console.log('Server delete route:', server.includes("app.delete('/api/rounds/:id'") ? 'OK' : 'MISSING')

const ui = readFileSync('F:/Documents/Steve/Development/hockey-2026/src/components/RoundPlanner.jsx', 'utf8')
console.log('UI deleteRound fn:    ', ui.includes('const deleteRound') ? 'OK' : 'MISSING')
console.log('UI saveRename fn:     ', ui.includes('const saveRename') ? 'OK' : 'MISSING')
console.log('UI delete modal:      ', ui.includes('showDeleteConfirm') ? 'OK' : 'MISSING')
console.log('UI rename modal:      ', ui.includes('showRenameModal') ? 'OK' : 'MISSING')
console.log('UI buttons:           ', ui.includes('openRenameModal') ? 'OK' : 'MISSING')
