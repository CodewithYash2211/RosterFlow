import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import dns from 'node:dns'
import dotenv from 'dotenv'
import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../src/app.js'
import Workspace from '../src/models/Workspace.js'
import User from '../src/models/User.js'
import Employee from '../src/models/Employee.js'
import Brand from '../src/models/Brand.js'
import Process from '../src/models/Process.js'
import Pod from '../src/models/Pod.js'
import Leave from '../src/models/Leave.js'
import Holiday from '../src/models/Holiday.js'
import Roster from '../src/models/Roster.js'
import Conflict from '../src/models/Conflict.js'

dotenv.config({path:'../.env',quiet:true})
if(process.env.MONGODB_DNS_SERVERS)dns.setServers(process.env.MONGODB_DNS_SERVERS.split(',').map(value=>value.trim()))
else if(dns.getServers().every(value=>['127.0.0.1','::1'].includes(value)))dns.setServers(['8.8.8.8'])
const databaseName=`rosterflow_test_${process.pid}_${Date.now()}`
let workspaceId, brandId, processId, employeeId, podId, leaveId, secondLeaveId, holidayId, rosterId, conflictId
const tokenUsers={admin:{uid:'test-admin-uid',email:'admin@test.invalid'},manager:{uid:'test-manager-uid',email:'manager@test.invalid'},employee:{uid:'test-employee-uid',email:'employee@test.invalid'},other:{uid:'test-other-uid',email:'other@test.invalid'}}
const app=createApp({verifyToken:async token=>{if(!tokenUsers[token])throw Object.assign(new Error('invalid'),{code:'auth/id-token-expired'});return tokenUsers[token]},verifyUser:async uid=>({uid,email:`${uid}@test.invalid`,displayName:'Provisioned test account'})})
const auth=(token='admin')=>({Authorization:`Bearer ${token}`})
const api=(token='admin')=>request(app).get('/api').set(auth(token))

before(async()=>{
 assert.ok(process.env.MONGODB_URI,'MONGODB_URI must be configured to run isolated backend integration tests')
 await mongoose.connect(process.env.MONGODB_URI,{dbName:databaseName,serverSelectionTimeoutMS:15000})
 assert.equal(mongoose.connection.name,databaseName,'tests must never connect to the production rosterflow database')
 const workspace=await Workspace.create({name:'Isolated backend tests',slug:databaseName})
 workspaceId=workspace._id
 await User.create({firebaseUid:tokenUsers.admin.uid,email:tokenUsers.admin.email,displayName:'Admin',role:'Admin',workspaceId})
 await User.create({firebaseUid:tokenUsers.manager.uid,email:tokenUsers.manager.email,displayName:'Manager',role:'Manager',workspaceId})
 await User.create({firebaseUid:tokenUsers.employee.uid,email:tokenUsers.employee.email,displayName:'Employee',role:'Employee',workspaceId})
 await User.create({firebaseUid:tokenUsers.other.uid,email:tokenUsers.other.email,displayName:'Other workspace',role:'Admin',workspaceId:new mongoose.Types.ObjectId()})
})
after(async()=>{if(mongoose.connection.readyState===1){await mongoose.connection.dropDatabase();await mongoose.disconnect()}})

