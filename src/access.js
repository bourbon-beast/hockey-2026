export const ADMIN_EMAIL = 'steve.g.waters@gmail.com'

export function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function isBootstrapAdmin(userOrEmail) {
  const email = typeof userOrEmail === 'string' ? userOrEmail : userOrEmail?.email
  return normaliseEmail(email) === normaliseEmail(ADMIN_EMAIL)
}

export function isAdminUser(user, allowedUser = null) {
  return isBootstrapAdmin(user) || allowedUser?.role === 'admin'
}

export function canViewPoll(poll, userEmail, isAdmin) {
  if (isAdmin) return true
  if (!poll?.isPrivate) return true
  return normaliseEmail(poll.createdByEmail) === normaliseEmail(userEmail)
}
