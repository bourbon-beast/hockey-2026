import { normalisePollQuestions } from '../db.polls'
import { optionLabel, pollDisplayTitle } from '../components/PollShared'

const METADATA_COLUMNS = ['Name', 'Date']

export function escapeCsvCell(value) {
  const text = value == null ? '' : String(value)
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function formatAnswerForCsv(question, rawValue) {
  if (rawValue == null || rawValue === '') return ''
  if (question.type === 'short_text') return String(rawValue)
  if (question.type === 'multi_choice') {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    return values
      .map(value => optionLabel(question, value))
      .sort((a, b) => String(a).localeCompare(String(b)))
      .join('; ')
  }
  return optionLabel(question, rawValue)
}

function formatSubmittedAt(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-AU', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function responseName(response) {
  return response.playerName || response.name || response.nameKey || ''
}

function getResponseAnswer(response, question) {
  const answers = response.answers || {}
  const value = answers[question.id]
  if (value != null && value !== '') return value
  if (question.id === 'main' && response.optionId) return response.optionId
  return ''
}

function buildResponseRow(response, questions) {
  const metadata = [
    responseName(response),
    formatSubmittedAt(response.submittedAt),
  ]
  const answers = questions.map(question => formatAnswerForCsv(question, getResponseAnswer(response, question)))
  return [...metadata, ...answers].map(escapeCsvCell).join(',')
}

export function buildPollResponsesCsv(poll, responses = []) {
  const questions = normalisePollQuestions(poll)
  const header = [...METADATA_COLUMNS, ...questions.map(question => question.text)].map(escapeCsvCell).join(',')

  const sortedResponses = [...responses].sort((a, b) => {
    const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0
    const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0
    return aTime - bTime
  })

  const rows = sortedResponses.map(response => buildResponseRow(response, questions))
  return [header, ...rows].join('\r\n')
}

function sanitizeFilenamePart(value, maxLength = 40) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return (slug || 'poll').slice(0, maxLength)
}

export function pollCsvFilename(poll) {
  const title = sanitizeFilenamePart(pollDisplayTitle(poll))
  const date = new Date().toISOString().slice(0, 10)
  return `MHC-Poll-${title}-${date}.csv`
}

export function downloadPollResponsesCsv(poll, responses = []) {
  if (!poll) return
  const content = buildPollResponsesCsv(poll, responses)
  const link = document.createElement('a')
  link.download = pollCsvFilename(poll)
  link.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  link.click()
  URL.revokeObjectURL(link.href)
}
