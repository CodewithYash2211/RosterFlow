import Conflict from '../../models/Conflict.js'
import Employee from '../../models/Employee.js'
import Process from '../../models/Process.js'
import Roster from '../../models/Roster.js'
import { generateAssignments } from './generator.js'
import { calculateCoverage } from './coverageCalculator.js'

export async function refreshRosterConflicts({ workspaceId, roster, inputs, userId }) {
  const generated = generateAssignments({ year: roster.year, month: roster.month, ...inputs, preserved: (roster.assignments || []).filter(item => item.locked || item.source === 'manual') })
  const coverage = calculateCoverage(roster.assignments || [], inputs.processes, roster.year, roster.month)
  await Roster.updateOne({ _id: roster._id, workspaceId }, { $set: { coverage } })
  await Conflict.deleteMany({ workspaceId, rosterId: roster._id, source: 'roster-engine' })
  if (generated.conflicts.length) await Conflict.insertMany(generated.conflicts.map(item => ({ ...item, workspaceId, rosterId: roster._id })))
  return generated.conflicts
}

export async function refreshExistingWorkspaceConflicts(workspaceId, roster, userId) {
  const start = new Date(Date.UTC(roster.year, roster.month - 1, 1)), end = new Date(Date.UTC(roster.year, roster.month, 1))
  const [employees, rawProcesses, leaves, holidays] = await Promise.all([
    Employee.find({ workspaceId, status: 'Active' }).lean(),
    Process.find({ workspaceId }).lean(),
    (await import('../../models/Leave.js')).default.find({ workspaceId, status: 'approved', startDate: { $lt: end }, endDate: { $gte: start } }).lean(),
    (await import('../../models/Holiday.js')).default.find({ workspaceId, date: { $gte: start, $lt: end } }).lean(),
  ])
  const processes = rawProcesses.map(process => ({ ...process, brandId: process.brandId }))
  return refreshRosterConflicts({ workspaceId, roster, inputs: { employees, processes, leaves, holidays }, userId })
}
