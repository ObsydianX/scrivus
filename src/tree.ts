import type { DocNode, DropTarget, FolderNode, TreeNode } from './types'

export function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'folder') {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

export function findParentFolder(nodes: TreeNode[], id: number, parent: FolderNode | null = null): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return parent
    if (n.type === 'folder') {
      const found = findParentFolder(n.children, id, n)
      if (found !== null) return found
    }
  }
  return null
}

export function collectDocs(node: TreeNode): DocNode[] {
  if (node.type === 'doc') return [node]
  const results: DocNode[] = []
  for (const child of node.children) {
    results.push(...collectDocs(child))
  }
  return results
}

export function getMaxTreeId(nodes: TreeNode[]): number {
  let maxId = 0
  for (const node of nodes) {
    if (node.id > maxId) maxId = node.id
    if (node.type === 'folder') {
      const childMax = getMaxTreeId(node.children)
      if (childMax > maxId) maxId = childMax
    }
  }
  return maxId
}

export function removeNode(nodes: TreeNode[], id: number): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) { nodes.splice(i, 1); return true }
    if (nodes[i].type === 'folder') {
      if (removeNode((nodes[i] as FolderNode).children, id)) return true
    }
  }
  return false
}

export function insertNode(nodes: TreeNode[], node: TreeNode, target: NonNullable<DropTarget>): TreeNode[] {
  if (target.type === 'inside') {
    return nodes.map(n => {
      if (n.id === target.id && n.type === 'folder') {
        return { ...n, children: [...n.children, node] }
      }
      if (n.type === 'folder') {
        return { ...n, children: insertNode(n.children, node, target) }
      }
      return n
    })
  }
  const result: TreeNode[] = []
  for (const n of nodes) {
    if (target.type === 'before' && n.id === target.id) result.push(node)
    if (n.type === 'folder') {
      result.push({ ...n, children: insertNode(n.children, node, target) })
    } else {
      result.push(n)
    }
    if (target.type === 'after' && n.id === target.id) result.push(node)
  }
  return result
}
