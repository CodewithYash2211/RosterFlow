import { isEligible, dateKey } from './eligibility.js'
import { recommendBackups, scoreCandidate } from './scoring.js'

const utcDate = (year, month, day) => new Date(Date.UTC(year, month - 1, day))
const shiftList = process => process.shiftRequirements?.length ? process.shiftRequirements : [{ name: 'day', minimumStaffing: process.minimumStaffing || 1 }]

export function generateAssignments({ year, month, employees, processes, leaves = [], holidays = [], preserved = [] }) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const assignments = preserved.map(item => ({ ...item }))
  const counts = new Map()
  const previousBrand = new Map()
  for (const item of assignments) if (item.kind === 'shift' && item.status !== 'cancelled') counts.set(String(item.employeeId), (counts.get(String(item.employeeId)) || 0) + 1)
  const conflicts = []
  for (const process of [...processes].sort((a,b) => String(a._id).localeCompare(String(b._id)))) {
    const brand = process.brandId
    const relevantEmployees = employees.filter(employee => String(employee.brandId) === String(brand) || (employee.processIds || []).some(id => String(id) === String(process._id)) || [...(employee.crossTrainedFor || []), ...(employee.crossTrainingSkills || [])].some(skill => (process.crossTrainingEligibility || []).some(value => value.toLowerCase() === String(skill).toLowerCase()) || String(skill).toLowerCase() === String(process.name).toLowerCase()))
    for (let day = 1; day <= days; day++) {
      const date = utcDate(year, month, day)
      const key = dateKey(date)
      const workDay = (!process.workingDays?.length || process.workingDays.includes(date.getUTCDay())) && (!brand.workingDays?.length || brand.workingDays.includes(date.getUTCDay()))
      if (!workDay) continue
      const holiday = holidays.find(item => dateKey(item.date) === key && (!item.processIds?.length || item.processIds.some(id => String(id) === String(process._id))) && (!item.brandIds?.length || item.brandIds.some(id => String(id) === String(brand._id))))
      if (holiday) continue
      for (const shift of shiftList(process)) {
        const needed = Math.max(0, shift.minimumStaffing ?? process.minimumStaffing ?? 1)
        if (!needed) continue
        const already = assignments.filter(item => item.kind === 'shift' && item.status !== 'cancelled' && String(item.processId) === String(process._id) && dateKey(item.date) === key && String(item.shift || 'day').toLowerCase() === String(shift.name || 'day').toLowerCase())
        let deficit = Math.max(0, needed - already.length)
        while (deficit > 0) {
          const pool = relevantEmployees.filter(employee => isEligible(employee, process, date, { leaves, assigned: assignments }))
          const context = { counts, previousBrand, process, shift, dateKey: key }
          pool.sort((a,b) => scoreCandidate(a,context) - scoreCandidate(b,context))
          const chosen = pool[0]
          if (!chosen) {
            const backups = recommendBackups(relevantEmployees, process, {...context,date,leaves,assignments})
            conflicts.push({ title: `Staffing gap · ${process.name}`, kind: 'coverage-gap', severity: 'High', processId: process._id, brandId: brand._id, date, shift:shift.name||'day', requiredStaffing:needed, assignedStaffing:needed-deficit, employeeIds: [], recommendedEmployeeIds: backups.map(item=>item.employeeId), details: `Requires ${needed} on ${shift.name || 'day'} shift; filled ${needed-deficit}. Recommended cross-trained backups require manager approval.`, source: 'roster-engine' })
            break
          }
          assignments.push({ employeeId: chosen._id, brandId: brand._id, processId: process._id, date, shift: shift.name || 'day', kind: 'shift', status: 'scheduled', locked: false, source: 'generated' })
          counts.set(String(chosen._id), (counts.get(String(chosen._id)) || 0) + 1)
          previousBrand.set(String(chosen._id), String(brand._id))
          deficit--
        }
      }
    }
  }
  return { assignments, conflicts }
}
