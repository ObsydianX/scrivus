import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { collectDocs, findNode } from './tree'
import type { DocNode, TreeNode } from './types'

export type SearchResult = {
  docId: number
  title: string
  excerpt: string
  source: string
  fileId: string
  isTrash: boolean
  trashNode?: TreeNode
  trashFolderId?: number
}

export async function searchProject(projectPath: string, tree: TreeNode[], query: string): Promise<SearchResult[]> {
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
      const filePath = await join(projectPath, dir, `${doc.file}.md`)
      const fileExists = await exists(filePath)
      if (!fileExists) continue
      const content = await readTextFile(filePath)
      const div = document.createElement('div')
      div.innerHTML = content
      const text = div.textContent ?? ''
      const idx = text.toLowerCase().indexOf(q)
      if (idx === -1) continue
      const start = Math.max(0, idx - 60)
      const end = Math.min(text.length, idx + query.length + 60)
      const excerpt = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
      results.push({
        docId: doc.id,
        title: doc.title,
        excerpt,
        source,
        fileId: doc.file,
        isTrash,
        trashNode,
        trashFolderId,
      })
    }
  }

  const manuscript = findNode(tree, 1)
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
