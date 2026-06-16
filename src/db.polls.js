import { db } from './firebase'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'

const REGION = 'australia-southeast1'
const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID
const SUBMIT_POLL_URL =
  import.meta.env.VITE_SUBMIT_POLL_URL ||
  (PROJECT_ID ? `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/submitPublicPollResponse` : '')

export function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function normaliseName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normaliseId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildOptions(options, fallbackPrefix = 'option') {
  const cleaned = (Array.isArray(options) ? options : [])
    .map(option => String(option || '').trim())
    .filter(Boolean)
    .slice(0, 8)

  return cleaned.map((label, index) => ({
    id: normaliseId(label) || `${fallbackPrefix}-${index + 1}`,
    label,
  }))
}

export function normalisePollQuestions(poll) {
  const rawQuestions = Array.isArray(poll?.questions) ? poll.questions : []
  if (rawQuestions.length > 0) {
    return rawQuestions.map((question, index) => {
      const type = ['single_choice', 'multi_choice', 'short_text'].includes(question.type)
        ? question.type
        : 'single_choice'
      return {
        id: String(question.id || `q-${index + 1}`),
        text: String(question.text || '').trim(),
        type,
        required: question.required !== false,
        options: type === 'short_text'
          ? []
          : (Array.isArray(question.options) ? question.options : []).map((option, optionIndex) => ({
            id: String(option.id || `option-${optionIndex + 1}`),
            label: String(option.label || '').trim(),
          })).filter(option => option.label),
        showIf: question.showIf?.questionId && question.showIf?.value
          ? { questionId: String(question.showIf.questionId), value: String(question.showIf.value) }
          : null,
      }
    }).filter(question => question.text)
  }

  const legacyOptions = buildOptions(poll?.options || [], 'option')
  if (poll?.question && legacyOptions.length > 0) {
    return [{
      id: 'main',
      text: String(poll.question).trim(),
      type: 'single_choice',
      required: true,
      options: legacyOptions,
      showIf: null,
    }]
  }

  return []
}

export function answerMatchesCondition(answer, expectedValue) {
  if (Array.isArray(answer)) return answer.map(String).includes(String(expectedValue))
  return String(answer || '') === String(expectedValue)
}

export function getVisiblePollQuestions(questions, answers = {}) {
  const list = Array.isArray(questions) ? questions : []
  return list.filter(question => {
    if (!question.showIf?.questionId) return true
    return answerMatchesCondition(answers[question.showIf.questionId], question.showIf.value)
  })
}

function normaliseTargetPlayer(player) {
  if (!player?.id) return null
  return {
    id: String(player.id),
    name: String(player.name || '').trim(),
    teamId: player.teamId || player.assigned_team_id_2026 || player.assignedTeam2026 || null,
  }
}

function buildTargetPayload({ teamId, teamName = '', targetType = '', targetTeamIds = [], targetPlayerIds = [], targetPlayers = [] }) {
  const cleanTargetPlayers = (targetPlayers || [])
    .map(normaliseTargetPlayer)
    .filter(player => player?.id && player?.name)

  const cleanTargetTeamIds = Array.from(new Set(
    (targetTeamIds || []).map(id => String(id || '').trim()).filter(Boolean)
  ))

  const cleanTargetPlayerIds = Array.from(new Set(
    (targetPlayerIds?.length ? targetPlayerIds : cleanTargetPlayers.map(player => player.id))
      .map(id => String(id || '').trim())
      .filter(Boolean)
  ))

  const resolvedTargetType = targetType || (teamId ? 'teams' : 'players')
  const cleanTeamId = teamId ? String(teamId) : (cleanTargetTeamIds.length === 1 ? cleanTargetTeamIds[0] : null)

  return {
    teamId: cleanTeamId,
    teamName: cleanTeamId ? String(teamName || cleanTeamId) : null,
    targetType: resolvedTargetType,
    targetTeamIds: cleanTargetTeamIds,
    targetPlayerIds: cleanTargetPlayerIds,
    targetPlayers: cleanTargetPlayers,
  }
}

