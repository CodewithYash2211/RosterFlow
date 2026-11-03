import { Router } from 'express'
import mongoose from 'mongoose'
import { authentication, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { ApiError, notFound } from '../services/ApiError.js'
import { ok, resourceRouter } from '../controllers/resourceController.js'
import Employee from '../models/Employee.js'
import Brand from '../models/Brand.js'
import Process from '../models/Process.js'
import Pod from '../models/Pod.js'
import Roster from '../models/Roster.js'
import Conflict from '../models/Conflict.js'
import Holiday from '../models/Holiday.js'
import { schemas } from '../validators/schemas.js'
import { leavesRouter, availabilityRouter } from './leaves.js'
import { usersRouter } from './users.js'
import { isDatabaseConnected } from '../database.js'
import { rostersRouter } from './rosters.js'
import { demoSeedRouter } from './demoSeed.js'
import { resolveConflictAction } from '../services/conflictResolution.js'
import { getConflictBackupRecommendations } from '../services/conflictRecommendations.js'

const manager=requireRole('Admin','Manager')
export function apiRouter({ verifyToken, userModel, workspaceModel, verifyUser } = {}) {
 const router=Router()
 const authenticate=authentication({verifyToken,userModel,workspaceModel})
 router.get('/health',(_req,res)=>{const connected=isDatabaseConnected();return res.status(connected?200:503).json({success:connected,data:{status:connected?'ok':'degraded',express:'connected',mongodb:connected?'connected':'disconnected',database:'rosterflow'}})})
 router.use('/users',usersRouter({authenticate,verifyUser}))
 router.use('/employees',resourceRouter({Model:Employee,schema:schemas.employee,authenticate}))
 router.use('/brands',resourceRouter({Model:Brand,schema:schemas.brand,authenticate}))
 router.use('/processes',resourceRouter({Model:Process,schema:schemas.process,authenticate}))
 router.use('/pods',resourceRouter({Model:Pod,schema:schemas.pod,authenticate}))
 router.use('/leaves',leavesRouter(authenticate))
 router.use('/holidays',resourceRouter({Model:Holiday,schema:schemas.holiday,authenticate}))
 router.use('/availability',availabilityRouter(authenticate))
 router.use('/rosters',rostersRouter(authenticate))
 router.use('/admin/seed',demoSeedRouter(authenticate))
 const conflicts=resourceRouter({Model:Conflict,schema:schemas.conflict,authenticate})
 conflicts.get('/:id/recommendations',manager,async(req,res)=>ok(res,await getConflictBackupRecommendations({conflictId:req.params.id,workspaceId:req.user.workspaceId})))
 conflicts.post('/:id/action',manager,validate(schemas.conflictAction),async(req,res)=>ok(res,await resolveConflictAction({conflictId:req.params.id,workspaceId:req.user.workspaceId,actorId:req.user.id,action:req.validated.action,employeeId:req.validated.employeeId,resolution:req.validated.resolution})))
 conflicts.get('/roster/:rosterId',manager,async(req,res)=>{const roster=await Roster.findOne({_id:req.params.rosterId,workspaceId:req.user.workspaceId});if(!roster)throw notFound('Roster not found.');const items=await Conflict.find({workspaceId:req.user.workspaceId,rosterId:roster._id}).sort({date:1,severity:-1}).lean();return ok(res,items)})
 conflicts.post('/:id/resolve',manager,validate(schemas.review),async(req,res)=>{const conflict=await Conflict.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:{$in:['open','reviewed']}},{$set:{status:'reviewed',resolution:req.validated.resolution,resolvedBy:req.user.id,resolvedAt:new Date()},$push:{resolutionHistory:{action:'reviewed',by:req.user.id,summary:req.validated.resolution}}},{returnDocument:'after',runValidators:true});if(!conflict)throw notFound('Open conflict not found.');return ok(res,conflict)})
 conflicts.post('/:id/dismiss',manager,validate(schemas.review),async(req,res)=>{const conflict=await Conflict.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:{$in:['open','reviewed']}},{$set:{status:'dismissed',resolution:req.validated.resolution,resolvedBy:req.user.id,resolvedAt:new Date()},$push:{resolutionHistory:{action:'dismissed',by:req.user.id,summary:req.validated.resolution}}},{returnDocument:'after',runValidators:true});if(!conflict)throw notFound('Open conflict not found.');return ok(res,conflict)})
 router.get('/conflicts/summary',authenticate,async(req,res)=>{
  const filter={workspaceId:new mongoose.Types.ObjectId(req.user.workspaceId)}
  if(req.query.year&&req.query.month){
   const parsed=schemas.rosterMonth.safeParse({year:req.query.year,month:req.query.month})
   if(!parsed.success)throw new ApiError(400,'VALIDATION_ERROR','A valid year and month are required.')
   filter.date={$gte:new Date(Date.UTC(parsed.data.year,parsed.data.month-1,1)),$lt:new Date(Date.UTC(parsed.data.year,parsed.data.month,1))}
  }
  const counts=await Conflict.aggregate([{$match:filter},{$group:{_id:{status:'$status',severity:'$severity',kind:'$kind'},count:{$sum:1}}}])
  const summary={total:counts.reduce((sum,item)=>sum+item.count,0),byStatus:{open:0,reviewed:0,resolved:0,dismissed:0},bySeverity:{Low:0,Medium:0,High:0},byKind:{}}
  for(const item of counts){summary.byStatus[item._id.status]=(summary.byStatus[item._id.status]||0)+item.count;summary.bySeverity[item._id.severity]=(summary.bySeverity[item._id.severity]||0)+item.count;summary.byKind[item._id.kind]=(summary.byKind[item._id.kind]||0)+item.count}
  return ok(res,summary)
 })
 router.use('/conflicts',conflicts)
 return router
}
