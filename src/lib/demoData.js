const demoEvent = 'rosterflow:demo-change'
import { isLiveWorkspaceMode } from './workspaceMode.js'
const defaults = {
  employees: [
    { id:'RF-1042', avatarSeed:'RF-1042', name:'Aarav Mehta', role:'Customer Support', email:'aarav@northstar.example', brand:'Nike', pod:'Pod Alpha', off:6, status:'Active', crossTrainedFor:['Returns'] },
    { id:'RF-1043', avatarSeed:'RF-1043', name:'Isha Shah', role:'Retention', email:'isha@northstar.example', brand:'Adidas', pod:'Pod Beta', off:2, status:'Active', crossTrainedFor:['Customer Support'] },
    { id:'RF-1044', avatarSeed:'RF-1044', name:'Kabir Rao', role:'NDR Operations', email:'kabir@northstar.example', brand:'Puma', pod:'Pod Alpha', off:0, status:'Active', crossTrainedFor:['Customer Support'] },
    { id:'RF-1045', avatarSeed:'RF-1045', name:'Ananya Das', role:'Abandoned Cart', email:'ananya@northstar.example', brand:'Zara', pod:'Pod Gamma', off:4, status:'Active', crossTrainedFor:['Customer Support'] },
    { id:'RF-1046', avatarSeed:'RF-1046', name:'Rohan Kulkarni', role:'Customer Support', email:'rohan@northstar.example', brand:'Nike', pod:'Pod Beta', off:1, status:'Active', crossTrainedFor:['Returns'] },
    { id:'RF-1047', avatarSeed:'RF-1047', name:'Meera Nair', role:'Retention', email:'meera@northstar.example', brand:'Puma', pod:'Pod Gamma', off:5, status:'Active', crossTrainedFor:['NDR Operations'] },
  ],
  brands: [ {id:'Nike',name:'Nike'}, {id:'Adidas',name:'Adidas'}, {id:'Puma',name:'Puma'}, {id:'Zara',name:'Zara'} ],
  conflicts: [
    { id:'minimum-nike-customer-support', title:'Minimum staffing at risk', severity:'High', brand:'Nike', process:'Customer Support', date:'2026-11-02', employeeIds:['RF-1042','RF-1046'], issue:'One scheduled shift is below the minimum staffing requirement for this process.', recommendation:'Assign a cross-trained teammate to cover the open shift.', status:'open', kind:'staffing' },
    { id:'overlap-adidas-retention', title:'Overlapping weekly offs', severity:'Medium', brand:'Adidas', process:'Retention', date:'2026-11-04', employeeIds:['RF-1043','RF-1047'], issue:'Two team members have weekly offs on the same day, leaving the process below its planned coverage.', recommendation:'Move one weekly off to the next available day.', status:'open', kind:'weekly-off' },
    { id:'leave-puma-ndr', title:'Unavailability not assigned', severity:'Low', brand:'Puma', process:'NDR Operations', date:'2026-11-06', employeeIds:['RF-1044'], issue:'A pending leave request overlaps a scheduled shift and has no coverage assignment.', recommendation:'Assign a teammate to cover the shift while the leave request is reviewed.', status:'open', kind:'leave' },
  ],
  assignments: [],
  leaveRequests: [],
  holidays: [],
  conflictHistory: [],
}
export function getDemo(key, fallback, { isLiveMode = isLiveWorkspaceMode() } = {}) {
  try {
    const storageKey = `rosterflow.demo.${key}`
    const value = localStorage.getItem(storageKey)
    if (value !== null) {
      const parsed = JSON.parse(value)
      if (key === 'employees' && Array.isArray(parsed)) {
        if (!isLiveMode && parsed.length === 0 && defaults.employees.length === 6) {
          const restored = defaults.employees.map(employee => ({ ...employee, avatarSeed: employee.avatarSeed || String(employee.id || employee.employeeCode || employee.name) }))
          localStorage.setItem(storageKey, JSON.stringify(restored))
          window.dispatchEvent(new CustomEvent(demoEvent, { detail: { key, value: restored } }))
          return restored
        }
        const upgraded = parsed.map(employee => ({ ...employee, avatarSeed: employee.avatarSeed || String(employee.id || employee.employeeCode || employee.name) }))
        if (upgraded.some((employee, index) => employee.avatarSeed !== parsed[index].avatarSeed)) localStorage.setItem(storageKey, JSON.stringify(upgraded))
        return upgraded
      }
      return parsed
    }
  } catch { /* recover with safe demo defaults */ }
  return fallback ?? defaults[key] ?? null
}
export function setDemo(key, value) {
  localStorage.setItem(`rosterflow.demo.${key}`, JSON.stringify(value))
  window.dispatchEvent(new CustomEvent(demoEvent, { detail: { key, value } }))
  return value
}
export function subscribeDemo(callback) {
  const listener = event => callback(event.detail)
  window.addEventListener(demoEvent, listener)
  return () => window.removeEventListener(demoEvent, listener)
}
export function getDemoMetrics() {
  const employees = getDemo('employees', defaults.employees)
  const brands = getDemo('brands', defaults.brands)
  const conflicts = getDemo('conflicts', defaults.conflicts)
  const assignments = getDemo('assignments', defaults.assignments)
  return {
    employees: employees.length,
    brands: brands.length,
    conflicts: conflicts.filter(x => x.status === 'open').length,
    highSeverity: conflicts.filter(x => x.status === 'open' && x.severity === 'High').length,
    coverage: Math.min(100, Math.round((96.4 + assignments.length * 0.6) * 10) / 10),
  }
}
const idOf = value => value == null ? '' : String(value).trim()
const normalized = value => String(value ?? '').trim().toLocaleLowerCase()
const sameDay = (left, right) => idOf(left) === idOf(right)
const weekdayFor = date => new Date(`${date}T12:00:00`).getDay()
const weeklyOffDay = employee => (Number(employee.off) + 1) % 7

