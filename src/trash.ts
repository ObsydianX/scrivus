import { exists, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { cloneTree } from './binderMutations'
import { collectDocs, findNode } from './tree'
import type { DocNode, FolderNode, TreeNode } from './types'

export type TrashItem = {
  sidecarId: string
  label: string
  node: TreeNode
  originalFolderId: number
}

export async function loadTrashItems(projectPath: string): Promise<TrashItem[]> {
  try {
    const trashDir = await join(projectPath, 'trash')
    const dirExists = await exists(trashDir)
    if (!dirExists) return []
    const entries = await readDir(trashDir)
    const items: TrashItem[] = []
    for (const entry of entries) {
      if (entry.name?.endsWith('.json')) {
        const sidecarId = entry.name.replace('.json', '')
        const sidecarPath = await join(trashDir, entry.name)
        const raw = await readTextFile(sidecarPath)
        const data = JSON.parse(raw)
        items.push({
          sidecarId,
          label: data.node.label,
          node: data.node,
          originalFolderId: data.originalFolderId,
        })
      }
    }
    return items
  } catch {
    return []
  }
}

export async function restoreTrashItem({
  projectPath,
  tree,
  sidecarId,
  node,
  originalFolderId,
  parentSidecarId,
}: {
  projectPath: string
  tree: TreeNode[]
  sidecarId: string
  node: TreeNode
  originalFolderId: number
  parentSidecarId?: string
}): Promise<{ tree: TreeNode[]; trashItems: TrashItem[] }> {
  const docs = collectDocs(node)

  for (const doc of docs) {
    const from = await join(projectPath, 'trash', `${doc.file}.md`)
    const to = await join(projectPath, 'scenes', `${doc.file}.md`)
    const fileExists = await exists(from)
    if (fileExists) await rename(from, to)
  }

  let parentFolderNode: FolderNode | null = null
  let originalChildOrder: number[] = []

  if (parentSidecarId) {
    const sidecarPath = await join(projectPath, 'trash', `${parentSidecarId}.json`)
    const sidecarExists = await exists(sidecarPath)
    if (sidecarExists) {
      const raw = await readTextFile(sidecarPath)
      const data = JSON.parse(raw)

      if (data.node.type === 'folder') {
        parentFolderNode = cloneTree([data.node])[0] as FolderNode
      }

      originalChildOrder = data.originalChildren ??
        (data.node.type === 'folder' ? data.node.children.map((child: TreeNode) => child.id) : [])

      const removeFromNode = (current: TreeNode, id: number): TreeNode | null => {
        if (current.type !== 'folder') return current
        const filtered = current.children.filter(child => child.id !== id)
        if (filtered.length !== current.children.length) {
          return { ...current, children: filtered }
        }
        return { ...current, children: current.children.map(child => removeFromNode(child, id)).filter(Boolean) as TreeNode[] }
      }

      const updatedNode = removeFromNode(data.node, node.id)
      const remaining = updatedNode ? collectDocs(updatedNode) : []
      if (remaining.length === 0) {
        await remove(sidecarPath)
      } else {
        await writeTextFile(sidecarPath, JSON.stringify({ ...data, node: updatedNode }, null, 2))
      }
    }
  } else {
    const sidecar = await join(projectPath, 'trash', `${sidecarId}.json`)
    const sidecarExists = await exists(sidecar)
    if (sidecarExists) await remove(sidecar)
  }

  const newTree = cloneTree(tree)
  const manuscript = findNode(newTree, 1) as FolderNode | null

  if (parentFolderNode) {
    const existingFolder = findNode(newTree, parentFolderNode.id) as FolderNode | null
    if (existingFolder && existingFolder.type === 'folder') {
      existingFolder.children.push(node)
      existingFolder.children.sort((a, b) => {
        const ai = originalChildOrder.indexOf(a.id)
        const bi = originalChildOrder.indexOf(b.id)
        return ai - bi
      })
    } else {
      const restoredFolder: FolderNode = {
        id: parentFolderNode.id,
        type: 'folder',
        label: parentFolderNode.label,
        open: true,
        children: [node],
      }
      if (manuscript) {
        manuscript.children.push(restoredFolder)
      } else {
        newTree.push(restoredFolder)
      }
    }
  } else {
    const targetFolder = findNode(newTree, originalFolderId) as FolderNode | null
    if (targetFolder && targetFolder.type === 'folder') {
      targetFolder.children.push(node)
    } else if (manuscript) {
      manuscript.children.push(node)
    } else {
      newTree.push(node)
    }
  }

  return {
    tree: newTree,
    trashItems: await loadTrashItems(projectPath),
  }
}

export async function permanentlyDeleteTrashItem(projectPath: string, sidecarId: string, node: TreeNode) {
  const docs = collectDocs(node)

  for (const doc of docs) {
    const filePath = await join(projectPath, 'trash', `${doc.file}.md`)
    const fileExists = await exists(filePath)
    if (fileExists) await remove(filePath)
  }

  const sidecar = await join(projectPath, 'trash', `${sidecarId}.json`)
  const sidecarExists = await exists(sidecar)
  if (sidecarExists) await remove(sidecar)
}

export async function emptyTrashFolder(projectPath: string) {
  const trashDir = await join(projectPath, 'trash')
  const dirExists = await exists(trashDir)
  if (!dirExists) return
  const entries = await readDir(trashDir)
  for (const entry of entries) {
    if (entry.name) {
      const filePath = await join(trashDir, entry.name)
      await remove(filePath)
    }
  }
}

export async function readTrashPreviewContent(projectPath: string, doc: DocNode): Promise<string> {
  const scenePath = await join(projectPath, 'scenes', `${doc.file}.md`)
  const sceneExists = await exists(scenePath)
  if (sceneExists) return readTextFile(scenePath)

  const trashPath = await join(projectPath, 'trash', `${doc.file}.md`)
  const trashExists = await exists(trashPath)
  if (trashExists) return readTextFile(trashPath)

  return ''
}
