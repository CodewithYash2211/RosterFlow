import Employee from '../models/Employee.js'
import Brand from '../models/Brand.js'
import Process from '../models/Process.js'
import Pod from '../models/Pod.js'
import Leave from '../models/Leave.js'
import Holiday from '../models/Holiday.js'
import Roster from '../models/Roster.js'
import Conflict from '../models/Conflict.js'
import Workspace from '../models/Workspace.js'
import { badRequest, notFound } from './ApiError.js'

const refModels = { Employee, Brand, Process, Pod, Leave, Holiday, Roster, Conflict, Workspace }
const references = {
  Employee: { brandId: 'Brand', processIds: 'Process', podId: 'Pod' },
  Brand: { holidayIds: 'Holiday' },
  Process: { brandId: 'Brand' },
  Pod: { leaderId: 'Employee', memberIds: 'Employee', brandIds: 'Brand', processIds: 'Process' },
  Leave: { employeeId: 'Employee' },
  Holiday: { brandIds: 'Brand', processIds: 'Process' },
  Conflict: { brandId: 'Brand', processId: 'Process', employeeIds: 'Employee' },
  Roster: { assignments: { employeeId: 'Employee', brandId: 'Brand', processId: 'Process' } },
}

export async function validateReferences(Model, data, workspaceId) {
  const fields = references[Model.modelName] || {}
  for (const [field, modelName] of Object.entries(fields)) {
    const values = data[field]
    if (typeof modelName === 'string' && values != null) {
      const list = Array.isArray(values) ? values : [values]
      const Reference = refModels[modelName]
      const count = await Reference.countDocuments({ _id: { $in: list }, workspaceId })
      if (count !== new Set(list.map(String)).size) throw badRequest(`${field} contains a missing or out-of-workspace reference.`)
    } else if (field === 'assignments' && Array.isArray(values)) {
      for (const assignment of values) for (const [assignmentField, assignmentModel] of Object.entries(modelName)) {
        const Reference = refModels[assignmentModel]
        const found = await Reference.exists({ _id: assignment[assignmentField], workspaceId })
        if (!found) throw badRequest(`assignments.${assignmentField} contains a missing or out-of-workspace reference.`)
      }
    }
  }
  if (Model === Pod && data.leaderId) {
    const leader = await Employee.findOne({ _id: data.leaderId, workspaceId }).select('status').lean()
    if (!leader || leader.status !== 'Active') throw badRequest('Pod leader must be an active employee in this workspace.')
  }
}

export async function assertNoDependencies(Model, id, workspaceId) {
  const checks = Model === Employee ? [[Pod,{ $or: [{ leaderId: id },{ memberIds: id }] }],[Leave,{ employeeId: id }]]
    : Model === Brand ? [[Process,{brandId:id}],[Employee,{brandId:id}],[Roster,{'assignments.brandId':id}]]
    : Model === Process ? [[Employee,{processIds:id}],[Pod,{processIds:id}],[Roster,{'assignments.processId':id}]]
    : Model === Pod ? [[Employee,{podId:id}]]
    : []
  for (const [Reference, filter] of checks) {
    if (await Reference.exists({ workspaceId, ...filter })) throw badRequest(`Cannot delete this ${Model.modelName.toLowerCase()} while records still reference it. Reassign the dependent records first.`)
  }
}

export async function readOne(Model, id, workspaceId) {
  const document = await Model.findOne({ _id: id, workspaceId })
  if (!document) throw notFound()
  return document
}
