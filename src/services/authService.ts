import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile, type User } from 'firebase/auth'
import { auth, authPersistence, firebaseConfigError } from '../lib/firebase'

function requireAuth() {
  if (!auth) throw new Error(firebaseConfigError || 'Firebase Authentication is unavailable.')
  return auth
}
export function friendlyAuthError(error: unknown) {
  const code = (error as {code?: string})?.code || ''
  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/user-not-found': 'No account was found for this email.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups and try again.',
    'auth/too-many-requests': 'Too many attempts. Wait a little and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Console.',
    'auth/account-exists-with-different-credential': 'An account already exists for this email with a different sign-in method.',
    'auth/cancelled-popup-request': 'Another Google sign-in request is already open.',
    'auth/user-disabled': 'This account has been disabled. Contact your workspace administrator.',
    'auth/unauthorized-domain': 'This domain is not authorized for Firebase sign-in. Add it in Firebase Console.',
  }
  return messages[code] || (error instanceof Error ? error.message : 'Authentication failed. Please try again.')
}
export async function signUp(email: string, password: string, name: string) {
  await authPersistence
  const credential = await createUserWithEmailAndPassword(requireAuth(), email, password)
  await updateProfile(credential.user, { displayName: name.trim() })
  return credential.user
}
export async function signIn(email: string, password: string, remember = true) { const current=requireAuth();await authPersistence;await setPersistence(current,remember?browserLocalPersistence:browserSessionPersistence);return (await signInWithEmailAndPassword(current,email,password)).user }
export async function signInWithGoogle() {
  await authPersistence
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return (await signInWithPopup(requireAuth(), provider)).user
}
export async function resetPassword(email: string) { return sendPasswordResetEmail(requireAuth(), email) }
export async function logout() { return signOut(requireAuth()) }
export type AuthUser = User

