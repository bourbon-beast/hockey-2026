const express = require('express')
const router = express.Router()

// Analytics not yet migrated — returns empty structure so frontend doesn't crash
router.get('/', (req, res) => {
  res.json({ overall: {}, teams: [], gamesDist: [], targetMin: 13, targetMax: 15 })
})

module.exports = router
