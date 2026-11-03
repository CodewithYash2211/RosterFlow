export function filterLiveConflicts(conflicts = [], filters = {}) {
  return conflicts.filter(conflict =>
    (!filters.brand || String(conflict.brandId) === String(filters.brand)) &&
    (!filters.process || String(conflict.processId) === String(filters.process))
  )
}
