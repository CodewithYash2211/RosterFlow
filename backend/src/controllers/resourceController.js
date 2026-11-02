import { Router } from 'express'
import { authentication, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { assertNoDependencies, validateReferences } from '../services/resourceService.js'
import { ApiError, notFound } from '../services/ApiError.js'

const manager = requireRole('Admin','Manager')
const admin = requireRole('Admin')
function serialize(value) {
  if (value == null || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (typeof value.toJSON === 'function' && !value._bsontype) return serialize(value.toJSON())
  if (value._bsontype === 'ObjectId') return String(value)
  if (Array.isArray(value)) return value.map(serialize)
  const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]))
  if (result._id != null) { result.id = String(result._id); delete result._id }
  return result
}
const ok = (response, data, status = 200, meta) => response.status(status).json({ success: true, data: serialize(data), ...(meta ? { meta } : {}) })
const idFilter = /^[a-f\d]{24}$/i

export function resourceRouter({ Model, schema, authenticate, patchSchema = schema.partial(), createRole = manager, updateRole = manager, deleteRole = manager }) {
  const router = Router()
  router.use(authenticate)
  router.get('/', async (request, response) => {
    const filter = { workspaceId: request.user.workspaceId }
    if (Model.modelName === 'Employee' && request.user.role === 'Employee') {
      if (!request.user.employeeId) throw new ApiError(403,'EMPLOYEE_PROFILE_REQUIRED','This account has no linked employee profile.')
      filter._id = request.user.employeeId
    }
    if (Model.modelName === 'Leave' && request.user.role === 'Employee') filter.employeeId = request.user.employeeId
    if (Model.modelName === 'Roster' && request.user.role === 'Employee') filter['assignments.employeeId'] = request.user.employeeId
    if (Model.modelName === 'Conflict' && request.user.role === 'Employee') filter.employeeIds = request.user.employeeId
    const limit = Math.min(Math.max(Number.parseInt(request.query.limit,10)||50,1),100)
    const page = Math.max(Number.parseInt(request.query.page,10)||1,1)
    const total = await Model.countDocuments(filter)
    const data = await Model.find(filter).sort({createdAt:-1}).skip((page-1)*limit).limit(limit).lean()
    return ok(response,data,200,{page,limit,total})
  })
  router.post('/', createRole, validate(schema), async (request,response) => {
    const data = request.validated
    await validateReferences(Model,data,request.user.workspaceId)
    if (Model.modelName === 'Leave') Object.assign(data,{status:'pending'})
    const document = await Model.create({ ...data, workspaceId: request.user.workspaceId, ...(Model.modelName === 'Conflict' ? {status:'open'} : {}), ...(Model.modelName === 'Roster' ? {createdBy:request.user.id} : {}) })
    return ok(response,document,201)
  })
  router.get('/:id', async (request,response) => {
    const filter = idFilter.test(request.params.id) ? {_id:request.params.id,workspaceId:request.user.workspaceId} : {workspaceId:request.user.workspaceId,employeeCode:request.params.id}
    const document = await Model.findOne(filter).lean()
    if (!document) throw notFound()
    if (Model.modelName === 'Employee' && request.user.role === 'Employee' && String(document._id)!==request.user.employeeId) throw new ApiError(403,'FORBIDDEN','You may only view your own employee profile.')
    if (Model.modelName === 'Roster' && request.user.role === 'Employee' && !(document.assignments||[]).some(assignment=>String(assignment.employeeId)===request.user.employeeId)) throw new ApiError(403,'FORBIDDEN','You may only view rosters containing your assignments.')
    if (Model.modelName === 'Conflict' && request.user.role === 'Employee' && !(document.employeeIds||[]).some(id=>String(id)===request.user.employeeId)) throw new ApiError(403,'FORBIDDEN','You may only view conflicts involving your employee profile.')
    return ok(response,document)
  })
  router.patch('/:id', updateRole, validate(patchSchema), async (request,response) => {
    const data=request.validated
    await validateReferences(Model,data,request.user.workspaceId)
    const document=await Model.findOneAndUpdate({_id:request.params.id,workspaceId:request.user.workspaceId},{$set:data},{returnDocument:'after',runValidators:true})
    if(!document) throw notFound()
    return ok(response,document)
  })
  router.delete('/:id', deleteRole, async (request,response) => {
    const filter={_id:request.params.id,workspaceId:request.user.workspaceId}
    if(!await Model.exists(filter))throw notFound()
    await assertNoDependencies(Model,request.params.id,request.user.workspaceId)
    await Model.deleteOne(filter)
    return response.status(204).end()
  })
  return router
}

export function managedRouter(authenticate) { const router=Router();router.use(authenticate,manager);return router }
export function adminRouter(authenticate) { const router=Router();router.use(authenticate,admin);return router }
export { ok }
