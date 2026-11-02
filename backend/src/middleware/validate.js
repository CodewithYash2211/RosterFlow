import { ApiError } from '../services/ApiError.js'
export function validate(schema, source = 'body') {
  return (request, _response, next) => {
    const parsed = schema.safeParse(request[source])
    if (!parsed.success) return next(new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))))
    request.validated = parsed.data
    return next()
  }
}