export function getResolutionEligibility(conflict, candidateId, { employees = getDemo('employees', defaults.employees), assignments = getDemo('assignments', defaults.assignments), leaveRequests = getDemo('leaveRequests', []) } = {}) {
  const candidate = employees.find(person => idOf(person.id) === idOf(candidateId))
  if (!candidate) return { eligible: false, candidate: null, reasons: ['Choose a teammate from the roster.'] }
  const reasons = []
  if (normalized(candidate.status || 'Active') !== 'active') reasons.push('Employee is not active.')
  if ((conflict.employeeIds || []).some(id => idOf(id) === idOf(candidate.id))) reasons.push('Employee is already involved in this conflict.')
  if ((assignments || []).some(item => idOf(item.employeeId) === idOf(candidate.id) && sameDay(item.date, conflict.date) && normalized(item.status) !== 'cancelled')) reasons.push('Employee already has an assignment on this date.')
  const day = weekdayFor(conflict.date)
  if (Number.isFinite(day) && weeklyOffDay(candidate) === day) reasons.push('Employee is on weekly off for this date.')
  const unavailableDates = [...(candidate.unavailableDates || []), ...(candidate.leaveDates || []), ...(candidate.approvedLeaveDates || [])]
  if (unavailableDates.some(date => sameDay(date, conflict.date)) || normalized(candidate.availability) === 'unavailable') reasons.push('Employee is unavailable on this date.')
  if ((leaveRequests || []).some(request => {
    const starts = request.startDate || request.date
    const ends = request.endDate || request.date || starts
    return idOf(request.employeeId) === idOf(candidate.id) && normalized(request.status) === 'approved' && starts <= conflict.date && ends >= conflict.date
  })) reasons.push('Employee has approved leave on this date.')
  const qualified = normalized(candidate.role) === normalized(conflict.process) || (candidate.crossTrainedFor || []).some(skill => normalized(skill) === normalized(conflict.process))
  if (!qualified) reasons.push(`Employee is not qualified for ${conflict.process}.`)
  return { eligible: reasons.length === 0, candidate, reasons }
}

