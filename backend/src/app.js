import express from 'express'
import cors from 'cors'
import { apiRouter } from './routes/api.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

export function createApp(options = {}) {
 const app=express()
 const allowedOrigins=(process.env.CLIENT_URL||'http://localhost:5173').split(',').map(value=>value.trim()).filter(Boolean)
 app.disable('x-powered-by')
 app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.includes(origin))return callback(null,true);return callback(null,false)},methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization']}))
 app.use(express.json({limit:'1mb'}))
 app.use('/api',apiRouter(options))
 app.use(notFoundHandler)
 app.use(errorHandler)
 return app
}
