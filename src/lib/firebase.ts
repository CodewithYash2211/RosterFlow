import { initializeApp, getApp, getApps } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const missing = Object.entries(config).filter(([key, value]) => key !== 'measurementId' && !value).map(([key]) => key)
export const firebaseConfigured = missing.length === 0
export const firebaseConfigError = firebaseConfigured ? '' : `Firebase configuration is incomplete (${missing.join(', ')}). Add the VITE_FIREBASE_* values to the project root .env file.`
export const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(config)) : null
export const auth = app ? getAuth(app) : null
export const authPersistence = auth ? setPersistence(auth, browserLocalPersistence) : Promise.resolve()
