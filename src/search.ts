import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { htmlFragmentText } from './html'
import { collectDocs, findNode } from './tree'
import { parseSceneTabs } from './sceneTabs'
import type { DocNode, TreeNode } from './types'

export type SearchResult = {
  docId: number
  title: string
  excerpt: string
  source: string
  fileId: string
  tabIndex: number
  tabName: string
  matchIndex: number
  matchLength: number
  isTrash: boolean
  trashNode?: TreeNode
  trashFolderId?: number
}

type SearchTabCacheEntry = {
  name: string
  text: string
  lowerText: string
}

const sceneSearchCache = new Map<string, SearchTabCacheEntry[]>()

function cacheKey(projectPath: string, fileId: string) {
  return `${projectPath}\u0000${fileId}`
}

function sceneTextFromHtml(html: string) {
  return htmlFragmentText(html)
}

async function getSearchTabs(projectPath: string, doc: DocNode, dir: 'scenes' | 'trash') {
  const filePath = await join(projectPath, dir, `${doc.file}.md`)
  const fileExists = await exists(filePath)
  if (!fileExists) return []

  const key = cacheKey(projectPath, doc.file)
  if (dir === 'scenes') {
    const cached = sceneSearchCache.get(key)
    if (cached) return cached
  }

  const raw = await readTextFile(filePath)
  const searchTabs = parseSceneTabs(raw).map(tab => {
    const text = sceneTextFromHtml(tab.content)
    return {
      name: tab.name,
      text,
      lowerText: text.toLowerCase(),
    }
  })

  if (dir === 'scenes') sceneSearchCache.set(key, searchTabs)
  return searchTabs
}

export function invalidateSceneSearchCache(projectPath: string, fileId: string) {
  sceneSearchCache.delete(cacheKey(projectPath, fileId))
}

// With no argument, drops the entire cache (used when switching projects, so
// entries from previously opened projects don't accumulate for the session).
export function clearProjectSearchCache(projectPath?: string) {
  if (projectPath === undefined) {
    sceneSearchCache.clear()
    return
  }
  const prefix = `${projectPath}\u0000`
  for (const key of sceneSearchCache.keys()) {
    if (key.startsWith(prefix)) sceneSearchCache.delete(key)
  }
}

export async function searchProject(projectPath: string, tree: TreeNode[], query: string, manuscriptFolderId = 1): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const results: SearchResult[] = []
  const q = query.toLowerCase()

  const searchDocs = async (
    docs: DocNode[],
    source: string,
    isTrash = false,
    trashNode?: TreeNode,
    trashFolderId?: number
  ) => {
    for (const doc of docs) {
      const dir = isTrash ? 'trash' : 'scenes'
      const tabs = await getSearchTabs(projectPath, doc, dir)
      for (const [tabIndex, tab] of tabs.entries()) {
        const idx = tab.lowerText.indexOf(q)
        if (idx === -1) continue
        const start = Math.max(0, idx - 60)
        const end = Math.min(tab.text.length, idx + query.length + 60)
        const excerpt = (start > 0 ? '...' : '') + tab.text.slice(start, end) + (end < tab.text.length ? '...' : '')
        results.push({
          docId: doc.id,
          title: doc.title,
          excerpt,
          source,
          fileId: doc.file,
          tabIndex,
          tabName: tab.name,
          matchIndex: idx,
          matchLength: query.length,
          isTrash,
          trashNode,
          trashFolderId,
        })
      }
    }
  }

  const manuscript = findNode(tree, manuscriptFolderId)
  if (manuscript && manuscript.type === 'folder') {
    await searchDocs(collectDocs(manuscript), 'Manuscript')
  }

  const notes = findNode(tree, 2)
  if (notes && notes.type === 'folder') {
    await searchDocs(collectDocs(notes), 'Notes')
  }

  try {
    const trashDir = await join(projectPath, 'trash')
    const dirExists = await exists(trashDir)
    if (dirExists) {
      const entries = await readDir(trashDir)
      for (const entry of entries) {
        if (entry.name?.endsWith('.json')) {
          const sidecarPath = await join(projectPath, 'trash', entry.name)
          const raw = await readTextFile(sidecarPath)
          const data = JSON.parse(raw)
          const node = data.node as TreeNode
          const docs = collectDocs(node)
          await searchDocs(docs, 'Trash', true, node, data.originalFolderId)
        }
      }
    }
  } catch {
    // Search can still succeed without trash results.
  }

  return results
}
