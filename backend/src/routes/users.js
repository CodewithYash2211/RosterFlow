import { Router } from 'express'
import User from '../models/User.js'
import Workspace from '../models/Workspace.js'
import { verifyFirebaseToken, getFirebaseUserByUid } from '../services/firebaseAdmin.js'
import { authentication, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { schemas } from '../validators/schemas.js'
import { ApiError, notFound } from '../services/ApiError.js'
import { ok } from '../controllers/resourceController.js'

export function usersRouter({ authenticate = authentication(), verifyUser = getFirebaseUserByUid } = {}) {
 const router=Router();router.use(authenticate)
 router.get('/me',async(req,res)=>{const user=await User.findOne({firebaseUid:req.auth.uid,workspaceId:req.user.workspaceId}).populate('workspaceId','name slug').lean();if(!user)throw notFound('User profile not found.');return ok(res,user)})
 router.patch('/me',validate(schemas.profile),async(req,res)=>{const user=await User.findOneAndUpdate({firebaseUid:req.auth.uid,workspaceId:req.user.workspaceId},{$set:req.validated},{returnDocument:'after',runValidators:true}).populate('workspaceId','name slug').lean();if(!user)throw notFound('User profile not found.');return ok(res,user)})
 router.get('/',requireRole('Admin'),async(req,res)=>ok(res,await User.find({workspaceId:req.user.workspaceId}).select('-__v').lean()))
 router.post('/',requireRole('Admin'),validate(schemas.user),async(req,res)=>{const firebaseUser=await verifyUser(req.validated.firebaseUid);const data={firebaseUid:firebaseUser.uid,email:firebaseUser.email,displayName:firebaseUser.displayName||req.validated.displayName,role:req.validated.role,employeeId:req.validated.employeeId||null,workspaceId:req.user.workspaceId};if(!data.email)throw new ApiError(400,'FIREBASE_USER_EMAIL_REQUIRED','The Firebase account must have an email address.');const created=await User.create(data);return ok(res,created,201)})
 router.patch('/:id/role',requireRole('Admin'),validate(schemas.user.pick({role:true})),async(req,res)=>{const user=await User.findOneAndUpdate({_id:req.params.id,workspaceId:req.user.workspaceId},{$set:{role:req.validated.role}},{returnDocument:'after',runValidators:true}).lean();if(!user)throw notFound('User not found.');return ok(res,user)})
 router.delete('/:id',requireRole('Admin'),async(req,res)=>{const user=await User.findOneAndDelete({_id:req.params.id,workspaceId:req.user.workspaceId});if(!user)throw notFound('User not found.');return res.status(204).end()})
 return router
}
