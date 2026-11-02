import { Router } from 'express'
import { authentication, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { schemas } from '../validators/schemas.js'
import { ApiError, notFound } from '../services/ApiError.js'
import { ok } from '../controllers/resourceController.js'
import { validateReferences } from '../services/resourceService.js'
import Employee from '../models/Employee.js'
import Leave from '../models/Leave.js'

const manager=requireRole('Admin','Manager')
export function leavesRouter(authenticate=authentication()){
 const router=Router();router.use(authenticate)
 router.get('/',async(req,res)=>{const filter={workspaceId:req.user.workspaceId};if(req.user.role==='Employee'){if(!req.user.employeeId)throw new ApiError(403,'EMPLOYEE_PROFILE_REQUIRED','This account has no linked employee profile.');filter.employeeId=req.user.employeeId}if(req.query.status)filter.status=req.query.status;return ok(res,await Leave.find(filter).sort({startDate:1}).lean())})
 router.post('/',validate(schemas.leave),async(req,res)=>{const data=req.validated;if(req.user.role==='Employee'&&String(data.employeeId)!==req.user.employeeId)throw new ApiError(403,'FORBIDDEN','Employees may only submit leave for their linked profile.');await validateReferences(Leave,data,req.user.workspaceId);const result=await Leave.create({...data,status:'pending',workspaceId:req.user.workspaceId});return ok(res,result,201)})
 router.get('/:id',async(req,res)=>{const item=await Leave.findOne({_id:req.params.id,workspaceId:req.user.workspaceId}).lean();if(!item)throw notFound();if(req.user.role==='Employee'&&String(item.employeeId)!==req.user.employeeId)throw new ApiError(403,'FORBIDDEN','You may only view your own leave requests.');return ok(res,item)})
 router.delete('/:id',async(req,res)=>{const item=await Leave.findOne({_id:req.params.id,workspaceId:req.user.workspaceId});if(!item)throw notFound();if(req.user.role==='Employee'&&(String(item.employeeId)!==req.user.employeeId||item.status!=='pending'))throw new ApiError(403,'FORBIDDEN','Employees may only withdraw their own pending leave requests.');await item.deleteOne();return res.status(204).end()})
 router.post('/:id/approve',manager,validate(schemas.review),async(req,res)=>{const item=await Leave.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:'pending'},{$set:{status:'approved',reviewedBy:req.user.id,reviewedAt:new Date()}},{returnDocument:'after',runValidators:true});if(!item)throw notFound('Pending leave request not found.');return ok(res,item)})
 router.post('/:id/reject',manager,validate(schemas.review),async(req,res)=>{const item=await Leave.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:'pending'},{$set:{status:'rejected',reviewedBy:req.user.id,reviewedAt:new Date()}},{returnDocument:'after',runValidators:true});if(!item)throw notFound('Pending leave request not found.');return ok(res,item)})
 return router
}

export function availabilityRouter(authenticate=authentication()){
 const router=Router();router.use(authenticate)
 router.get('/',async(req,res)=>{const filter={workspaceId:req.user.workspaceId,status:'Active'};if(req.user.role==='Employee'){if(!req.user.employeeId)throw new ApiError(403,'EMPLOYEE_PROFILE_REQUIRED','This account has no linked employee profile.');filter._id=req.user.employeeId}else if(req.query.employeeId)filter._id=req.query.employeeId;const people=await Employee.find(filter).select('employeeCode name weeklyOff workingDays availability brandId processIds podId').lean();const dateFilter={workspaceId:req.user.workspaceId,status:'approved'};if(req.query.from||req.query.to){dateFilter.startDate={$lte:new Date(req.query.to||req.query.from)};dateFilter.endDate={$gte:new Date(req.query.from||req.query.to)}}const leaves=await Leave.find(dateFilter).select('employeeId startDate endDate leaveType').lean();return ok(res,{employees:people,approvedLeaves:leaves})})
 router.patch('/:employeeId',manager,validate(schemas.availability),async(req,res)=>{const item=await Employee.findOneAndUpdate({_id:req.params.employeeId,workspaceId:req.user.workspaceId},{$set:req.validated},{returnDocument:'after',runValidators:true});if(!item)throw notFound('Employee not found.');return ok(res,item)})
 return router
}
