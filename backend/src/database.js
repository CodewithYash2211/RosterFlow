import mongoose from 'mongoose'

let retryTimer
let connecting = false
let connectionFailureLogged = false

function logConnectionFailure() {
  if (connectionFailureLogged) return
  connectionFailureLogged = true
  console.error('Could not connect to MongoDB Atlas. Check MONGODB_URI, DNS resolution, Atlas network access, and database-user permissions.')
}

mongoose.connection.on('connected', () => {
  connectionFailureLogged = false
  console.info('MongoDB connection established for rosterflow.')
})
mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB connection is disconnected.')
})
mongoose.connection.on('error', () => {
  // Driver errors may include server details; never log their message or URI.
  logConnectionFailure()
})

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1
}

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    logConnectionFailure()
    return false
  }
  if (isDatabaseConnected()) return true
  if (connecting) return false
  connecting = true
  try {
    await mongoose.connect(uri, { dbName: 'rosterflow', serverSelectionTimeoutMS: 10000 })
    return true
  } catch {
    // Do not log driver messages because they can contain connection details.
    logConnectionFailure()
    return false
  } finally {
    connecting = false
  }
}

export function scheduleDatabaseRetry(intervalMs = 15000) {
  if (retryTimer) return
  retryTimer = setInterval(() => {
    if (!isDatabaseConnected()) void connectDatabase()
  }, intervalMs)
  retryTimer.unref?.()
}

export async function closeDatabase() {
  if (retryTimer) clearInterval(retryTimer)
  retryTimer = undefined
  await mongoose.disconnect()
}
