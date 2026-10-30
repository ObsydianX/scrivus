import type { LoreSubcategory } from './types'

export type OrderedLoreSubcategory = LoreSubcategory & { depth: number }

// Cleans references from imported/older data and breaks cycles deterministically.
export function normalizeLoreSubcategories(subcategories: LoreSubcategory[]): LoreSubcategory[] {
  const ids = new Set(subcategories.map(subcategory => subcategory.id))
  const parents = new Map<string, string | undefined>()

  return subcategories.map(subcategory => {
    let parentId = subcategory.parentId
    if (!parentId || parentId === subcategory.id || !ids.has(parentId)) parentId = undefined

    const visited = new Set([subcategory.id])
    let ancestorId = parentId
    while (ancestorId) {
      if (visited.has(ancestorId)) {
        parentId = undefined
        break
      }
      visited.add(ancestorId)
      ancestorId = parents.get(ancestorId)
        ?? subcategories.find(candidate => candidate.id === ancestorId)?.parentId
    }
    parents.set(subcategory.id, parentId)
    return parentId ? { ...subcategory, parentId } : { ...subcategory, parentId: undefined }
  })
}

export function orderLoreSubcategories(subcategories: LoreSubcategory[]): OrderedLoreSubcategory[] {
  const normalized = normalizeLoreSubcategories(subcategories)
  const byParent = new Map<string | undefined, LoreSubcategory[]>()
  normalized.forEach(subcategory => {
    const siblings = byParent.get(subcategory.parentId) ?? []
    siblings.push(subcategory)
    byParent.set(subcategory.parentId, siblings)
  })
  // Array order is the user's saved drag-and-drop order. Keep that order among
  // siblings while displaying descendants immediately below their parent.

  const ordered: OrderedLoreSubcategory[] = []
  const appendChildren = (parentId: string | undefined, depth: number) => {
    for (const subcategory of byParent.get(parentId) ?? []) {
      ordered.push({ ...subcategory, depth })
      appendChildren(subcategory.id, depth + 1)
    }
  }
  appendChildren(undefined, 0)
  return ordered
}

export function getInvalidLoreParentIds(subcategories: LoreSubcategory[], subcategoryId: string): Set<string> {
  const invalid = new Set([subcategoryId])
  let changed = true
  while (changed) {
    changed = false
    subcategories.forEach(candidate => {
      if (candidate.parentId && invalid.has(candidate.parentId) && !invalid.has(candidate.id)) {
        invalid.add(candidate.id)
        changed = true
      }
    })
  }
  return invalid
}
