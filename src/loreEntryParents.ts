import type { LoreEntry } from './types'

export function getInvalidLoreEntryParentIds(entries: LoreEntry[], entryId: string) {
  const invalidIds = new Set<string>([entryId])
  let changed = true
  while (changed) {
    changed = false
    entries.forEach(entry => {
      if (entry.parentEntryId && invalidIds.has(entry.parentEntryId) && !invalidIds.has(entry.id)) {
        invalidIds.add(entry.id)
        changed = true
      }
    })
  }
  return invalidIds
}

export function orderLoreEntriesByParent(entries: LoreEntry[]) {
  const entryIds = new Set(entries.map(entry => entry.id))
  const children = new Map<string, LoreEntry[]>()
  const roots: LoreEntry[] = []
  const byName = (a: LoreEntry, b: LoreEntry) => a.name.localeCompare(b.name)

  entries.forEach(entry => {
    if (!entry.parentEntryId || !entryIds.has(entry.parentEntryId) || entry.parentEntryId === entry.id) {
      roots.push(entry)
      return
    }
    const siblings = children.get(entry.parentEntryId) ?? []
    siblings.push(entry)
    children.set(entry.parentEntryId, siblings)
  })

  roots.sort(byName)
  children.forEach(siblings => siblings.sort(byName))
  const ordered: { entry: LoreEntry; depth: number }[] = []
  const visited = new Set<string>()
  const visit = (entry: LoreEntry, depth: number) => {
    if (visited.has(entry.id)) return
    visited.add(entry.id)
    ordered.push({ entry, depth })
    children.get(entry.id)?.forEach(child => visit(child, depth + 1))
  }
  roots.forEach(entry => visit(entry, 0))
  entries.filter(entry => !visited.has(entry.id)).sort(byName).forEach(entry => visit(entry, 0))
  return ordered
}
