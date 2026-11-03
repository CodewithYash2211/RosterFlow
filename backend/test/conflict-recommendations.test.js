import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateConflictBackups } from '../src/services/conflictRecommendations.js'
import { getEligibilityIssues } from '../src/services/roster/eligibility.js'

const id = value => value.padStart(24, '0')
const date = new Date('2026-11-03T00:00:00.000Z')
const brand = { _id: id('1'), name: 'Test Brand', status: 'active', workingDays: [1, 2, 3, 4, 5] }
const process = { _id: id('2'), brandId: brand._id, name: 'Support', minimumStaffing: 1, requiredSkills: ['support'], workingDays: [1, 2, 3, 4, 5] }
const conflict = { _id: id('8'), kind: 'coverage-gap', status: 'open', brandId: brand._id, processId: process._id, date, shift: 'day', recommendedEmployeeIds: [id('3')] }
const roster = { year: 2026, month: 11, locked: false, assignments: [] }
const activeEmployee = overrides => ({ _id: id('3'), name: 'Eligible backup', employeeCode: 'RF-3', status: 'Active', availability: 'available', brandId: brand._id, processIds: [], crossTrainedFor: ['Support'], crossTrainingSkills: ['support'], skills: [], weeklyOff: 0, workingDays: [1, 2, 3, 4, 5], ...overrides })

test('recalculates candidates from current records rather than stored recommendation IDs', () => {
  const stale = activeEmployee({ _id: id('4'), name: 'Already assigned', employeeCode: 'RF-4' })
  const valid = activeEmployee({ _id: id('5'), name: 'Fresh eligible candidate', employeeCode: 'RF-5' })
  const result = evaluateConflictBackups({ conflict: { ...conflict, recommendedEmployeeIds: [stale._id] }, roster: { ...roster, assignments: [{ employeeId: stale._id, processId: id('6'), brandId: brand._id, date, shift: 'day', kind: 'shift', status: 'scheduled' }] }, employees: [stale, valid], brand, process })
  assert.deepEqual(result.recommendations.map(item => item.id), [String(valid._id)])
  assert.deepEqual(result.exclusions.find(item => item.id === String(stale._id)).issues, ['OVERLAPPING_SHIFT'])
})

test('applies all employee hard constraints and reports exact exclusion codes', () => {
  const assigned = { employeeId: id('10'), processId: id('11'), brandId: brand._id, date, shift: 'night', kind: 'shift', status: 'scheduled' }
  const candidates = [
    activeEmployee({ _id: id('10'), name: 'Overlapping', employeeCode: 'RF-10' }),
    activeEmployee({ _id: id('12'), name: 'Weekly off', employeeCode: 'RF-12', weeklyOff: 2 }),
    activeEmployee({ _id: id('13'), name: 'Unavailable', employeeCode: 'RF-13', availability: 'unavailable' }),
    activeEmployee({ _id: id('14'), name: 'Inactive', employeeCode: 'RF-14', status: 'Inactive' }),
    activeEmployee({ _id: id('15'), name: 'Unskilled', employeeCode: 'RF-15', crossTrainedFor: [], crossTrainingSkills: [], skills: [] }),
    activeEmployee({ _id: id('16'), name: 'Not a workday', employeeCode: 'RF-16', workingDays: [1, 3, 4, 5] }),
  ]
  const result = evaluateConflictBackups({ conflict, roster: { ...roster, assignments: [assigned] }, employees: candidates, brand, process })
  assert.deepEqual(result.recommendations, [])
  const codes = Object.fromEntries(result.exclusions.map(item => [item.name, item.issues]))
  assert.ok(codes.Overlapping.includes('OVERLAPPING_SHIFT'))
  assert.ok(codes['Weekly off'].includes('WEEKLY_OFF'))
  assert.ok(codes.Unavailable.includes('UNAVAILABLE'))
  assert.ok(codes.Inactive.includes('INACTIVE'))
  assert.ok(codes.Unskilled.includes('PROCESS_SKILL'))
  assert.ok(codes['Not a workday'].includes('NON_WORKING_DAY'))
})

test('approved leave, holiday closure, non-working day, and current coverage block recommendations', () => {
  const employee = activeEmployee({ _id: id('20'), employeeCode: 'RF-20' })
  const leave = { employeeId: employee._id, status: 'approved', startDate: date, endDate: date }
  const onLeave = evaluateConflictBackups({ conflict, roster, employees: [employee], brand, process, leaves: [leave] })
  assert.ok(onLeave.exclusions[0].issues.includes('APPROVED_LEAVE'))
  const holiday = evaluateConflictBackups({ conflict, roster, employees: [employee], brand, process, holidays: [{ date, brandIds: [brand._id], processIds: [process._id] }] })
  assert.equal(holiday.reason, 'The brand or process is closed for a holiday on this date.')
  const nonWorking = evaluateConflictBackups({ conflict, roster, employees: [employee], brand: { ...brand, workingDays: [1] }, process })
  assert.equal(nonWorking.reason, 'The process or brand is closed on this date.')
  const covered = evaluateConflictBackups({ conflict, roster: { ...roster, assignments: [{ employeeId: id('21'), brandId: brand._id, processId: process._id, date, shift: 'day', kind: 'shift', status: 'scheduled' }] }, employees: [employee], brand, process })
  assert.equal(covered.reason, 'The staffing requirement is already filled or requires no assignments.')
})

test('monthly workload ranks candidates but only an explicit cap makes it a hard constraint', () => {
  const employee = activeEmployee({ _id: id('30'), employeeCode: 'RF-30' })
  const manyShifts = Array.from({ length: 20 }, (_, index) => ({ employeeId: employee._id, processId: process._id, brandId: brand._id, date: new Date(Date.UTC(2026, 10, index + 4)), shift: 'day', kind: 'shift', status: 'scheduled' }))
  assert.deepEqual(getEligibilityIssues(employee, process, date, { assigned: manyShifts }), [])
  assert.ok(getEligibilityIssues({ ...employee, maxShiftsPerMonth: 20 }, process, date, { assigned: manyShifts }).includes('MONTHLY_SHIFT_CAP'))
  assert.deepEqual(getEligibilityIssues({ ...employee, maxShiftsPerMonth: null }, process, date, { assigned: manyShifts }), [])
})
