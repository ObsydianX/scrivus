import type { OutlineRow } from './types'

// Recompute folder totals from scenes so live edits do not leave a stale chapter
// total or double-count nested acts/chapters from the last Outline snapshot.
export function getBinderWordCounts(rows: OutlineRow[], activeId: number | null, liveCount: number, savedCounts: ReadonlyMap<number, number> = new Map()) {
  const counts: Record<number, number> = {}
  const ancestors: OutlineRow[] = []
  for (const row of rows) {
    while (ancestors.length && ancestors[ancestors.length - 1].depth >= row.depth) ancestors.pop()
    if (row.type === 'chapter') {
      counts[row.id] = 0
      ancestors.push(row)
    } else {
      const count = row.id === activeId ? liveCount : savedCounts.get(row.id) ?? row.wordCount
      counts[row.id] = count
      for (const ancestor of ancestors) counts[ancestor.id] += count
    }
  }
  return counts
}
