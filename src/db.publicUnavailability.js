const REGION = 'australia-southeast1'
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID

const SUBMIT_URL =
  import.meta.env.VITE_SUBMIT_UNAVAIL_URL ||
  import.meta.env.VITE_SUBMIT_PUBLIC_UNAVAIL_URL ||
  (PROJECT_ID ? `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/submitPublicUnavailability` : '')

const LOOKUP_URL =
  import.meta.env.VITE_LOOKUP_UNAVAIL_URL ||
  import.meta.env.VITE_LOOKUP_PUBLIC_UNAVAIL_URL ||
  (PROJECT_ID ? `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/lookupPublicUnavailability` : '')

const UPDATE_URL =
  import.meta.env.VITE_UPDATE_UNAVAIL_URL ||
  import.meta.env.VITE_UPDATE_PUBLIC_UNAVAIL_URL ||
  (PROJECT_ID ? `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/updatePublicUnavailability` : '')

async function postJson(url, payload) {
  if (!url) throw new Error('Public unavailability endpoint is not configured.')

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Request failed.')
  }
  return data
}

export async function submitPublicUnavailability({ name, email, entries, notes = '' }) {
  return postJson(SUBMIT_URL, { name, email, entries, notes })
}

export async function lookupPublicUnavailability(email, name = '') {
  const data = await postJson(LOOKUP_URL, { email, name })
  return {
    submissions: data.submissions || [],
    linkedPlayerName: data.linkedPlayerName || '',
    linkedPlayerId: data.linkedPlayerId || '',
    suggestedPlayerName: data.suggestedPlayerName || '',
    suggestedPlayerId: data.suggestedPlayerId || '',
    suggestedMatchConfidence: data.suggestedMatchConfidence || '',
  }
}

export async function updatePublicUnavailability({ submission_id, name, email, entries, notes = '' }) {
  return postJson(UPDATE_URL, { submission_id, name, email, entries, notes })
}
