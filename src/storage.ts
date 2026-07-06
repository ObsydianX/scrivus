import { writeTextFile, readTextFile, mkdir, exists, writeFile, readFile, rename, remove } from '@tauri-apps/plugin-fs'
import { join, appDataDir } from '@tauri-apps/api/path'
import {
  DEFAULT_ATLAS,
  DEFAULT_MIND_MAP,
  DEFAULT_PROJECT_SETTINGS,
  DEFAULT_STYLES,
  PROJECT_FORMAT_VERSION,
  SCRIVUS_VERSION,
  normalizeManuscripts,
  normalizeAtlas,
  normalizeMindMap,
  normalizeProjectSettings,
  normalizeProjectStyles,
  normalizeWritingStats,
} from './constants'
import { getNextIdValue } from './idCounter'
import { invalidateSceneSearchCache } from './search'
import { collectDocs, getMaxTreeId } from './tree'
import type {
  ChecklistItem,
  Atlas,
  FolderNode,
  LoreBook,
  MindMap,
  Manuscript,
  Project,
  ProjectStyles,
  RevisionComment,
  TreeNode,
} from './types'

export type ReviewSnapshotScene = {
  sceneId: number
  fileId: string
  title: string
  chapterTitle: string
  tabIndex: number
  tabName: string
  content: string
}

export type ReviewSnapshot = {
  reviewId: string
  projectName: string
  reviewerName: string
  createdAt: string
  manuscriptId: string
  manuscriptTitle: string
  scenes: ReviewSnapshotScene[]
}

// Writes to a temp file in the same directory, then renames it over the target,
// so a crash or power loss mid-write can never leave a truncated file behind.
async function atomicWriteTextFile(filePath: string, content: string) {
  const tempPath = `${filePath}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.tmp`
  await writeTextFile(tempPath, content)
  await rename(tempPath, filePath)
}

export async function saveProjectToDisk(project: Project, activeId?: number, activeTabIndex?: number) {
  const nextId = Math.max(getNextIdValue(), getMaxTreeId(project.tree) + 1, 10)
  const manuscripts = normalizeManuscripts(
    project.manuscripts,
    project.name,
    project.settings,
    project.compileSelections,
    project.compileIncludes,
    project.compileCollapsed,
  )
  const activeManuscriptId = manuscripts.some(manuscript => manuscript.id === project.activeManuscriptId)
    ? project.activeManuscriptId
    : manuscripts[0].id
  const projectJson = {
    name: project.name,
    scrivusVersion: SCRIVUS_VERSION,
    projectFormatVersion: PROJECT_FORMAT_VERSION,
    tree: project.tree,
    nextId,
    lastActiveId: activeId ?? null,
    lastActiveTabIndex: activeTabIndex ?? project.lastActiveTabIndex ?? 0,
    styles: project.styles,
    settings: normalizeProjectSettings(project.settings ?? DEFAULT_PROJECT_SETTINGS),
    manuscripts,
    activeManuscriptId,
    compileSelections: project.compileSelections ?? {},
    compileIncludes: project.compileIncludes ?? {},
    compileCollapsed: project.compileCollapsed ?? {},
    writingStats: normalizeWritingStats(project.writingStats),
  }
  const projectFile = await join(project.path, 'project.json')
  await atomicWriteTextFile(projectFile, JSON.stringify(projectJson, null, 2))
}

export async function loadRecentProjects(): Promise<{ name: string; path: string }[]> {
  try {
    const appData = await appDataDir()
    await mkdir(appData, { recursive: true })
    const recentFile = await join(appData, 'recent.json')
    const fileExists = await exists(recentFile)
    if (!fileExists) return []
    const raw = await readTextFile(recentFile)
    const data = JSON.parse(raw)
    return data.recents ?? []
  } catch {
    return []
  }
}

export async function saveRecentProjects(recents: { name: string; path: string }[]) {
  try {
    const appData = await appDataDir()
    await mkdir(appData, { recursive: true })
    const recentFile = await join(appData, 'recent.json')
    const existing = await loadRecentData()
    await atomicWriteTextFile(recentFile, JSON.stringify({ ...existing, recents }, null, 2))
  } catch {
    // silently fail
  }
}

