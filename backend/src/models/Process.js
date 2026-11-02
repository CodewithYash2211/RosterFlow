import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ name: { type: String, required: true, trim: true, maxlength: 120 }, brandId: { type: objectId, ref: 'Brand', required: true }, description: { type: String, trim: true, maxlength: 1000 }, minimumStaffing: { type: Number, min: 0, max: 10000, default: 1 }, requiredSkills: [{ type: String, trim: true, maxlength: 80 }], workingDays: [{ type: Number, min: 0, max: 6 }], shiftRequirements: [{ name: { type: String, required: true, trim: true }, startTime: String, endTime: String, minimumStaffing: { type: Number, min: 0, default: 1 } }], crossTrainingEligibility: [{ type: String, trim: true }] })
schema.index({ workspaceId: 1, brandId: 1, name: 1 }, { unique: true })
export default model('Process', schema)
