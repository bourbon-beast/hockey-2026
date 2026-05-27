import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function allowedUserRef(email) {
  return doc(db, 'allowedUsers', normaliseEmail(email))
}

export async function getAllowedUser(email) {
  const normalized = normaliseEmail(email)
  if (!normalized) return null
  const snap = await getDoc(allowedUserRef(normalized))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data(), email: snap.data().email || snap.id }
}

export async function listAllowedUsers() {
  const snap = await getDocs(collection(db, 'allowedUsers'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data(), email: d.data().email || d.id }))
    .sort((a, b) => normaliseEmail(a.email).localeCompare(normaliseEmail(b.email)))
}

export async function addAllowedUser(email, role = 'user', adminEmail = '') {
  const normalized = normaliseEmail(email)
  if (!normalized) throw new Error('Email is required')
  const safeRole = role === 'admin' ? 'admin' : 'user'
  await setDoc(allowedUserRef(normalized), {
    email: normalized,
    role: safeRole,
    enabled: true,
    createdAt: new Date().toISOString(),
    createdBy: normaliseEmail(adminEmail) || null,
  }, { merge: true })
}

export async function updateAllowedUser(email, updates) {
  const normalized = normaliseEmail(email)
  if (!normalized) throw new Error('Email is required')
  const payload = {}
  if (updates.role !== undefined) payload.role = updates.role === 'admin' ? 'admin' : 'user'
  if (updates.enabled !== undefined) payload.enabled = updates.enabled === true
  if (Object.keys(payload).length === 0) return
  await updateDoc(allowedUserRef(normalized), payload)
}

export async function removeAllowedUser(email) {
  const normalized = normaliseEmail(email)
  if (!normalized) throw new Error('Email is required')
  await deleteDoc(allowedUserRef(normalized))
}
