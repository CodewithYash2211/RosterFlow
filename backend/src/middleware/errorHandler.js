import { ApiError } from '../services/ApiError.js'
export function notFoundHandler(request, _response, next) { next(new ApiError(404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.path} was not found.`)) }
export function errorHandler(error, _request, response, _next) {
  if (response.headersSent) return
  if (error?.code === 'auth/configuration-error') return response.status(503).json({ success: false, error: { code: 'AUTH_UNAVAILABLE', message: 'Firebase Admin authentication is not configured.' } })
  if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-uid') return response.status(404).json({ success: false, error: { code: 'FIREBASE_USER_NOT_FOUND', message: 'The Firebase account could not be found.' } })
  if (error?.name === 'ValidationError') return response.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'The resource failed validation.', details: Object.values(error.errors || {}).map(item => ({ path: item.path, message: item.message })) } })
  if (error?.name === 'CastError') return response.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Resource not found.' } })
  if (error?.code === 11000) return response.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'A record with one of these unique values already exists.' } })
  if (error?.type === 'entity.parse.failed') return response.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } })
  if (error?.type === 'entity.too.large') return response.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 1 MB limit.' } })
  if (error instanceof ApiError) return response.status(error.status).json({ success: false, error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } })
  // Do not log unknown error messages because database drivers may include connection data.
  console.error('Unhandled API error.')
  return response.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } })
}
