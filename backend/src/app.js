import express from 'express'
import cors from 'cors'
import { apiRouter } from './routes/api.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

export function createApp(options = {}) {
 const app=express()
 const configuredOrigins=[process.env.CLIENT_URL,...(process.env.CLIENT_URLS||'').split(',')]
 const allowedOrigins=new Set(configuredOrigins.flatMap(value=>String(value||'').split(',')).map(value=>value.trim()).filter(value=>value&&value!=='*'))
 if(!allowedOrigins.size)allowedOrigins.add('http://localhost:5173')
 app.disable('x-powered-by')
 app.use(cors({origin(origin,callback){if(!origin||allowedOrigins.has(origin))return callback(null,true);return callback(null,false)},methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization'],optionsSuccessStatus:204}))
 app.use(express.json({limit:'1mb'}))
 app.use('/api',apiRouter(options))
 app.use(notFoundHandler)
 app.use(errorHandler)
 return app
}
