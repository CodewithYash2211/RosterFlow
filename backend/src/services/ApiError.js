export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}
export const notFound = (message = 'Resource not found.') => new ApiError(404, 'NOT_FOUND', message)
export const badRequest = (message, details) => new ApiError(400, 'VALIDATION_ERROR', message, details)
export const forbidden = (message = 'You do not have permission to perform this action.') => new ApiError(403, 'FORBIDDEN', message)