export async function loadRecentData(): Promise<{ recents: { name: string; path: string }[]; defaultStyles: ProjectStyles }> {
  try {
    const appData = await appDataDir()
    const recentFile = await join(appData, 'recent.json')
    const fileExists = await exists(recentFile)
    if (!fileExists) return { recents: [], defaultStyles: DEFAULT_STYLES }
    const raw = await readTextFile(recentFile)
    const data = JSON.parse(raw)
    return {
      recents: data.recents ?? [],
      defaultStyles: normalizeProjectStyles(data.defaultStyles),
    }
  } catch {
    return { recents: [], defaultStyles: DEFAULT_STYLES }
  }
}

export async function saveDefaultStyles(styles: ProjectStyles) {
  try {
    const appData = await appDataDir()
    await mkdir(appData, { recursive: true })
    const recentFile = await join(appData, 'recent.json')
    const existing = await loadRecentData()
    await atomicWriteTextFile(recentFile, JSON.stringify({ ...existing, defaultStyles: styles }, null, 2))
  } catch {
    // silently fail
  }
}

export async function addToRecentProjects(name: string, path: string) {
  const { recents } = await loadRecentData()
  const filtered = recents.filter(r => r.path !== path)
  const updated = [{ name, path }, ...filtered].slice(0, 8)
  await saveRecentProjects(updated)
}

// Tracks ids handed out this session so bulk operations (imports, duplicates)
// can never collide with each other, however unlikely.
const issuedFileIds = new Set<string>()

export function generateFileId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id: string
  do {
    id = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (issuedFileIds.has(id))
  issuedFileIds.add(id)
  return id
}

export async function writeSceneFile(projectPath: string, fileId: string, content: string) {
  const scenesDir = await join(projectPath, 'scenes')
  await mkdir(scenesDir, { recursive: true })
  const filePath = await join(scenesDir, `${fileId}.md`)
  await atomicWriteTextFile(filePath, content)
  invalidateSceneSearchCache(projectPath, fileId)
}

export async function readSceneFile(projectPath: string, fileId: string): Promise<string> {
  try {
    const filePath = await join(projectPath, 'scenes', `${fileId}.md`)
    const fileExists = await exists(filePath)
    if (!fileExists) return ''
    return await readTextFile(filePath)
  } catch {
    return ''
  }
}

