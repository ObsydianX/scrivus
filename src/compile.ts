import { parseSceneTabs } from './sceneTabs'
import { readSceneFile } from './storage'
import type { CompileChapterEntry, CompileSceneEntry, TreeNode } from './types'

export async function buildCompileChapters(
  tree: TreeNode[],
  projectPath: string
): Promise<CompileChapterEntry[]> {
  const manuscript = tree.find(n => n.id === 1)
  if (!manuscript || manuscript.type !== 'folder') return []

  const chapters: CompileChapterEntry[] = []

  for (const n of manuscript.children) {
    if (n.type === 'folder') {
      const scenes: CompileSceneEntry[] = []
      for (const child of n.children) {
        if (child.type === 'doc') {
          const raw = await readSceneFile(projectPath, child.file)
          const tabs = parseSceneTabs(raw)
          const tabNames = tabs.map(t => t.name)
          scenes.push({
            docId: child.id,
            fileId: child.file,
            label: child.label,
            tabs: tabNames,
            selectedTab: tabNames[tabNames.length - 1],
            included: true,
          })
        }
      }
      chapters.push({
        folderId: n.id,
        label: n.label,
        included: true,
        scenes,
      })
    } else if (n.type === 'doc') {
      const raw = await readSceneFile(projectPath, n.file)
      const tabs = parseSceneTabs(raw)
      const tabNames = tabs.map(t => t.name)
      chapters.push({
        folderId: n.id,
        label: n.label,
        included: true,
        scenes: [{
          docId: n.id,
          fileId: n.file,
          label: n.label,
          tabs: tabNames,
          selectedTab: tabNames[tabNames.length - 1],
          included: true,
        }],
      })
    }
  }

  return chapters
}

export async function collectCompileNodesFromSelection(
  chapters: CompileChapterEntry[],
  projectPath: string
): Promise<({ type: 'heading'; label: string } | { type: 'body'; html: string })[]> {
  const result: ({ type: 'heading'; label: string } | { type: 'body'; html: string })[] = []

  for (const chapter of chapters) {
    if (!chapter.included) continue
    const includedScenes = chapter.scenes.filter(s => s.included)
    if (includedScenes.length === 0) continue

    const isRealChapter = chapter.scenes.length > 1 || chapter.folderId !== chapter.scenes[0]?.docId
    if (isRealChapter) {
      result.push({ type: 'heading', label: chapter.label })
    }

    for (const scene of includedScenes) {
      const raw = await readSceneFile(projectPath, scene.fileId)
      const tabs = parseSceneTabs(raw)
      const tab = scene.selectedTab === '__last__'
        ? tabs[tabs.length - 1]
        : (tabs.find(t => t.name === scene.selectedTab) ?? tabs[tabs.length - 1])
      const html = tab?.content ?? ''
      if (html.trim()) result.push({ type: 'body', html })
    }
  }

  return result
}
