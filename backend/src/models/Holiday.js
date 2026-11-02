import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ name: { type: String, required: true, trim: true, maxlength: 120 }, date: { type: Date, required: true }, brandIds: [{ type: objectId, ref: 'Brand' }], processIds: [{ type: objectId, ref: 'Process' }], description: { type: String, trim: true, maxlength: 500 } })
schema.index({ workspaceId: 1, date: 1, name: 1 }, { unique: true })
export default model('Holiday', schema)
