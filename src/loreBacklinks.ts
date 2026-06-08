import { parseSceneTabs } from './sceneTabs'
import { readSceneFile } from './storage'
import { collectDocs, findNode } from './tree'
import { htmlToPlainText } from './wordCount'
import type { LoreBook, TreeNode } from './types'

export type LoreBacklink = {
  entryId: string
  sceneId: number
  sceneTitle: string
  tabName: string
  excerpt: string
  matchCount: number
}

const MIN_TERM_LENGTH = 3
const MAX_EXCERPT_RADIUS = 58

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getTermVariants(term: string) {
  const trimmed = term.trim()
  const variants = new Set([trimmed, `${trimmed}'s`, `${trimmed}\u2019s`, `${trimmed}s`, `${trimmed}s'`, `${trimmed}s\u2019`])
  if (/y$/i.test(trimmed) && trimmed.length > 1) {
    variants.add(`${trimmed.slice(0, -1)}ies`)
  }
  return Array.from(variants)
}

function getEntryTerms(name: string, keywords: string[] | undefined) {
  const terms = new Set<string>()
  ;[name, ...(keywords ?? [])].forEach(term => {
    const clean = term.trim()
    if (clean.length >= MIN_TERM_LENGTH) terms.add(clean)
  })
  return Array.from(terms).sort((a, b) => b.length - a.length)
}

function buildTermPattern(terms: string[]) {
  const variants = terms.flatMap(getTermVariants).sort((a, b) => b.length - a.length)
  if (variants.length === 0) return null
  return new RegExp(`(^|[^\\p{L}\\p{N}_])(${variants.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'giu')
}

function buildExcerpt(text: string, index: number, length: number) {
  const start = Math.max(0, index - MAX_EXCERPT_RADIUS)
  const end = Math.min(text.length, index + length + MAX_EXCERPT_RADIUS)
  return `${start > 0 ? '...' : ''}${text.slice(start, end).trim()}${end < text.length ? '...' : ''}`
}

export async function buildLoreBacklinks(
  projectPath: string,
  tree: TreeNode[],
  loreBook: LoreBook,
): Promise<Record<string, LoreBacklink[]>> {
  const manuscript = findNode(tree, 1)
  const docs = manuscript?.type === 'folder' ? collectDocs(manuscript) : []
  const entries = loreBook.categories.flatMap(category => category.entries)
  const patterns = entries
    .map(entry => ({ entry, pattern: buildTermPattern(getEntryTerms(entry.name, entry.keywords)) }))
    .filter((item): item is { entry: typeof entries[number]; pattern: RegExp } => item.pattern !== null)

  const backlinks: Record<string, LoreBacklink[]> = {}
  if (docs.length === 0 || patterns.length === 0) return backlinks

  for (const doc of docs) {
    const tabs = parseSceneTabs(await readSceneFile(projectPath, doc.file))
    const tab = tabs[tabs.length - 1] ?? tabs[0]
    const text = htmlToPlainText(tab?.content ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    for (const { entry, pattern } of patterns) {
      pattern.lastIndex = 0
      const firstMatch = pattern.exec(text)
      if (!firstMatch) continue

      const prefixLength = firstMatch[1]?.length ?? 0
      const firstIndex = firstMatch.index + prefixLength
      let matchCount = 1
      while (pattern.exec(text)) matchCount += 1

      backlinks[entry.id] = backlinks[entry.id] ?? []
      backlinks[entry.id].push({
        entryId: entry.id,
        sceneId: doc.id,
        sceneTitle: doc.title,
        tabName: tab?.name ?? 'Draft',
        excerpt: buildExcerpt(text, firstIndex, firstMatch[2].length),
        matchCount,
      })
    }
  }

  return backlinks
}