function setDemoBatch(entries) {
  const originals = new Map()
  try {
    for (const [key, value] of Object.entries(entries)) {
      const storageKey = `rosterflow.demo.${key}`
      originals.set(storageKey, localStorage.getItem(storageKey))
      localStorage.setItem(storageKey, JSON.stringify(value))
    }
  } catch (error) {
    for (const [key, value] of originals) {
      try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* preserve the original storage error */ }
    }
    throw new Error('The resolution could not be saved. Your conflict remains open; check browser storage and try again.')
  }
  for (const [key, value] of Object.entries(entries)) window.dispatchEvent(new CustomEvent(demoEvent, { detail: { key, value } }))
}
export async function refreshDemoData() {
  await new Promise(resolve => setTimeout(resolve, 650))
  const conflicts = getDemo('conflicts', defaults.conflicts)
  const metrics = getDemoMetrics()
  const snapshot = { refreshedAt: new Date().toISOString(), metrics, openConflictIds: conflicts.filter(x => x.status === 'open').map(x => x.id) }
  setDemo('lastReview', snapshot)
  return snapshot
}
export function applyDemoResolution(conflictId, candidateId) {
  const conflicts = getDemo('conflicts', defaults.conflicts)
  const conflict = conflicts.find(x => x.id === conflictId && x.status === 'open')
  if (!conflict) throw new Error('This conflict is no longer open. Refresh the review and try again.')
  const people = getDemo('employees', defaults.employees)
  let assignments = getDemo('assignments', defaults.assignments)
  let nextEmployees = people
  let assignedEmployeeId = null
  let resolution
  if (conflict.kind === 'weekly-off') {
    const employee = people.find(x => idOf(x.id) === idOf(conflict.employeeIds[1]))
    if (!employee) throw new Error('The affected employee is missing from the demo roster, so this resolution cannot be applied.')
    if (normalized(employee.status || 'Active') !== 'active') throw new Error('The affected employee is inactive, so their weekly off cannot be changed.')
    const nextDay = (Number(employee.off) + 1) % 7
    nextEmployees = people.map(x => idOf(x.id) === idOf(employee.id) ? { ...x, off: nextDay } : x)
    resolution = 'Moved a weekly off to the next day.'
  } else {
    if (!['staffing', 'coverage-gap', 'leave', 'availability'].includes(conflict.kind)) throw new Error('This conflict type does not support shift reassignment.')
    const result = getResolutionEligibility(conflict, candidateId, { employees: people, assignments })
    if (!result.eligible) throw new Error(result.reasons.join(' '))
    const candidate = result.candidate
    assignedEmployeeId = idOf(candidate.id)
    assignments = [...assignments, { id:`${conflict.id}-${Date.now()}`, conflictId:conflict.id, employeeId:assignedEmployeeId, employeeName:candidate.name, brand:conflict.brand, process:conflict.process, date:conflict.date, status:'scheduled', assignmentType:conflict.kind === 'leave' || conflict.kind === 'availability' ? 'leave-cover' : conflict.kind === 'coverage-gap' ? 'coverage-cover' : 'staffing-cover' }]
    resolution = conflict.kind === 'leave' || conflict.kind === 'availability' ? 'Assigned a teammate to cover the unavailable shift.' : conflict.kind === 'coverage-gap' ? 'Assigned a teammate to close the coverage gap.' : 'Assigned a teammate to cover the shift.'
  }
  const updated = conflicts.map(x => x.id === conflict.id ? { ...x, status:'resolved', resolvedAt:new Date().toISOString(), resolution, assignedEmployeeId } : x)
  const resolved = updated.find(x => x.id === conflict.id)
  const changes = { conflicts: updated, conflictHistory: [...getDemo('conflictHistory', []), resolved], assignments }
  if (nextEmployees !== people) changes.employees = nextEmployees
  setDemoBatch(changes)
  return getDemoMetrics()
}
export function dismissDemoConflict(conflictId) {
  const conflicts = getDemo('conflicts', defaults.conflicts)
  const conflict = conflicts.find(x => x.id === conflictId && x.status === 'open')
  if (!conflict) throw new Error('This conflict is no longer open.')
  const dismissed = { ...conflict, status:'dismissed', dismissedAt:new Date().toISOString() }
  setDemo('conflicts', conflicts.map(x => x.id === conflictId ? dismissed : x))
  setDemo('conflictHistory', [...getDemo('conflictHistory', []), dismissed])
  return getDemoMetrics()
}
export { defaults as demoDefaults }
