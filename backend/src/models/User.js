import { scopedSchema, model, objectId } from './base.js'
const schema = scopedSchema({ firebaseUid: { type: String, required: true, trim: true }, email: { type: String, trim: true, lowercase: true, maxlength: 254 }, displayName: { type: String, trim: true, maxlength: 120 }, photoURL: { type: String, trim: true, maxlength: 2048 }, role: { type: String, enum: ['Admin','Manager','Employee'], default: 'Employee', required: true }, workspaceId: { type: objectId, ref: 'Workspace', required: true }, employeeId: { type: objectId, ref: 'Employee', default: null } })
schema.index({ firebaseUid: 1 }, { unique: true })
schema.index({ workspaceId: 1, role: 1 })
export default model('User', schema)
