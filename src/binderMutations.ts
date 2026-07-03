import { findNode, insertNode, removeNode } from './tree'
import type { DocNode, DropTarget, FolderNode, TreeNode } from './types'

export function cloneTree(tree: TreeNode[]): TreeNode[] {
  return JSON.parse(JSON.stringify(tree)) as TreeNode[]
}

export function toggleFolderInTree(tree: TreeNode[], id: number): TreeNode[] {
  const newTree = cloneTree(tree)
  const node = findNode(newTree, id)
  if (node && node.type === 'folder') node.open = !node.open
  return newTree
}

export function addDocToTree(tree: TreeNode[], targetFolderId: number | undefined, doc: DocNode): TreeNode[] {
  const newTree = cloneTree(tree)
  const folderId = targetFolderId ?? 1
  const target = findNode(newTree, folderId) as FolderNode | null
  if (target && target.type === 'folder') {
    target.open = true
    target.children.push(doc)
  } else {
    newTree.push(doc)
  }
  return newTree
}

export function addFolderToTree(tree: TreeNode[], targetFolderId: number | undefined, folder: FolderNode): TreeNode[] {
  const newTree = cloneTree(tree)
  const folderId = targetFolderId ?? 1
  const target = findNode(newTree, folderId) as FolderNode | null
  if (target && target.type === 'folder') {
    target.open = true
    target.children.push(folder)
  } else {
    newTree.push(folder)
  }
  return newTree
}

export function removeNodeFromTree(tree: TreeNode[], id: number): TreeNode[] {
  const newTree = cloneTree(tree)
  removeNode(newTree, id)
  return newTree
}

export function removeNodesFromTree(tree: TreeNode[], idsToRemove: number[]): TreeNode[] {
  const ids = new Set(idsToRemove.filter(id => id !== 1 && id !== 2))
  return removeNodes(cloneTree(tree), ids)
}

export function renameNodeInTree(tree: TreeNode[], id: number, label: string): TreeNode[] {
  const newTree = cloneTree(tree)
  const node = findNode(newTree, id)
  if (node) {
    node.label = label
    if (node.type === 'doc') node.title = label
  }
  return newTree
}

export function setFolderRoleInTree(tree: TreeNode[], id: number, role: NonNullable<FolderNode['role']>): TreeNode[] {
  const newTree = cloneTree(tree)
  const node = findNode(newTree, id)
  if (node && node.type === 'folder') node.role = role
  return newTree
}

export function moveNodeInTree(tree: TreeNode[], draggedId: number, dropTarget: NonNullable<DropTarget>): TreeNode[] | null {
  const newTree = cloneTree(tree)
  const dragged = findNode(newTree, draggedId)
  if (!dragged) return null
  // Dropping a node onto or next to its own descendant would orphan it:
  // the node is removed first, so the insert target no longer exists.
  if (containsNode(dragged, dropTarget.id)) return null
  removeNode(newTree, draggedId)
  return insertNode(newTree, dragged, dropTarget)
}

function containsNode(node: TreeNode, id: number): boolean {
  if (node.id === id) return true
  return node.type === 'folder' && node.children.some(child => containsNode(child, id))
}

function collectTopLevelMoveNodes(nodes: TreeNode[], ids: Set<number>, moved: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    if (ids.has(node.id)) {
      moved.push(node)
      continue
    }
    if (node.type === 'folder') collectTopLevelMoveNodes(node.children, ids, moved)
  }
  return moved
}

function removeNodes(nodes: TreeNode[], ids: Set<number>): TreeNode[] {
  return nodes
    .filter(node => !ids.has(node.id))
    .map(node => node.type === 'folder'
      ? { ...node, children: removeNodes(node.children, ids) }
      : node)
}

