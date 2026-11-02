import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ employeeId: { type: objectId, ref: 'Employee', required: true }, startDate: { type: Date, required: true }, endDate: { type: Date, required: true }, leaveType: { type: String, enum: ['Personal','Sick','Annual','Other'], required: true }, reason: { type: String, trim: true, maxlength: 1000 }, status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' }, reviewedBy: { type: objectId, ref: 'User' }, reviewedAt: Date })
schema.path('endDate').validate(function(value) { return !this.startDate || value >= this.startDate }, 'End date must be on or after start date')
schema.index({ workspaceId: 1, employeeId: 1, status: 1, startDate: 1, endDate: 1 })
export default model('Leave', schema)
