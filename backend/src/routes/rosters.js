import { Router } from 'express'
import mongoose from 'mongoose'
import Roster from '../models/Roster.js'
import Employee from '../models/Employee.js'
import Process from '../models/Process.js'
import Leave from '../models/Leave.js'
import Holiday from '../models/Holiday.js'
import Brand from '../models/Brand.js'
import Pod from '../models/Pod.js'
import Conflict from '../models/Conflict.js'
import { requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { schemas } from '../validators/schemas.js'
import { ApiError, notFound } from '../services/ApiError.js'
import { generateAssignments } from '../services/roster/generator.js'
import { calculateCoverage } from '../services/roster/coverageCalculator.js'
import { validateAssignments } from '../services/roster/validator.js'
import { isEligible, dateKey } from '../services/roster/eligibility.js'

const manager=requireRole('Admin','Manager')
const endOfMonth=(year,month)=>new Date(Date.UTC(year,month,1))
const success=(res,data,status=200)=>res.status(status).json({success:true,data})
function plain(doc){return doc?.toJSON?doc.toJSON():doc}
function serialize(value){if(value==null||typeof value!=='object')return value;if(value instanceof Date)return value;if(value._bsontype==='ObjectId')return String(value);if(Array.isArray(value))return value.map(serialize);const result=Object.fromEntries(Object.entries(value).map(([key,child])=>[key,serialize(child)]));if(result._id!=null){result.id=String(result._id);delete result._id}return result}
async function loadInputs(workspaceId,year,month){
 const [employees,processes,leaves,holidays,brands,pods]=await Promise.all([
  Employee.find({workspaceId,status:'Active'}).lean(),Process.find({workspaceId}).lean(),
  Leave.find({workspaceId,status:'approved',startDate:{$lt:endOfMonth(year,month)},endDate:{$gte:new Date(Date.UTC(year,month-1,1))}}).lean(),
  Holiday.find({workspaceId,date:{$gte:new Date(Date.UTC(year,month-1,1)),$lt:endOfMonth(year,month)}}).lean(),Brand.find({workspaceId,status:'active'}).lean(),Pod.find({workspaceId,status:'active'}).lean(),
 ])
 const brandMap=new Map(brands.map(item=>[String(item._id),item]))
 return {employees,processes:processes.filter(item=>brandMap.has(String(item.brandId))).map(item=>({...item,brandId:brandMap.get(String(item.brandId))})),leaves,holidays,pods}
}
function validationFor(assignments,inputs,year,month){return validateAssignments(assignments,{...inputs,year,month})}

export function rostersRouter(authenticate){
 const router=Router();router.use(authenticate)
 router.get('/',async(req,res)=>{
  const filter={workspaceId:req.user.workspaceId}
  if(req.user.role==='Employee'){if(!req.user.employeeId)throw new ApiError(403,'EMPLOYEE_PROFILE_REQUIRED','This account has no linked employee profile.');filter['assignments.employeeId']=req.user.employeeId}
  const docs=await Roster.find(filter).sort({year:-1,month:-1}).lean();return success(res,docs)
 })
 router.post('/generate',manager,validate(schemas.rosterGenerate),async(req,res)=>{
  const {year,month,regenerate,preview}=req.validated;const workspaceId=req.user.workspaceId
  const existing=await Roster.findOne({workspaceId,year,month})
  if(existing?.locked)throw new ApiError(409,'ROSTER_LOCKED','This roster is locked. Unlock it before regenerating.')
  if(existing&&!regenerate&&!preview)throw new ApiError(409,'ROSTER_EXISTS','A roster already exists for this month. Set regenerate=true to explicitly replace unlocked generated assignments.')
  const inputs=await loadInputs(workspaceId,year,month)
  const preserved=existing?(existing.assignments||[]).filter(item=>item.locked||item.source==='manual').map(plain):[]
  const generated=generateAssignments({year,month,...inputs,preserved})
  const validation=validationFor(generated.assignments,inputs,year,month)
  const coverage=calculateCoverage(generated.assignments,inputs.processes,year,month,inputs.holidays,inputs.employees,inputs.pods)
  const previous=existing?.assignments||[]
  const oldKeys=new Set(previous.map(item=>`${item.employeeId}:${dateKey(item.date)}:${item.processId}:${item.shift||''}:${item.kind}`))
  const nextKeys=new Set(generated.assignments.map(item=>`${item.employeeId}:${dateKey(item.date)}:${item.processId}:${item.shift||''}:${item.kind}`))
  const changeSummary={added:[...nextKeys].filter(key=>!oldKeys.has(key)).length,removed:[...oldKeys].filter(key=>!nextKeys.has(key)).length,preserved:preserved.length,conflicts:generated.conflicts.length}
  if(preview)return success(res,{year,month,assignments:generated.assignments,conflicts:generated.conflicts,coverage,validation,changeSummary})
  const action=existing?'regenerated':'generated'
  const operations=async session=>{
   let roster
   if(existing){existing.assignments=generated.assignments;existing.coverage=coverage;existing.generation=(existing.generation||0)+1;existing.history.push({action,by:req.user.id,summary:`${changeSummary.added} added, ${changeSummary.removed} removed, ${changeSummary.preserved} preserved.`,changeCount:changeSummary.added+changeSummary.removed});roster=await existing.save(session?{session}:undefined)}
   else roster=await Roster.create([{workspaceId,year,month,name:`${new Date(Date.UTC(year,month-1,1)).toLocaleString('en',{month:'long',timeZone:'UTC'})} ${year}`,assignments:generated.assignments,coverage,status:'draft',createdBy:req.user.id,generation:1,history:[{action:'generated',by:req.user.id,summary:`Generated with ${generated.conflicts.length} uncovered staffing requirements.`,changeCount:generated.assignments.length}]}],session?{session}:undefined).then(docs=>docs[0])
   await Conflict.deleteMany({workspaceId,rosterId:roster._id,source:'roster-engine'},session?{session}:undefined)
   if(generated.conflicts.length)await Conflict.insertMany(generated.conflicts.map(item=>({...item,workspaceId,rosterId:roster._id})),session?{session}:undefined)
   return roster
  }
  let roster
  try{const session=await mongoose.startSession();try{await session.withTransaction(async()=>{roster=await operations(session)})}finally{await session.endSession()}}
  catch(error){if(error?.code===11000)throw new ApiError(409,'ROSTER_EXISTS','A roster already exists for this month.');if(/Transaction numbers are only allowed|replica set|mongos/i.test(error?.message||''))roster=await operations();else throw error}
  return success(res,{roster,conflicts:generated.conflicts,validation,changeSummary},existing?200:201)
 })
 router.post('/validate',manager,validate(schemas.rosterValidate),async(req,res)=>{const inputs=await loadInputs(req.user.workspaceId,req.validated.year,req.validated.month);return success(res,validationFor(req.validated.assignments,inputs,req.validated.year,req.validated.month))})
 router.get('/coverage',async(req,res)=>{const parsed=schemas.rosterMonth.safeParse({year:req.query.year,month:req.query.month});if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','A valid year and month are required.');const {year,month}=parsed.data;const roster=await Roster.findOne({workspaceId:req.user.workspaceId,year,month}).lean();const inputs=await loadInputs(req.user.workspaceId,year,month);return success(res,{year,month,...calculateCoverage(roster?.assignments||[],inputs.processes,year,month,inputs.holidays,inputs.employees,inputs.pods),conflicts:await Conflict.countDocuments({workspaceId:req.user.workspaceId,rosterId:roster?._id,status:'open'})})})
 router.get('/month/:year/:month',async(req,res)=>{const parsed=schemas.rosterMonth.safeParse(req.params);if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','A valid year and month are required.');const roster=await Roster.findOne({workspaceId:req.user.workspaceId,...parsed.data}).lean();if(!roster)return success(res,null);if(req.user.role==='Employee'&&!(roster.assignments||[]).some(item=>String(item.employeeId)===req.user.employeeId))throw new ApiError(403,'FORBIDDEN','You may only view rosters containing your assignments.');return success(res,serialize(roster))})
 router.post('/:id/assignments',manager,validate(schemas.rosterAssignment),async(req,res)=>{const roster=await Roster.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!roster)throw notFound();if(roster.locked)throw new ApiError(409,'ROSTER_LOCKED','Unlock the roster before editing assignments.');const [employee,brand,process]=await Promise.all([Employee.findOne({_id:req.validated.employeeId,workspaceId:req.user.workspaceId}).lean(),Brand.findOne({_id:req.validated.brandId,workspaceId:req.user.workspaceId}).lean(),Process.findOne({_id:req.validated.processId,workspaceId:req.user.workspaceId}).lean()]);if(!employee||!brand||!process||String(process.brandId)!==String(brand._id))throw new ApiError(400,'INVALID_REFERENCE','Employee, brand, and process must exist in this workspace and match.');const inputs=await loadInputs(req.user.workspaceId,roster.year,roster.month);const date=new Date(req.validated.date);if(req.validated.kind==='shift'&&!isEligible(employee,process,date,{leaves:inputs.leaves,assigned:roster.assignments.map(plain)}))throw new ApiError(400,'INELIGIBLE_ASSIGNMENT','Employee is unavailable, on leave/off, already assigned that day, or ineligible for this process.');const assignment={...req.validated,source:'manual'};roster.assignments.push(assignment);const validation=validationFor(roster.assignments,inputs,roster.year,roster.month);if(!validation.valid)throw new ApiError(400,'ROSTER_CONFLICT','Assignment fails roster validation.',validation.errors);roster.coverage=calculateCoverage(roster.assignments,inputs.processes,roster.year,roster.month,inputs.holidays);roster.history.push({action:'assignment-updated',by:req.user.id,summary:'Manual assignment added.',changeCount:1});await roster.save();return success(res,roster)})
 router.patch('/:id/assignments/:assignmentId',manager,validate(schemas.rosterAssignment.partial()),async(req,res)=>{
  const roster=await Roster.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!roster)throw notFound()
  if(roster.locked)throw new ApiError(409,'ROSTER_LOCKED','Unlock the roster before editing assignments.')
  const assignment=roster.assignments.id(req.params.assignmentId);if(!assignment)throw notFound('Assignment not found.')
  const update={...req.validated};const lockValue=update.locked;delete update.locked
  if(Object.keys(update).some(key=>!['source','notes'].includes(key))){
   const next={...plain(assignment),...update};const [employee,brand,process]=await Promise.all([Employee.findOne({_id:next.employeeId,workspaceId:req.user.workspaceId}).lean(),Brand.findOne({_id:next.brandId,workspaceId:req.user.workspaceId}).lean(),Process.findOne({_id:next.processId,workspaceId:req.user.workspaceId}).lean()])
   if(!employee||!brand||!process||String(process.brandId)!==String(brand._id))throw new ApiError(400,'INVALID_REFERENCE','Employee, brand, and process must exist in this workspace and match.')
   const inputs=await loadInputs(req.user.workspaceId,roster.year,roster.month);const other=roster.assignments.filter(item=>String(item._id)!==String(assignment._id)).map(plain)
   if(next.kind==='shift'&&!isEligible(employee,process,new Date(next.date),{leaves:inputs.leaves,assigned:other}))throw new ApiError(400,'INELIGIBLE_ASSIGNMENT','Employee is unavailable, on leave/off, already assigned that day, or ineligible for this process.')
  }
  Object.assign(assignment,update,{source:'manual'});if(typeof lockValue==='boolean')assignment.locked=lockValue;roster.history.push({action:'assignment-updated',by:req.user.id,summary:typeof lockValue==='boolean'?'Assignment edited or lock changed.':'Assignment edited.',changeCount:1})
  const inputs=await loadInputs(req.user.workspaceId,roster.year,roster.month);roster.coverage=calculateCoverage(roster.assignments,inputs.processes,roster.year,roster.month,inputs.holidays);await roster.save();return success(res,roster)
 })
 router.delete('/:id/assignments/:assignmentId',manager,async(req,res)=>{const roster=await Roster.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!roster)throw notFound();if(roster.locked)throw new ApiError(409,'ROSTER_LOCKED','Unlock the roster before editing assignments.');if(!roster.assignments.id(req.params.assignmentId))throw notFound('Assignment not found.');roster.assignments.pull(req.params.assignmentId);roster.history.push({action:'assignment-updated',by:req.user.id,summary:'Assignment removed.',changeCount:1});const inputs=await loadInputs(req.user.workspaceId,roster.year,roster.month);roster.coverage=calculateCoverage(roster.assignments,inputs.processes,roster.year,roster.month,inputs.holidays);await roster.save();return success(res,roster)})
 router.post('/:id/lock',manager,validate(schemas.rosterLock),async(req,res)=>{const roster=await Roster.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!roster)throw notFound();roster.locked=req.validated.locked;roster.lockedAt=roster.locked?new Date():null;roster.lockedBy=roster.locked?req.user.id:null;roster.history.push({action:roster.locked?'locked':'unlocked',by:req.user.id,summary:roster.locked?'Roster locked.':'Roster unlocked.',changeCount:0});await roster.save();return success(res,roster)})
 router.post('/:id/publish',manager,async(req,res)=>{const roster=await Roster.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!roster)throw notFound();roster.status='published';roster.history.push({action:'published',by:req.user.id,summary:'Roster published.',changeCount:0});await roster.save();return success(res,roster)})
 return router
}
