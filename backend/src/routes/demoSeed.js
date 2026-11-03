import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { authentication, requireRole } from '../middleware/auth.js'
import { ApiError } from '../services/ApiError.js'
import Brand from '../models/Brand.js'
import Employee from '../models/Employee.js'
import Pod from '../models/Pod.js'
import Process from '../models/Process.js'
import Workspace from '../models/Workspace.js'
import { demoSeedCatalog } from '../services/demoSeedCatalog.js'
import { validate } from '../middleware/validate.js'
import { schemas } from '../validators/schemas.js'

const confirmPhrase='CREATE ROSTERFLOW DEMO DATA'
const previewTtlMs=10*60*1000
const pendingPreviews=new Map()
const clean=value=>String(value||'').trim().toLocaleLowerCase()
const idOf=value=>String(value?._id||value||'')
const sumCounts=groups=>Object.values(groups).reduce((sum,items)=>sum+items.length,0)

async function buildPlan(workspaceId){
 const [workspace,brands,processes,employees,pods]=await Promise.all([
  Workspace.findById(workspaceId).select('name slug').lean(),
  Brand.find({workspaceId}).lean(),Process.find({workspaceId}).lean(),Employee.find({workspaceId}).lean(),Pod.find({workspaceId}).lean(),
 ])
 if(!workspace)throw new ApiError(404,'WORKSPACE_NOT_FOUND','The authenticated workspace was not found.')
 const blockers=[]
 const brandRows=demoSeedCatalog.brands.map(spec=>{
  const byName=brands.find(item=>clean(item.name)===clean(spec.name))
  const byCode=brands.find(item=>clean(item.code)===clean(spec.code))
  if(byName&&byCode&&idOf(byName)!==idOf(byCode)){blockers.push(`Brand ${spec.name} matches different existing records by name and code.`);return {...spec,existing:null}}
  const existing=byName||byCode||null
  if(existing&&clean(existing.name)!==clean(spec.name)){blockers.push(`Brand code ${spec.code} is already used by ${existing.name}; it was left unchanged.`);return {...spec,existing:null}}
  return {...spec,existing}
 })
 const brandByKey=new Map(brandRows.map(item=>[item.key,item]))
 const processRows=demoSeedCatalog.processes.map(spec=>{
  const brand=brandByKey.get(spec.brandKey)
  if(!brand?.existing)return {...spec,brand,existing:null}
  const existing=processes.find(item=>idOf(item.brandId)===idOf(brand.existing)&&clean(item.name)===clean(spec.name))||null
  return {...spec,brand,existing}
 })
 const processByKey=new Map(processRows.map(item=>[item.key,item]))
 const employeeRows=demoSeedCatalog.employees.map(spec=>{
  const byCode=employees.find(item=>clean(item.employeeCode)===clean(spec.employeeCode))
  const byEmail=employees.find(item=>clean(item.email)===clean(spec.email))
  if(byCode&&byEmail&&idOf(byCode)!==idOf(byEmail)){blockers.push(`Employee ${spec.employeeCode} and ${spec.email} belong to different existing records.`);return {...spec,existing:null}}
  const existing=byCode||byEmail||null
  if(existing&&clean(existing.name)!==clean(spec.name)){blockers.push(`Seed identity ${spec.employeeCode} or ${spec.email} belongs to ${existing.name}; it was left unchanged.`);return {...spec,existing:null}}
  return {...spec,existing}
 })
 const podRows=demoSeedCatalog.pods.map(spec=>{
  const byName=pods.find(item=>clean(item.name)===clean(spec.name))
  const byCode=pods.find(item=>clean(item.code)===clean(spec.code))
  if(byName&&byCode&&idOf(byName)!==idOf(byCode)){blockers.push(`Pod ${spec.name} matches different existing records by name and code.`);return {...spec,existing:null}}
  const existing=byName||byCode||null
  if(existing&&(clean(existing.name)!==clean(spec.name)||clean(existing.code)!==clean(spec.code))){blockers.push(`Pod code or name ${spec.code} is already used by ${existing.name}; it was left unchanged.`);return {...spec,existing:null}}
  return {...spec,existing}
 })
 const create={
  brands:brandRows.filter(item=>!item.existing).map(({key,name,code,description,workingDays})=>({key,name,code,description,workingDays})),
  processes:processRows.filter(item=>!item.existing).map(({key,brandKey,name,minimumStaffing,requiredSkills,workingDays,crossTrainingEligibility})=>({key,brandKey,name,minimumStaffing,requiredSkills,workingDays,crossTrainingEligibility})),
  employees:employeeRows.filter(item=>!item.existing).map(({employeeCode,name,email,role,brandKey,processKeys,podKey,weeklyOff,skills,crossTrainingSkills,crossTrainedFor})=>({employeeCode,name,email,role,brandKey,processKeys,podKey,weeklyOff,availability:'available',status:'Active',skills,crossTrainingSkills,crossTrainedFor})),
  pods:podRows.filter(item=>!item.existing).map(({key,name,code,description,leaderCode,memberCodes,brandKeys,processKeys,capacity})=>({key,name,code,description,leaderCode,memberCodes,brandKeys,processKeys,capacity})),
 }
 const reused={
  brands:brandRows.filter(item=>item.existing).map(item=>({id:idOf(item.existing),name:item.name})),
  processes:processRows.filter(item=>item.existing).map(item=>({id:idOf(item.existing),name:item.name,brand:item.brand.name})),
  employees:employeeRows.filter(item=>item.existing).map(item=>({id:idOf(item.existing),employeeCode:item.employeeCode,name:item.name,email:item.email})),
  pods:podRows.filter(item=>item.existing).map(item=>({id:idOf(item.existing),name:item.name})),
 }
 const reusedIds={brands:new Map(brandRows.filter(item=>item.existing).map(item=>[item.key,idOf(item.existing)])),processes:new Map(processRows.filter(item=>item.existing).map(item=>[item.key,idOf(item.existing)])),employees:new Map(employeeRows.filter(item=>item.existing).map(item=>[item.employeeCode,idOf(item.existing)])),pods:new Map(podRows.filter(item=>item.existing).map(item=>[item.key,idOf(item.existing)]))}
 const digest=createHash('sha256').update(JSON.stringify({workspaceId:String(workspaceId),seedVersion:demoSeedCatalog.version,create,blockers,ids:{brands:[...reusedIds.brands],processes:[...reusedIds.processes],employees:[...reusedIds.employees],pods:[...reusedIds.pods]}})).digest('hex')
 const createdCounts=Object.fromEntries(Object.entries(create).map(([key,items])=>[key,items.length]))
 const reusedCounts=Object.fromEntries(Object.entries(reused).map(([key,items])=>[key,items.length]))
 return {workspace:{name:workspace.name,slug:workspace.slug},brandRows,processRows,employeeRows,podRows,create,reused,reusedIds,blockers,digest,createdCounts,reusedCounts,totalToCreate:sumCounts(create)}
}