function insertNodes(nodes: TreeNode[], moving: TreeNode[], target: NonNullable<DropTarget>): TreeNode[] {
  if (target.type === 'inside') {
    return nodes.map(node => {
      if (node.id === target.id && node.type === 'folder') {
        return { ...node, open: true, children: [...node.children, ...moving] }
      }
      if (node.type === 'folder') {
        return { ...node, children: insertNodes(node.children, moving, target) }
      }
      return node
    })
  }

  const result: TreeNode[] = []
  for (const node of nodes) {
    if (target.type === 'before' && node.id === target.id) result.push(...moving)
    result.push(node.type === 'folder'
      ? { ...node, children: insertNodes(node.children, moving, target) }
      : node)
    if (target.type === 'after' && node.id === target.id) result.push(...moving)
  }
  return result
}

export function moveNodesInTree(tree: TreeNode[], draggedIds: number[], dropTarget: NonNullable<DropTarget>): TreeNode[] | null {
  const ids = new Set(draggedIds.filter(id => id !== 1 && id !== 2))
  if (ids.size === 0 || ids.has(dropTarget.id)) return null

  const newTree = cloneTree(tree)
  const moving = collectTopLevelMoveNodes(newTree, ids)
  if (moving.length === 0) return null
  if (moving.some(node => containsNode(node, dropTarget.id))) return null

  const movingIds = new Set(moving.map(node => node.id))
  const withoutMoving = removeNodes(newTree, movingIds)
  return insertNodes(withoutMoving, moving, dropTarget)
}

export async function duplicateNodeInTree(
  tree: TreeNode[],
  id: number,
  allocateId: () => number,
  copyDoc: (doc: DocNode) => Promise<string>
): Promise<TreeNode[]> {
  const cloneNode = async (node: TreeNode): Promise<TreeNode> => {
    const newId = allocateId()
    if (node.type === 'doc') {
      const newFileId = await copyDoc(node)
      return { ...node, id: newId, file: newFileId, label: `${node.label} (copy)`, title: `${node.title} (copy)` }
    }

    const clonedChildren = await Promise.all(node.children.map(cloneNode))
    return { ...node, id: newId, label: `${node.label} (copy)`, children: clonedChildren }
  }

  const newTree = cloneTree(tree)

  const insertAfter = async (nodes: TreeNode[]): Promise<boolean> => {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].id === id) {
        const clone = await cloneNode(nodes[i])
        nodes.splice(i + 1, 0, clone)
        return true
      }
      const node = nodes[i]
      if (node.type === 'folder') {
        if (await insertAfter(node.children)) return true
      }
    }
    return false
  }

  await insertAfter(newTree)
  return newTree
}

export async function duplicateNodesInTree(
  tree: TreeNode[],
  idsToDuplicate: number[],
  allocateId: () => number,
  copyDoc: (doc: DocNode) => Promise<string>
): Promise<TreeNode[]> {
  const selectedIds = new Set(idsToDuplicate.filter(id => id !== 1 && id !== 2))
  if (selectedIds.size === 0) return cloneTree(tree)

  const cloneNode = async (node: TreeNode): Promise<TreeNode> => {
    const newId = allocateId()
    if (node.type === 'doc') {
      const newFileId = await copyDoc(node)
      return { ...node, id: newId, file: newFileId, label: `${node.label} (copy)`, title: `${node.title} (copy)` }
    }

    const clonedChildren = await Promise.all(node.children.map(cloneNode))
    return { ...node, id: newId, label: `${node.label} (copy)`, children: clonedChildren }
  }

  const insertCopies = async (nodes: TreeNode[], ancestorSelected = false): Promise<TreeNode[]> => {
    const result: TreeNode[] = []
    for (const node of nodes) {
      const isSelected = selectedIds.has(node.id)
      const nextNode = node.type === 'folder'
        ? { ...node, children: await insertCopies(node.children, ancestorSelected || isSelected) }
        : node
      result.push(nextNode)
      if (isSelected && !ancestorSelected) {
        result.push(await cloneNode(node))
      }
    }
    return result
  }

  return insertCopies(cloneTree(tree))
}
