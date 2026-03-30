const { getFirestore } = require('firebase-admin/firestore')

// Returns the Firestore instance — admin SDK is already initialised in index.js
const db = () => getFirestore()

module.exports = { db }
