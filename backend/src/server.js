import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'
import dotenv from 'dotenv'
import { closeDatabase, connectDatabase, scheduleDatabaseRetry } from './database.js'

const backendDirectory=fileURLToPath(new URL('../',import.meta.url))
const envPath=existsSync(resolve(backendDirectory,'.env'))?resolve(backendDirectory,'.env'):resolve(backendDirectory,'..','.env')
dotenv.config({path:envPath,quiet:true})
const dnsServers=process.env.MONGODB_DNS_SERVERS?.split(',').map(value=>value.trim()).filter(Boolean)
if(dnsServers?.length)dns.setServers(dnsServers)
const {createApp}=await import('./app.js')
const app=createApp()
const port=Number(process.env.PORT)||4000
const server=app.listen(port,'0.0.0.0',async()=>{console.info(`RosterFlow API listening on port ${port}.`);await connectDatabase();scheduleDatabaseRetry()})
async function shutdown(signal){console.info(`Received ${signal}; closing the API server.`);server.close(async()=>{await closeDatabase().catch(()=>console.error('MongoDB shutdown did not complete cleanly.'));process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.once('SIGINT',()=>void shutdown('SIGINT'))
process.once('SIGTERM',()=>void shutdown('SIGTERM'))
