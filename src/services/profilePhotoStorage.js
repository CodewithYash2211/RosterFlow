const databaseName = 'rosterflow-profile-photos'
const storeName = 'photos'
let databasePromise

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('This browser does not support local profile photo storage.'))
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local profile photo storage.'))
  })
  return databasePromise
}
function transact(mode, action) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)
    request.onerror = () => reject(request.error || new Error('Could not access the saved profile photo.'))
    transaction.oncomplete = () => resolve(request.result)
    transaction.onerror = () => reject(transaction.error || new Error('Could not access the saved profile photo.'))
    transaction.onabort = () => reject(transaction.error || new Error('Profile photo storage was interrupted.'))
  }))
}

async function compressedBlob(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image compression is unavailable in this browser.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not compress this image.')), 'image/jpeg', 0.84))
  } finally { bitmap?.close() }
}

export async function loadProfilePhoto(userId) {
  if (!userId) return { url: null, hasOverride: false }
  const value = await transact('readonly', store => store.get(String(userId)))
  if (!value) return { url: null, hasOverride: false }
  return { url: value.blob ? URL.createObjectURL(value.blob) : null, hasOverride: true }
}

export async function saveProfilePhoto(userId, file) {
  if (!userId) throw new Error('A signed-in user is required to save a profile photo.')
  if (!file || !['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPG, JPEG or PNG image.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.')
  const blob = await compressedBlob(file)
  await transact('readwrite', store => store.put({ blob, type: blob.type, updatedAt: Date.now() }, String(userId)))
  return URL.createObjectURL(blob)
}

export async function removeProfilePhoto(userId) {
  if (!userId) throw new Error('A signed-in user is required to remove a profile photo.')
  await transact('readwrite', store => store.put({ blob: null, updatedAt: Date.now() }, String(userId)))
}
