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
 const created=await request(app).post('/api/employees').set(auth()).send({employeeCode:'RF-TEST-1',name:'Test Employee',email:'worker@test.invalid',brandId,processIds:[processId],weeklyOff:0,status:'Active',crossTrainedFor:['Support']})
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
test('roster CRUD validates assignment references and scopes employee reads',async()=>{
 const created=await request(app).post('/api/rosters').set(auth('manager')).send({year:2026,month:12,assignments:[{employeeId,brandId,processId,date:'2026-12-03',shift:'day'}]})
 assert.equal(created.status,201);rosterId=created.body.data.id
 assert.equal((await request(app).get('/api/rosters').set(auth('employee'))).body.data.length,1)
 assert.equal((await request(app).patch(`/api/rosters/${rosterId}`).set(auth('manager')).send({status:'published'})).body.data.status,'published')
 assert.equal((await request(app).delete(`/api/rosters/${rosterId}`).set(auth())).status,204)
})
test('conflicts can only be resolved through manager action and scope by workspace',async()=>{
 const created=await request(app).post('/api/conflicts').set(auth()).send({title:'Test gap',kind:'coverage-gap',severity:'High',employeeIds:[employeeId],brandId,processId,date:'2026-12-03'})
 assert.equal(created.status,201);conflictId=created.body.data.id;assert.equal(created.body.data.status,'open')
 assert.equal((await request(app).patch(`/api/conflicts/${conflictId}`).set(auth('manager')).send({status:'resolved'})).status,400)
 assert.equal((await request(app).post(`/api/conflicts/${conflictId}/resolve`).set(auth('employee')).send({resolution:'Covered'})).status,403)
 const resolved=await request(app).post(`/api/conflicts/${conflictId}/resolve`).set(auth('manager')).send({resolution:'Coverage assigned'})
 assert.equal(resolved.status,200);assert.equal(resolved.body.data.status,'resolved')
 assert.equal((await request(app).get('/api/conflicts').set(auth('employee'))).body.data.length,1)
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
