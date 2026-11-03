import Conflict from '../models/Conflict.js'
import Roster from '../models/Roster.js'
import Employee from '../models/Employee.js'
import Brand from '../models/Brand.js'
import Process from '../models/Process.js'
import Leave from '../models/Leave.js'
import Holiday from '../models/Holiday.js'
import Pod from '../models/Pod.js'
import { ApiError, notFound } from './ApiError.js'
import { isEligible, dateKey } from './roster/eligibility.js'
import { calculateCoverage } from './roster/coverageCalculator.js'

export async function resolveConflictAction({conflictId,workspaceId,actorId,action,employeeId,resolution}){
 const conflict=await Conflict.findOne({_id:conflictId,workspaceId,status:{$in:['open','reviewed']}})
 if(!conflict)throw notFound('Open conflict not found.')
 const at=new Date(),history={at,by:actorId,summary:resolution||''}
 if(action==='mark-reviewed'){
  conflict.status='reviewed';conflict.resolution=resolution;conflict.resolvedBy=actorId;conflict.resolvedAt=at;conflict.resolutionHistory.push({...history,action:'reviewed'});await conflict.save();return conflict
 }
 if(action==='dismiss'){
  conflict.status='dismissed';conflict.resolution=resolution;conflict.resolvedBy=actorId;conflict.resolvedAt=at;conflict.resolutionHistory.push({...history,action:'dismissed'});await conflict.save();return conflict
 }
 if(!conflict.rosterId||!conflict.processId||!conflict.brandId||!conflict.date)throw new ApiError(409,'CONFLICT_NOT_ASSIGNABLE','This conflict does not include enough roster detail to safely assign a backup.')
 const [roster,employee,brand,process]=await Promise.all([Roster.findOne({_id:conflict.rosterId,workspaceId}),Employee.findOne({_id:employeeId,workspaceId}).lean(),Brand.findOne({_id:conflict.brandId,workspaceId}).lean(),Process.findOne({_id:conflict.processId,workspaceId}).lean()])
 if(!roster||roster.locked)throw new ApiError(409,roster?'ROSTER_LOCKED':'ROSTER_NOT_FOUND',roster?'Unlock the roster before applying a recommendation.':'The related roster no longer exists.')
 if(!employee||!brand||!process||String(process.brandId)!==String(brand._id))throw new ApiError(400,'INVALID_REFERENCE','The employee, brand, process, or their relationship is invalid.')
 if(brand.status!=='active')throw new ApiError(409,'BRAND_INACTIVE','The related brand is not active.')
 const [leaves,holidays,employees,pods]=await Promise.all([Leave.find({workspaceId,status:'approved',startDate:{$lt:new Date(Date.UTC(roster.year,roster.month,1))},endDate:{$gte:new Date(Date.UTC(roster.year,roster.month-1,1))}}).lean(),Holiday.find({workspaceId,date:{$gte:new Date(Date.UTC(roster.year,roster.month-1,1)),$lt:new Date(Date.UTC(roster.year,roster.month,1))}}).lean(),Employee.find({workspaceId,status:'Active'}).lean(),Pod.find({workspaceId,status:'active'}).lean()])
 const date=new Date(conflict.date),assigned=roster.assignments.map(item=>item.toObject())
 if(date.getUTCFullYear()!==roster.year||date.getUTCMonth()+1!==roster.month)throw new ApiError(409,'CONFLICT_DATE_MISMATCH','The conflict date does not match its roster month.')
 const day=date.getUTCDay(),shiftName=String(conflict.shift||'day').toLowerCase()
 if((process.workingDays?.length&&!process.workingDays.includes(day))||(brand.workingDays?.length&&!brand.workingDays.includes(day)))throw new ApiError(400,'NON_WORKING_DAY','The related process or brand does not operate on this date.')
 if(holidays.some(item=>dateKey(item.date)===dateKey(date)&&(!item.brandIds?.length||item.brandIds.some(id=>String(id)===String(brand._id)))&&(!item.processIds?.length||item.processIds.some(id=>String(id)===String(process._id)))))throw new ApiError(400,'HOLIDAY','The related brand or process is closed for this holiday.')
 const shiftRequirement=process.shiftRequirements?.find(item=>String(item.name||'day').toLowerCase()===shiftName),required=Number(conflict.requiredStaffing??shiftRequirement?.minimumStaffing??process.minimumStaffing??1)
 const assignedForShift=assigned.filter(item=>item.kind==='shift'&&item.status!=='cancelled'&&String(item.processId)===String(process._id)&&dateKey(item.date)===dateKey(date)&&String(item.shift||'day').toLowerCase()===shiftName).length
 if(assignedForShift>=required)throw new ApiError(409,'CONFLICT_ALREADY_COVERED','The staffing requirement is already filled; refresh the conflict list.')
 if(!isEligible(employee,process,date,{leaves,assigned}))throw new ApiError(400,'INELIGIBLE_ASSIGNMENT','The selected employee no longer satisfies availability, leave, weekly off, overlap, skill, and process eligibility constraints.')
 const assignment={employeeId:employee._id,brandId:brand._id,processId:process._id,date,shift:conflict.shift||'day',kind:'shift',status:'scheduled',source:'manual',notes:`Applied to resolve conflict ${conflict._id}`}
 roster.assignments.push(assignment);const created=roster.assignments[roster.assignments.length-1]
 const processes=await Process.find({workspaceId}).populate('brandId','name workingDays').lean()
 const coverage=calculateCoverage(roster.assignments,processes,roster.year,roster.month,holidays,employees,pods)
 const matching=coverage.byProcess.find(item=>String(item.processId)===String(process._id))
 const issueResolved=Boolean(matching&&matching.required>0&&matching.assigned>=matching.required)
 roster.coverage=coverage;roster.history.push({action:'assignment-updated',by:actorId,summary:`Assigned ${employee.name} to ${process.name} on ${dateKey(date)} while reviewing conflict ${conflict._id}.`,changeCount:1});await roster.save()
 conflict.resolution=resolution||`Assigned ${employee.name} to ${process.name} on ${dateKey(date)}.`;conflict.resolvedBy=actorId;conflict.resolvedAt=at;conflict.resolutionHistory.push({...history,action:'assignment-applied',assignmentId:created._id});if(issueResolved){conflict.status='resolved';conflict.resolutionHistory.push({...history,action:'resolved',summary:conflict.resolution})}else conflict.status='reviewed';await conflict.save()
 return {conflict,roster,coverage,issueResolved}
}
