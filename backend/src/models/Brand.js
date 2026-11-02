import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ name: { type: String, required: true, trim: true, maxlength: 120 }, code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 }, description: { type: String, trim: true, maxlength: 1000 }, workingDays: [{ type: Number, min: 0, max: 6 }], holidayIds: [{ type: objectId, ref: 'Holiday' }], status: { type: String, enum: ['active','inactive'], default: 'active' } })
schema.index({ workspaceId: 1, code: 1 }, { unique: true })
schema.index({ workspaceId: 1, name: 1 }, { unique: true })
export default model('Brand', schema)
