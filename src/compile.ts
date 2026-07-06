import { parseSceneTabs } from './sceneTabs'
import { readSceneFile } from './storage'
import type { CompileChapterEntry, CompileSceneEntry, DocNode, FolderNode, TreeNode } from './types'

type CompileNode =
  | { type: 'heading'; label: string; role: 'act' | 'chapter'; depth: number }
  | { type: 'body'; label: string; html: string }

type CompileSelectionOptions = {
  includeActHeadings?: boolean
}

function folderRole(folder: FolderNode): 'act' | 'chapter' {
  return folder.role ?? 'chapter'
}

async function buildSceneEntry(doc: DocNode, projectPath: string): Promise<CompileSceneEntry> {
  const raw = await readSceneFile(projectPath, doc.file)
  const tabs = parseSceneTabs(raw)
  const tabNames = tabs.map(t => t.name)
  return {
    docId: doc.id,
    fileId: doc.file,
    label: doc.label,
    tabs: tabNames,
    selectedTab: tabNames[tabNames.length - 1],
    included: true,
  }
}

export async function buildCompileChapters(
  tree: TreeNode[],
  projectPath: string,
  manuscriptFolderId = 1,
): Promise<CompileChapterEntry[]> {
  const findFolder = (nodes: TreeNode[]): FolderNode | null => {
    for (const node of nodes) {
      if (node.id === manuscriptFolderId && node.type === 'folder') return node
      if (node.type === 'folder') {
        const found = findFolder(node.children)
        if (found) return found
      }
    }
    return null
  }
  const manuscript = findFolder(tree)
  if (!manuscript || manuscript.type !== 'folder') return []

  const entries: CompileChapterEntry[] = []

  const visit = async (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 'folder') {
        const directScenes: CompileSceneEntry[] = []
        for (const child of node.children) {
          if (child.type === 'doc') directScenes.push(await buildSceneEntry(child, projectPath))
        }

        entries.push({
          folderId: node.id,
          label: node.label,
          role: folderRole(node),
          depth,
          included: true,
          scenes: directScenes,
        })

        await visit(node.children.filter(child => child.type === 'folder'), depth + 1)
        continue
      }

      const scene = await buildSceneEntry(node, projectPath)
      entries.push({
        folderId: node.id,
        label: node.label,
        role: 'chapter',
        depth,
        included: true,
        scenes: [scene],
      })
    }
  }

  await visit(manuscript.children, 0)
  return entries
}

export async function collectCompileNodesFromSelection(
  chapters: CompileChapterEntry[],
  projectPath: string,
  options: CompileSelectionOptions = {}
): Promise<CompileNode[]> {
  const result: CompileNode[] = []
  const includeActHeadings = options.includeActHeadings ?? true

  const hasIncludedDescendant = (index: number) => {
    const parentDepth = chapters[index].depth ?? 0
    for (let i = index + 1; i < chapters.length; i++) {
      const depth = chapters[i].depth ?? 0
      if (depth <= parentDepth) return false
      if (chapters[i].included && chapters[i].scenes.some(scene => scene.included)) return true
    }
    return false
  }

  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index]
    if (!chapter.included) continue
    const includedScenes = chapter.scenes.filter(s => s.included)
    if (includedScenes.length === 0 && !hasIncludedDescendant(index)) continue

    const isRealChapter = chapter.scenes.length > 1 || chapter.folderId !== chapter.scenes[0]?.docId
    const role = chapter.role ?? 'chapter'
    if (isRealChapter && (role !== 'act' || includeActHeadings)) {
      result.push({
        type: 'heading',
        label: chapter.label,
        role,
        depth: chapter.depth ?? 0,
      })
    }

    for (const scene of includedScenes) {
      const raw = await readSceneFile(projectPath, scene.fileId)
      const tabs = parseSceneTabs(raw)
      const tab = scene.selectedTab === '__last__'
        ? tabs[tabs.length - 1]
        : (tabs.find(t => t.name === scene.selectedTab) ?? tabs[tabs.length - 1])
      const html = tab?.content ?? ''
      if (html.trim()) result.push({ type: 'body', label: scene.label, html })
    }
  }

  return result
}
