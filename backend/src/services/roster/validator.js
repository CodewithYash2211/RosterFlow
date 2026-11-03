import { dateKey } from './eligibility.js'

export function validateAssignments(assignments, { year, month, employees = [], processes = [], leaves = [], holidays = [] }) {
  const errors = [], seenEmployeeDate = new Set()
  const monthStart=Date.UTC(year,month-1,1),monthEnd=Date.UTC(year,month,1)
  for (const [index,item] of assignments.entries()) {
    const date=new Date(item.date),key=dateKey(date),emp=employees.find(value=>String(value._id)===String(item.employeeId)),process=processes.find(value=>String(value._id)===String(item.processId))
    const add=(code,message)=>errors.push({index,code,message,date:key,employeeId:item.employeeId})
    if (date.getTime()<monthStart||date.getTime()>=monthEnd) add('OUTSIDE_MONTH','Assignment date is outside the selected month.')
    if (!emp) add('EMPLOYEE_NOT_FOUND','Employee is missing or outside this workspace.')
    if (!process) add('PROCESS_NOT_FOUND','Process is missing or outside this workspace.')
    if (!emp||!process) continue
    const brandId=String(process.brandId?._id||process.brandId)
    if(String(item.brandId)!==brandId)add('BRAND_PROCESS_MISMATCH','Assignment brand does not match the process brand.')
    if(emp.status!=='Active')add('INACTIVE_EMPLOYEE','Inactive employees cannot be scheduled.')
    const direct=(emp.processIds||[]).some(id=>String(id)===String(process._id))
    const crossNames=new Set([process.name,...(process.crossTrainingEligibility||[])].map(value=>String(value).toLowerCase()))
    const cross=[...(emp.crossTrainedFor||[]),...(emp.crossTrainingSkills||[])].some(value=>crossNames.has(String(value).toLowerCase()))
    if(!direct&&!cross)add('PROCESS_INELIGIBLE','Employee is not assigned or cross-trained for this process.')
    if(process.requiredSkills?.length){const skills=new Set([...(emp.skills||[]),...(emp.crossTrainingSkills||[])].map(value=>String(value).toLowerCase()));if(!process.requiredSkills.some(skill=>skills.has(String(skill).toLowerCase())))add('MISSING_SKILL','Employee does not have a required process skill.')}
    if (emp.availability==='unavailable') add('UNAVAILABLE','Employee is marked unavailable.')
    if(emp.weeklyOff===date.getUTCDay())add('WEEKLY_OFF','Employee is assigned on their configured weekly off.')
    if(emp.workingDays?.length&&!emp.workingDays.includes(date.getUTCDay()))add('EMPLOYEE_NON_WORKING_DAY','Employee is scheduled on a non-working day.')
    if(process.workingDays?.length&&!process.workingDays.includes(date.getUTCDay()))add('PROCESS_NON_WORKING_DAY','Process is not scheduled on this day.')
    if(process.brandId?.workingDays?.length&&!process.brandId.workingDays.includes(date.getUTCDay()))add('BRAND_NON_WORKING_DAY','Brand is not operational on this day.')
    if (leaves.some(leave=>String(leave.employeeId)===String(emp._id)&&leave.status==='approved'&&date>=new Date(leave.startDate)&&date<=new Date(leave.endDate))) add('APPROVED_LEAVE','Employee has approved leave on this date.')
    if (holidays.some(holiday=>dateKey(holiday.date)===key&&(!holiday.brandIds?.length||holiday.brandIds.some(id=>String(id)===brandId))&&(!holiday.processIds?.length||holiday.processIds.some(id=>String(id)===String(process._id))))) add('HOLIDAY','Assignment overlaps a configured holiday.')
    if (item.kind==='shift') { const unique=`${emp._id}:${key}`;if(seenEmployeeDate.has(unique))add('OVERLAPPING_SHIFT','Employee has multiple shifts on the same day.');seenEmployeeDate.add(unique) }
  }
  return { valid:errors.length===0, errors }
}
