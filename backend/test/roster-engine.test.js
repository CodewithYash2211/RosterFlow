import test from 'node:test'
import assert from 'node:assert/strict'
import { generateAssignments } from '../src/services/roster/generator.js'
import { calculateCoverage } from '../src/services/roster/coverageCalculator.js'
import { validateAssignments } from '../src/services/roster/validator.js'
import { recommendBackups } from '../src/services/roster/scoring.js'

const id=value=>value.padStart(24,'0')
const brand={_id:id('1'),name:'Test Brand',workingDays:[1,2,3,4,5]}
const process={_id:id('2'),name:'Support',brandId:brand,minimumStaffing:1,requiredSkills:['support'],workingDays:[1,2,3,4,5]}
const employees=[
 {_id:id('3'),name:'Alex',status:'Active',availability:'available',brandId:brand._id,processIds:[process._id],weeklyOff:0,workingDays:[1,2,3,4,5,6],skills:['support']},
 {_id:id('4'),name:'Bailey',status:'Active',availability:'available',brandId:brand._id,processIds:[process._id],weeklyOff:0,workingDays:[1,2,3,4,5,6],skills:['support']},
]

test('generator is deterministic, respects constraints, and distributes shifts fairly',()=>{
 const args={year:2026,month:11,employees,processes:[process],leaves:[],holidays:[]}
 const first=generateAssignments(args),second=generateAssignments(args)
 assert.deepEqual(first.assignments.map(item=>`${item.employeeId}:${item.date.toISOString()}`),second.assignments.map(item=>`${item.employeeId}:${item.date.toISOString()}`))
 assert.equal(first.conflicts.length,0)
 const counts=new Map();for(const item of first.assignments)counts.set(String(item.employeeId),(counts.get(String(item.employeeId))||0)+1)
 assert.ok(Math.abs(counts.get(id('3'))-counts.get(id('4')))<=1)
 assert.ok(first.assignments.every(item=>item.kind==='shift'&&new Date(item.date).getUTCDay()!==0))
})

test('generator reports staffing gaps when no eligible employees exist',()=>{
 const onlyEmployee={...employees[0],processIds:[],crossTrainedFor:[]}
 const result=generateAssignments({year:2026,month:11,employees:[onlyEmployee],processes:[process],leaves:[],holidays:[]})
 assert.ok(result.conflicts.length>0)
 assert.ok(result.assignments.length===0)
})

test('coverage calculator and validator expose staffing and hard-constraint failures',()=>{
 const assignment={employeeId:employees[0]._id,brandId:brand._id,processId:process._id,date:new Date(Date.UTC(2026,10,2)),shift:'day',kind:'shift',status:'scheduled'}
 const coverage=calculateCoverage([assignment],[process],2026,11)
 assert.ok(coverage.required>0);assert.equal(coverage.assigned,1);assert.ok(coverage.percentage<100)
 const invalid=validateAssignments([{...assignment,date:new Date(Date.UTC(2026,10,1))} ],{year:2026,month:11,employees,processes:[process],leaves:[{employeeId:employees[0]._id,status:'approved',startDate:new Date(Date.UTC(2026,10,1)),endDate:new Date(Date.UTC(2026,10,1))}],holidays:[]})
 assert.equal(invalid.valid,false);assert.ok(invalid.errors.some(error=>error.code==='APPROVED_LEAVE'))
})

test('approved leave, weekly off, holidays, availability, skills, and active status are hard constraints',()=>{
 const monday=new Date(Date.UTC(2026,10,2)),tuesday=new Date(Date.UTC(2026,10,3))
 const leave={employeeId:employees[0]._id,status:'approved',startDate:monday,endDate:monday}
 const noLeave=generateAssignments({year:2026,month:11,employees:[employees[0]],processes:[process],leaves:[leave],holidays:[]})
 assert.ok(noLeave.assignments.every(item=>new Date(item.date).getUTCDate()!==2))
 const offEmployee={...employees[0],weeklyOff:2}
 assert.ok(generateAssignments({year:2026,month:11,employees:[offEmployee],processes:[process]}).assignments.every(item=>new Date(item.date).getUTCDay()!==2))
 const holidayResult=generateAssignments({year:2026,month:11,employees:[employees[0]],processes:[process],holidays:[{date:monday,brandIds:[brand._id],processIds:[process._id]}]})
 assert.ok(holidayResult.assignments.every(item=>new Date(item.date).getUTCDate()!==2))
 assert.equal(generateAssignments({year:2026,month:11,employees:[{...employees[0],availability:'unavailable'}],processes:[process]}).assignments.length,0)
 assert.equal(generateAssignments({year:2026,month:11,employees:[{...employees[0],skills:[]}],processes:[process]}).assignments.length,0)
 assert.equal(generateAssignments({year:2026,month:11,employees:[{...employees[0],status:'Inactive'}],processes:[process]}).assignments.length,0)
 assert.ok(generateAssignments({year:2026,month:11,employees,processes:[process]}).assignments.some(item=>new Date(item.date).getTime()===tuesday.getTime()))
})

