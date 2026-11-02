import { createAvatar } from '@dicebear/core'
import * as adventurer from '@dicebear/adventurer'
import * as micah from '@dicebear/micah'

const styles = [adventurer, micah]
const cache = new Map()
function hash(value) {
  let result = 2166136261
  for (const character of String(value)) result = Math.imul(result ^ character.charCodeAt(0), 16777619)
  return result >>> 0
}

export function getEmployeeAvatar(employee) {
  const id = String(employee?.id || employee?.employeeCode || employee?.name || 'rosterflow-demo')
  const seed = employee?.avatarSeed || id
  const key = `${id}:${seed}`
  if (cache.has(key)) return cache.get(key)
  const index = hash(id) % styles.length
  const dataUri = createAvatar(styles[index], { seed, size: 96, radius: 50, backgroundColor: ['e7eef9','e9f3ef','f8efe4','f1eafa','f9e8eb','e4f1f3'] }).toDataUri()
  cache.set(key, dataUri)
  return dataUri
}
