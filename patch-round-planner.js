import { readFileSync, writeFileSync } from 'fs'

const filePath = 'F:/Documents/Steve/Development/hockey-2026/src/components/RoundPlanner.jsx'
let content = readFileSync(filePath, 'utf8')

// ── 1. Add new state variables after showNewRoundModal state ──────────────────
content = content.replace(
  `  const [showNewRoundModal, setShowNewRoundModal] = useState(false)
  const [newRoundForm, setNewRoundForm] = useState({ type: 'season', name: '' })`,
  `  const [showNewRoundModal, setShowNewRoundModal] = useState(false)
  const [newRoundForm, setNewRoundForm] = useState({ type: 'season', name: '' })
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameValue, setRenameValue] = useState('')`
)

// ── 2. Add deleteRound and renameRound functions after createRound ─────────────
content = content.replace(
  `  // ── Match details ─────────────────────────────────────────────────────`,
  `  const deleteRound = async () => {
    if (!currentRound) return
    await fetch(\`/api/rounds/\${currentRound.id}\`, { method: 'DELETE' })
    const remaining = rounds.filter(r => r.id !== currentRound.id)
    setRounds(remaining)
    setCurrentRound(remaining.length > 0 ? remaining[remaining.length - 1] : null)
    setShowDeleteConfirm(false)
  }

  const openRenameModal = () => {
    if (!currentRound) return
    setRenameValue(
      currentRound.round_type === 'season'
        ? \`Round \${currentRound.round_number}\`
        : currentRound.name || 'Practice Match'
    )
    setShowRenameModal(true)
  }

  const saveRename = async () => {
    if (!currentRound || !renameValue.trim()) return
    const body = currentRound.round_type === 'season'
      ? { round_number: parseInt(renameValue.replace(/\\D/g, '')) || currentRound.round_number }
      : { name: renameValue.trim() }
    const res = await fetch(\`/api/rounds/\${currentRound.id}\`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const updated = await res.json()
    setRounds(rounds.map(r => r.id === updated.id ? updated : r))
    setCurrentRound(updated)
    setShowRenameModal(false)
  }

  // ── Match details ─────────────────────────────────────────────────────`
)

// ── 3. Replace the current round title section to add Rename + Delete buttons ──
content = content.replace(
  `      {currentRound && (
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-800">
            {currentRound.round_type === 'season' ? \`Round \${currentRound.round_number}\` : currentRound.name || 'Practice Match'}
          </h3>
          {currentRound.round_type === 'practice' && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              Practice — does not count towards season games
            </span>
          )}
        </div>
      )}`,
  `      {currentRound && (
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-gray-800">
              {currentRound.round_type === 'season' ? \`Round \${currentRound.round_number}\` : currentRound.name || 'Practice Match'}
            </h3>
            {currentRound.round_type === 'practice' && (
              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                Practice — does not count towards season games
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openRenameModal}
              className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              ✏️ Rename
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              🗑 Delete
            </button>
          </div>
        </div>
      )}`
)

// ── 4. Add Delete Confirm and Rename modals before the closing </div> ──────────
content = content.replace(
  `      {/* New Round Modal */}`,
  `      {/* Delete Confirm Modal */}
      {showDeleteConfirm && currentRound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl w-96" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">Delete Round</h3>
            </div>
            <div className="p-4">
              <p className="text-gray-600 text-sm">
                Are you sure you want to delete <span className="font-semibold">
                  {currentRound.round_type === 'season' ? \`Round \${currentRound.round_number}\` : currentRound.name || 'Practice Match'}
                </span>? This will remove all player selections and match details for this round. This cannot be undone.
              </p>
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 rounded-b-xl flex gap-2">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={deleteRound}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">
                Delete Round
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && currentRound && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowRenameModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-96" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b">
              <h3 className="font-semibold text-gray-800">Rename Round</h3>
            </div>
            <div className="p-4">
              {currentRound.round_type === 'season' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Round Number</label>
                  <input
                    type="number"
                    value={renameValue.replace(/\\D/g, '')}
                    onChange={e => setRenameValue(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveRename()}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    placeholder="e.g. Altona, Grading Game 1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && saveRename()}
                  />
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 rounded-b-xl flex gap-2">
              <button onClick={() => setShowRenameModal(false)}
                className="flex-1 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={saveRename}
                disabled={!renameValue.trim()}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Round Modal */}`
)

writeFileSync(filePath, content, 'utf8')
console.log('Done — RoundPlanner.jsx updated')