function publicPreview(plan,confirmationToken){
 return {workspace:plan.workspace,seedVersion:demoSeedCatalog.version,create:plan.create,reuse:plan.reused,createdCounts:plan.createdCounts,reusedCounts:plan.reusedCounts,totalToCreate:plan.totalToCreate,blockers:plan.blockers,confirmationToken,confirmationPhrase:confirmPhrase,expiresInSeconds:previewTtlMs/1000}
}

async function executePlan(workspaceId,plan,actorId){
 const brandIds=new Map(plan.reusedIds.brands)
 for(const spec of plan.create.brands){const {key,...brandData}=spec;const created=await Brand.create({...brandData,workspaceId});brandIds.set(key,String(created._id))}
 const processIds=new Map(plan.reusedIds.processes)
 for(const spec of plan.create.processes){const created=await Process.create({workspaceId,name:spec.name,brandId:brandIds.get(spec.brandKey),minimumStaffing:spec.minimumStaffing,requiredSkills:spec.requiredSkills,workingDays:spec.workingDays,crossTrainingEligibility:spec.crossTrainingEligibility});processIds.set(spec.key,String(created._id))}
 const employeeIds=new Map(plan.reusedIds.employees),newEmployeeIds=[]
 for(const spec of plan.create.employees){const processIdsForEmployee=spec.processKeys.map(key=>processIds.get(key));if(processIdsForEmployee.some(value=>!value))throw new ApiError(409,'SEED_REFERENCE_CHANGED','A required process reference was not available; run a new preview.');const created=await Employee.create({workspaceId,employeeCode:spec.employeeCode,name:spec.name,email:spec.email,role:spec.role,designation:spec.role,status:spec.status,brandId:brandIds.get(spec.brandKey),processIds:processIdsForEmployee,weeklyOff:spec.weeklyOff,workingDays:[0,1,2,3,4,5,6].filter(day=>day!==spec.weeklyOff),shiftPreference:'any',availability:spec.availability,skills:spec.skills,crossTrainingSkills:spec.crossTrainingSkills,crossTrainedFor:spec.crossTrainedFor,avatarSeed:spec.employeeCode});employeeIds.set(spec.employeeCode,String(created._id));newEmployeeIds.push({id:String(created._id),podKey:spec.podKey})}
 const podIds=new Map(plan.reusedIds.pods)
 for(const spec of plan.create.pods){const memberIds=spec.memberCodes.map(code=>employeeIds.get(code));const leaderId=employeeIds.get(spec.leaderCode);const brandIdsForPod=spec.brandKeys.map(key=>brandIds.get(key));const processIdsForPod=spec.processKeys.map(key=>processIds.get(key));if(!leaderId||memberIds.some(value=>!value)||brandIdsForPod.some(value=>!value)||processIdsForPod.some(value=>!value))throw new ApiError(409,'SEED_REFERENCE_CHANGED','A required pod reference was not available; run a new preview.');const created=await Pod.create({workspaceId,name:spec.name,code:spec.code,description:spec.description,leaderId,memberIds,brandIds:brandIdsForPod,processIds:processIdsForPod,capacity:spec.capacity,status:'active'});podIds.set(spec.key,String(created._id))}
 for(const item of newEmployeeIds){const podId=podIds.get(item.podKey);if(podId)await Employee.updateOne({_id:item.id,workspaceId},{$set:{podId}})}
 return {workspaceId,createdBy:actorId,created:{brands:plan.createdCounts.brands,processes:plan.createdCounts.processes,employees:plan.createdCounts.employees,pods:plan.createdCounts.pods},reused:plan.reusedCounts,seedVersion:demoSeedCatalog.version,modifiedExistingRecords:0}
}

