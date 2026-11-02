import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ name: { type: String, required: true, trim: true, maxlength: 120 }, code: { type: String, trim: true, uppercase: true, maxlength: 32 }, description: { type: String, trim: true, maxlength: 1000 }, leaderId: { type: objectId, ref: 'Employee' }, memberIds: [{ type: objectId, ref: 'Employee' }], brandIds: [{ type: objectId, ref: 'Brand' }], processIds: [{ type: objectId, ref: 'Process' }], capacity: { type: Number, min: 1, max: 10000, default: 8 }, status: { type: String, enum: ['active','inactive'], default: 'active' } })
schema.index({ workspaceId: 1, name: 1 }, { unique: true })
schema.index({ workspaceId: 1, code: 1 }, { unique: true, sparse: true })
export default model('Pod', schema)