function buildQuestions(questions, legacyQuestion, legacyOptions) {
  const source = Array.isArray(questions) && questions.length > 0
    ? questions
    : [{ text: legacyQuestion, type: 'single_choice', required: true, options: legacyOptions }]

  return source.map((question, index) => {
    const type = ['single_choice', 'multi_choice', 'short_text'].includes(question.type)
      ? question.type
      : 'single_choice'
    const id = normaliseId(question.id || question.text) || `q-${index + 1}`
    const options = type === 'short_text' ? [] : buildOptions(question.options || [], `q${index + 1}-option`)
    return {
      id,
      text: String(question.text || '').trim(),
      type,
      required: question.required !== false,
      options,
      showIf: question.showIf?.questionId && question.showIf?.value
        ? { questionId: String(question.showIf.questionId), value: normaliseId(question.showIf.value) || String(question.showIf.value) }
        : null,
    }
  }).filter(question => question.text)
}

export async function createPoll({
  teamId,
  teamName = '',
  title = '',
  intro = '',
  question,
  options,
  questions,
  createdByEmail = '',
  targetType = '',
  targetTeamIds = [],
  targetPlayerIds = [],
  targetPlayers = [],
  isPrivate = false,
}) {
  const cleanQuestions = buildQuestions(questions, question, options)
  if (cleanQuestions.length === 0) throw new Error('Add at least one question.')
  cleanQuestions.forEach(question => {
    if (question.text.length < 3) throw new Error('Question is too short.')
    if (question.type !== 'short_text' && question.options.length < 2) {
      throw new Error('Choice questions need at least two options.')
    }
  })
  const firstQuestion = cleanQuestions[0]
  const cleanTitle = String(title || '').trim().slice(0, 80)
  const cleanIntro = String(intro || '').trim().slice(0, 600)
  const targetPayload = buildTargetPayload({ teamId, teamName, targetType, targetTeamIds, targetPlayerIds, targetPlayers })
  if (targetPayload.targetType !== 'all_active' && targetPayload.targetPlayers.length === 0 && !targetPayload.teamId) {
    throw new Error('Select poll recipients.')
  }

  const ref = await addDoc(collection(db, 'polls'), {
    ...targetPayload,
    title: cleanTitle || null,
    intro: cleanIntro || null,
    question: firstQuestion.text,
    options: firstQuestion.options,
    questions: cleanQuestions,
    isOpen: true,
    createdAt: new Date().toISOString(),
    createdByEmail: normaliseEmail(createdByEmail) || null,
    isPrivate: isPrivate === true,
    closedAt: null,
  })

  return ref.id
}

export async function closePoll(pollId) {
  await updateDoc(doc(db, 'polls', String(pollId)), {
    isOpen: false,
    closedAt: new Date().toISOString(),
  })
}

export async function reopenPoll(pollId) {
  await updateDoc(doc(db, 'polls', String(pollId)), {
    isOpen: true,
    closedAt: null,
  })
}

export async function getPoll(pollId) {
  const snap = await getDoc(doc(db, 'polls', String(pollId)))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}

