import type { OutlineRow, TreeNode } from './types'
import { normalizeSceneMetadata } from './constants'

export type FolderProgress = { scenes: number; complete: number; needsWork: number; words: number; completeWords: number }

export function getFolderProgress(tree: TreeNode[], wordCounts: Record<number, number>) {
  const folders = new Map<number, FolderProgress>()
  const collect = (node: TreeNode): FolderProgress => {
    if (node.type === 'doc') {
      const status = normalizeSceneMetadata(node.metadata).status
      const words = Math.max(0, wordCounts[node.id] ?? 0)
      return { scenes: 1, complete: status === 'complete' ? 1 : 0, needsWork: status === 'needsWork' ? 1 : 0, words, completeWords: status === 'complete' ? words : 0 }
    }
    const total: FolderProgress = { scenes: 0, complete: 0, needsWork: 0, words: 0, completeWords: 0 }
    for (const child of node.children) {
      const progress = collect(child)
      for (const key of Object.keys(total) as (keyof FolderProgress)[]) total[key] += progress[key]
    }
    folders.set(node.id, total)
    return total
  }
  tree.forEach(collect)
  return folders
}

export function getFolderProgressDisplay(progress: FolderProgress) {
  const done = progress.scenes > 0 && progress.complete === progress.scenes
  const ratio = progress.words > 0 ? progress.completeWords / progress.words : progress.scenes > 0 ? progress.complete / progress.scenes : 0
  const fill = !done && ratio >= 1 ? .95 : ratio
  const basis = progress.words > 0 ? 'words' : 'scenes'
  const label = progress.scenes === 0 ? 'No scenes' :     `${Math.round(ratio * 100)}% of ${basis} complete · ${progress.complete} of ${progress.scenes} scenes complete · ${progress.needsWork} needs work`
  return { done, fill, label }
}

export function getOutlineFolderProgress(rows: OutlineRow[]) {
  const folders = new Map<number, FolderProgress>()
  const ancestors: OutlineRow[] = []
  for (const row of rows) {
    while (ancestors.length && ancestors[ancestors.length - 1].depth >= row.depth) ancestors.pop()
    if (row.type === 'chapter') {
      folders.set(row.id, { scenes: 0, complete: 0, needsWork: 0, words: 0, completeWords: 0 })
      ancestors.push(row)
    } else {
      for (const ancestor of ancestors) {
        const total = folders.get(ancestor.id)!
        const words = Math.max(0, row.wordCount)
        total.scenes++
        total.words += words
        if (row.status === 'complete') { total.complete++; total.completeWords += words }
        if (row.status === 'needsWork') total.needsWork++
      }
    }
  }
  return folders
}
