import mongoose from 'mongoose'

const options = { timestamps: true, strict: 'throw', versionKey: false, toJSON: { virtuals: true, transform: (_doc, value) => { value.id = String(value._id); delete value._id; return value } }, toObject: { virtuals: true } }
export const objectId = mongoose.Schema.Types.ObjectId
export function scopedSchema(fields, extra = {}) {
  return new mongoose.Schema({ workspaceId: { type: objectId, ref: 'Workspace', required: true, index: true }, ...fields }, { ...options, ...extra })
}
export function model(name, schema) { return mongoose.models[name] || mongoose.model(name, schema) }
export { mongoose }