export async function getTeamPolls(teamId) {
  const snap = await getDocs(
    query(
      collection(db, 'polls'),
      where('teamId', '==', String(teamId)),
      orderBy('createdAt', 'desc'),
    ),
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getPolls() {
  const snap = await getDocs(
    query(
      collection(db, 'polls'),
      orderBy('createdAt', 'desc'),
    ),
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function pollsFromSnap(snap) {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

function sortPollsByCreatedAt(polls) {
  return [...polls].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

function mergePollSnapshots(snapshots) {
  const byId = new Map()
  snapshots.forEach(rows => rows.forEach(poll => byId.set(poll.id, poll)))
  return sortPollsByCreatedAt([...byId.values()])
}

/** Firestore list rules are per-document; unfiltered queries fail if any private poll is unreadable. */
function subscribeMergedPollQueries(queries, onNext, onError) {
  const slots = queries.map(() => ({ rows: [], ready: false, error: null }))

  const tryEmit = () => {
    const failed = slots.find(slot => slot.error)
    if (failed) {
      onError(failed.error)
      return
    }
    if (!slots.every(slot => slot.ready)) return
    onNext(mergePollSnapshots(slots.map(slot => slot.rows)))
  }

  const unsubs = queries.map((q, index) => onSnapshot(
    q,
    snap => {
      slots[index].rows = pollsFromSnap(snap)
      slots[index].ready = true
      slots[index].error = null
      tryEmit()
    },
    err => {
      slots[index].error = err
      tryEmit()
    },
  ))

  return () => unsubs.forEach(unsub => unsub())
}

export function subscribePolls(onNext, onError, { isAdmin = false, userEmail = '' } = {}) {
  const pollsRef = collection(db, 'polls')
  if (isAdmin) {
    return onSnapshot(
      query(pollsRef, orderBy('createdAt', 'desc')),
      snap => onNext(pollsFromSnap(snap)),
      onError,
    )
  }

  const email = normaliseEmail(userEmail)
  return subscribeMergedPollQueries(
    [
      query(pollsRef, where('isPrivate', '==', false), orderBy('createdAt', 'desc')),
      query(
        pollsRef,
        where('createdByEmail', '==', email),
        where('isPrivate', '==', true),
        orderBy('createdAt', 'desc'),
      ),
    ],
    onNext,
    onError,
  )
}

export function subscribeTeamPolls(teamId, onNext, onError, { isAdmin = false, userEmail = '' } = {}) {
  const pollsRef = collection(db, 'polls')
  const teamKey = String(teamId)
  if (isAdmin) {
    return onSnapshot(
      query(pollsRef, where('teamId', '==', teamKey), orderBy('createdAt', 'desc')),
      snap => onNext(pollsFromSnap(snap)),
      onError,
    )
  }

  const email = normaliseEmail(userEmail)
  return subscribeMergedPollQueries(
    [
      query(
        pollsRef,
        where('teamId', '==', teamKey),
        where('isPrivate', '==', false),
        orderBy('createdAt', 'desc'),
      ),
      query(
        pollsRef,
        where('teamId', '==', teamKey),
        where('createdByEmail', '==', email),
        where('isPrivate', '==', true),
        orderBy('createdAt', 'desc'),
      ),
    ],
    onNext,
    onError,
  )
}

export async function getPollResponses(pollId) {
  const snap = await getDocs(
    query(
      collection(db, 'polls', String(pollId), 'responses'),
      orderBy('submittedAt', 'desc'),
    ),
  )
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export function subscribePollResponses(pollId, onNext, onError) {
  return onSnapshot(
    query(
      collection(db, 'polls', String(pollId), 'responses'),
      orderBy('submittedAt', 'desc'),
    ),
    snap => onNext(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError,
  )
}

function candidateEmails(player) {
  return [
    player?.email,
    player?.emailLower,
    player?.email_address,
    player?.emailAddress,
    player?.contactEmail,
    player?.contact_email,
  ]
    .map(normaliseEmail)
    .filter(Boolean)
}

export function buildPollSummary(poll, responses = [], teamPlayers = []) {
  if (!poll) return null
  const questions = normalisePollQuestions(poll)
  const sourcePlayers = Array.isArray(poll.targetPlayers) && poll.targetPlayers.length > 0
    ? poll.targetPlayers
    : teamPlayers
  const uniqueTeamPlayers = []
  const seenPlayers = new Set()

  for (const player of sourcePlayers || []) {
    const playerId = String(player?.id || '')
    if (playerId && seenPlayers.has(playerId)) continue
    if (playerId) seenPlayers.add(playerId)
    uniqueTeamPlayers.push({
      ...player,
      id: playerId || player.id,
      teamId: player.teamId || player.assigned_team_id_2026 || player.assignedTeam2026 || null,
    })
  }

  const activeResponses = (responses || []).filter(response => response.status !== 'ignored')
  const ignoredResponses = (responses || []).filter(response => response.status === 'ignored')
  const respondedPlayerIds = new Set(activeResponses.map(r => String(r.playerId || '')).filter(Boolean))
  const unmatchedResponses = []
  const matchedResponses = []

  activeResponses.forEach(response => {
    if (response.playerId) {
      const matchedPlayer = uniqueTeamPlayers.find(player => String(player.id) === String(response.playerId)) || null
      matchedResponses.push({ ...response, matchedPlayer })
    } else {
      unmatchedResponses.push(response)
    }
  })

  const respondedPlayers = uniqueTeamPlayers.filter(player => respondedPlayerIds.has(String(player.id)))
  const outstandingPlayers = uniqueTeamPlayers.filter(player => !respondedPlayerIds.has(String(player.id)))

  const questionResults = questions.map(question => {
    const optionTallies = {}
    ;(question.options || []).forEach(option => {
      optionTallies[String(option.id)] = 0
    })
    const textAnswers = []
    activeResponses.forEach(response => {
      const answers = response.answers || {}
      const value = answers[question.id] ?? (question.id === 'main' ? response.optionId : undefined)
      if (value == null || value === '') return
      if (question.type === 'short_text') {
        textAnswers.push({
          responseId: response.id,
          name: response.playerName || response.name || response.nameKey || 'Unknown',
          value: String(value),
        })
        return
      }
      const values = Array.isArray(value) ? value : [value]
      values.forEach(answer => {
        const key = String(answer)
        if (!(key in optionTallies)) optionTallies[key] = 0
        optionTallies[key] += 1
      })
    })
    return { question, optionTallies, textAnswers }
  })

  return {
    poll,
    questions,
    responses: activeResponses,
    ignoredResponses,
    questionResults,
    respondedPlayers,
    outstandingPlayers,
    matchedResponses,
    unmatchedResponses,
  }
}

export async function getPollSummary(pollId, teamPlayers = []) {
  const poll = await getPoll(pollId)
  if (!poll) return null
  const responses = await getPollResponses(pollId)
  return buildPollSummary(poll, responses, teamPlayers)
}

async function postJson(url, payload) {
  if (!url) throw new Error('Poll submit endpoint is not configured.')
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

export async function submitPublicPollResponse({ pollId, name, answers, email = '', optionId = '' }) {
  return postJson(SUBMIT_POLL_URL, {
    poll_id: String(pollId || '').trim(),
    name: String(name || '').trim(),
    email: normaliseEmail(email),
    answers: answers || {},
    option_id: String(optionId || '').trim(),
  })
}

export async function updatePollResponseMatch(pollId, responseId, player) {
  await updateDoc(doc(db, 'polls', String(pollId), 'responses', String(responseId)), {
    playerId: player?.id ? String(player.id) : null,
    playerName: player?.name || null,
    matchConfidence: player?.id ? 'manual' : null,
    status: 'active',
    ignoredAt: null,
    reviewedAt: new Date().toISOString(),
  })
}

export async function markPollResponseReviewed(pollId, responseId) {
  await updateDoc(doc(db, 'polls', String(pollId), 'responses', String(responseId)), {
    status: 'active',
    reviewedAt: new Date().toISOString(),
  })
}

export async function ignorePollResponse(pollId, responseId) {
  await updateDoc(doc(db, 'polls', String(pollId), 'responses', String(responseId)), {
    status: 'ignored',
    ignoredAt: new Date().toISOString(),
  })
}

export async function deletePollResponse(pollId, responseId) {
  await deleteDoc(doc(db, 'polls', String(pollId), 'responses', String(responseId)))
}

export function buildPollLink(origin, pollId) {
  const base = String(origin || '').replace(/\/$/, '')
  return `${base}/poll/${encodeURIComponent(String(pollId))}`
}
