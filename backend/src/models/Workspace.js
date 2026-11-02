import { mongoose, model } from './base.js'
const schema = new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 120 }, slug: { type: String, required: true, trim: true, lowercase: true, unique: true, maxlength: 120 }, status: { type: String, enum: ['active','inactive'], default: 'active' } }, { timestamps: true, versionKey: false })
export default model('Workspace', schema)
