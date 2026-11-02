import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function adminApp() {
  if (getApps().length) return getApp()
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  const keyFile = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  let credential
  if (encoded) {
    const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    credential = cert(serviceAccount)
  } else if (raw) {
    credential = cert(JSON.parse(raw))
  } else if (keyFile) {
    const backendDirectory = fileURLToPath(new URL('../../', import.meta.url))
    const keyPath = resolve(backendDirectory, keyFile)
    credential = cert(JSON.parse(readFileSync(keyPath, 'utf8')))
  } else if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
    credential = cert({ projectId: process.env.FIREBASE_ADMIN_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') })
  } else {
    credential = applicationDefault()
  }
  return initializeApp({ credential, projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'rosterflow-f1a9d' })
}

export function initializeFirebaseAdmin() {
  return getAuth(adminApp())
}

export async function verifyFirebaseToken(token) {
  let auth
  try { auth = getAuth(adminApp()) }
  catch {
    const error = new Error('Firebase Admin credential configuration is unavailable.')
    error.code = 'auth/configuration-error'
    throw error
  }
  return auth.verifyIdToken(token)
}

export async function getFirebaseUserByUid(uid) {
  try { return await getAuth(adminApp()).getUser(uid) }
  catch (error) {
    if (error?.code?.startsWith('auth/')) throw error
    const unavailable = new Error('Firebase Admin credential configuration is unavailable.')
    unavailable.code = 'auth/configuration-error'
    throw unavailable
  }
}
