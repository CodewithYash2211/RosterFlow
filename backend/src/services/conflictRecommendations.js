import Conflict from '../models/Conflict.js'
import Roster from '../models/Roster.js'
import Employee from '../models/Employee.js'
import Brand from '../models/Brand.js'
import Process from '../models/Process.js'
import Leave from '../models/Leave.js'
import Holiday from '../models/Holiday.js'
import Pod from '../models/Pod.js'
import { notFound } from './ApiError.js'
import { dateKey, getEligibilityIssues } from './roster/eligibility.js'
import { scoreCandidate } from './roster/scoring.js'

const same = (left, right) => String(left) === String(right)
const shiftName = conflict => String(conflict.shift || 'day').toLowerCase()
const holidayApplies = (holiday, brandId, processId) =>
  dateKey(holiday.date) && (!holiday.brandIds?.length || holiday.brandIds.some(id => same(id, brandId))) &&
  (!holiday.processIds?.length || holiday.processIds.some(id => same(id, processId)))

function failure(reason, details = {}) {
  return { recommendations: [], exclusions: [], reason, ...details }
}

export function evaluateConflictBackups({ conflict, roster, employees, brand, process, pods = [], leaves = [], holidays = [] }) {
  if (!conflict || !['open', 'reviewed'].includes(conflict.status) || conflict.kind !== 'coverage-gap') return failure('This conflict is not an actionable open staffing gap.')
  if (!roster || !conflict.date || !conflict.processId || !conflict.brandId) return failure('The conflict does not have a matching roster, date, brand, and process.')
  if (roster.locked) return failure('Unlock the roster before applying a backup.', { code: 'ROSTER_LOCKED' })
  if (!brand || brand.status !== 'active' || !process || !same(process.brandId, brand._id)) return failure('The conflict brand or process is no longer active and valid.')

  const date = new Date(conflict.date)
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() !== roster.year || date.getUTCMonth() + 1 !== roster.month) return failure('The conflict date does not match its roster month.')
  const day = date.getUTCDay()
  const key = dateKey(date)
  const shift = shiftName(conflict)
  const shiftRequirement = process.shiftRequirements?.find(item => String(item.name || 'day').toLowerCase() === shift)
  const required = Number(conflict.requiredStaffing ?? shiftRequirement?.minimumStaffing ?? process.minimumStaffing ?? 1)
  const assignments = (roster.assignments || []).map(item => item.toObject?.() || item)
  const assigned = assignments.filter(item => item.kind === 'shift' && item.status !== 'cancelled' && same(item.processId, process._id) && same(item.brandId, brand._id) && dateKey(item.date) === key && String(item.shift || 'day').toLowerCase() === shift).length
  const staffing = { required, assigned, gap: Math.max(0, required - assigned) }
  if (required <= 0 || assigned >= required) return failure('The staffing requirement is already filled or requires no assignments.', { code: 'CONFLICT_ALREADY_COVERED', staffing })

  const operationalDay = (!process.workingDays?.length || process.workingDays.includes(day)) && (!brand.workingDays?.length || brand.workingDays.includes(day))
  if (!operationalDay) return failure('The process or brand is closed on this date.', { code: 'NON_WORKING_DAY', staffing })
  const holiday = holidays.find(item => dateKey(item.date) === key && holidayApplies(item, brand._id, process._id))
  if (holiday) return failure('The brand or process is closed for a holiday on this date.', { code: 'HOLIDAY', staffing })

  const counts = new Map(employees.map(employee => [String(employee._id), assignments.filter(item => same(item.employeeId, employee._id) && item.kind === 'shift' && item.status !== 'cancelled').length]))
  const previousBrand = new Map()
  for (const item of assignments) {
    if (item.kind === 'shift' && item.status !== 'cancelled') previousBrand.set(String(item.employeeId), String(item.brandId))
  }
  const context = { counts, previousBrand, process, shift: { name: conflict.shift || 'day' }, dateKey: key }
  const ranked = [...employees]
    .map(employee => ({ employee, issues: getEligibilityIssues(employee, process, date, { leaves, assigned: assignments }) }))
    .sort((left, right) => scoreCandidate(left.employee, context) - scoreCandidate(right.employee, context))
  const recommendations = ranked.filter(item => item.issues.length === 0).slice(0, 3).map(({ employee }) => {
    const pod = pods.find(item => same(item._id, employee.podId) && (item.processIds || []).some(id => same(id, process._id)) && (!item.brandIds?.length || item.brandIds.some(id => same(id, brand._id))))
    const direct = (employee.processIds || []).some(id => same(id, process._id))
    return {
      id: String(employee._id),
      name: employee.name,
      employeeCode: employee.employeeCode,
      status: employee.status,
      availability: employee.availability,
      skillBasis: direct ? 'direct process skill' : 'cross-trained process skill',
      monthlyAssignedShifts: counts.get(String(employee._id)) || 0,
      maxShiftsPerMonth: Number.isInteger(employee.maxShiftsPerMonth) ? employee.maxShiftsPerMonth : null,
      pod: pod ? { id: String(pod._id), name: pod.name } : null,
      reason: direct ? 'Active and qualified for this process.' : 'Active and cross-trained for this process.'
    }
  })
  const exclusions = ranked.filter(item => item.issues.length).map(({ employee, issues }) => ({ id: String(employee._id), name: employee.name, issues }))
  const pod = pods.find(item => (item.processIds || []).some(id => same(id, process._id)) && (!item.brandIds?.length || item.brandIds.some(id => same(id, brand._id))))
  return {
    recommendations,
    exclusions,
    reason: recommendations.length ? null : 'No employee currently satisfies all hard scheduling constraints for this date and shift.',
    staffing,
    date: key,
    shift: conflict.shift || 'day',
    brand: { id: String(brand._id), name: brand.name },
    process: { id: String(process._id), name: process.name },
    pod: pod ? { id: String(pod._id), name: pod.name } : null
  }
}

export async function getConflictBackupRecommendations({ conflictId, workspaceId }) {
  const conflict = await Conflict.findOne({ _id: conflictId, workspaceId, status: { $in: ['open', 'reviewed'] } }).lean()
  if (!conflict) throw notFound('Open conflict not found.')
  const [roster, brand, process, employees] = await Promise.all([
    conflict.rosterId ? Roster.findOne({ _id: conflict.rosterId, workspaceId }).lean() : null,
    Brand.findOne({ _id: conflict.brandId, workspaceId }).lean(),
    Process.findOne({ _id: conflict.processId, workspaceId }).lean(),
    Employee.find({ workspaceId }).lean()
  ])
  if (!roster || !conflict.date) return failure('The conflict has no current roster assignment context.')
  const start = new Date(Date.UTC(roster.year, roster.month - 1, 1))
  const end = new Date(Date.UTC(roster.year, roster.month, 1))
  const [leaves, holidays, pods] = await Promise.all([
    Leave.find({ workspaceId, status: 'approved', startDate: { $lt: end }, endDate: { $gte: start } }).lean(),
    Holiday.find({ workspaceId, date: { $gte: start, $lt: end } }).lean(),
    Pod.find({ workspaceId, status: 'active' }).lean()
  ])
  return evaluateConflictBackups({ conflict, roster, employees, brand, process, pods, leaves, holidays })
}
