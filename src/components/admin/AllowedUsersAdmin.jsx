import { useEffect, useState } from 'react'
import { Check, Trash2, UserPlus } from 'lucide-react'
import { auth } from '../../firebase'
import { ADMIN_EMAIL, isBootstrapAdmin } from '../../access'
import {
  addAllowedUser,
  listAllowedUsers,
  normaliseEmail,
  removeAllowedUser,
  updateAllowedUser,
} from '../../db.access'

export default function AllowedUsersAdmin() {
  const [users, setUsers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('user')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await listAllowedUsers())
    } catch (e) {
      console.error('Failed to load allowed users', e)
      setError('Failed to load allowed users.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const flashSaved = (message) => {
    setSaved(message)
    setTimeout(() => setSaved(''), 2200)
  }

  const handleAdd = async () => {
    const normalized = normaliseEmail(email)
    if (!normalized) return
    setSaving(true)
    setError('')
    try {
      await addAllowedUser(normalized, role, auth.currentUser?.email || '')
      setEmail('')
      setRole('user')
      await load()
      flashSaved('User saved')
    } catch (e) {
      console.error('Failed to save allowed user', e)
      setError('Failed to save user.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = async (user, updates) => {
    setError('')
    try {
      await updateAllowedUser(user.email, updates)
      await load()
      flashSaved('User updated')
    } catch (e) {
      console.error('Failed to update allowed user', e)
      setError('Failed to update user.')
    }
  }

  const handleRemove = async (user) => {
    if (isBootstrapAdmin(user.email)) return
    if (!confirm(`Remove access for ${user.email}?`)) return
    setError('')
    try {
      await removeAllowedUser(user.email)
      await load()
      flashSaved('User removed')
    } catch (e) {
      console.error('Failed to remove allowed user', e)
      setError('Failed to remove user.')
    }
  }

  const hasBootstrapAdmin = users.some(user => isBootstrapAdmin(user.email))

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Allowed tracker users</h3>
            <p className="mt-1 text-xs text-slate-500">
              Add emails that can access the tracker after signing in with Google or email/password.
            </p>
          </div>
          {saved && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
              <Check size={13} />
              {saved}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_120px_auto]">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="coach@example.com"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-blue-400 focus:outline-none"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={saving || !normaliseEmail(email)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UserPlus size={15} />
            Add
          </button>
        </div>

        {!hasBootstrapAdmin && (
          <p className="mt-3 text-xs text-slate-400">
            Bootstrap admin: {ADMIN_EMAIL} can always access admin tools even if not listed here.
          </p>
        )}
        {error && <p className="mt-3 text-xs font-medium text-red-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            No allowed users yet. Add an email above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map(user => {
              const bootstrap = isBootstrapAdmin(user.email)
              return (
                <div key={user.id || user.email} className="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_120px_120px_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{user.email}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {bootstrap ? 'Bootstrap admin' : user.createdBy ? `Added by ${user.createdBy}` : 'Allowed user'}
                    </div>
                  </div>
                  <select
                    value={bootstrap ? 'admin' : user.role || 'user'}
                    onChange={e => handleUpdate(user, { role: e.target.value })}
                    disabled={bootstrap}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleUpdate(user, { enabled: user.enabled !== true })}
                    disabled={bootstrap}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      user.enabled === true || bootstrap
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {user.enabled === true || bootstrap ? 'Enabled' : 'Disabled'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(user)}
                    disabled={bootstrap}
                    className="inline-flex items-center justify-center rounded-lg p-2 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-slate-300"
                    title={bootstrap ? 'Bootstrap admin cannot be removed' : 'Remove user'}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
