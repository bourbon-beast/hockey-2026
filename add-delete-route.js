import { readFileSync, writeFileSync } from 'fs'

const filePath = 'F:/Documents/Steve/Development/hockey-2026/server/index.js'
const content = readFileSync(filePath, 'utf8')

const searchStr = '// Update match details for a team in a round'
const insertStr = `// Delete a round — cascades to matches and selections
app.delete('/api/rounds/:id', (req, res) => {
  const { id } = req.params
  run('DELETE FROM round_selections WHERE round_id = ?', [id])
  run('DELETE FROM round_matches WHERE round_id = ?', [id])
  run('DELETE FROM rounds WHERE id = ?', [id])
  res.json({ success: true })
})

// Update match details for a team in a round`

if (!content.includes(searchStr)) {
  console.error('ERROR: search string not found')
  process.exit(1)
}

const updated = content.replace(searchStr, insertStr)
writeFileSync(filePath, updated, 'utf8')
console.log('Done — delete route added')
