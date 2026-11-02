import { Router } from 'express'
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
 router.use('/rosters',resourceRouter({Model:Roster,schema:schemas.roster,authenticate}))
 const conflicts=resourceRouter({Model:Conflict,schema:schemas.conflict,authenticate})
 conflicts.post('/:id/resolve',manager,validate(schemas.review),async(req,res)=>{const conflict=await Conflict.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:'open'},{$set:{status:'resolved',resolution:req.validated.resolution,resolvedBy:req.user.id,resolvedAt:new Date()}},{returnDocument:'after',runValidators:true});if(!conflict)throw notFound('Open conflict not found.');return ok(res,conflict)})
 conflicts.post('/:id/dismiss',manager,validate(schemas.review),async(req,res)=>{const conflict=await Conflict.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId,status:'open'},{$set:{status:'dismissed',resolution:req.validated.resolution,resolvedBy:req.user.id,resolvedAt:new Date()}},{returnDocument:'after',runValidators:true});if(!conflict)throw notFound('Open conflict not found.');return ok(res,conflict)})
 router.use('/conflicts',conflicts)
 return router
}
