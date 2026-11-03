const modeStorageKey = 'rosterflow.workspace.mode'
const modeEvent = 'rosterflow:workspace-mode-change'
const fallbackMode = import.meta.env?.VITE_DATA_MODE === 'live' ? 'live' : 'demo'

export function getWorkspaceMode() {
  try {
    const savedMode = localStorage.getItem(modeStorageKey)
    if (savedMode === 'live' || savedMode === 'demo') return savedMode
  } catch { /* use the configured default when browser storage is unavailable */ }
  return fallbackMode
}

export function isLiveWorkspaceMode() {
  return getWorkspaceMode() === 'live'
}

export function setWorkspaceMode(mode) {
  if (mode !== 'live' && mode !== 'demo') throw new Error('Workspace mode must be live or demo.')
  try { localStorage.setItem(modeStorageKey, mode) } catch { /* current session still switches without persistence */ }
  window.dispatchEvent(new CustomEvent(modeEvent, { detail: mode }))
  return mode
}

export function subscribeWorkspaceMode(callback) {
  const listener = event => callback(event.detail)
  window.addEventListener(modeEvent, listener)
  return () => window.removeEventListener(modeEvent, listener)
}
