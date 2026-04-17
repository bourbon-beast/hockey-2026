// src/components/LoginPage.jsx — Magic link sign-in screen
// Shows the Mentone panther with a tongue-in-cheek "no entry" message
// and an email input to request a magic link.

import { useState } from 'react'
import { sendMagicLink } from '../auth'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      await sendMagicLink(email.trim().toLowerCase())
      setSent(true)
    } catch (e) {
      console.error('Magic link error:', e.code, e.message)
      const msg = e.code === 'auth/operation-not-allowed'
        ? 'Email link sign-in is not enabled — check Firebase Console.'
        : e.code === 'auth/invalid-email'
        ? 'Invalid email address.'
        : `Error: ${e.message}`
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
         style={{ background: '#0f172a' }}>

      {/* Gold top bar */}
      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: '#eab308' }} />

      {/* Panther */}
      <img
        src="/panther.png"
        alt="Mentone Hockey Club panther"
        className="w-48 h-48 sm:w-64 sm:h-64 object-contain mb-6 select-none"
        draggable={false}
      />

      {/* Heading */}
      <h1 className="text-3xl sm:text-4xl font-black text-white text-center mb-2 tracking-tight">
        MHC Squad Tracker
      </h1>

      {/* Tongue-in-cheek message */}
      <div className="text-center mb-8 space-y-1">
        <p className="text-yellow-400 font-bold text-lg">
          🐾 You are not Mentone Hockey security cleared.
        </p>
        <p className="text-slate-400 text-sm">
          Members only beyond this point. The panther is watching.
        </p>
      </div>

      {/* Sign-in card */}
      {!sent ? (
        <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <p className="text-slate-300 text-sm text-center">
            Enter your email — we'll send you a magic link. No password required.
          </p>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="your@email.com"
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20
                       text-white placeholder-slate-500 text-sm
                       focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
            autoComplete="email"
            autoCapitalize="off"
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim()}
            className="w-full py-3 rounded-lg font-bold text-sm transition-colors
                       disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#eab308', color: '#0f172a' }}
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
        </div>
      ) : (
        <div className="w-full max-w-sm bg-white/5 border border-green-500/30 rounded-xl p-6 text-center space-y-2">
          <p className="text-2xl">📬</p>
          <p className="text-white font-bold">Check your inbox</p>
          <p className="text-slate-400 text-sm">
            We sent a sign-in link to <span className="text-white">{email}</span>.
            Click it to access the app.
          </p>
          <p className="text-slate-500 text-xs pt-2">
            Wrong email?{' '}
            <button onClick={() => { setSent(false); setEmail('') }}
                    className="text-yellow-400 hover:underline">
              Try again
            </button>
          </p>
        </div>
      )}

      {/* Footer */}
      <p className="mt-10 text-slate-600 text-xs text-center">
        Mentone Hockey Club · 2026 Season
      </p>
    </div>
  )
}