export async function readNotesFile(projectPath: string): Promise<{
  quickNote: string
  checklist: ChecklistItem[]
}> {
  try {
    const filePath = await join(projectPath, 'notes.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return { quickNote: '', checklist: [] }
    const raw = await readTextFile(filePath)
    return { quickNote: '', checklist: [], ...JSON.parse(raw) }
  } catch {
    return { quickNote: '', checklist: [], }
  }
}

export async function writeNotesFile(projectPath: string, data: {
  quickNote: string
  checklist: ChecklistItem[]
}) {
  try {
    const filePath = await join(projectPath, 'notes.json')
    await atomicWriteTextFile(filePath, JSON.stringify(data, null, 2))
  } catch {
    // silently fail
  }
}

export async function readProjectDictionary(projectPath: string): Promise<string[]> {
  try {
    const filePath = await join(projectPath, 'dictionary.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return []
    const raw = await readTextFile(filePath)
    const data = JSON.parse(raw)
    return Array.isArray(data.words)
      ? data.words.filter((word: unknown): word is string => typeof word === 'string')
      : []
  } catch {
    return []
  }
}

export async function writeProjectDictionary(projectPath: string, words: string[]) {
  try {
    const filePath = await join(projectPath, 'dictionary.json')
    const uniqueWords = Array.from(new Set(words.map(word => word.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))
    await atomicWriteTextFile(filePath, JSON.stringify({ words: uniqueWords }, null, 2))
  } catch {
    // silently fail
  }
}

export async function readLoreBookFile(projectPath: string): Promise<LoreBook> {
  try {
    const filePath = await join(projectPath, 'lorebook.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return { categories: [] }
    const raw = await readTextFile(filePath)
    return { categories: [], ...JSON.parse(raw) }
  } catch {
    return { categories: [] }
  }
}

export async function writeLoreBookFile(projectPath: string, data: LoreBook) {
  try {
    const filePath = await join(projectPath, 'lorebook.json')
    await atomicWriteTextFile(filePath, JSON.stringify(data, null, 2))
  } catch {
    // silently fail
  }
}

export async function readRevisionFile(projectPath: string): Promise<RevisionComment[]> {
  try {
    const filePath = await join(projectPath, 'revision.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return []
    const raw = await readTextFile(filePath)
    return JSON.parse(raw) ?? []
  } catch {
    return []
  }
}

export async function writeRevisionFile(projectPath: string, comments: RevisionComment[]) {
  try {
    const filePath = await join(projectPath, 'revision.json')
    await atomicWriteTextFile(filePath, JSON.stringify(comments, null, 2))
  } catch {
    // silently fail
  }
}

export async function readReviewSnapshots(projectPath: string): Promise<ReviewSnapshot[]> {
  try {
    const filePath = await join(projectPath, 'reviews.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return []
    const raw = await readTextFile(filePath)
    const data = JSON.parse(raw)
    return Array.isArray(data.reviews) ? data.reviews : []
  } catch {
    return []
  }
}

export async function writeReviewSnapshots(projectPath: string, reviews: ReviewSnapshot[]) {
  try {
    const filePath = await join(projectPath, 'reviews.json')
    await atomicWriteTextFile(filePath, JSON.stringify({ reviews }, null, 2))
  } catch {
    // silently fail
  }
}

export async function readCanvasFile(projectPath: string): Promise<MindMap> {
  try {
    const filePath = await join(projectPath, 'canvas.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return DEFAULT_MIND_MAP
    const raw = await readTextFile(filePath)
    return normalizeMindMap(JSON.parse(raw))
  } catch {
    return DEFAULT_MIND_MAP
  }
}

export async function writeCanvasFile(projectPath: string, data: MindMap) {
  try {
    const filePath = await join(projectPath, 'canvas.json')
    await atomicWriteTextFile(filePath, JSON.stringify(normalizeMindMap(data), null, 2))
  } catch {
    // silently fail
  }
}

export async function readAtlasFile(projectPath: string): Promise<Atlas> {
  try {
    const filePath = await join(projectPath, 'atlas.json')
    const fileExists = await exists(filePath)
    if (!fileExists) return DEFAULT_ATLAS
    const raw = await readTextFile(filePath)
    return normalizeAtlas(JSON.parse(raw))
  } catch {
    return DEFAULT_ATLAS
  }
}

export async function writeAtlasFile(projectPath: string, data: Atlas) {
  try {
    const filePath = await join(projectPath, 'atlas.json')
    await atomicWriteTextFile(filePath, JSON.stringify(normalizeAtlas(data), null, 2))
  } catch {
    // silently fail
  }
}

export async function copyAtlasImage(projectPath: string, sourcePath: string, mapId: string, assetId = mapId): Promise<string> {
  const ext = sourcePath.split('.').pop() ?? 'png'
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const imagesDir = await join(projectPath, 'atlas', 'images')
  await mkdir(imagesDir, { recursive: true })
  const safeAssetId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_') || mapId
  const destName = `${safeAssetId}.${cleanExt}`
  const destPath = await join(imagesDir, destName)
  const bytes = await readFile(sourcePath)
  await writeFile(destPath, bytes)
  return `atlas/images/${destName}`.replace(/\\/g, '/')
}

export async function deleteAtlasImage(projectPath: string, imagePath: string) {
  try {
    if (!imagePath.startsWith('atlas/images/')) return
    const filePath = await join(projectPath, imagePath)
    const fileExists = await exists(filePath)
    if (fileExists) await remove(filePath)
  } catch {
    // silently fail
  }
}

// Copies a book cover into the project under cover/. A unique filename avoids
// stale-cache issues and orphaned files when the extension changes.
export async function copyCoverImage(projectPath: string, sourcePath: string): Promise<string> {
  const ext = sourcePath.split('.').pop() ?? 'jpg'
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const coverDir = await join(projectPath, 'cover')
  await mkdir(coverDir, { recursive: true })
  const destName = `cover-${Date.now().toString(36)}.${cleanExt}`
  const destPath = await join(coverDir, destName)
  const bytes = await readFile(sourcePath)
  await writeFile(destPath, bytes)
  return `cover/${destName}`
}

export async function deleteCoverImage(projectPath: string, imagePath: string) {
  try {
    if (!imagePath.startsWith('cover/')) return
    const filePath = await join(projectPath, imagePath)
    const fileExists = await exists(filePath)
    if (fileExists) await remove(filePath)
  } catch {
    // an orphaned cover file is harmless
  }
}

export async function copyLoreImage(projectPath: string, sourcePath: string, entryId: string, fieldId: string): Promise<string> {
  const ext = sourcePath.split('.').pop() ?? 'png'
  const cleanExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const safeEntryId = entryId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'entry'
  const safeFieldId = fieldId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'field'
  const destName = `${safeEntryId}_${safeFieldId}_${unique}.${cleanExt}`
  const imagesDir = await join(projectPath, 'lorebook', 'images')
  await mkdir(imagesDir, { recursive: true })
  const destPath = await join(imagesDir, destName)
  const bytes = await readFile(sourcePath)
  await writeFile(destPath, bytes)
  return `lorebook/images/${destName}`.replace(/\\/g, '/')
}

export async function saveLoreCroppedImage(projectPath: string, bytes: Uint8Array, entryId: string, fieldId: string): Promise<string> {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const safeEntryId = entryId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'entry'
  const safeFieldId = fieldId.replace(/[^a-zA-Z0-9_-]/g, '_') || 'field'
  const destName = `${safeEntryId}_${safeFieldId}_${unique}_crop.png`
  const imagesDir = await join(projectPath, 'lorebook', 'images')
  await mkdir(imagesDir, { recursive: true })
  const destPath = await join(imagesDir, destName)
  await writeFile(destPath, bytes)
  return `lorebook/images/${destName}`.replace(/\\/g, '/')
}

export async function deleteLoreImage(projectPath: string, imagePath: string) {
  try {
    if (!imagePath.startsWith('lorebook/images/')) return
    const filePath = await join(projectPath, imagePath)
    const fileExists = await exists(filePath)
    if (fileExists) await remove(filePath)
  } catch {
    // silently fail
  }
}

// Throws on failure. Callers must only remove the node from the binder tree
// after this resolves, otherwise the scenes become unreachable from the UI.
export async function trashNode(
  projectPath: string,
  node: TreeNode,
  originalFolderId: number,
  options: { manuscript?: Manuscript } = {},
) {
  const trashDir = await join(projectPath, 'trash')
  await mkdir(trashDir, { recursive: true })

  const docs = collectDocs(node)
  const moved: { from: string; to: string }[] = []
  try {
    for (const doc of docs) {
      const from = await join(projectPath, 'scenes', `${doc.file}.md`)
      const to = await join(trashDir, `${doc.file}.md`)
      const fileExists = await exists(from)
      if (!fileExists) continue
      await rename(from, to)
      moved.push({ from, to })
    }

    const sidecarId = node.type === 'doc' ? node.file : `folder_${node.id}`
    const sidecar = await join(trashDir, `${sidecarId}.json`)
    await writeTextFile(sidecar, JSON.stringify({
      node,
      originalFolderId,
      deletedAt: Date.now(),
      originalChildren: node.type === 'folder'
        ? (node as FolderNode).children.map(c => c.id)
        : [],
      manuscript: options.manuscript,
    }))
  } catch (error) {
    // Best-effort rollback so scenes are not stranded in trash/ without a sidecar.
    for (const { from, to } of moved.reverse()) {
      try {
        await rename(to, from)
      } catch {
        // leave for manual recovery; the binder node is kept either way
      }
    }
    throw error
  }
}