test('health reports Express and isolated MongoDB database online',async()=>{
 const response=await request(app).get('/api/health')
 assert.equal(response.status,200);assert.equal(response.body.data.mongodb,'connected');assert.equal(response.body.data.database,'rosterflow')
})
test('Firebase bearer token is required and invalid token is rejected',async()=>{
 assert.equal((await request(app).get('/api/employees')).status,401)
 const invalid=await request(app).get('/api/employees').set('Authorization','Bearer invalid')
 assert.equal(invalid.status,401);assert.equal(invalid.body.error.code,'INVALID_TOKEN')
})
test('brand CRUD, duplicate handling, workspace isolation, and malformed IDs',async()=>{
 const created=await request(app).post('/api/brands').set(auth()).send({name:'Test brand',code:'TST',workingDays:[1,2,3]})
 assert.equal(created.status,201);brandId=created.body.data.id
 assert.equal((await request(app).get('/api/brands').set(auth('manager'))).body.data.length,1)
 assert.equal((await request(app).get('/api/brands').set(auth('other'))).body.data.length,0)
 const duplicate=await request(app).post('/api/brands').set(auth()).send({name:'Test brand',code:'TST'})
 assert.equal(duplicate.status,409)
 const updated=await request(app).patch(`/api/brands/${brandId}`).set(auth('manager')).send({description:'Updated brand'})
 assert.equal(updated.status,200);assert.equal(updated.body.data.description,'Updated brand')
 assert.equal((await request(app).get('/api/brands/not-an-object-id').set(auth())).status,404)
})
test('process CRUD validates required brand references',async()=>{
 const missing=await request(app).post('/api/processes').set(auth()).send({name:'Broken process',brandId:'ffffffffffffffffffffffff'})
 assert.equal(missing.status,400)
 const created=await request(app).post('/api/processes').set(auth()).send({name:'Support',brandId,minimumStaffing:2,requiredSkills:['support']})
 assert.equal(created.status,201);processId=created.body.data.id
 assert.equal((await request(app).delete(`/api/brands/${brandId}`).set(auth())).status,400,'brand deletion is blocked while processes depend on it')
 assert.equal((await request(app).get(`/api/processes/${processId}`).set(auth())).status,200)
 assert.equal((await request(app).patch(`/api/processes/${processId}`).set(auth('employee')).send({minimumStaffing:3})).status,403)
 assert.equal((await request(app).patch(`/api/processes/${processId}`).set(auth('manager')).send({minimumStaffing:3})).body.data.minimumStaffing,3)
})
test('employee CRUD validates references and restricts employee visibility',async()=>{
 const invalid=await request(app).post('/api/employees').set(auth()).send({employeeCode:'RF-X',name:'Invalid',email:'invalid@test.invalid',brandId:'ffffffffffffffffffffffff',processIds:[processId],weeklyOff:0})
 assert.equal(invalid.status,400)
 const created=await request(app).post('/api/employees').set(auth()).send({employeeCode:'RF-TEST-1',name:'Test Employee',email:'worker@test.invalid',brandId,processIds:[processId],weeklyOff:0,status:'Active',skills:['support'],crossTrainedFor:['Support']})
 assert.equal(created.status,201);employeeId=created.body.data.id
 await User.updateOne({firebaseUid:tokenUsers.employee.uid},{$set:{employeeId}})
 assert.equal((await request(app).get('/api/employees').set(auth('employee'))).body.data.length,1)
 const denied=await request(app).post('/api/employees').set(auth('employee')).send({})
 assert.equal(denied.status,403)
 const updated=await request(app).patch(`/api/employees/${employeeId}`).set(auth('manager')).send({weeklyOff:2,availability:'limited'})
 assert.equal(updated.status,200);assert.equal(updated.body.data.weeklyOff,2)
 assert.equal((await request(app).get('/api/employees/OTHER-CODE').set(auth('employee'))).status,404)
})
test('pod CRUD enforces active in-workspace leader and employee reference',async()=>{
 const invalid=await request(app).post('/api/pods').set(auth()).send({name:'Bad pod',leaderId:'ffffffffffffffffffffffff',memberIds:[],brandIds:[],processIds:[]})
 assert.equal(invalid.status,400)
 const created=await request(app).post('/api/pods').set(auth()).send({name:'Test pod',code:'P-TEST',leaderId:employeeId,memberIds:[employeeId],brandIds:[brandId],processIds:[processId],capacity:4})
 assert.equal(created.status,201);podId=created.body.data.id
 await Employee.updateOne({_id:employeeId},{$set:{podId}})
 assert.equal((await request(app).patch(`/api/pods/${podId}`).set(auth('manager')).send({capacity:5})).body.data.capacity,5)
 assert.equal((await request(app).delete(`/api/pods/${podId}`).set(auth())).status,400)
})
test('availability is workspace-scoped and weekly off writes require management role',async()=>{
 const own=await request(app).get('/api/availability').set(auth('employee'))
 assert.equal(own.status,200);assert.equal(own.body.data.employees.length,1)
 assert.equal((await request(app).patch(`/api/availability/${employeeId}`).set(auth('employee')).send({weeklyOff:4})).status,403)
 const updated=await request(app).patch(`/api/availability/${employeeId}`).set(auth('manager')).send({weeklyOff:4})
 assert.equal(updated.status,200);assert.equal(updated.body.data.weeklyOff,4)
})
test('leave requests support own submission and manager approve/reject decisions',async()=>{
 const denied=await request(app).post('/api/leaves').set(auth('employee')).send({employeeId:new mongoose.Types.ObjectId().toString(),startDate:'2026-12-01',endDate:'2026-12-02',leaveType:'Annual'})
 assert.equal(denied.status,403)
 const created=await request(app).post('/api/leaves').set(auth('employee')).send({employeeId:String(employeeId),startDate:'2026-12-01',endDate:'2026-12-02',leaveType:'Annual',reason:'Test leave',status:'approved'})
 assert.equal(created.status,400,'clients cannot set leave status')
 const valid=await request(app).post('/api/leaves').set(auth('employee')).send({employeeId:String(employeeId),startDate:'2026-12-01',endDate:'2026-12-02',leaveType:'Annual',reason:'Test leave'})
 assert.equal(valid.status,201);leaveId=valid.body.data.id;assert.equal(valid.body.data.status,'pending')
 assert.equal((await request(app).post(`/api/leaves/${leaveId}/approve`).set(auth('employee')).send({resolution:'approved'})).status,403)
 const approved=await request(app).post(`/api/leaves/${leaveId}/approve`).set(auth('manager')).send({resolution:'Approved by test'})
 assert.equal(approved.status,200);assert.equal(approved.body.data.status,'approved')
 const second=await request(app).post('/api/leaves').set(auth('employee')).send({employeeId:String(employeeId),startDate:'2026-12-08',endDate:'2026-12-08',leaveType:'Sick'})
 secondLeaveId=second.body.data.id
 const rejected=await request(app).post(`/api/leaves/${second.body.data.id}/reject`).set(auth('manager')).send({resolution:'Coverage conflict'})
 assert.equal(rejected.body.data.status,'rejected')
})
test('holiday CRUD and model date validation',async()=>{
 const created=await request(app).post('/api/holidays').set(auth('manager')).send({name:'Test holiday',date:'2026-12-25',brandIds:[brandId],processIds:[processId]})
 assert.equal(created.status,201);holidayId=created.body.data.id
 assert.equal((await request(app).patch(`/api/holidays/${holidayId}`).set(auth()).send({description:'Observed'})).body.data.description,'Observed')
 assert.equal((await request(app).delete(`/api/holidays/${holidayId}`).set(auth())).status,204)
})
test('roster generation, preview, month retrieval, locking, and workspace scoping',async()=>{
 await Employee.updateOne({_id:employeeId},{$set:{processIds:[processId],skills:['support'],availability:'available',weeklyOff:0}})
 const emptyMonth=await request(app).get('/api/rosters/month/2026/11').set(auth('manager'))
 assert.equal(emptyMonth.status,200);assert.equal(emptyMonth.body.data,null)
 const forbidden=await request(app).post('/api/rosters/generate').set(auth('employee')).send({year:2026,month:12})
 assert.equal(forbidden.status,403)
 const generated=await request(app).post('/api/rosters/generate').set(auth('manager')).send({year:2026,month:12})
 assert.equal(generated.status,201);rosterId=generated.body.data.roster.id
 assert.ok(generated.body.data.roster.assignments.length>0)
 assert.equal((await request(app).post('/api/rosters/generate').set(auth('manager')).send({year:2026,month:12})).status,409)
 const month=await request(app).get('/api/rosters/month/2026/12').set(auth('employee'))
 assert.equal(month.status,200);assert.equal(month.body.data.id,rosterId)
 assert.equal((await request(app).get('/api/rosters').set(auth('employee'))).body.data.length,1)
 const coverage=await request(app).get('/api/rosters/coverage?year=2026&month=12').set(auth('manager'))
 assert.equal(coverage.status,200);assert.ok(coverage.body.data.required>0);assert.equal(coverage.body.data.assigned,generated.body.data.roster.assignments.length)
 const firstAssignment=generated.body.data.roster.assignments[0]
 const edited=await request(app).patch(`/api/rosters/${rosterId}/assignments/${firstAssignment.id||firstAssignment._id}`).set(auth('manager')).send({notes:'TEST manual edit',locked:true})
 assert.equal(edited.status,200);assert.ok(edited.body.data.assignments.some(item=>item.notes==='TEST manual edit'&&item.locked))
 const persisted=await request(app).get('/api/rosters/month/2026/12').set(auth('manager'))
 assert.ok(persisted.body.data.assignments.some(item=>item.notes==='TEST manual edit'&&item.locked))
 const preview=await request(app).post('/api/rosters/generate').set(auth('manager')).send({year:2026,month:12,regenerate:true,preview:true})
 assert.equal(preview.status,200);assert.ok(preview.body.data.changeSummary);assert.equal(preview.body.data.changeSummary.preserved,1)
 const regenerated=await request(app).post('/api/rosters/generate').set(auth('manager')).send({year:2026,month:12,regenerate:true})
 assert.equal(regenerated.status,200);assert.ok(regenerated.body.data.roster.assignments.some(item=>item.notes==='TEST manual edit'&&item.locked))
 const lock=await request(app).post(`/api/rosters/${rosterId}/lock`).set(auth('manager')).send({locked:true})
 assert.equal(lock.status,200);assert.equal(lock.body.data.locked,true)
 assert.equal((await request(app).post('/api/rosters/generate').set(auth('manager')).send({year:2026,month:12,regenerate:true})).status,409)
 assert.equal((await request(app).post(`/api/rosters/${rosterId}/lock`).set(auth('manager')).send({locked:false})).status,200)
 assert.equal((await request(app).post(`/api/rosters/${rosterId}/publish`).set(auth('manager'))).body.data.status,'published')
 assert.equal((await request(app).delete(`/api/rosters/${rosterId}`).set(auth())).status,404,'monthly rosters are managed by generation lifecycle and are not generic CRUD records')
 await Conflict.deleteMany({rosterId})
 await Roster.deleteOne({_id:rosterId})
})
test('conflicts can only be resolved through manager action and scope by workspace',async()=>{
 const roster=await Roster.create({workspaceId,year:2026,month:12,assignments:[],createdBy:(await User.findOne({firebaseUid:tokenUsers.admin.uid}))._id});rosterId=String(roster._id)
 const created=await request(app).post('/api/conflicts').set(auth()).send({title:'Test gap',kind:'coverage-gap',severity:'High',employeeIds:[employeeId],brandId,processId,date:'2026-12-09'})
 assert.equal(created.status,201);conflictId=created.body.data.id;assert.equal(created.body.data.status,'open');await Conflict.updateOne({_id:conflictId},{$set:{rosterId}})
 const summary=await request(app).get('/api/conflicts/summary?year=2026&month=12').set(auth('employee'))
 assert.equal(summary.status,200);assert.equal(summary.body.data.byStatus.open,1);assert.equal((await request(app).get('/api/conflicts/summary?year=2026&month=13').set(auth())).status,400)
 assert.equal((await request(app).patch(`/api/conflicts/${conflictId}`).set(auth('manager')).send({status:'resolved'})).status,400)
 assert.equal((await request(app).post(`/api/conflicts/${conflictId}/resolve`).set(auth('employee')).send({resolution:'Covered'})).status,403)
 const reviewed=await request(app).post(`/api/conflicts/${conflictId}/resolve`).set(auth('manager')).send({resolution:'Reviewed; gap remains open.'})
 assert.equal(reviewed.status,200);assert.equal(reviewed.body.data.status,'reviewed');assert.equal(reviewed.body.data.resolutionHistory.at(-1).action,'reviewed')
 const reviewedSummary=await request(app).get('/api/conflicts/summary?year=2026&month=12').set(auth())
 assert.equal(reviewedSummary.body.data.byStatus.reviewed,1);assert.equal(reviewedSummary.body.data.byStatus.open,0)
 const staleBackup=await Employee.create({workspaceId,employeeCode:'RF-STALE',name:'TEST inactive recommendation',email:'stale@test.invalid',brandId,processIds:[processId],skills:['support'],weeklyOff:0,status:'Inactive'})
 await Conflict.updateOne({_id:conflictId},{$set:{recommendedEmployeeIds:[staleBackup._id],requiredStaffing:2}})
 assert.equal((await request(app).get(`/api/conflicts/${conflictId}/recommendations`)).status,401)
 assert.equal((await request(app).get(`/api/conflicts/${conflictId}/recommendations`).set(auth('employee'))).status,403)
 assert.equal((await request(app).get(`/api/conflicts/${conflictId}/recommendations`).set(auth('other'))).status,404)
 const recommendations=await request(app).get(`/api/conflicts/${conflictId}/recommendations`).set(auth('manager'))
 assert.equal(recommendations.status,200);assert.equal(recommendations.body.data.staffing.required,2);assert.equal(recommendations.body.data.staffing.assigned,0)
 assert.ok(recommendations.body.data.recommendations.some(item=>item.id===String(employeeId)))
 assert.ok(!recommendations.body.data.recommendations.some(item=>item.id===String(staleBackup._id)),'stale stored inactive recommendation is never shown as eligible')
 assert.ok(recommendations.body.data.exclusions.find(item=>item.id===String(staleBackup._id)).issues.includes('INACTIVE'))
 await Employee.updateOne({_id:employeeId},{$set:{status:'Inactive'}})
 const emptyRecommendations=await request(app).get(`/api/conflicts/${conflictId}/recommendations`).set(auth('manager'))
 assert.equal(emptyRecommendations.status,200);assert.equal(emptyRecommendations.body.success,true);assert.deepEqual(emptyRecommendations.body.data.recommendations,[])
 await Employee.updateOne({_id:employeeId},{$set:{status:'Active'}})
 assert.equal((await request(app).post(`/api/conflicts/${conflictId}/action`).set(auth('manager')).send({action:'apply-recommendation',employeeId:'ffffffffffffffffffffffff'})).status,400)
 await Employee.updateOne({_id:employeeId},{$set:{maxShiftsPerMonth:0}})
 const blockedByWorkloadCap=await request(app).post(`/api/conflicts/${conflictId}/action`).set(auth('manager')).send({action:'apply-recommendation',employeeId})
 assert.equal(blockedByWorkloadCap.status,400);assert.equal(blockedByWorkloadCap.body.error.code,'INELIGIBLE_ASSIGNMENT')
 await Employee.updateOne({_id:employeeId},{$set:{maxShiftsPerMonth:null}})
 const testHoliday=await Holiday.create({workspaceId,name:'TEST conflict closure',date:new Date('2026-12-09T00:00:00.000Z')})
 const blockedByHoliday=await request(app).post(`/api/conflicts/${conflictId}/action`).set(auth('manager')).send({action:'apply-recommendation',employeeId})
 assert.equal(blockedByHoliday.status,400);assert.equal(blockedByHoliday.body.error.code,'HOLIDAY');await Holiday.deleteOne({_id:testHoliday._id})
 const applied=await request(app).post(`/api/conflicts/${conflictId}/action`).set(auth('manager')).send({action:'apply-recommendation',employeeId,resolution:'TEST backup assigned'})
 assert.equal(applied.status,200,JSON.stringify(applied.body));assert.ok(['reviewed','resolved'].includes(applied.body.data.conflict.status));assert.equal(applied.body.data.conflict.resolutionHistory.at(-1).action,'assignment-applied');assert.ok(applied.body.data.roster.history.some(item=>item.summary.includes('while reviewing conflict')))
 assert.equal((await request(app).get('/api/conflicts').set(auth('employee'))).body.data.length,1)
 await Conflict.deleteOne({_id:conflictId});await Roster.deleteOne({_id:rosterId});await Employee.deleteOne({_id:staleBackup._id})
})
test('user profile is token-scoped; client cannot set its own role',async()=>{
 const profile=await request(app).get('/api/users/me').set(auth('employee'))
 assert.equal(profile.status,200);assert.equal(profile.body.data.role,'Employee')
 assert.equal((await request(app).patch('/api/users/me').set(auth('employee')).send({displayName:'Changed',role:'Admin'})).status,400)
 assert.equal((await request(app).patch('/api/users/me').set(auth('employee')).send({displayName:'Changed name'})).body.data.displayName,'Changed name')
 const added=await request(app).post('/api/users').set(auth()).send({firebaseUid:'new-uid',email:'new@test.invalid',displayName:'New manager',role:'Manager'})
 assert.equal(added.status,201);assert.equal(added.body.data.role,'Manager')
 assert.equal((await request(app).post('/api/users').set(auth('manager')).send({firebaseUid:'bad',email:'bad@test.invalid',displayName:'Bad',role:'Admin'})).status,403)
})
test('centralized 404 and JSON parsing errors use the common response shape',async()=>{
 const missing=await request(app).get('/api/does-not-exist').set(auth())
 assert.equal(missing.status,404);assert.equal(missing.body.error.code,'ROUTE_NOT_FOUND')
 const invalid=await request(app).post('/api/brands').set(auth()).set('Content-Type','application/json').send('{')
 assert.equal(invalid.status,400);assert.equal(invalid.body.error.code,'INVALID_JSON')
})
test('dependent records block unsafe deletion and remaining CRUD deletes succeed',async()=>{
 assert.equal((await request(app).delete(`/api/employees/${employeeId}`).set(auth())).status,400)
 await request(app).delete(`/api/conflicts/${conflictId}`).set(auth())
 await request(app).delete(`/api/leaves/${leaveId}`).set(auth())
 await request(app).delete(`/api/leaves/${secondLeaveId}`).set(auth())
 await Employee.updateOne({_id:employeeId},{$set:{podId:null,processIds:[]}})
 await Pod.deleteOne({_id:podId})
 await Employee.deleteOne({_id:employeeId})
 assert.equal((await request(app).delete(`/api/processes/${processId}`).set(auth())).status,204)
 assert.equal((await request(app).delete(`/api/brands/${brandId}`).set(auth())).status,204)
})

