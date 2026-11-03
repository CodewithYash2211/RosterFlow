import { dateKey } from './eligibility.js'

export function calculateCoverage(assignments, processes, year, month, holidays = [], employees = [], pods = []) {
  const result = { required: 0, assigned: 0, percentage: null, applicable: false, byProcess: [], byBrand: [], byPod: [], byEmployee: [], byDate: {} }
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (const process of processes) {
    const shifts = process.shiftRequirements?.length ? process.shiftRequirements : [{ name: 'day', minimumStaffing: process.minimumStaffing || 1 }]
    let required = 0, assigned = 0
    for (let day=1; day<=days; day++) {
      const date = new Date(Date.UTC(year,month-1,day))
      if ((process.workingDays?.length && !process.workingDays.includes(date.getUTCDay())) || (process.brandId?.workingDays?.length && !process.brandId.workingDays.includes(date.getUTCDay()))) continue
      const holiday = holidays.some(item=>dateKey(item.date)===dateKey(date)&&(!item.brandIds?.length||item.brandIds.some(id=>String(id)===String(process.brandId?._id||process.brandId)))&&(!item.processIds?.length||item.processIds.some(id=>String(id)===String(process._id))))
      if(holiday)continue
      for (const shift of shifts) {
        const need = shift.minimumStaffing ?? process.minimumStaffing ?? 1
        const count = assignments.filter(item=>item.kind==='shift' && item.status!=='cancelled' && String(item.processId)===String(process._id) && dateKey(item.date)===dateKey(date) && String(item.shift||'day').toLowerCase()===String(shift.name||'day').toLowerCase()).length
        required += need; assigned += Math.min(need,count)
        const key=dateKey(date);result.byDate[key] ||= { required:0, assigned:0 };result.byDate[key].required+=need;result.byDate[key].assigned+=Math.min(need,count)
      }
    }
    result.byProcess.push({processId:process._id,name:process.name,required,assigned,percentage:required?Math.round(assigned/required*100):null})
  }
  result.required=requiredTotal(result.byProcess);result.assigned=result.byProcess.reduce((total,item)=>total+item.assigned,0);result.applicable=result.required>0;result.percentage=result.applicable?Math.round(result.assigned/result.required*100):null
  const brands=new Map(),employeeWorkloads=new Map()
  for(const process of processes){const metric=result.byProcess.find(item=>String(item.processId)===String(process._id));const brandId=String(process.brandId?._id||process.brandId);const brandName=process.brandId?.name||brandId;const brand=brands.get(brandId)||{brandId,name:brandName,required:0,assigned:0};brand.required+=metric.required;brand.assigned+=metric.assigned;brands.set(brandId,brand)}
  for(const item of assignments.filter(item=>item.kind==='shift'&&item.status!=='cancelled')){const employeeId=String(item.employeeId);const employee=employeeWorkloads.get(employeeId)||{employeeId,assignments:0};employee.assignments++;employeeWorkloads.set(employeeId,employee)}
  const employeeById=new Map(employees.map(item=>[String(item._id||item.id),item]))
  const podById=new Map(pods.map(item=>[String(item._id||item.id),{podId:String(item._id||item.id),name:item.name,capacity:item.capacity||0,assigned:0}]))
  for(const item of assignments.filter(item=>item.kind==='shift'&&item.status!=='cancelled')){const employee=employeeById.get(String(item.employeeId));const pod=employee?.podId&&podById.get(String(employee.podId));if(pod)pod.assigned++}
  for(const pod of podById.values()){const workingDays=processes.reduce((max,process)=>Math.max(max,process.workingDays?.length||process.brandId?.workingDays?.length||5),0);const days=new Date(Date.UTC(year,month,0)).getUTCDate();const nominalCapacity=pod.capacity*days*(workingDays/7);pod.capacityWorkload=Math.round(nominalCapacity);pod.utilizationPercentage=pod.capacityWorkload?Math.round(pod.assigned/pod.capacityWorkload*100):0}
  for(const brand of brands.values())brand.percentage=brand.required?Math.round(brand.assigned/brand.required*100):null
  result.byBrand=[...brands.values()];result.byEmployee=[...employeeWorkloads.values()];result.byPod=[...podById.values()]
  return result
}
const requiredTotal = items => items.reduce((total,item)=>total+item.required,0)
