import { useState } from 'react'

export const QUESTION_TYPES = [
  { id: 'single_choice', label: 'Single choice' },
  { id: 'multi_choice', label: 'Checkboxes' },
  { id: 'short_text', label: 'Short text' },
]

export function createNewPollQuestion(index = 0) {
  return {
    id: `q-${Date.now()}-${index}`,
    text: '',
    type: 'single_choice',
    required: true,
    options: ['', ''],
    showIf: null,
  }
}

export function optionLabel(question, value) {
  return (question.options || []).find(option => String(option.id) === String(value))?.label || value
}

export function pollDisplayTitle(poll, fallback = 'Poll') {
  return poll?.title || poll?.questions?.[0]?.text || poll?.question || fallback
}

export function PollSummary({ summary, targetPlayers = [], onMap, onMarkReviewed, onIgnore, onDelete, busyResponseId, readOnly = false }) {
  if (!summary) return null

  const reviewResponses = summary.responses.filter(response => !response.reviewedAt)
  const metricCards = [
    { label: 'Responses', value: summary.responses.length, className: 'border-blue-100 bg-blue-50/70 text-blue-700', accentClassName: 'bg-blue-500' },
    { label: 'Responded', value: summary.respondedPlayers.length, className: 'border-emerald-100 bg-emerald-50/70 text-emerald-700', accentClassName: 'bg-emerald-500' },
    { label: 'Outstanding', value: summary.outstandingPlayers.length, className: 'border-amber-100 bg-amber-50/70 text-amber-700', accentClassName: 'bg-amber-500' },
    { label: 'Unmatched', value: summary.unmatchedResponses.length, className: 'border-rose-100 bg-rose-50/70 text-rose-700', accentClassName: 'bg-rose-500' },
  ]

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {metricCards.map(card => (
          <div key={card.label} className={`overflow-hidden rounded-lg border p-3 text-xs shadow-sm ${card.className}`}>
            <div className={`mb-2 h-1 w-8 rounded-full ${card.accentClassName}`} />
            <div className="font-semibold uppercase tracking-wide opacity-75">{card.label}</div>
            <div className="mt-1 text-2xl font-black tabular-nums text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      {summary.questionResults.map(result => (
        <div key={result.question.id} className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{result.question.text}</div>
          {result.question.type === 'short_text' ? (
            <div className="mt-2 max-h-40 space-y-1 overflow-auto text-sm text-slate-700">
              {result.textAnswers.length === 0 ? (
                <div className="text-slate-400">No text answers yet.</div>
              ) : result.textAnswers.map(answer => (
                <div key={`${result.question.id}-${answer.responseId}`} className="rounded bg-slate-50 px-2 py-1">
                  <span className="font-semibold">{answer.name}:</span> {answer.value}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              {(result.question.options || []).map(option => {
                const count = result.optionTallies[String(option.id)] || 0
                return (
                  <div key={option.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{option.label}</span>
                    <span className="font-semibold text-slate-900">{count}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding players</div>
          <div className="mt-3 max-h-80 min-h-48 space-y-1 overflow-auto rounded-md bg-slate-50/70 p-2 text-sm text-slate-700">
            {summary.outstandingPlayers.length === 0
              ? <div className="text-slate-400">All target players have a matched response.</div>
              : summary.outstandingPlayers.map(player => (
                <div key={`out-${player.id}`} className="rounded bg-white px-2 py-1 shadow-sm">
                  {player.name}
                  {player.teamId && <span className="ml-2 text-xs text-slate-400">{player.teamId}</span>}
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unmatched responses</div>
          <div className="mt-3 max-h-80 min-h-48 space-y-1 overflow-auto text-sm text-slate-700">
            {summary.unmatchedResponses.length === 0
              ? <div className="text-slate-400">No unmatched responses.</div>
              : summary.unmatchedResponses.map(response => (
                <div key={response.id} className="rounded border border-slate-100 p-2">
                  <div className="font-medium">{response.name || response.nameKey || 'Unknown name'}</div>
                  {!readOnly && (
                  <div className="mt-2 flex gap-1">
                    <select
                      value=""
                      onChange={e => {
                        const player = targetPlayers.find(p => String(p.id) === e.target.value)
                        if (player) onMap(response, player)
                      }}
                      className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value="">Match to player...</option>
                      {targetPlayers.map(player => (
                        <option key={player.id} value={player.id}>{player.name}</option>
                      ))}
                    </select>
                    <button type="button" disabled={busyResponseId === response.id} onClick={() => onIgnore(response)} className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                      Ignore
                    </button>
                    <button type="button" disabled={busyResponseId === response.id} onClick={() => onDelete(response)} className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                      Kill
                    </button>
                  </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </div>

      {!readOnly && (
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Response review</div>
          <div className="text-xs text-slate-400">{reviewResponses.length} to review</div>
        </div>
        <div className="mt-2 max-h-72 space-y-2 overflow-auto text-sm text-slate-700">
          {summary.responses.length === 0 ? (
            <div className="text-slate-400">No active responses yet.</div>
          ) : reviewResponses.length === 0 ? (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-700">All responses reviewed.</div>
          ) : reviewResponses.map(response => (
            <div key={response.id} className="rounded border border-slate-100 p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{response.playerName || response.name || response.nameKey}</span>
                  {response.matchConfidence && (
                    <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                      {response.matchConfidence}
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <select
                    value={response.playerId || ''}
                    onChange={e => {
                      const player = targetPlayers.find(p => String(p.id) === e.target.value)
                      if (player) onMap(response, player)
                    }}
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    <option value="">Unmatched</option>
                    {targetPlayers.map(player => (
                      <option key={player.id} value={player.id}>{player.name}</option>
                    ))}
                  </select>
                  {response.playerId && (
                    <button type="button" disabled={busyResponseId === response.id} onClick={() => onMarkReviewed(response)} className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                      Done
                    </button>
                  )}
                  <button type="button" disabled={busyResponseId === response.id} onClick={() => onIgnore(response)} className="rounded px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">
                    Ignore
                  </button>
                  <button type="button" disabled={busyResponseId === response.id} onClick={() => onDelete(response)} className="rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                    Kill
                  </button>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {summary.questions.map(question => {
                  const value = response.answers?.[question.id] ?? (question.id === 'main' ? response.optionId : undefined)
                  if (value == null || value === '') return null
                  const label = Array.isArray(value)
                    ? value.map(v => optionLabel(question, v)).join(', ')
                    : question.type === 'short_text' ? value : optionLabel(question, value)
                  return <span key={question.id} className="mr-3">{question.text}: {label}</span>
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  )
}

export function PollCreateForm({ targetControls = null, targetDescription = '', creating = false, onCreate, showPrivateOption = true }) {
  const [pollTitle, setPollTitle] = useState('')
  const [pollIntro, setPollIntro] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [questions, setQuestions] = useState([createNewPollQuestion(0)])

  const reset = () => {
    setPollTitle('')
    setPollIntro('')
    setIsPrivate(false)
    setQuestions([createNewPollQuestion(0)])
  }

  const updateQuestion = (index, updates) => {
    setQuestions(current => current.map((question, i) => (
      i === index ? { ...question, ...updates } : question
    )))
  }

  const updateQuestionOption = (questionIndex, optionIndex, value) => {
    setQuestions(current => current.map((question, i) => {
      if (i !== questionIndex) return question
      const options = [...question.options]
      options[optionIndex] = value
      return { ...question, options }
    }))
  }

  const handleCreate = async () => {
    await onCreate?.({ title: pollTitle, intro: pollIntro, questions, isPrivate })
    reset()
  }

  return (
    <div className="space-y-3">
      {targetDescription && <p className="text-xs text-slate-500">{targetDescription}</p>}
      {targetControls}

      <input
        value={pollTitle}
        onChange={e => setPollTitle(e.target.value)}
        maxLength={80}
        placeholder="Poll title (optional, e.g. Round socks check)"
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      <textarea
        value={pollIntro}
        onChange={e => setPollIntro(e.target.value)}
        maxLength={600}
        rows={3}
        placeholder="Intro / label (optional). Add context before players answer."
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      {questions.map((question, index) => (
        <div key={question.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={question.text}
              onChange={e => updateQuestion(index, { text: e.target.value })}
              placeholder={`Question ${index + 1}`}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <select
              value={question.type}
              onChange={e => updateQuestion(index, {
                type: e.target.value,
                options: e.target.value === 'short_text' ? [] : (question.options.length ? question.options : ['', '']),
              })}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {QUESTION_TYPES.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </div>
          {question.type !== 'short_text' && (
            <div className="mt-2 space-y-2">
              {question.options.map((option, optionIndex) => (
                <input
                  key={`${question.id}-option-${optionIndex}`}
                  value={option}
                  onChange={e => updateQuestionOption(index, optionIndex, e.target.value)}
                  placeholder={`Option ${optionIndex + 1}`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400"
                />
              ))}
              <button type="button" onClick={() => updateQuestion(index, { options: [...question.options, ''] })} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                Add option
              </button>
            </div>
          )}
          {index > 0 && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold text-slate-500">Show if</span>
              <select
                value={question.showIf?.questionId || ''}
                onChange={e => updateQuestion(index, {
                  showIf: e.target.value ? { questionId: e.target.value, value: '' } : null,
                })}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
              >
                <option value="">Always show</option>
                {questions.slice(0, index).filter(q => q.type !== 'short_text').map(q => (
                  <option key={q.id} value={q.id}>{q.text || q.id}</option>
                ))}
              </select>
              {question.showIf?.questionId && (
                <select
                  value={question.showIf.value || ''}
                  onChange={e => updateQuestion(index, {
                    showIf: { ...question.showIf, value: e.target.value },
                  })}
                  className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <option value="">Select answer...</option>
                  {(questions.find(q => q.id === question.showIf.questionId)?.options || []).map((option, optionIndex) => (
                    <option key={`${option}-${optionIndex}`} value={option}>{option}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="mt-2 flex justify-between">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={question.required} onChange={e => updateQuestion(index, { required: e.target.checked })} />
              Required
            </label>
            {questions.length > 1 && (
              <button type="button" onClick={() => setQuestions(current => current.filter((_, i) => i !== index))} className="text-xs font-semibold text-red-600 hover:text-red-700">
                Remove question
              </button>
            )}
          </div>
        </div>
      ))}
      {showPrivateOption && (
        <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={e => setIsPrivate(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            <span className="font-semibold text-slate-700">Private poll</span>
            {' '}— only you and admins can see this poll and its responses.
          </span>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setQuestions(current => [...current, createNewPollQuestion(current.length)])} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Add question
        </button>
        <button type="button" onClick={handleCreate} disabled={creating} className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {creating ? 'Creating...' : 'Create poll'}
        </button>
      </div>
    </div>
  )
}
