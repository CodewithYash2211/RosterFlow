const dateKey = value => new Date(value).toISOString().slice(0, 10)
const weekday = value => new Date(value).getUTCDay()

export function isEligible(employee, process, date, { leaves = [], assigned = [] } = {}) {
  return getEligibilityIssues(employee, process, date, { leaves, assigned }).length === 0
}

export function getEligibilityIssues(employee, process, date, { leaves = [], assigned = [] } = {}) {
  const issues = []
  if (employee.status !== 'Active') issues.push('INACTIVE')
  if (employee.availability === 'unavailable') issues.push('UNAVAILABLE')
  const key = dateKey(date)
  const day = weekday(date)
  if (!(employee.workingDays?.length ? employee.workingDays : [0,1,2,3,4,5,6]).includes(day)) issues.push('NON_WORKING_DAY')
  if (employee.weeklyOff === day) issues.push('WEEKLY_OFF')
  if (leaves.some(leave => String(leave.employeeId) === String(employee._id) && leave.status === 'approved' && key >= dateKey(leave.startDate) && key <= dateKey(leave.endDate))) issues.push('APPROVED_LEAVE')
  const shiftsForDate = assigned.filter(item => String(item.employeeId) === String(employee._id) && dateKey(item.date) === key && item.kind === 'shift' && item.status !== 'cancelled')
  if (shiftsForDate.length) issues.push('OVERLAPPING_SHIFT')
  const directProcess = (employee.processIds || []).some(id => String(id) === String(process._id))
  const processNames = new Set([process.name, ...(process.crossTrainingEligibility || [])].filter(Boolean).map(value => String(value).toLowerCase()))
  const crossTrained = [...(employee.crossTrainedFor || []), ...(employee.crossTrainingSkills || [])].some(value => processNames.has(String(value).toLowerCase()))
  if (!directProcess && !crossTrained) issues.push('PROCESS_SKILL')
  if (process.requiredSkills?.length) {
    const skills = new Set([...(employee.skills || []), ...(employee.crossTrainingSkills || [])].map(value => String(value).toLowerCase()))
    if (!process.requiredSkills.some(skill => skills.has(String(skill).toLowerCase()))) issues.push('REQUIRED_SKILL')
  }
  const cap = employee.maxShiftsPerMonth
  if (cap !== undefined && cap !== null && Number.isInteger(Number(cap)) && Number(cap) >= 0) {
    const monthShifts = assigned.filter(item => {
      const itemDate = new Date(item.date)
      return String(item.employeeId) === String(employee._id) && item.kind === 'shift' && item.status !== 'cancelled' && itemDate.getUTCFullYear() === new Date(date).getUTCFullYear() && itemDate.getUTCMonth() === new Date(date).getUTCMonth()
    }).length
    if (monthShifts >= Number(cap)) issues.push('MONTHLY_SHIFT_CAP')
  }
  return issues
}

export { dateKey }
