import test from 'node:test'
import assert from 'node:assert/strict'
import { filterLiveConflicts } from '../../src/lib/conflictFilters.js'

const conflicts = [
  { id: 'one', brandId: 'brand-a', processId: 'process-a' },
  { id: 'two', brandId: 'brand-a', processId: 'process-b' },
  { id: 'three', brandId: 'brand-b', processId: 'process-a' },
]

test('Live conflict filter matches brand independently', () => {
  assert.deepEqual(filterLiveConflicts(conflicts, { brand: 'brand-a' }).map(item => item.id), ['one', 'two'])
})

test('Live conflict filter matches process independently', () => {
  assert.deepEqual(filterLiveConflicts(conflicts, { process: 'process-a' }).map(item => item.id), ['one', 'three'])
})

test('Live conflict filters combine brand and process with AND semantics', () => {
  assert.deepEqual(filterLiveConflicts(conflicts, { brand: 'brand-a', process: 'process-b' }).map(item => item.id), ['two'])
  assert.deepEqual(filterLiveConflicts(conflicts, { brand: 'brand-b', process: 'process-b' }), [])
})

test('clearing Live conflict filters restores the complete source list', () => {
  assert.deepEqual(filterLiveConflicts(conflicts, { brand: '', process: '' }), conflicts)
  assert.deepEqual(filterLiveConflicts(conflicts), conflicts)
})
