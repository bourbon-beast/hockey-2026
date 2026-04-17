// src/auth.js — Google Sign-In wrapper
// Small surface: sign in, sign out, subscribe, and read the
// Gmail OAuth access token (used later by the digest feature).
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'

// Module-level cache for the Gmail access token.
// Not persisted: lost on refresh (Firebase doesn't store OAuth
// access tokens). We re-request via popup when we need it again.
let gmailAccessToken = null

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  const credential = GoogleAuthProvider.credentialFromResult(result)
  gmailAccessToken = credential?.accessToken ?? null
  return result.user
}

export async function signOutUser() {
  gmailAccessToken = null
  await signOut(auth)
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export function getGmailAccessToken() {
  return gmailAccessToken
}
