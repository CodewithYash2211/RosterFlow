export function scoreCandidate(employee, context) {
  const assignedCount = context.counts.get(String(employee._id)) || 0
  const sameBrand = context.previousBrand.get(String(employee._id)) === String(context.process.brandId)
  const shiftMatch = employee.shiftPreference === 'any' || !employee.shiftPreference || employee.shiftPreference === context.shift.name.toLowerCase()
  const seed = [...`${context.dateKey}:${context.process._id}:${employee._id}`].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 7)
  return assignedCount * 100 + (employee.availability === 'limited' ? 20 : 0) + (sameBrand ? -4 : 0) + (shiftMatch ? -2 : 0) + seed / 0xffffffff
}

export function recommendBackups(employees, process, context) {
  return employees.filter(employee => isEligible(employee,process,context.date,{leaves:context.leaves,assigned:context.assignments}) && !(employee.processIds || []).some(id => String(id) === String(process._id)))
    .sort((a,b) => scoreCandidate(a,context)-scoreCandidate(b,context)).slice(0,3).map(employee => ({ employeeId: employee._id, name: employee.name, reason: 'Cross-trained backup; manager approval required.' }))
}
import { isEligible } from './eligibility.js'
