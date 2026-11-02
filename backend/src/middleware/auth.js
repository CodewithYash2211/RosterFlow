import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { verifyFirebaseToken } from '../services/firebaseAdmin.js'
import { ApiError } from '../services/ApiError.js'

export function authentication({ verifyToken = verifyFirebaseToken, userModel = User, workspaceModel = Workspace } = {}) {
  return async (request, _response, next) => {
    const match = /^Bearer\s+([^\s]+)$/i.exec(request.get('authorization') || '')
    if (!match) return next(new ApiError(401, 'AUTH_REQUIRED', 'A Firebase bearer token is required.'))
    let decoded
    try { decoded = await verifyToken(match[1]) }
    catch (error) {
      if (error?.code === 'auth/configuration-error') return next(new ApiError(503, 'AUTH_UNAVAILABLE', 'Firebase Admin authentication is not configured.'))
      return next(new ApiError(401, 'INVALID_TOKEN', 'The Firebase ID token is invalid or expired.'))
    }
    if (!decoded?.uid) return next(new ApiError(401, 'INVALID_TOKEN', 'The Firebase ID token is invalid.'))
    try {
      let user = await userModel.findOne({ firebaseUid: decoded.uid }).lean()
      const bootstrapUid = process.env.BOOTSTRAP_ADMIN_UID
      if (!user && bootstrapUid && bootstrapUid === decoded.uid && process.env.DEFAULT_WORKSPACE_SLUG) {
        const workspace = await workspaceModel.findOneAndUpdate(
          { slug: process.env.DEFAULT_WORKSPACE_SLUG.toLowerCase() },
          { $setOnInsert: { name: process.env.DEFAULT_WORKSPACE_NAME || 'RosterFlow Workspace', slug: process.env.DEFAULT_WORKSPACE_SLUG.toLowerCase(), status: 'active' } },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        )
        user = await userModel.findOneAndUpdate(
          { firebaseUid: decoded.uid },
          { $setOnInsert: { firebaseUid: decoded.uid, email: decoded.email, displayName: decoded.name, role: 'Admin', workspaceId: workspace._id } },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        ).lean()
      }
      if (!user || !user.workspaceId) return next(new ApiError(403, 'USER_NOT_PROVISIONED', 'This account has not been provisioned for a RosterFlow workspace.'))
      request.auth = { uid: decoded.uid, email: decoded.email || null, emailVerified: Boolean(decoded.email_verified) }
      request.user = { id: String(user._id), uid: decoded.uid, email: user.email || decoded.email || null, displayName: user.displayName || decoded.name || '', role: user.role, workspaceId: String(user.workspaceId), employeeId: user.employeeId ? String(user.employeeId) : null }
      return next()
    } catch (error) { return next(error) }
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => roles.includes(request.user?.role) ? next() : next(new ApiError(403, 'FORBIDDEN', 'Your workspace role does not allow this operation.'))
}
