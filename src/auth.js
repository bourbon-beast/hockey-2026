// src/auth.js — Firebase Auth helpers for magic link (passwordless email) sign-in
import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { app } from './firebase'

export const auth = getAuth(app)

const ACTION_CODE_SETTINGS = {
  // After clicking the magic link, user lands back here
  url: window.location.origin,
  handleCodeInApp: true,
}

export async function sendMagicLink(email) {
  await sendSignInLinkToEmail(auth, email, ACTION_CODE_SETTINGS)
  // Store email so we can complete sign-in when user returns
  window.localStorage.setItem('mhcSignInEmail', email)
}

export async function completeMagicLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return null
  let email = window.localStorage.getItem('mhcSignInEmail')
  if (!email) {
    // Fallback: ask user — handles case where link opened on different device
    email = window.prompt('Please enter your email to confirm sign-in:')
  }
  const result = await signInWithEmailLink(auth, email, window.location.href)
  window.localStorage.removeItem('mhcSignInEmail')
  // Clean the URL so the link can't be reused
  window.history.replaceState({}, document.title, window.location.pathname)
  return result.user
}

export function signOutUser() {
  return signOut(auth)
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}
