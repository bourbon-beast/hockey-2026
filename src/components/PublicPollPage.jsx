import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  getPoll,
  getVisiblePollQuestions,
  normalisePollQuestions,
  submitPublicPollResponse,
} from '../db.polls'

function PollLayout({ children, center = false }) {
  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 ${center ? 'flex items-center justify-center p-6' : ''}`}>
      {children}
    </div>
  )
}

function pollDisplayTitle(poll, questions) {
  return poll?.title || questions?.[0]?.text || poll?.question || 'Poll'
}

function pollAudienceLabel(poll) {
  if (poll?.teamName || poll?.teamId) return poll.teamName || poll.teamId
  if (poll?.targetType === 'all_active') return 'All active players'
  if (poll?.targetType === 'custom') return 'Custom audience'
  if (poll?.targetType === 'players') return 'Selected players'
  if (poll?.targetTeamIds?.length > 1) return `${poll.targetTeamIds.length} teams`
  return 'Player poll'
}

export default function PublicPollPage() {
  const { pollId: pollIdParam } = useParams()
  const pollId = String(pollIdParam || '').trim()
  const [poll, setPoll] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitConfirmed, setSubmitConfirmed] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setPoll(null)
    setSubmitted(false)
    ;(async () => {
      try {
        if (!pollId) {
          setError('Invalid poll link.')
          return
        }
        const row = await getPoll(pollId)
        if (cancelled) return
        if (!row) {
          setError('Poll not found.')
          return
        }
        if (!row.isOpen) {
          setError('This poll is closed.')
          return
        }
        setPoll(row)
        setAnswers({})
      } catch {
        if (!cancelled) setError('Failed to load poll.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [pollId])

  const questions = useMemo(() => normalisePollQuestions(poll), [poll])
  const visibleQuestions = useMemo(() => getVisiblePollQuestions(questions, answers), [questions, answers])
  const missingRequired = visibleQuestions.some(question => {
    if (!question.required) return false
    const value = answers[question.id]
    if (Array.isArray(value)) return value.length === 0
    return String(value || '').trim() === ''
  })
  const canSubmit = name.trim().length >= 2 && !missingRequired && !submitting

  const handleSubmit = async () => {
    if (!canSubmit || !poll) return
    setSubmitting(true)
    setSubmitted(true)
    setSubmitConfirmed(false)
    setSubmitError('')
    try {
      await submitPublicPollResponse({
        pollId: poll.id,
        name: name.trim(),
        answers,
      })
      setSubmitConfirmed(true)
    } catch (e) {
      setSubmitError(e.message || 'Could not submit your response.')
      setSubmitted(false)
      setSubmitConfirmed(false)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PollLayout center>
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-sm text-slate-500 shadow-sm">
          Loading poll...
        </div>
      </PollLayout>
    )
  }

  if (error) {
    return (
      <PollLayout center>
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Poll unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </PollLayout>
    )
  }

  if (!poll) return null

  if (submitted) {
    return (
      <PollLayout center>
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            OK
          </div>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Response submitted</h1>
          <p className="mt-1 text-sm text-slate-500">
            {submitConfirmed ? 'Thanks, your response has been recorded.' : 'Saving your response...'}
          </p>
          <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Submitted as <span className="font-semibold">{name.trim()}</span>
          </p>
          {!submitConfirmed && (
            <p className="mt-3 text-xs text-slate-400">You can close this once it says recorded.</p>
          )}
        </div>
      </PollLayout>
    )
  }

  return (
    <PollLayout>
      <div className="mx-auto w-full max-w-lg px-4 pb-8 pt-6">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-slate-950" style={{ background: 'linear-gradient(160deg, #0f172a 0%, #172f57 54%, #0f2740 100%)' }}>
            <div style={{ background: 'linear-gradient(90deg, #eab308 0%, #facc15 65%, rgba(250,204,21,0.35) 100%)', height: '4px' }} />
            <div className="px-5 py-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-yellow-300">
                Mentone Hockey Club
              </div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-blue-200">
                {pollAudienceLabel(poll)}
              </div>
              <h1 className="mt-3 text-2xl font-bold leading-tight text-white">
                {pollDisplayTitle(poll, questions)}
              </h1>
              {poll.intro && (
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                  {poll.intro}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="First and last name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>

            {visibleQuestions.map((question, index) => (
              <div key={question.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                <label className="mb-2 block text-sm font-semibold text-slate-800">
                  {index + 1}. {question.text}
                  {question.required && <span className="text-red-500"> *</span>}
                </label>
                {question.type === 'short_text' ? (
                  <input
                    type="text"
                    value={answers[question.id] || ''}
                    onChange={e => setAnswers(current => ({ ...current, [question.id]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                  />
                ) : (
                  <div className="space-y-2">
                    {(question.options || []).map(option => {
                      const currentValue = answers[question.id]
                      const active = question.type === 'multi_choice'
                        ? (Array.isArray(currentValue) && currentValue.includes(String(option.id)))
                        : String(currentValue || '') === String(option.id)
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setAnswers(current => {
                              if (question.type === 'multi_choice') {
                                const values = Array.isArray(current[question.id]) ? current[question.id] : []
                                const optionId = String(option.id)
                                const nextValues = values.includes(optionId)
                                  ? values.filter(id => id !== optionId)
                                  : [...values, optionId]
                                return { ...current, [question.id]: nextValues }
                              }
                              return { ...current, [question.id]: String(option.id) }
                            })
                          }}
                          className={`w-full rounded-lg border bg-white px-3 py-2 text-left text-sm transition ${
                            active
                              ? 'border-blue-500 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {question.type === 'multi_choice' && (
                            <span className={`mr-2 inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${active ? 'border-blue-500 bg-blue-600 text-white' : 'border-slate-300 text-transparent'}`}>
                              ✓
                            </span>
                          )}
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {submitError && <p className="text-sm text-red-600">{submitError}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`h-11 w-full rounded-lg text-sm font-semibold ${
                canSubmit
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              {submitting ? 'Submitting...' : 'Submit response'}
            </button>
          </div>
        </div>
      </div>
    </PollLayout>
  )
}
