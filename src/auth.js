// src/auth.js — Authentication helpers
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
} from 'firebase/auth'
import { auth, googleProvider } from './firebase'

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider)
  return result.user
}

export async function signInWithEmailPassword(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function sendPasswordReset(email) {
  await sendPasswordResetEmail(auth, email)
}

export async function signOutUser() {
  await signOut(auth)
}

export function subscribeToAuth(callback) {
  return onAuthStateChanged(auth, callback)
}

export function subscribeToAuthToken(callback) {
  return onIdTokenChanged(auth, callback)
}