export function demoSeedRouter(authenticate=authentication()){
 const router=Router();router.use(authenticate);router.use(requireRole('Admin'))
 router.get('/demo/preview',async(req,res)=>{
  const plan=await buildPlan(req.user.workspaceId)
  for(const [token,pending] of pendingPreviews)if(pending.expiresAt<Date.now())pendingPreviews.delete(token)
  const confirmationToken=randomUUID()
  pendingPreviews.set(confirmationToken,{uid:req.auth.uid,workspaceId:req.user.workspaceId,digest:plan.digest,expiresAt:Date.now()+previewTtlMs})
  return res.json({success:true,data:publicPreview(plan,confirmationToken)})
 })
 router.post('/demo/execute',validate(schemas.demoSeedExecute),async(req,res)=>{
  const {confirmationToken,confirmationPhrase:phrase}=req.validated
  if(phrase!==confirmPhrase)throw new ApiError(400,'SEED_CONFIRMATION_REQUIRED',`Preview the seed and confirm by sending the exact phrase: ${confirmPhrase}.`)
  const pending=pendingPreviews.get(confirmationToken)
  if(!pending||pending.expiresAt<Date.now()||pending.uid!==req.auth.uid||pending.workspaceId!==req.user.workspaceId)throw new ApiError(409,'SEED_PREVIEW_EXPIRED','The seed preview is missing, expired, or belongs to another workspace. Preview again.')
  const plan=await buildPlan(req.user.workspaceId)
  if(plan.digest!==pending.digest)throw new ApiError(409,'SEED_PREVIEW_STALE','Workspace records changed after preview. Review a fresh preview before seeding.')
  if(plan.blockers.length)throw new ApiError(409,'SEED_BLOCKED','Resolve the preview identity conflicts before seeding.',plan.blockers)
  pendingPreviews.delete(confirmationToken)
  try{return res.status(plan.totalToCreate?201:200).json({success:true,data:await executePlan(req.user.workspaceId,plan,req.user.id)})}
  catch(error){if(error?.code===11000)throw new ApiError(409,'SEED_DUPLICATE_RACE','A matching record was created during this seed. Preview again; existing records will be reused.');throw error}
 })
 return router
}
