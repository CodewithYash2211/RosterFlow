import { z } from 'zod'
const id = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid ObjectId')
const name = z.string().trim().min(1).max(120)
const code = z.string().trim().min(1).max(32)
const text = max => z.string().trim().max(max).optional().default('')
const day = z.number().int().min(0).max(6)
const ids = z.array(id).max(1000).default([])
export const schemas = {
  employee: z.object({ employeeCode: code, name, email: z.string().trim().email().max(254), phone: text(32), designation: text(100), role: text(100), status: z.enum(['Active','Inactive']).optional(), brandId: id, processIds: ids, podId: id.optional().nullable(), weeklyOff: day, workingDays: z.array(day).max(7).optional().default([]), shiftPreference: z.enum(['any','morning','afternoon','night']).optional(), availability: z.enum(['available','unavailable','limited']).optional(), joiningDate: z.coerce.date().optional().nullable(), skills: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]), crossTrainingSkills: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]), crossTrainedFor: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]), avatarSeed: text(100) }).strict(),
  brand: z.object({ name, code, description: text(1000), workingDays: z.array(day).max(7).optional().default([]), holidayIds: ids, status: z.enum(['active','inactive']).optional() }).strict(),
  process: z.object({ name, brandId: id, description: text(1000), minimumStaffing: z.number().int().min(0).max(10000).optional(), requiredSkills: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]), workingDays: z.array(day).max(7).optional().default([]), shiftRequirements: z.array(z.object({ name, startTime: z.string().max(20).optional(), endTime: z.string().max(20).optional(), minimumStaffing: z.number().int().min(0).max(10000).optional() })).max(24).optional().default([]), crossTrainingEligibility: z.array(z.string().trim().min(1).max(80)).max(100).optional().default([]) }).strict(),
  pod: z.object({ name, code: code.optional(), description: text(1000), leaderId: id.optional().nullable(), memberIds: ids, brandIds: ids, processIds: ids, capacity: z.number().int().min(1).max(10000).optional(), status: z.enum(['active','inactive']).optional() }).strict(),
  leave: z.object({ employeeId: id, startDate: z.coerce.date(), endDate: z.coerce.date(), leaveType: z.enum(['Personal','Sick','Annual','Other']), reason: text(1000) }).strict(),
  holiday: z.object({ name, date: z.coerce.date(), brandIds: ids, processIds: ids, description: text(500) }).strict(),
  roster: z.object({ year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12), name: text(120), assignments: z.array(z.object({ employeeId: id, brandId: id, processId: id, date: z.coerce.date(), shift: text(40), kind: z.enum(['shift','weekly-off','leave','holiday']).optional(), status: z.enum(['scheduled','confirmed','cancelled']).optional() })).max(10000).optional().default([]), status: z.enum(['draft','published']).optional() }).strict(),
  conflict: z.object({ title: z.string().trim().min(1).max(200), severity: z.enum(['Low','Medium','High']).optional(), kind: z.enum(['staffing','weekly-off','availability','coverage-gap','leave']), brandId: id.optional().nullable(), processId: id.optional().nullable(), date: z.coerce.date().optional().nullable(), employeeIds: ids, details: text(2000), resolution: text(2000) }).strict(),
  profile: z.object({ displayName: z.string().trim().min(1).max(120).optional(), photoURL: z.string().trim().url().max(2048).optional().or(z.literal('')) }).strict(),
  user: z.object({ firebaseUid: z.string().trim().min(1).max(128), email: z.string().trim().email().max(254), displayName: z.string().trim().min(1).max(120), role: z.enum(['Admin','Manager','Employee']), employeeId: id.optional().nullable() }).strict(),
  availability: z.object({ weeklyOff: day.optional(), workingDays: z.array(day).max(7).optional(), availability: z.enum(['available','unavailable','limited']).optional() }).strict().refine(value => Object.keys(value).length > 0, 'At least one availability field is required'),
  review: z.object({ resolution: z.string().trim().min(1).max(2000) }).strict(),
}
export const objectIdSchema = id