test('demo seed preview is Admin-only, read-only, and creates the reference catalog with valid links after confirmation',async()=>{
 const beforeCounts={brands:await Brand.countDocuments({workspaceId}),processes:await Process.countDocuments({workspaceId}),employees:await Employee.countDocuments({workspaceId}),pods:await Pod.countDocuments({workspaceId})}
 const denied=await request(app).get('/api/admin/seed/demo/preview').set(auth('manager'))
 assert.equal(denied.status,403)
 const noAuth=await request(app).get('/api/admin/seed/demo/preview')
 assert.equal(noAuth.status,401)
 const preview=await request(app).get('/api/admin/seed/demo/preview').set(auth())
 assert.equal(preview.status,200)
 assert.equal(preview.body.data.totalToCreate,20)
 assert.deepEqual(preview.body.data.createdCounts,{brands:4,processes:7,employees:6,pods:3})
 assert.equal(await Brand.countDocuments({workspaceId}),beforeCounts.brands,'preview must not write data')
 assert.equal(await Employee.countDocuments({workspaceId}),beforeCounts.employees,'preview must not write data')
 assert.equal((await request(app).post('/api/admin/seed/demo/execute').set(auth()).send({confirmationToken:preview.body.data.confirmationToken,confirmationPhrase:'wrong'})).status,400)
 const execute=await request(app).post('/api/admin/seed/demo/execute').set(auth()).send({confirmationToken:preview.body.data.confirmationToken,confirmationPhrase:preview.body.data.confirmationPhrase})
 assert.equal(execute.status,201)
 assert.deepEqual(execute.body.data.created,{brands:4,processes:7,employees:6,pods:3})
 const brands=await Brand.find({workspaceId}).lean(),processes=await Process.find({workspaceId}).lean(),employees=await Employee.find({workspaceId}).lean(),pods=await Pod.find({workspaceId}).lean()
 assert.equal(brands.length,4);assert.equal(processes.length,7);assert.equal(employees.length,6);assert.equal(pods.length,3)
 assert.ok(processes.every(item=>brands.some(brand=>String(brand._id)===String(item.brandId))))
 assert.ok(employees.every(item=>brands.some(brand=>String(brand._id)===String(item.brandId))&&item.processIds.length>0&&item.podId&&item.workingDays.length===6))
 assert.ok(pods.every(item=>item.leaderId&&item.memberIds.length===2&&item.brandIds.length>0&&item.processIds.length>0))
 const repeat=await request(app).get('/api/admin/seed/demo/preview').set(auth())
 assert.equal(repeat.body.data.totalToCreate,0)
 assert.deepEqual(repeat.body.data.reusedCounts,{brands:4,processes:7,employees:6,pods:3})
 assert.equal((await request(app).post('/api/admin/seed/demo/execute').set(auth()).send({confirmationToken:repeat.body.data.confirmationToken,confirmationPhrase:repeat.body.data.confirmationPhrase})).status,200)
 assert.equal(await Employee.countDocuments({workspaceId}),6,'rerunning must not duplicate employees')
})
