import { useEffect, useMemo, useState } from 'react'
import { getRounds } from '../db'
import {
  lookupPublicUnavailability,
  submitPublicUnavailability,
  updatePublicUnavailability,
} from '../db.publicUnavailability'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function toDays(sat, sun) {
  if (sat && sun) return 'both'
  if (sat) return 'sat'
  if (sun) return 'sun'
  return null
}

function dayLabel(days) {
  if (days === 'both') return 'Both'
  if (days === 'sat') return 'Sat'
  if (days === 'sun') return 'Sun'
  return ''
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function isEntryEditable(entry) {
  const today = todayKey()
  const dates = []
  if ((entry.days === 'sat' || entry.days === 'both') && entry.sat_date) dates.push(entry.sat_date)
  if ((entry.days === 'sun' || entry.days === 'both') && entry.sun_date) dates.push(entry.sun_date)
  if (dates.length === 0) dates.push(entry.sat_date, entry.sun_date)
  return dates.some(value => value && String(value) >= today)
}

function isRoundEditable(round) {
  return isEntryEditable({
    days: 'both',
    sat_date: round.sat_date,
    sun_date: round.sun_date,
  })
}

function editableRoundMap(items) {
  const next = {}
  items.forEach(item => {
    ;(item.entries || []).filter(isEntryEditable).forEach(entry => {
      next[String(entry.round_id)] = entry.days || 'both'
    })
  })
  return next
}

function Layout({ children, centre = false }) {
  return (
    <div className={`min-h-screen bg-slate-50 text-slate-900 ${centre ? 'flex items-center justify-center p-6' : ''}`}>
      {children}
    </div>
  )
}

export default function PublicUnavailabilityForm() {
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [roundDays, setRoundDays] = useState({})

  const [lookupLoading, setLookupLoading] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [lookupStatus, setLookupStatus] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submittedReceipt, setSubmittedReceipt] = useState(null)
  const [editingItem, setEditingItem] = useState(null)
  const [showPastRounds, setShowPastRounds] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await getRounds()
        if (cancelled) return
        setRounds(data.filter(round => round.round_type === 'season'))
      } catch {
        if (!cancelled) setLoadError('Unable to load rounds right now.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const selectedEntries = useMemo(() => (
    Object.entries(roundDays)
      .filter(([, days]) => days)
      .map(([roundId, days]) => ({ round_id: String(roundId), days }))
  ), [roundDays])

  const visibleRounds = useMemo(
    () => rounds.filter(round => showPastRounds || isRoundEditable(round)),
    [rounds, showPastRounds]
  )
  const hiddenPastRoundCount = rounds.length - rounds.filter(isRoundEditable).length
  const readyToSubmit = selectedEntries.length > 0

  const toggleDay = (roundId, day) => {
    setSubmittedReceipt(null)
    setRoundDays(prev => {
      const current = prev[String(roundId)]
      const hasSat = current === 'sat' || current === 'both'
      const hasSun = current === 'sun' || current === 'both'
      const next = toDays(day === 'sat' ? !hasSat : hasSat, day === 'sun' ? !hasSun : hasSun)
      const updated = { ...prev }
      if (next) updated[String(roundId)] = next
      else delete updated[String(roundId)]
      return updated
    })
  }

  const handleLookup = async () => {
    const normalisedEmail = email.trim().toLowerCase()
    if (!isValidEmail(normalisedEmail)) {
      setLookupError('Enter a valid email first.')
      return
    }
    setLookupLoading(true)
    setLookupError('')
    setLookupStatus(null)
    setSubmitError('')
    setSubmittedReceipt(null)
    try {
      const result = await lookupPublicUnavailability(normalisedEmail, name.trim())
      const rows = result.submissions || []
      const prefilled = editableRoundMap(rows)
      setRoundDays(prefilled)
      const firstEditable = rows.find(item => (item.entries || []).some(isEntryEditable))
      if (firstEditable) {
        setName(firstEditable.name || name)
        setNotes(firstEditable.notes || '')
        setEditingItem({ id: 'current', status: 'current' })
        setLookupStatus({
          tone: 'success',
          text: 'Loaded your upcoming entries. Update them below and save when ready.',
        })
      } else if (rows.length > 0) {
        setLookupStatus({
          tone: 'info',
          text: 'We found previous entries, but none for upcoming rounds.',
        })
      } else {
        setEditingItem(null)
        setNotes('')
        setLookupStatus({
          tone: 'muted',
          text: 'No previous entries found for this email yet.',
        })
      }
    } catch (e) {
      setLookupError(e.message || 'Could not look up previous entries.')
    } finally {
      setLookupLoading(false)
    }
  }

  const handleSubmit = async () => {
    setSubmitError('')
    setSubmittedReceipt(null)
    if (name.trim().length < 2) {
      setSubmitError('Enter your name.')
      return
    }
    if (!isValidEmail(email)) {
      setSubmitError('Enter a valid email.')
      return
    }
    if (selectedEntries.length === 0) {
      setSubmitError('Choose at least one round.')
      return
    }

    setReviewOpen(true)
  }

  const confirmSubmit = async () => {
    setSubmitError('')
    setSubmittedReceipt(null)
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        entries: selectedEntries,
        notes: notes.trim(),
      }
      const wasEditing = !!editingItem
      let submissionId = editingItem?.id
      if (wasEditing) {
        await updatePublicUnavailability({ ...payload, submission_id: editingItem.id })
      } else {
        const res = await submitPublicUnavailability(payload)
        submissionId = res?.id
      }
      const receiptEntries = selectedEntries.map(entry => {
        const round = rounds.find(r => String(r.id) === String(entry.round_id))
        return {
          round_id: String(entry.round_id),
          round_label: round?.name || (round ? `Round ${round.round_number}` : `Round ${entry.round_id}`),
          date_label: round
            ? [formatDate(round.sat_date), formatDate(round.sun_date)].filter(Boolean).join(' - ')
            : '',
          days: entry.days,
        }
      })
      setSubmittedReceipt({
        mode: wasEditing ? 'updated' : 'submitted',
        name: payload.name,
        email: payload.email,
        entries: receiptEntries,
      })
      setEditingItem({ id: submissionId || 'current', status: 'current' })
      setReviewOpen(false)
    } catch (e) {
      setSubmitError(e.message || 'Could not submit unavailability.')
    } finally {
      setSubmitting(false)
    }
  }

  const clearForm = () => {
    setRoundDays({})
    setNotes('')
    setEditingItem(null)
    setName('')
    setEmail('')
    setLookupStatus(null)
    setLookupError('')
    setSubmitError('')
    setSubmittedReceipt(null)
  }

  const cancelEdit = () => {
    setRoundDays({})
    setNotes('')
    setEditingItem(null)
    setSubmitError('')
    setSubmittedReceipt(null)
  }

  if (loading) {
    return (
      <Layout centre>
        <p className="text-sm text-slate-500">Loading rounds...</p>
      </Layout>
    )
  }

  if (loadError) {
    return (
      <Layout centre>
        <div className="max-w-sm rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Availability form unavailable</h2>
          <p className="mt-2 text-sm text-slate-500">{loadError}</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-4 sm:py-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-4 sm:px-6">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Mentone Hockey Club</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Submit Unavailability</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
              Add the rounds you cannot play. You can come back with your email any time to update future rounds.
            </p>
          </div>

          <div className="grid gap-4 border-b border-slate-100 px-4 py-4 sm:grid-cols-2 sm:px-6">
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</span>
              <div className="mt-1 flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value)
                    setSubmittedReceipt(null)
                    setRoundDays({})
                    setEditingItem(null)
                    setReviewOpen(false)
                    setLookupStatus(null)
                    setLookupError('')
                    setSubmitError('')
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="off"
                />
                <button
                  type="button"
                  onClick={handleLookup}
                  disabled={lookupLoading || !email.trim()}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {lookupLoading ? 'Checking...' : 'Check'}
                </button>
              </div>
              {lookupError && <p className="mt-1 text-xs text-red-600">{lookupError}</p>}
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Email is only used so you can come back later and update your own future unavailability.
              </p>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
          </div>
          {lookupStatus && (
            <div className="border-b border-slate-100 px-4 pb-3 pt-1 sm:px-6">
              <p
                className={`text-center text-xs sm:text-left ${
                  lookupStatus.tone === 'success'
                    ? 'text-green-700'
                    : lookupStatus.tone === 'info'
                      ? 'text-blue-700'
                      : 'text-slate-500'
                }`}
              >
                {lookupStatus.text}
              </p>
            </div>
          )}

          <div className="px-4 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {editingItem ? 'Edit unavailable rounds' : 'Choose unavailable rounds'}
                </p>
                <p className="text-xs text-slate-500">
                  {editingItem ? 'Saving will replace future rounds only.' : 'Current and future rounds are shown by default.'}
                </p>
                {readyToSubmit && (
                  <p className="mt-1 text-xs font-medium text-blue-700">
                    All set. Confirm below when ready.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hiddenPastRoundCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPastRounds(v => !v)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    {showPastRounds ? 'Hide past' : `Show past (${hiddenPastRoundCount})`}
                  </button>
                )}
                {editingItem && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Clear form
                  </button>
                )}
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500">
                  {selectedEntries.length} selected
                </span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRounds.map(round => {
                const days = roundDays[String(round.id)]
                const hasSat = days === 'sat' || days === 'both'
                const hasSun = days === 'sun' || days === 'both'
                const isPast = !isRoundEditable(round)
                return (
                  <div key={round.id} className={`rounded-xl border p-3 ${isPast ? 'border-slate-100 bg-slate-50 opacity-65' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {round.name || `Round ${round.round_number}`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {[formatDate(round.sat_date), formatDate(round.sun_date)].filter(Boolean).join(' - ')}
                        </p>
                      </div>
                      {days && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
                          {dayLabel(days)}
                        </span>
                      )}
                      {isPast && !days && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                          Past
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDay(round.id, 'sat')}
                        disabled={isPast}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          hasSat
                            ? 'border-orange-400 bg-orange-400 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-orange-300'
                        } ${isPast ? 'cursor-not-allowed opacity-60 hover:border-slate-200' : ''
                        }`}
                      >
                        Sat
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleDay(round.id, 'sun')}
                        disabled={isPast}
                        className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          hasSun
                            ? 'border-amber-400 bg-amber-400 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-amber-300'
                        } ${isPast ? 'cursor-not-allowed opacity-60 hover:border-slate-200' : ''
                        }`}
                      >
                        Sun
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes optional</span>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="Anything managers should know?"
              />
            </label>
          </div>
        </div>

        <div
          className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-3xl">
            {submitError && <p className="mb-2 text-center text-xs font-semibold text-red-600">{submitError}</p>}
            <div className="flex gap-2">
              {(name || email || notes || readyToSubmit) && (
                <button
                  type="button"
                  onClick={clearForm}
                  className="rounded-lg border border-slate-200 bg-white px-4 h-12 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                >
                  Clear Form
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !readyToSubmit}
                className={`h-12 flex-1 rounded-lg text-sm font-semibold transition ${
                  readyToSubmit && !submitting
                    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400'
                }`}
              >
                {submitting
                  ? (editingItem ? 'Saving...' : 'Submitting...')
                  : readyToSubmit
                    ? `${editingItem ? 'Save' : 'Submit'} ${selectedEntries.length} round${selectedEntries.length === 1 ? '' : 's'}`
                    : 'Choose rounds to submit'}
              </button>
            </div>
          </div>
        </div>

        {reviewOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-base font-semibold text-slate-900">Confirm Unavailability</h2>
                <p className="mt-1 text-xs text-slate-500">Check these details before saving.</p>
              </div>

              <div className="space-y-3 overflow-y-auto px-4 py-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <div className="font-semibold text-slate-800">{name.trim()}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{email.trim().toLowerCase()}</div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {selectedEntries.length} round{selectedEntries.length === 1 ? '' : 's'} selected
                  </p>
                  <div className="space-y-1">
                    {selectedEntries.map(entry => {
                      const round = rounds.find(r => String(r.id) === String(entry.round_id))
                      return (
                        <div key={entry.round_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                          <div>
                            <div className="font-semibold text-slate-800">
                              {round?.name || (round ? `Round ${round.round_number}` : `Round ${entry.round_id}`)}
                            </div>
                            {round && (
                              <div className="mt-0.5 text-xs text-slate-500">
                                {[formatDate(round.sat_date), formatDate(round.sun_date)].filter(Boolean).join(' - ')}
                              </div>
                            )}
                          </div>
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                            {dayLabel(entry.days)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {notes.trim() && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</p>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      {notes.trim()}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setReviewOpen(false)}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmSubmit}
                  disabled={submitting}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingItem ? 'Confirm update' : 'Confirm submit'}
                </button>
              </div>
            </div>
          </div>
        )}

        {submittedReceipt && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="border-b border-slate-200 px-4 py-4 text-center bg-slate-50">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 animate-bounce">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {submittedReceipt.mode === 'updated' ? 'Unavailability updated' : 'Unavailability submitted'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {submittedReceipt.mode === 'updated'
                    ? 'Your upcoming rounds are saved.'
                    : 'Your manager will review this submission shortly.'}
                </p>
              </div>

              <div className="space-y-3 overflow-y-auto px-4 py-4 flex-1">
                <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm">
                  <div className="font-semibold text-slate-800">{submittedReceipt.name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{submittedReceipt.email}</div>
                </div>

                <div className="space-y-1">
                  {submittedReceipt.entries.map(entry => (
                    <div key={entry.round_id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white shadow-sm">
                      <div>
                        <div className="font-semibold text-slate-800">{entry.round_label}</div>
                        {entry.date_label && <div className="mt-0.5 text-xs text-slate-500">{entry.date_label}</div>}
                      </div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        {dayLabel(entry.days)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 border-t border-slate-200 px-4 py-3 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setSubmittedReceipt(null)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Close & Keep Editing
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