test('cross-trained employees can fill eligible work and duplicate date shifts are rejected',()=>{
 const crossTrained={...employees[0],processIds:[],crossTrainedFor:['Support']}
 assert.ok(generateAssignments({year:2026,month:11,employees:[crossTrained],processes:[process]}).assignments.length>0)
 const date=new Date(Date.UTC(2026,10,3)),first={employeeId:employees[0]._id,brandId:brand._id,processId:process._id,date,shift:'day',kind:'shift'}
 const duplicate=validateAssignments([first,{...first,shift:'night'}],{year:2026,month:11,employees,processes:[process]})
 assert.ok(duplicate.errors.some(item=>item.code==='OVERLAPPING_SHIFT'))
})

test('preserves locked and manual assignments during regeneration and does not double-book them',()=>{
 const locked={employeeId:employees[0]._id,brandId:brand._id,processId:process._id,date:new Date(Date.UTC(2026,10,3)),shift:'day',kind:'shift',locked:true,source:'manual'}
 const result=generateAssignments({year:2026,month:11,employees,processes:[process],preserved:[locked]})
 assert.ok(result.assignments.some(item=>item.locked&&String(item.employeeId)===String(locked.employeeId)&&new Date(item.date).getTime()===new Date(locked.date).getTime()))
 assert.equal(result.assignments.filter(item=>String(item.employeeId)===String(locked.employeeId)&&new Date(item.date).getTime()===new Date(locked.date).getTime()).length,1)
})

test('supports empty datasets, multiple brands and processes, and leap-year February',()=>{
 assert.deepEqual(generateAssignments({year:2026,month:11,employees:[],processes:[]}),{assignments:[],conflicts:[]})
 const brand2={_id:id('5'),name:'Second Brand',workingDays:[1,2,3,4,5]}
 const process2={_id:id('6'),name:'Returns',brandId:brand2,minimumStaffing:1,requiredSkills:['returns'],workingDays:[1,2,3,4,5]}
 const employee2={...employees[1],brandId:brand2._id,processIds:[process2._id],skills:['returns']}
 const multi=generateAssignments({year:2026,month:11,employees:[...employees,employee2],processes:[process,process2]})
 assert.ok(multi.assignments.some(item=>String(item.processId)===String(process2._id)))
 const leapProcess={...process,workingDays:[0,1,2,3,4,5,6],brandId:{...brand,workingDays:[0,1,2,3,4,5,6]}}
 const leap=generateAssignments({year:2028,month:2,employees,processes:[leapProcess]})
 assert.ok(leap.assignments.some(item=>new Date(item.date).toISOString().slice(0,10)==='2028-02-29'))
})

test('zero required positions are not reported as full coverage',()=>{
 const coverage=calculateCoverage([],[],2026,11)
 assert.equal(coverage.required,0);assert.equal(coverage.applicable,false);assert.equal(coverage.percentage,null)
})

test('backup recommendations omit unavailable, weekly-off, overlapping, or unskilled employees',()=>{
 const date=new Date(Date.UTC(2026,10,2)),backup={...employees[1],processIds:[],crossTrainedFor:['support'],crossTrainingSkills:['support'],weeklyOff:1}
 const valid={...backup,_id:id('7'),name:'Valid backup',weeklyOff:6}
 const result=recommendBackups([backup,valid],process,{counts:new Map(),previousBrand:new Map(),process,shift:{name:'day'},dateKey:'2026-11-02',date,leaves:[],assignments:[]})
 assert.deepEqual(result.map(item=>String(item.employeeId)),[String(valid._id)])
})
