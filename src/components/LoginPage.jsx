import { useState } from 'react'
import { sendPasswordReset, signInWithEmailPassword, signInWithGoogle, signOutUser } from '../auth'
import { Loader2 } from 'lucide-react'

export default function LoginPage({ deniedUser = null, accessError = '' }) {
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [error, setError]     = useState('')

  const handleSubmit = async () => {
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    setResetSent(false)
    try {
      await signInWithEmailPassword(email.trim().toLowerCase(), password)
    } catch (e) {
      console.error('Email sign-in error:', e.code, e.message)
      const msg = e.code === 'auth/invalid-email'
        ? 'Invalid email address.'
        : e.code === 'auth/invalid-credential' || e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password'
          ? 'Email or password is incorrect.'
          : e.code === 'auth/operation-not-allowed'
            ? 'Email/password sign-in is not enabled in Firebase.'
            : `Error: ${e.message}`
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setLoading(true)
    setError('')
    setResetSent(false)
    try {
      await signInWithGoogle()
    } catch (e) {
      console.error('Google sign-in error:', e.code, e.message)
      setError(`Google sign-in failed: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Enter your email first, then use forgot password.')
      return
    }
    setLoading(true)
    setError('')
    setResetSent(false)
    try {
      await sendPasswordReset(email.trim().toLowerCase())
      setResetSent(true)
    } catch (e) {
      console.error('Password reset error:', e.code, e.message)
      const msg = e.code === 'auth/invalid-email'
        ? 'Invalid email address.'
        : e.code === 'auth/user-not-found'
          ? 'No password account exists for that email yet.'
          : `Error: ${e.message}`
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-6 sm:py-12"
         style={{ background: '#0f172a' }}>

      <div className="fixed top-0 left-0 right-0 h-1" style={{ background: '#eab308' }} />

      <img
        src="/panther.png"
        alt="Mentone Hockey Club panther"
        className="w-32 h-32 sm:w-64 sm:h-64 object-contain mb-3 sm:mb-6 select-none"
        draggable={false}
      />

      <h1 className="text-2xl sm:text-4xl font-black text-white text-center mb-1 sm:mb-2 tracking-tight">
        MHC Squad Tracker
      </h1>

      <div className="text-center mb-4 sm:mb-8 space-y-0.5 sm:space-y-1">
        <p className="text-yellow-400 font-bold text-base sm:text-lg">
          Members only
        </p>
        <p className="text-slate-400 text-xs sm:text-sm">
          Sign in with an approved tracker email.
        </p>
      </div>

      {deniedUser && (
        <div className="mb-3 sm:mb-4 w-full max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4 text-center">
          <p className="text-sm font-semibold text-amber-200">Access not approved</p>
          <p className="mt-1 text-xs text-amber-100/80">
            {deniedUser.email} is signed in, but is not on the tracker access list.
          </p>
          {accessError && (
            <p className="mt-2 text-xs text-red-200">{accessError}</p>
          )}
          <button
            type="button"
            onClick={signOutUser}
            className="mt-2 sm:mt-3 text-xs font-semibold text-yellow-300 hover:underline"
          >
            Sign out and try another account
          </button>
        </div>
      )}

      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 space-y-3 sm:space-y-4">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full rounded-lg border border-white/15 bg-white/10 px-4 py-2.5 sm:py-3 text-sm font-bold text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Sign in with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <input
          type="email"
          aria-label="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="your@email.com"
          className="w-full px-4 py-2.5 sm:py-3 rounded-lg bg-white/10 border border-white/20
                     text-white placeholder-slate-500 text-sm
                     focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
          autoComplete="email"
          autoCapitalize="off"
        />
        <input
          type="password"
          aria-label="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Password"
          className="w-full px-4 py-2.5 sm:py-3 rounded-lg bg-white/10 border border-white/20
                     text-white placeholder-slate-500 text-sm
                     focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400"
          autoComplete="current-password"
        />

        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        {resetSent && (
          <p className="text-green-300 text-xs text-center">
            Password reset email sent. Check your inbox.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !password}
          className="w-full py-2.5 sm:py-3 rounded-lg font-bold text-sm transition-colors
                     disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{ background: '#eab308', color: '#0f172a' }}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={loading || !email.trim()}
          className="w-full text-xs font-semibold text-yellow-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
        >
          Forgot password?
        </button>
      </div>

      <p className="mt-6 sm:mt-10 text-slate-600 text-xs text-center">
        Mentone Hockey Club · 2026 Season
      </p>
    </div>
  )
}
