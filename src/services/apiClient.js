import { auth } from '../lib/firebase'
import { isLiveWorkspaceMode } from '../lib/workspaceMode'

const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api').replace(/\/$/, '')

export async function apiRequest(path, { method = 'GET', body, headers = {} } = {}) {
  if (!isLiveWorkspaceMode()) throw new Error('The live workspace API is not active in Demo Mode.')
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in is required to use the live workspace API.')
  const token = await user.getIdToken()
  const response = await fetch(`${apiBase}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.success === false) throw new Error(payload?.error?.message || `Request failed (${response.status}).`)
  return payload?.data
}
