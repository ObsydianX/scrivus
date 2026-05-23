// #region === IMPORTS ===
// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { open, save } from '@tauri-apps/plugin-dialog'
import { writeTextFile, readTextFile, mkdir, exists, writeFile, rename, readDir, remove } from '@tauri-apps/plugin-fs'
import { join, appDataDir } from '@tauri-apps/api/path'
import { exit } from '@tauri-apps/plugin-process'
import { Packer, Document, Paragraph, HeadingLevel, AlignmentType, TextRun } from 'docx'
import { Mark } from '@tiptap/core'
import { revealItemInDir } from '@tauri-apps/plugin-opener'
import './App.css'

// #endregion

// #region === TYPES & INTERFACES ===
// ─────────────────────────────────────────────────────────────────────────────
// Core project data types
// ─────────────────────────────────────────────────────────────────────────────
type DocNode = {
  id: number
  type: 'doc'
  label: string
  title: string
  file: string
}

type FolderNode = {
  id: number
  type: 'folder'
  label: string
  open: boolean
  children: TreeNode[]
}

type TreeNode = DocNode | FolderNode

type DropTarget =
  | { type: 'before'; id: number }
  | { type: 'after'; id: number }
  | { type: 'inside'; id: number }
  | null

type Project = {
  name: string
  path: string
  tree: TreeNode[]
  styles: ProjectStyles
}

type ChapterStyle = {
  font: string
  size: number
  bold: boolean
  italic: boolean
}

type BodyStyle = {
  font: string
  size: number
  justification: 'left' | 'center' | 'right' | 'both'
  firstLineIndent: boolean
  lineSpacing: number
}

type ProjectStyles = {
  chapter: ChapterStyle
  body: BodyStyle
}

// Represents a single checklist entry with order tracking.
type ChecklistItem = {
  id: number
  label: string
  checked: boolean
  order: number
}

type SceneTab = {
  name: string
  content: string
}

// #endregion

// #region === CONSTANTS & DEFAULTS ===

// Default typography/style settings used for new projects and fallback loads.
const DEFAULT_STYLES: ProjectStyles = {
  chapter: {
    font: 'Georgia',
    size: 24,
    bold: true,
    italic: false,
  },
  body: {
    font: 'Georgia',
    size: 12,
    justification: 'both',
    firstLineIndent: true,
    lineSpacing: 0,
  },
}

// Runtime id counter for newly-created folders/scenes. Persisted in project.json.
let nextId = 10

// #endregion

// #region === TREE TRAVERSAL HELPERS ===
// ─────────────────────────────────────────────────────────────────────────────
// Tree traversal helpers
// ─────────────────────────────────────────────────────────────────────────────

// Recursively finds a scene or folder by id.
function findNode(nodes: TreeNode[], id: number): TreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.type === 'folder') {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

// Recursively finds the parent folder for a given node id.
function findParentFolder(nodes: TreeNode[], id: number, parent: FolderNode | null = null): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return parent
    if (n.type === 'folder') {
      const found = findParentFolder(n.children, id, n)
      if (found !== undefined) return found
    }
  }
  return null
}

// Flattens a folder subtree into a list of scene documents.
function collectDocs(node: TreeNode): DocNode[] {
  if (node.type === 'doc') return [node]
  const results: DocNode[] = []
  for (const child of node.children) {
    results.push(...collectDocs(child))
  }
  return results
}

// Removes a node from a tree in-place. Returns true when successful.
function removeNode(nodes: TreeNode[], id: number): boolean {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) { nodes.splice(i, 1); return true }
    if (nodes[i].type === 'folder') {
      if (removeNode((nodes[i] as FolderNode).children, id)) return true
    }
  }
  return false
}

// Inserts a dragged node before, after, or inside a drop target.
function insertNode(nodes: TreeNode[], node: TreeNode, target: NonNullable<DropTarget>): TreeNode[] {
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

// #endregion

// #region === TEXT & HTML HELPERS ===
// ─────────────────────────────────────────────────────────────────────────────
// Text and HTML helpers
// ─────────────────────────────────────────────────────────────────────────────

// Converts editor HTML into plain paragraph lines for DOCX export.
function htmlToPlainLines(html: string): string[] {
  const div = document.createElement('div')
  div.innerHTML = html
  const lines: string[] = []
  div.querySelectorAll('p').forEach(p => lines.push(p.textContent ?? ''))
  return lines.length ? lines : [div.textContent ?? '']
}

// // Counts words from HTML by reading its text content.
// function wordCountFromHtml(html: string): number {
//   const div = document.createElement('div')
//   div.innerHTML = html
//   const text = div.textContent ?? ''
//   return text.trim() ? text.trim().split(/\s+/).length : 0
// }

// Removes temporary find-and-replace highlight marks from saved HTML.
// function stripFnrHighlights(html: string): string {
//   const div = document.createElement('div')
//   div.innerHTML = html
//   div.querySelectorAll('mark.fnr-highlight').forEach(mark => {
//     mark.replaceWith(mark.textContent ?? '')
//   })
//   return div.innerHTML
// }

// #endregion

// #region === PERSISTENCE HELPERS ===
// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

// Writes project metadata, tree structure, style data, and last active scene.
async function saveProjectToDisk(project: Project, activeId?: number) {
  const projectJson = {
    name: project.name,
    tree: project.tree,
    nextId,
    lastActiveId: activeId ?? null,
    styles: project.styles,
  }
  const projectFile = await join(project.path, 'project.json')
  await writeTextFile(projectFile, JSON.stringify(projectJson, null, 2))
}

// Loads recently opened projects from app data.
async function loadRecentProjects(): Promise<{ name: string; path: string }[]> {
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

// Saves the recent projects list while preserving other app preferences.
async function saveRecentProjects(recents: { name: string; path: string }[]) {
  try {
    const appData = await appDataDir()
    await mkdir(appData, { recursive: true })
    const recentFile = await join(appData, 'recent.json')
    const existing = await loadRecentData()
    await writeTextFile(recentFile, JSON.stringify({ ...existing, recents }, null, 2))
  } catch {
    // silently fail
  }
}

// Loads app-level recent project data and default style preferences.
async function loadRecentData(): Promise<{ recents: { name: string; path: string }[]; defaultStyles: ProjectStyles }> {
  try {
    const appData = await appDataDir()
    const recentFile = await join(appData, 'recent.json')
    const fileExists = await exists(recentFile)
    if (!fileExists) return { recents: [], defaultStyles: DEFAULT_STYLES }
    const raw = await readTextFile(recentFile)
    const data = JSON.parse(raw)
    return {
      recents: data.recents ?? [],
      defaultStyles: data.defaultStyles ?? DEFAULT_STYLES,
    }
  } catch {
    return { recents: [], defaultStyles: DEFAULT_STYLES }
  }
}

// Saves style settings as the default for future new projects.
async function saveDefaultStyles(styles: ProjectStyles) {
  try {
    const appData = await appDataDir()
    await mkdir(appData, { recursive: true })
    const recentFile = await join(appData, 'recent.json')
    const existing = await loadRecentData()
    await writeTextFile(recentFile, JSON.stringify({ ...existing, defaultStyles: styles }, null, 2))
  } catch {
    // silently fail
  }
}

// Adds or promotes a project in the recent projects list.
async function addToRecentProjects(name: string, path: string) {
  const { recents } = await loadRecentData()
  const filtered = recents.filter(r => r.path !== path)
  const updated = [{ name, path }, ...filtered].slice(0, 8)
  await saveRecentProjects(updated)
}

// #endregion

// #region === COMPILE HELPERS ===

// Generates a short random file id for scene files.
function generateFileId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// Writes a scene body file under the project scenes folder.
async function writeSceneFile(projectPath: string, fileId: string, content: string) {
  const scenesDir = await join(projectPath, 'scenes')
  await mkdir(scenesDir, { recursive: true })
  const filePath = await join(scenesDir, `${fileId}.md`)
  await writeTextFile(filePath, content)
}

// Reads a scene body file, returning an empty string if missing.
async function readSceneFile(projectPath: string, fileId: string): Promise<string> {
  try {
    const filePath = await join(projectPath, 'scenes', `${fileId}.md`)
    const fileExists = await exists(filePath)
    if (!fileExists) return ''
    return await readTextFile(filePath)
  } catch {
    return ''
  }
}

// Reads the project-wide notes file, returning defaults if missing.
async function readNotesFile(projectPath: string): Promise<{
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

// Writes the project-wide notes file.
async function writeNotesFile(projectPath: string, data: {
  quickNote: string
  checklist: ChecklistItem[]
}) {
  try {
    const filePath = await join(projectPath, 'notes.json')
    await writeTextFile(filePath, JSON.stringify(data, null, 2))
  } catch { /* silently fail */ }
}

// Moves a scene or folder subtree into project trash with recovery metadata.
async function trashNode(projectPath: string, node: TreeNode, originalFolderId: number) {
  try {
    const trashDir = await join(projectPath, 'trash')
    await mkdir(trashDir, { recursive: true })

    // Move all doc files to trash
    const docs = collectDocs(node)
    for (const doc of docs) {
      const from = await join(projectPath, 'scenes', `${doc.file}.md`)
      const to = await join(trashDir, `${doc.file}.md`)
      const fileExists = await exists(from)
      if (fileExists) await rename(from, to)
    }

    // Write a single sidecar for the whole subtree
    const sidecarId = node.type === 'doc' ? node.file : `folder_${node.id}`
    const sidecar = await join(trashDir, `${sidecarId}.json`)
    await writeTextFile(sidecar, JSON.stringify({
      node,
      originalFolderId,
      deletedAt: Date.now(),
      originalChildren: node.type === 'folder'
        ? (node as FolderNode).children.map(c => c.id)
        : [],
    }))
  } catch {
    // silently fail
  }
}

// Collects manuscript folders/scenes into ordered chunks for DOCX export.
async function collectCompileNodes(
  nodes: TreeNode[],
  projectPath: string
): Promise<({ type: 'heading'; label: string } | { type: 'body'; html: string })[]> {
  const manuscript = nodes.find(n => n.id === 1)
  if (!manuscript || manuscript.type !== 'folder') return []
  const result: ({ type: 'heading'; label: string } | { type: 'body'; html: string })[] = []
  for (const n of manuscript.children) {
    if (n.type === 'folder') {
      result.push({ type: 'heading', label: n.label })
      for (const child of n.children) {
        if (child.type === 'doc') {
          const raw = await readSceneFile(projectPath, child.file)
          const tabs = parseSceneTabs(raw)
          const html = tabs[tabs.length - 1]?.content ?? ''
          if (html.trim()) result.push({ type: 'body', html })
        }
      }
    } else if (n.type === 'doc') {
      const raw = await readSceneFile(projectPath, n.file)
      const tabs = parseSceneTabs(raw)
      const html = tabs[tabs.length - 1]?.content ?? ''
      if (html.trim()) result.push({ type: 'body', html })
    }
  }
  return result
}

// #endregion

// #region === TIPTAP EXTENSIONS ===

// TipTap mark used only for temporary find-and-replace highlights.
const FnrHighlight = Mark.create({
  name: 'fnrHighlight',
  parseHTML() {
    return [{ tag: 'mark[data-fnr]' }]
  },
  renderHTML() {
    return ['mark', { 'data-fnr': '', class: 'fnr-highlight' }, 0]
  },
})

// #endregion

// #region === SCENE TAB HELPERS ===

const TAB_DELIMITER = (name: string) => `<!--TAB:${name}-->`
const TAB_PATTERN = /<!--TAB:(.*?)-->/
const DELETED_DELIMITER = (name: string, ts: number) => `<!--DELETED:${name}:${ts}-->`

// Splits a raw scene file into active tabs, skipping deleted blocks.
function parseSceneTabs(raw: string): SceneTab[] {
  if (!raw.trim()) return [{ name: 'First Draft', content: '' }]
  const lines = raw.split('\n')
  const tabs: SceneTab[] = []
  let currentName: string | null = null
  let currentLines: string[] = []
  let inDeleted = false

  for (const line of lines) {
    const tabMatch = line.match(/^<!--TAB:(.*?)-->$/)
    const deletedMatch = line.match(/^<!--DELETED:(.*?):(\d+)-->$/)
    if (tabMatch) {
      if (currentName !== null && !inDeleted) {
        tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
      }
      currentName = tabMatch[1]
      currentLines = []
      inDeleted = false
    } else if (deletedMatch) {
      if (currentName !== null && !inDeleted) {
        tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
      }
      currentName = deletedMatch[1]
      currentLines = []
      inDeleted = true
    } else {
      currentLines.push(line)
    }
  }
  // Push last block if active
  if (currentName !== null && !inDeleted) {
    tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
  }

  // Legacy: file has content but no tab delimiters — treat as single First Draft tab
  if (tabs.length === 0 && raw.trim()) {
    return [{ name: 'First Draft', content: raw.trim() }]
  }

  return tabs.length > 0 ? tabs : [{ name: 'First Draft', content: '' }]
}

// Extracts only the deleted blocks from a raw file string, preserving them.
function extractDeletedBlocks(raw: string): string {
  const lines = raw.split('\n')
  const blocks: string[] = []
  let inDeleted = false
  let currentLines: string[] = []
  let currentHeader = ''

  for (const line of lines) {
    const deletedMatch = line.match(/^<!--DELETED:(.*?):(\d+)-->$/)
    const tabMatch = line.match(/^<!--TAB:(.*?)-->$/)
    if (deletedMatch) {
      if (inDeleted && currentHeader) {
        blocks.push(currentHeader + '\n' + currentLines.join('\n'))
      }
      currentHeader = line
      currentLines = []
      inDeleted = true
    } else if (tabMatch) {
      if (inDeleted && currentHeader) {
        blocks.push(currentHeader + '\n' + currentLines.join('\n'))
      }
      inDeleted = false
      currentHeader = ''
      currentLines = []
    } else if (inDeleted) {
      currentLines.push(line)
    }
  }
  if (inDeleted && currentHeader) {
    blocks.push(currentHeader + '\n' + currentLines.join('\n'))
  }
  return blocks.length > 0 ? '\n' + blocks.join('\n') : ''
}

// Serializes active tabs back to a file string, preserving deleted blocks.
function serializeSceneTabs(tabs: SceneTab[], raw: string): string {
  const activePart = tabs
    .map(t => `${TAB_DELIMITER(t.name)}\n${t.content}`)
    .join('\n')
  const deletedPart = extractDeletedBlocks(raw)
  return activePart + deletedPart
}

// Moves a tab to a soft-deleted block in the raw file string.
function softDeleteTab(tabs: SceneTab[], tabIndex: number, raw: string): string {
  const tab = tabs[tabIndex]
  const remaining = tabs.filter((_, i) => i !== tabIndex)
  const activePart = remaining
    .map(t => `${TAB_DELIMITER(t.name)}\n${t.content}`)
    .join('\n')
  const existingDeleted = extractDeletedBlocks(raw)
  const newDeleted = `\n${DELETED_DELIMITER(tab.name, Date.now())}\n${tab.content}`
  return activePart + existingDeleted + newDeleted
}

// #endregion

// #region === APP COMPONENT ===
// ─────────────────────────────────────────────────────────────────────────────
// Main application component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // #region === STATE ===

  // ── App Message system ──
  const [appMessage, setAppMessage] = useState<{
    title: string
    body: string
    kind: 'info' | 'warning' | 'error'
    action?: { label: string; onClick: () => void }
  } | null>(null)

  // ── Binder drag/drop and project selection state ──
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [titleValue, setTitleValue] = useState('')
  const [saveLabel, setSaveLabel] = useState('')

  // ── Project creation, menus, and style modal state ──
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectParent, setNewProjectParent] = useState('')
  const [recentProjects, setRecentProjects] = useState<{ name: string; path: string }[]>([])
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [styles, setStyles] = useState<ProjectStyles>(DEFAULT_STYLES)
  const [showStyles, setShowStyles] = useState(false)
  const [stylesTab, setStylesTab] = useState<'chapter' | 'body'>('chapter')
  const [editMenuOpen, setEditMenuOpen] = useState(false)

  // ── Editor stats and trash state ──
  const [wordCount, setWordCount] = useState(0)
  const [, setCharCount] = useState(0)
  const [trashItems, setTrashItems] = useState<{
    sidecarId: string
    label: string
    node: TreeNode
    originalFolderId: number
  }[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashExpanded, setTrashExpanded] = useState<Set<string>>(new Set())
  const [isTrashPreview, setIsTrashPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ sidecarId: string; node: TreeNode } | null>(null)
  const [confirmBinDelete, setConfirmBinDelete] = useState<{ id: number; label: string } | null>(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)

// ── Workspace state ──
const [workspace, setWorkspace] = useState<'editor' | 'lorebook' | 'mindmap'>('editor')

  // ── Binder states ──
  const [binderOpen, setBinderOpen] = useState(true)

  // ── Context Menu states ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode; depth: number } | null>(null)


  // ── Mutable refs used by async handlers and delayed saves ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectRef = useRef<Project | null>(null)
  const treeRef = useRef<TreeNode[]>([])
  const activeIdRef = useRef<number | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const editMenuRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<number | null>(null)
  const dropTargetRef = useRef<DropTarget>(null)
  const bodyHtmlRef = useRef<string>('')


  // ── Manuscript/chapter statistics ──
  const [manuscriptWordCount, setManuscriptWordCount] = useState(0)
  const [chapterWordCount, setChapterWordCount] = useState(0)


  // ── Project search panel state ──
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{
    docId: number
    title: string
    excerpt: string
    source: string
    fileId: string
    isTrash: boolean
    trashNode?: TreeNode
    trashFolderId?: number
  }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)


  // ── Find-and-replace panel state ──
  const [showFnR, setShowFnR] = useState(false)
  const [fnrFind, setFnrFind] = useState('')
  const [fnrReplace, setFnrReplace] = useState('')
  const [fnrScope, setFnrScope] = useState<'scene' | 'manuscript'>('scene')
  const [fnrStatus, setFnrStatus] = useState('')
  const fnrInputRef = useRef<HTMLInputElement>(null)
  const [fnrVersion, setFnrVersion] = useState(0)

  // ── Find-and-replace undo snapshot ──
  const [fnrUndoSnapshot, setFnrUndoSnapshot] = useState<{ fileId: string; content: string }[]>([])

  // ── Inspector Panel ──
  const [inspectorOpen, setInspectorOpen] = useState(true)

  // ── Statusbar Panel ──
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 600);

  // ── Drawer Panel ──
  const [drawerOpen, setDrawerOpen] = useState<Record<string, boolean>>({
    quickNote: false,
    checklist: false,
  })

  // ── Inspector / notes state ──
  const [quickNote, setQuickNote] = useState('')
  const quickNoteRef = useRef('')
  const quickNoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const checklistRef = useRef<ChecklistItem[]>([])
  const [renamingChecklistId, setRenamingChecklistId] = useState<number | null>(null)
  const [checklistDragId, setChecklistDragId] = useState<number | null>(null)
  const [checklistDropIndex, setChecklistDropIndex] = useState<number | null>(null)
  const checklistDragIdRef = useRef<number | null>(null)

  // ── Scene Tabs state ──
  const [sceneTabs, setSceneTabs] = useState<SceneTab[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const sceneTabsRef = useRef<SceneTab[]>([])
  const rawFileRef = useRef<string>('')
  const [renamingTabIndex, setRenamingTabIndex] = useState<number | null>(null)
  const [tabDragIndex, setTabDragIndex] = useState<number | null>(null)
  const [tabDropIndex, setTabDropIndex] = useState<number | null>(null)
  const tabDragIndexRef = useRef<number | null>(null)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const [confirmDeleteTab, setConfirmDeleteTab] = useState<number | null>(null)

  // Settings helpers
  const DEFAULT_SETTINGS = {
    zoom: 100,
  };

  type AppSettings = typeof DEFAULT_SETTINGS;

  function loadSettings(): AppSettings {
    try {
      const raw = localStorage.getItem('scrivus-settings');
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings: AppSettings) {
    localStorage.setItem('scrivus-settings', JSON.stringify(settings));
  }

  // --- ZOOM STATE ---
  const ZOOM_PRESETS = [50, 75, 90, 100, 110, 125, 150, 175, 200, 300];
  const [zoom, setZoom] = useState(() => loadSettings().zoom);
  const [zoomOpen, setZoomOpen] = useState(false);

  // ── TipTap editor configuration ──
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Begin writing…' }),
      FnrHighlight,
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      handleKeyDown: (_view, _event) => {
        const active = document.activeElement
        const editorEl = document.querySelector('.ProseMirror')
        if (active && active !== editorEl && !editorEl?.contains(active)) {
          return true
        }
        return false
      }
    },
    editable: true,
    onUpdate: ({ editor }) => {
      // Strip fnr highlight marks from saved content
      // const json = editor.getJSON()
      const html = editor.getHTML().replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
      bodyHtmlRef.current = html
      const div = document.createElement('div')
      div.innerHTML = html
      const text = div.textContent ?? ''
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
      setCharCount(text.length)
      triggerSave()
    },
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Effects: refs, project loading, styles, menus, trash preview, shortcuts
  // ───────────────────────────────────────────────────────────────────────────

  // #endregion

  // #region === EFFECTS ===

  useEffect(() => { projectRef.current = project }, [project])
  useEffect(() => { treeRef.current = tree }, [tree])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { dragIdRef.current = dragId }, [dragId])
  useEffect(() => { dropTargetRef.current = dropTarget }, [dropTarget])

  useEffect(() => {
    if (activeId !== null && editor) {
      const node = findNode(tree, activeId)
      if (node && node.type === 'doc') {
        setTitleValue(node.title)
        const content = ''
        bodyHtmlRef.current = content
        editor.commands.setContent(content, { emitUpdate: false })
        const div = document.createElement('div')
        div.innerHTML = content
        const text = div.textContent ?? ''
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
        setCharCount(text.length)
      }
    }
  }, [activeId, editor])

  useEffect(() => {
    loadRecentProjects().then(setRecentProjects)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--editor-body-font', styles.body.font)
    root.style.setProperty('--editor-body-size', `${styles.body.size}pt`)
    root.style.setProperty('--editor-body-indent', styles.body.firstLineIndent ? '2em' : '0')
    root.style.setProperty('--editor-body-align',
      styles.body.justification === 'both' ? 'justify' : styles.body.justification)
    root.style.setProperty('--editor-chapter-font', styles.chapter.font)
    root.style.setProperty('--editor-chapter-size', `${styles.chapter.size}pt`)
    root.style.setProperty('--editor-chapter-weight', styles.chapter.bold ? '700' : '400')
    root.style.setProperty('--editor-chapter-style', styles.chapter.italic ? 'italic' : 'normal')
    root.style.setProperty('--editor-body-line-height', styles.body.lineSpacing > 0
      ? `${styles.body.lineSpacing * 1.2}em`
      : '1.85')
  }, [styles])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false)
      }
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (editor) editor.setEditable(!isTrashPreview)
  }, [isTrashPreview, editor])

  useEffect(() => {
    if (!editor) return

    const { state, view } = editor
    const { tr } = state

    // Remove all fnrHighlight marks without creating a history entry
    state.doc.descendants((node, pos) => {
      if (!node.isText) return
      node.marks.forEach(mark => {
        if (mark.type.name === 'fnrHighlight') {
          tr.removeMark(pos, pos + node.nodeSize, mark.type)
        }
      })
    })

    // Mark transaction as non-undoable
    tr.setMeta('addToHistory', false)
    view.dispatch(tr)

    if (!showFnR || !fnrFind.trim()) return

    const q = fnrFind.toLowerCase()
    const addTr = editor.state.tr
    const markType = editor.schema.marks.fnrHighlight

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      const text = node.text ?? ''
      const lower = text.toLowerCase()
      let idx = lower.indexOf(q)
      while (idx !== -1) {
        addTr.addMark(pos + idx, pos + idx + fnrFind.length, markType.create())
        idx = lower.indexOf(q, idx + fnrFind.length)
      }
    })

    addTr.setMeta('addToHistory', false)
    view.dispatch(addTr)

  }, [fnrFind, showFnR, editor, fnrVersion])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key === 'z'
      const isRedo = (e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))
      if (!isUndo && !isRedo) return

      const editorEl = document.querySelector('.ProseMirror')
      const active = document.activeElement

      // If focus is not in the editor, block the shortcut entirely
      if (active !== editorEl && !editorEl?.contains(active)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    document.addEventListener('keydown', handler, true) // capture phase
    return () => document.removeEventListener('keydown', handler, true)
  }, [])

  // --- ZOOM EFFECT --- 
  useEffect(() => {
    const applyZoom = () => {
      const wrap = document.getElementById('editor-wrap');
      const proseMirror = wrap?.querySelector('.ProseMirror') as HTMLElement | null;
      if (!wrap || !proseMirror) return false;

      const scale = zoom / 100;
      proseMirror.style.fontSize = `calc(var(--editor-body-size, 12pt) * ${scale})`;
      const title = document.getElementById('editor-title') as HTMLElement | null;
      if (title) title.style.fontSize = `calc(var(--editor-chapter-size, 24pt) * ${scale})`;
      return true;
    };

    if (!applyZoom()) {
      const id = requestAnimationFrame(() => applyZoom());
      return () => cancelAnimationFrame(id);
    }
  }, [zoom, activeId]);

  useEffect(() => {
    saveSettings({ ...loadSettings(), zoom });
  }, [zoom]);

  // --- Collapse panels on small window EFFECT --- 
  useEffect(() => {
    const handleResize = () => {
      const narrow = window.innerWidth < 900;
      setIsNarrow(narrow);
      setBinderOpen(!narrow);
      setInspectorOpen(!narrow);
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Disable browser context menu EFFECT --- 

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // --- Duplicate Node EFFECT --- 
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2' && activeId !== null) {
        const node = findNode(treeRef.current, activeId)
        if (node && node.id !== 1 && node.id !== 2) setRenamingId(activeId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeId])

  // --- Context Menu EFFECT --- 
  useEffect(() => {
    if (!contextMenu) return
    const handle = () => setContextMenu(null)
    window.addEventListener('click', handle)
    return () => window.removeEventListener('click', handle)
  }, [contextMenu])

  // --- Tab context menu close EFFECT ---
  useEffect(() => {
    if (!tabContextMenu) return
    const handle = () => setTabContextMenu(null)
    window.addEventListener('click', handle)
    return () => window.removeEventListener('click', handle)
  }, [tabContextMenu])
  

  // #endregion

  // #region === HANDLERS: SAVE & EDITOR ===

  // Saves the currently active scene and project metadata.
  const saveActive = useCallback((currentTree?: TreeNode[]) => {
    if (activeIdRef.current === null) return
    const workingTree = currentTree ?? treeRef.current
    const clone = JSON.parse(JSON.stringify(workingTree)) as TreeNode[]
    const node = findNode(clone, activeIdRef.current)
    if (node && node.type === 'doc' && projectRef.current) {
      const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
      // Update the active tab's content in the ref
      const updatedTabs = sceneTabsRef.current.map((t, i) =>
        i === activeTabIndex ? { ...t, content: cleanHtml } : t
      )
      sceneTabsRef.current = updatedTabs
      const serialized = serializeSceneTabs(updatedTabs, rawFileRef.current)
      rawFileRef.current = serialized
      writeSceneFile(projectRef.current.path, node.file, serialized)
    }
    setTree(clone)
    treeRef.current = clone
    if (projectRef.current) {
      saveProjectToDisk({ ...projectRef.current, tree: clone }, activeIdRef.current ?? undefined)
    }
  }, [activeTabIndex])

  // Debounces autosave while the editor is changing.
  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveLabel('editing…')
    saveTimer.current = setTimeout(() => {
      saveActive()
      computeManuscriptWordCount()
      computeChapterWordCount()
      setSaveLabel('saved')
      setTimeout(() => setSaveLabel(''), 1200)
    }, 900)
  }, [saveActive])

  // Opens a scene from the binder and loads its content into TipTap.
  const selectDoc = async (id: number) => {
    saveActive()
    setIsTrashPreview(false)
    setActiveId(id)
    const node = findNode(treeRef.current, id)
    if (node && node.type === 'doc' && projectRef.current) {
      const raw = await readSceneFile(projectRef.current.path, node.file)
      rawFileRef.current = raw
      const tabs = parseSceneTabs(raw)
      setSceneTabs(tabs)
      sceneTabsRef.current = tabs
      setActiveTabIndex(0)
      const content = tabs[0]?.content ?? ''
      bodyHtmlRef.current = content
      editor?.commands.setContent(content, { emitUpdate: false })
      const div = document.createElement('div')
      div.innerHTML = content
      const text = div.textContent ?? ''
      setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
      setCharCount(text.length)
      setTitleValue(node.title)
      computeChapterWordCount()
      computeManuscriptWordCount()
    }
  }

  // Show Message helper.
  const showMessage = (
    body: string,
    title: string,
    kind: 'info' | 'warning' | 'error' = 'info',
    action?: { label: string; onClick: () => void }
  ) => {
    setAppMessage({ title, body, kind, action })
  }

  // #endregion

  // #region === HANDLERS: NOTES, CHECKLIST, CHARACTERS & LOCATIONS ===

  // Persists all project-wide notes to notes.json.
  const saveNotes = async (overrides: Partial<{
    checklist: ChecklistItem[]
  }> = {}) => {
    if (!projectRef.current) return
    await writeNotesFile(projectRef.current.path, {
      quickNote: quickNoteRef.current,
      checklist: overrides.checklist ?? checklistRef.current,
    })
  }

  // Adds a new unchecked checklist item and immediately enters rename mode.
  const addChecklistItem = () => {
    const id = Date.now()
    const unchecked = checklistRef.current.filter(i => !i.checked)
    const order = unchecked.length
    const newItem: ChecklistItem = { id, label: 'New item', checked: false, order }
    const updated = [...checklistRef.current, newItem]
    setChecklist(updated)
    checklistRef.current = updated
    saveNotes({ checklist: updated })
    setRenamingChecklistId(id)
  }

  // Toggles a checklist item checked state, restoring order index on uncheck.
  const toggleChecklistItem = (id: number) => {
    const updated = checklistRef.current.map(item => {
      if (item.id !== id) return item
      if (item.checked) {
        // Restore to original order position among unchecked
        return { ...item, checked: false }
      } else {
        return { ...item, checked: true }
      }
    })
    setChecklist(updated)
    checklistRef.current = updated
    saveNotes({ checklist: updated })
  }

  // Renames a checklist item label.
  const renameChecklistItem = (id: number, label: string) => {
    const updated = checklistRef.current.map(i => i.id === id ? { ...i, label: label || i.label } : i)
    setChecklist(updated)
    checklistRef.current = updated
    saveNotes({ checklist: updated })
    setRenamingChecklistId(null)
  }

  // Permanently deletes a checked checklist item.
  const deleteChecklistItem = (id: number) => {
    const updated = checklistRef.current.filter(i => i.id !== id)
    setChecklist(updated)
    checklistRef.current = updated
    saveNotes({ checklist: updated })
  }

  // Handles drop reordering of unchecked items.
  const handleChecklistDrop = (targetIndex: number) => {
    const dragId = checklistDragIdRef.current
    if (dragId === null) return
    const unchecked = checklistRef.current
      .filter(i => !i.checked)
      .sort((a, b) => a.order - b.order)
    const checked = checklistRef.current.filter(i => i.checked)
    const dragIndex = unchecked.findIndex(i => i.id === dragId)
    if (dragIndex === -1) return
    const reordered = [...unchecked]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    const withNewOrder = reordered.map((item, idx) => ({ ...item, order: idx }))
    const updated = [...withNewOrder, ...checked]
    setChecklist(updated)
    checklistRef.current = updated
    saveNotes({ checklist: updated })
    setChecklistDragId(null)
    setChecklistDropIndex(null)
    checklistDragIdRef.current = null
  }

  // #endregion

  // #region === HANDLERS: SCENE TABS ===

  // Switches to a tab, saving current tab content first.
  const switchTab = (index: number) => {
    if (index === activeTabIndex) return
    // Save current tab content into ref
    const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
    const updatedTabs = sceneTabsRef.current.map((t, i) =>
      i === activeTabIndex ? { ...t, content: cleanHtml } : t
    )
    sceneTabsRef.current = updatedTabs
    setSceneTabs(updatedTabs)
    // Serialize and save immediately
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(updatedTabs, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
      }
    }
    // Load new tab
    setActiveTabIndex(index)
    const content = updatedTabs[index]?.content ?? ''
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    const div = document.createElement('div')
    div.innerHTML = content
    const text = div.textContent ?? ''
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    setCharCount(text.length)
  }

  // Adds a new tab and immediately enters rename mode.
  const addTab = () => {
    const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
    const updatedTabs = sceneTabsRef.current.map((t, i) =>
      i === activeTabIndex ? { ...t, content: cleanHtml } : t
    )
    const newTab: SceneTab = { name: 'New Revision', content: '' }
    const newTabs = [...updatedTabs, newTab]
    const newIndex = newTabs.length - 1
    sceneTabsRef.current = newTabs
    setSceneTabs(newTabs)
    setActiveTabIndex(newIndex)
    bodyHtmlRef.current = ''
    editor?.commands.setContent('', { emitUpdate: false })
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(newTabs, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
      }
    }
    setRenamingTabIndex(newIndex)
  }

  // Renames a tab.
  const renameTab = (index: number, name: string) => {
    const label = name.trim() || sceneTabsRef.current[index].name
    const updatedTabs = sceneTabsRef.current.map((t, i) =>
      i === index ? { ...t, name: label } : t
    )
    sceneTabsRef.current = updatedTabs
    setSceneTabs(updatedTabs)
    setRenamingTabIndex(null)
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(updatedTabs, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
      }
    }
  }

  // Soft-deletes a tab, preserving its content in the file.
  const deleteTab = (index: number) => {
    const tabs = sceneTabsRef.current
    if (tabs.length <= 1) return
    const newRaw = softDeleteTab(tabs, index, rawFileRef.current)
    const newTabs = tabs.filter((_, i) => i !== index)
    rawFileRef.current = newRaw
    sceneTabsRef.current = newTabs
    setSceneTabs(newTabs)
    const newIndex = Math.min(activeTabIndex, newTabs.length - 1)
    setActiveTabIndex(newIndex)
    const content = newTabs[newIndex]?.content ?? ''
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        writeSceneFile(projectRef.current.path, node.file, newRaw)
      }
    }
    setConfirmDeleteTab(null)
  }

  // Handles drag/drop reordering of tabs.
  const handleTabDrop = (targetIndex: number) => {
    const dragIndex = tabDragIndexRef.current
    if (dragIndex === null || dragIndex === targetIndex) {
      setTabDragIndex(null)
      setTabDropIndex(null)
      tabDragIndexRef.current = null
      return
    }
    // Save current content first
    const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
    const savedTabs = sceneTabsRef.current.map((t, i) =>
      i === activeTabIndex ? { ...t, content: cleanHtml } : t
    )
    const reordered = [...savedTabs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    // Track where the active tab ended up
    const newActiveIndex = reordered.findIndex(t => t === savedTabs[activeTabIndex])
    sceneTabsRef.current = reordered
    setSceneTabs(reordered)
    setActiveTabIndex(newActiveIndex)
    setTabDragIndex(null)
    setTabDropIndex(null)
    tabDragIndexRef.current = null
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(reordered, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
      }
    }
  }

  // #endregion

  // #region === HANDLERS: TRASH ===

  // Reads trash sidecar files so deleted scenes/folders can be listed.
  const loadTrash = async () => {
    if (!projectRef.current) return
    try {
      const trashDir = await join(projectRef.current.path, 'trash')
      const dirExists = await exists(trashDir)
      if (!dirExists) { setTrashItems([]); return }
      const entries = await readDir(trashDir)
      const items: { sidecarId: string; label: string; node: TreeNode; originalFolderId: number }[] = []
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
      setTrashItems(items)
    } catch {
      setTrashItems([])
    }
  }

  // Restores a trashed scene/folder and moves its files back into scenes.
  const restoreFromTrash = async (sidecarId: string, node: TreeNode, originalFolderId: number, parentSidecarId?: string) => {
    if (!projectRef.current) return
    try {
      const docs = collectDocs(node)

      // Move all doc files back to scenes
      for (const doc of docs) {
        const from = await join(projectRef.current.path, 'trash', `${doc.file}.md`)
        const to = await join(projectRef.current.path, 'scenes', `${doc.file}.md`)
        const fileExists = await exists(from)
        if (fileExists) await rename(from, to)
      }

      // Read parent sidecar BEFORE modifying it so we can use it for tree re-insert
      let parentFolderNode: FolderNode | null = null
      let originalChildOrder: number[] = []
      if (parentSidecarId) {
        const sidecarPath = await join(projectRef.current.path, 'trash', `${parentSidecarId}.json`)
        const sidecarExists = await exists(sidecarPath)
        if (sidecarExists) {
          const raw = await readTextFile(sidecarPath)
          const data = JSON.parse(raw)

          // Capture the original full folder node before any modifications
          if (data.node.type === 'folder') {
            parentFolderNode = JSON.parse(JSON.stringify(data.node)) as FolderNode
          }

          // Use stored originalChildren for sort order, fall back to current node children
          originalChildOrder = data.originalChildren ??
            (data.node.type === 'folder' ? data.node.children.map((c: TreeNode) => c.id) : [])

          // Remove this node from the sidecar
          const removeFromNode = (n: TreeNode, id: number): TreeNode | null => {
            if (n.type !== 'folder') return n
            const filtered = n.children.filter(c => c.id !== id)
            if (filtered.length !== n.children.length) {
              return { ...n, children: filtered }
            }
            return { ...n, children: n.children.map(c => removeFromNode(c, id)).filter(Boolean) as TreeNode[] }
          }
          const updatedNode = removeFromNode(data.node, node.id)
          const remaining = updatedNode ? collectDocs(updatedNode) : []
          if (remaining.length === 0) {
            await remove(sidecarPath)
            setTrashItems(prev => prev.filter(i => i.sidecarId !== parentSidecarId))
          } else {
            await writeTextFile(sidecarPath, JSON.stringify({ ...data, node: updatedNode }, null, 2))
            await loadTrash()
          }
        }
      } else {
        // Top-level sidecar — delete it entirely
        const sidecar = await join(projectRef.current.path, 'trash', `${sidecarId}.json`)
        await remove(sidecar)
        setTrashItems(prev => prev.filter(i => i.sidecarId !== sidecarId))
      }

      // Re-insert into tree
      const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
      const manuscript = findNode(newTree, 1) as FolderNode | null

      if (parentFolderNode) {
        // Restoring a child from a trashed folder — find or recreate the parent folder
        const existingFolder = findNode(newTree, parentFolderNode.id) as FolderNode | null
        if (existingFolder && existingFolder.type === 'folder') {
          existingFolder.children.push(node)
          // Sort by original order from the sidecar
          existingFolder.children.sort((a, b) => {
            const ai = originalChildOrder.indexOf(a.id)
            const bi = originalChildOrder.indexOf(b.id)
            return ai - bi
          })
        } else {
          // Recreate the folder with just this scene
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
        // Top-level restore — use originalFolderId
        const targetFolder = findNode(newTree, originalFolderId) as FolderNode | null
        if (targetFolder && targetFolder.type === 'folder') {
          targetFolder.children.push(node)
        } else if (manuscript) {
          manuscript.children.push(node)
        } else {
          newTree.push(node)
        }
      }

      setTree(newTree)
      treeRef.current = newTree
      saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)

      if (isTrashPreview) {
        setIsTrashPreview(false)
        setActiveId(null)
        setTitleValue('')
        bodyHtmlRef.current = ''
        editor?.commands.setContent('')
      }
    } catch (e) {
      showMessage('Failed to restore: ' + String(e), 'Error', 'error')
    }
  }

  // Empties trash completely.
  const emptyTrash = async () => {
    if (!projectRef.current) return
    try {
      const trashDir = await join(projectRef.current.path, 'trash')
      const dirExists = await exists(trashDir)
      if (!dirExists) return
      const entries = await readDir(trashDir)
      for (const entry of entries) {
        if (entry.name) {
          const filePath = await join(trashDir, entry.name)
          await remove(filePath)
        }
      }
      setTrashItems([])
      setTrashOpen(false)
    } catch (e) {
      showMessage('Failed to empty trash: ' + String(e), 'Error', 'error')
    }
  }

  // #endregion

  // #region === HANDLERS: SEARCH ===

  // Searches manuscript, notes, and trash for a text query.
  const runSearch = async (query: string) => {
    if (!projectRef.current || !query.trim()) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    const results: typeof searchResults = []
    const q = query.toLowerCase()

    const searchDocs = async (docs: DocNode[], source: string, isTrash = false, trashNode?: TreeNode, trashFolderId?: number) => {
      for (const doc of docs) {
        const dir = isTrash ? 'trash' : 'scenes'
        const filePath = await join(projectRef.current!.path, dir, `${doc.file}.md`)
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
        const excerpt = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
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

    // Search Manuscript
    const manuscript = findNode(treeRef.current, 1)
    if (manuscript && manuscript.type === 'folder') {
      await searchDocs(collectDocs(manuscript), 'Manuscript')
    }

    // Search Notes
    const notes = findNode(treeRef.current, 2)
    if (notes && notes.type === 'folder') {
      await searchDocs(collectDocs(notes), 'Notes')
    }

    // Search Trash
    try {
      const trashDir = await join(projectRef.current.path, 'trash')
      const dirExists = await exists(trashDir)
      if (dirExists) {
        const entries = await readDir(trashDir)
        for (const entry of entries) {
          if (entry.name?.endsWith('.json')) {
            const sidecarPath = await join(projectRef.current.path, 'trash', entry.name)
            const raw = await readTextFile(sidecarPath)
            const data = JSON.parse(raw)
            const node = data.node as TreeNode
            const docs = collectDocs(node)
            await searchDocs(docs, 'Trash', true, node, data.originalFolderId)
          }
        }
      }
    } catch { /* silently fail */ }

    setSearchResults(results)
    setSearchLoading(false)
  }

  // Opens a selected search result, previewing trash results read-only.
  const openSearchResult = async (result: typeof searchResults[0]) => {
    if (result.isTrash) {
      // Preview trash scene
      const doc = result.trashNode ? collectDocs(result.trashNode).find(d => d.file === result.fileId) : null
      if (doc) await previewTrashScene(doc)
      return
    }
    // Open normal scene
    const node = findNode(treeRef.current, result.docId)
    if (node && node.type === 'doc') {
      await selectDoc(result.docId)
    }
  }

  // #endregion

  // #region === HANDLERS: FIND & REPLACE ===

  // Restores all scenes affected by the last manuscript-wide replace all.
  const fnrUndoReplaceAll = async () => {
    if (!projectRef.current || fnrUndoSnapshot.length === 0) return
    for (const { fileId, content } of fnrUndoSnapshot) {
      await writeSceneFile(projectRef.current.path, fileId, content)
      const activeNode = findNode(treeRef.current, activeIdRef.current ?? -1)
      if (activeNode && activeNode.type === 'doc' && activeNode.file === fileId) {
        bodyHtmlRef.current = content
        editor?.commands.setContent(content, { emitUpdate: false })
      }
    }
    setFnrUndoSnapshot([])
    setFnrStatus('Replace undone.')
  }

  // Local cleanup helper for temporary find-and-replace highlight marks.
  const stripFnrHighlights = (html: string): string => {
    const div = document.createElement('div')
    div.innerHTML = html
    div.querySelectorAll('mark.fnr-highlight').forEach(mark => {
      mark.replaceWith(mark.textContent ?? '')
    })
    return div.innerHTML
  }

  // Performs case-insensitive text replacement inside paragraph HTML.
  const replaceInHtml = (html: string, find: string, replaceWith: string, onlyFirst = false): { result: string; count: number } => {
    const div = document.createElement('div')
    div.innerHTML = html
    let count = 0
    const q = find.toLowerCase()
    const paragraphs = Array.from(div.querySelectorAll('p'))

    for (let pi = 0; pi < paragraphs.length; pi++) {
      const p = paragraphs[pi]
      let text = p.innerHTML
      let lower = text.toLowerCase()
      let idx = lower.indexOf(q)
      while (idx !== -1) {
        text = text.slice(0, idx) + replaceWith + text.slice(idx + find.length)
        count++
        if (onlyFirst) {
          p.innerHTML = text
          return { result: div.innerHTML, count }
        }
        lower = text.toLowerCase()
        idx = lower.indexOf(q, idx + replaceWith.length)
      }
      p.innerHTML = text
    }

    return { result: div.innerHTML, count }
  }

  // Replaces the next match in the current scene or manuscript.
  const fnrReplaceOne = async () => {
    if (!fnrFind.trim() || !projectRef.current) return

    if (fnrScope === 'scene') {
      const cleanHtml = stripFnrHighlights(bodyHtmlRef.current)
      const { result, count } = replaceInHtml(cleanHtml, fnrFind, fnrReplace, true)
      if (count === 0) { setFnrStatus('No match found in current scene.'); return }
      bodyHtmlRef.current = result
      editor?.commands.setContent(result, { emitUpdate: false })

      if (fnrReplace.trim()) {
        const q = fnrReplace.toLowerCase()
        const doc = editor?.state.doc
        let foundPos: number | null = null
        doc?.descendants((node, pos) => {
          if (!node.isText) return
          const text = node.text ?? ''
          const lower = text.toLowerCase()
          let idx = lower.indexOf(q)
          while (idx !== -1) {
            foundPos = pos + idx + fnrReplace.length
            idx = lower.indexOf(q, idx + fnrReplace.length)
          }
        })
        if (foundPos !== null && editor) {
          const safePos = Math.min(foundPos, editor.state.doc.content.size)
          editor.chain().focus().setTextSelection(safePos).run()
        } else if (editor) {
          editor.chain().focus().setTextSelection(1).run()
        }
      } else if (editor) {
        editor.chain().focus().setTextSelection(1).run()
      }

      saveActive()
      setFnrStatus('Replaced 1 match.')
      setFnrVersion(v => v + 1)
    } else {
      const manuscript = findNode(treeRef.current, 1)
      if (!manuscript || manuscript.type !== 'folder') return
      const docs = collectDocs(manuscript)
      for (const doc of docs) {
        const content = await readSceneFile(projectRef.current.path, doc.file)
        const clean = stripFnrHighlights(content)
        const { result, count } = replaceInHtml(clean, fnrFind, fnrReplace, true)
        if (count > 0) {
          await writeSceneFile(projectRef.current.path, doc.file, result)
          if (activeIdRef.current === doc.id) {
            bodyHtmlRef.current = result
            editor?.commands.setContent(result, { emitUpdate: false })
          }
          setFnrStatus('Replaced 1 match.')
          editor?.commands.focus()
          setFnrVersion(v => v + 1)
          return
        }
      }
      setFnrStatus('No match found in manuscript.')
    }
  }

  // Replaces every match in the selected find-and-replace scope.
  const fnrReplaceAll = async () => {
    if (!fnrFind.trim() || !projectRef.current) return
    let totalCount = 0

    if (fnrScope === 'scene') {
      const cleanHtml = stripFnrHighlights(bodyHtmlRef.current)
      const { result, count } = replaceInHtml(cleanHtml, fnrFind, fnrReplace)
      if (count === 0) { setFnrStatus('No matches found in current scene.'); return }
      bodyHtmlRef.current = result
      editor?.commands.setContent(result, { emitUpdate: false })
      saveActive()
      totalCount = count
    } else {
      const manuscript = findNode(treeRef.current, 1)
      if (!manuscript || manuscript.type !== 'folder') return
      const docs = collectDocs(manuscript)
      const snapshot: { fileId: string; content: string }[] = []
      for (const doc of docs) {
        const content = await readSceneFile(projectRef.current.path, doc.file)
        const { result, count } = replaceInHtml(content, fnrFind, fnrReplace)
        if (count > 0) {
          snapshot.push({ fileId: doc.file, content })
          await writeSceneFile(projectRef.current.path, doc.file, result)
          if (activeIdRef.current === doc.id) {
            bodyHtmlRef.current = result
            editor?.commands.setContent(result, { emitUpdate: false })
          }
          totalCount += count
        }
      }
      if (totalCount === 0) { setFnrStatus('No matches found in manuscript.'); return }
      setFnrUndoSnapshot(snapshot)
    }

    setFnrStatus(`Replaced ${totalCount} match${totalCount !== 1 ? 'es' : ''}.`)
    editor?.commands.focus()
    setFnrVersion(v => v + 1)
  }

  // #endregion

  // #region === HANDLERS: PROJECT MANAGEMENT ===

  // Flushes pending changes and returns to the welcome screen.
  const closeProject = () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    saveActive()
    setProject(null)
    projectRef.current = null
    setTree([])
    treeRef.current = []
    setActiveId(null)
    activeIdRef.current = null
    setTitleValue('')
    bodyHtmlRef.current = ''
    editor?.commands.setContent('')
    setSaveLabel('')
    setFileMenuOpen(false)
    setQuickNote('')
    quickNoteRef.current = ''
    setChecklist([])
    checklistRef.current = []
    setDrawerOpen({
      quickNote: false,
      checklist: false,
    })
    setSceneTabs([])
    sceneTabsRef.current = []
    rawFileRef.current = ''
    setActiveTabIndex(0)
    setRenamingTabIndex(null)
    setTabContextMenu(null)
    setConfirmDeleteTab(null)
  }

  // Exports the manuscript folder to a DOCX document.
  const compileProject = async () => {
    if (!project) return
    setFileMenuOpen(false)

    const nodes = await collectCompileNodes(tree, project.path)
    if (nodes.length === 0) {
      showMessage('Nothing to export — add some content first.', 'Nothing to Export', 'warning')
      return
    }

    const paragraphs = []
    let firstHeading = true
    for (const node of nodes) {
      if (node.type === 'heading') {
        if (!firstHeading) {
          paragraphs.push(new Paragraph({ children: [], pageBreakBefore: true }))
        }
        firstHeading = false
        paragraphs.push(
          new Paragraph({
            text: node.label,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 200 },
          })
        )
      } else {
        const lines = htmlToPlainLines(node.html)
        for (const line of lines) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  font: styles.body.font,
                  size: styles.body.size * 2,
                  bold: line === lines[0] ? false : undefined,
                })
              ],
              spacing: {
                after: 0,
                line: styles.body.lineSpacing > 0 ? styles.body.lineSpacing * 240 : 276,
                lineRule: 'auto' as const,
              },
              alignment: styles.body.justification === 'both' ? AlignmentType.JUSTIFIED
                : styles.body.justification === 'center' ? AlignmentType.CENTER
                  : styles.body.justification === 'right' ? AlignmentType.RIGHT
                    : AlignmentType.LEFT,
              indent: styles.body.firstLineIndent ? { firstLine: 720 } : undefined,
            })
          )
        }
      }
    }

    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            run: {
              font: styles.chapter.font,
              size: styles.chapter.size * 2,
              bold: styles.chapter.bold,
              italics: styles.chapter.italic,
            },
          },
        ],
      },
      sections: [{ children: paragraphs }],
    })

    try {
      const blob = await Packer.toBlob(doc)
      const arrayBuffer = await blob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)

      const outputPath = await save({
        title: 'Export Manuscript',
        defaultPath: `${project.name}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      })

      if (!outputPath) return

      await writeFile(outputPath, uint8)
      // const exportDir = outputPath.substring(0, Math.max(outputPath.lastIndexOf('/'), outputPath.lastIndexOf('\\')))
      showMessage(
        `Exported to ${outputPath}`,
        'Export Complete',
        'info',
        {
          label: 'Show in Folder',
          onClick: () => revealItemInDir(outputPath)
        }
      )
    } catch (e) {
      showMessage('Export failed: ' + String(e), 'Export Failed', 'error')
    }
  }

  // Lets the user choose where a new project folder should be created.
  const pickParentFolder = async () => {
    const selectedPath = await open({
      title: 'Choose where to save your project',
      directory: true,
    })
    if (!selectedPath || Array.isArray(selectedPath)) return
    setNewProjectParent(selectedPath as string)
  }

  // Creates a new project folder, default tree, and project.json.
  const createProject = async () => {
    if (!newProjectName.trim() || !newProjectParent) return
    try {
      const projectPath = await join(newProjectParent, newProjectName.trim())
      await mkdir(projectPath, { recursive: true })
      const scenesDir = await join(projectPath, 'scenes')
      await mkdir(scenesDir, { recursive: true })

      nextId = 10
      const chapterId = nextId++
      const sceneId = nextId++

      const defaultFileId = generateFileId()
      const defaultTree: TreeNode[] = [
        {
          id: 1, type: 'folder', label: 'Manuscript', open: true,
          children: [
            {
              id: chapterId, type: 'folder', label: 'Chapter 1', open: true,
              children: [
                { id: sceneId, type: 'doc', label: 'Scene 1', title: 'Scene 1', file: defaultFileId }
              ]
            }
          ]
        },
        { id: 2, type: 'folder', label: 'Notes', open: false, children: [] },
      ]

      const defaultContent = `<p>This is the beginning of your story. Somewhere in these pages, a character is waiting to surprise you — someone whose voice you don't yet know, whose choices will lead somewhere you haven't imagined. Let them.</p><p>The world you're building exists nowhere else. Every detail you set down — the quality of light through a particular window, the way two people talk around what they mean, the rules of a place that has never existed — belongs entirely to you. There is no wrong way to begin.</p><p>Write the first true sentence. The rest will follow.</p>`

      await writeSceneFile(projectPath, defaultFileId, defaultContent)

      const { defaultStyles } = await loadRecentData()
      const newProj: Project = { name: newProjectName.trim(), path: projectPath, tree: defaultTree, styles: defaultStyles }

      nextId = Math.max(nextId, 12)
      await saveProjectToDisk(newProj)
      await addToRecentProjects(newProjectName.trim(), projectPath)
      setProject(newProj)
      projectRef.current = newProj
      setStyles(defaultStyles)
      setTree(defaultTree)
      treeRef.current = defaultTree
      setActiveId(null)
      setTitleValue('')
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
      setShowNewProject(false)
      setNewProjectName('')
      setNewProjectParent('')
      setRecentProjects(await loadRecentProjects())
    } catch (e) {
      showMessage('Failed to create project: ' + String(e), 'Error', 'error')
    }
  }

  // Hydrates project state from project.json and restores the last active scene.
  const loadProjectData = async (data: Record<string, unknown>, path: string) => {
    const loadedStyles = (data.styles as ProjectStyles) ?? DEFAULT_STYLES
    const loadedTree = data.tree as TreeNode[]
    nextId = (data.nextId as number) ?? 10
    const loadedProject: Project = {
      name: data.name as string,
      path,
      tree: loadedTree,
      styles: loadedStyles,
    }
    setProject(loadedProject)
    projectRef.current = loadedProject
    setTree(loadedTree)
    treeRef.current = loadedTree
    const notes = await readNotesFile(path)
    setQuickNote(notes.quickNote)
    quickNoteRef.current = notes.quickNote
    setChecklist(notes.checklist)
    checklistRef.current = notes.checklist
    setStyles(loadedStyles)
    const restoredId = (data.lastActiveId as number | null) ?? null
    setActiveId(restoredId)
    if (restoredId !== null) {
      const restoredNode = findNode(loadedTree, restoredId)
      if (restoredNode && restoredNode.type === 'doc') {
        setTitleValue(restoredNode.title)
        const raw = await readSceneFile(path, restoredNode.file)
        rawFileRef.current = raw
        const tabs = parseSceneTabs(raw)
        setSceneTabs(tabs)
        sceneTabsRef.current = tabs
        setActiveTabIndex(0)
        const content = tabs[0]?.content ?? ''
        bodyHtmlRef.current = content
        editor?.commands.setContent(content, { emitUpdate: false })
        const div = document.createElement('div')
        div.innerHTML = content
        const text = div.textContent ?? ''
        setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
        setCharCount(text.length)
      }
    } else {
      setTitleValue('')
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
      setWordCount(0)
      setCharCount(0)
    }
    setTimeout(() => loadTrash(), 100)
    setTimeout(() => {
      computeManuscriptWordCount()
      computeChapterWordCount()
    }, 200)
  }

  // Opens an existing project by asking the user for a project folder.
  const openProject = async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    saveActive()
    setFileMenuOpen(false)
    const selectedPath = await open({ title: 'Open Project', directory: true })
    if (!selectedPath || Array.isArray(selectedPath)) return
    const projectFile = await join(selectedPath as string, 'project.json')
    const fileExists = await exists(projectFile)
    if (!fileExists) { showMessage('That folder does not contain a Scrivus project.', 'Invalid Project', 'warning'); return }
    const raw = await readTextFile(projectFile)
    const data = JSON.parse(raw)
    await loadProjectData(data, selectedPath as string)
    await addToRecentProjects(data.name, selectedPath as string)
    setRecentProjects(await loadRecentProjects())
  }

  // Opens a recent project directly from its saved path.
  const openProjectByPath = async (path: string) => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    saveActive()
    try {
      const projectFile = await join(path, 'project.json')
      const fileExists = await exists(projectFile)
      if (!fileExists) {
        showMessage('That project could not be found. It may have been moved or deleted.', 'Project Not Found', 'warning')
        const updated = recentProjects.filter(r => r.path !== path)
        setRecentProjects(updated)
        await saveRecentProjects(updated)
        return
      }
      const raw = await readTextFile(projectFile)
      const data = JSON.parse(raw)
      await loadProjectData(data, path)
      await addToRecentProjects(data.name, path)
      setRecentProjects(await loadRecentProjects())
    } catch (e) {
      showMessage('Failed to open project: ' + String(e), 'Error', 'error')
    }
  }

  // #endregion

  // #region === HANDLERS: BINDER (TREE, DRAG & DROP, SCENES) ===

  // Expands or collapses a binder folder.
  const toggleFolder = (id: number) => {
    setTree(prev => {
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode[]
      const node = findNode(clone, id)
      if (node && node.type === 'folder') node.open = !node.open
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: clone }, activeIdRef.current ?? undefined)
      return clone
    })
  }

  // Adds a new scene to the selected folder, then starts rename mode.
  const addDoc = (targetFolderId?: number) => {
    const id = nextId++
    const fileId = generateFileId()
    const node: DocNode = { id, type: 'doc', label: 'New scene', title: 'New scene', file: fileId }
    const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
    const folderId = targetFolderId ?? 1
    const target = findNode(newTree, folderId) as FolderNode | null
    if (target && target.type === 'folder') {
      target.open = true
      target.children.push(node)
    } else {
      newTree.push(node)
    }
    setTree(newTree)
    treeRef.current = newTree
    const defaultTabs: SceneTab[] = [{ name: 'First Draft', content: '' }]
    const defaultRaw = serializeSceneTabs(defaultTabs, '')
    if (projectRef.current) {
      writeSceneFile(projectRef.current.path, fileId, defaultRaw)
      saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    }
    setSceneTabs(defaultTabs)
    sceneTabsRef.current = defaultTabs
    rawFileRef.current = defaultRaw
    setActiveTabIndex(0)
    setRenamingId(id)
    setActiveId(id)
    setTitleValue('New scene')
    bodyHtmlRef.current = ''
    editor?.commands.setContent('')
  }

  // Adds a new binder folder, then starts rename mode.
  const addFolder = (targetFolderId?: number) => {
    const id = nextId++
    const newFolder: FolderNode = { id, type: 'folder', label: 'New folder', open: true, children: [] }
    const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
    const folderId = targetFolderId ?? 1
    const target = findNode(newTree, folderId) as FolderNode | null
    if (target && target.type === 'folder') {
      target.open = true
      target.children.push(newFolder)
    } else {
      newTree.push(newFolder)
    }
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    setRenamingId(id)
  }

  // Moves a binder node to trash instead of deleting it permanently.
  const deleteNode = (id: number) => {
    const node = findNode(treeRef.current, id)
    if (node && projectRef.current) {
      const parentFolder = findParentFolder(treeRef.current, id)
      const folderId = parentFolder?.id ?? 1
      trashNode(projectRef.current.path, node, folderId)
        .then(() => loadTrash())
    }
    setTree(prev => {
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode[]
      removeNode(clone, id)
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: clone }, activeIdRef.current ?? undefined)
      return clone
    })
    if (activeId === id) {
      setActiveId(null)
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
    }
  }

  // Deletes trashed files and sidecar metadata permanently.
  const permanentlyDelete = async (sidecarId: string, node: TreeNode) => {
    if (!projectRef.current) return
    try {
      const docs = collectDocs(node)
      for (const doc of docs) {
        const filePath = await join(projectRef.current.path, 'trash', `${doc.file}.md`)
        const fileExists = await exists(filePath)
        if (fileExists) await remove(filePath)
      }
      const sidecar = await join(projectRef.current.path, 'trash', `${sidecarId}.json`)
      await remove(sidecar)
      setTrashItems(prev => prev.filter(i => i.sidecarId !== sidecarId))
      setConfirmDelete(null)
      setTrashItems(prev => prev.filter(i => i.sidecarId !== sidecarId))
      setConfirmDelete(null)

      if (isTrashPreview) {
        setIsTrashPreview(false)
        setActiveId(null)
        setTitleValue('')
        bodyHtmlRef.current = ''
        editor?.commands.setContent('')
      }
    } catch (e) {
      showMessage('Failed to delete: ' + String(e), 'Error', 'error')
    }
  }

  // Loads a trashed scene into the editor in read-only preview mode.
  const previewTrashScene = async (doc: DocNode) => {
    if (!projectRef.current) return

    // Try scenes folder first, then trash folder
    let content = ''
    const scenePath = await join(projectRef.current.path, 'scenes', `${doc.file}.md`)
    const sceneExists = await exists(scenePath)
    if (sceneExists) {
      content = await readTextFile(scenePath)
    } else {
      const trashPath = await join(projectRef.current.path, 'trash', `${doc.file}.md`)
      const trashExists = await exists(trashPath)
      if (trashExists) content = await readTextFile(trashPath)
    }

    setIsTrashPreview(true)
    setTitleValue(doc.title)
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    const div = document.createElement('div')
    div.innerHTML = content
    const text = div.textContent ?? ''
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    setCharCount(text.length)
  }

  // Renames a binder item and syncs document titles for scenes.
  const renameNode = (id: number, label: string) => {
    setTree(prev => {
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode[]
      const node = findNode(clone, id)
      if (node) {
        node.label = label
        if (node.type === 'doc') node.title = label
      }
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: clone }, activeIdRef.current ?? undefined)
      return clone
    })
    if (id === activeIdRef.current) {
      setTitleValue(label)
    }
    setRenamingId(null)
  }

  // Duplicates a node in the binder tree.
  const duplicateNode = async (id: number) => {
    const cloneNode = async (n: TreeNode): Promise<TreeNode> => {
      const newId = nextId++
      if (n.type === 'doc') {
        const newFileId = generateFileId()
        if (projectRef.current) {
          try {
            const srcPath = await join(projectRef.current.path, 'scenes', `${n.file}.md`)
            const content = await readTextFile(srcPath)
            await writeSceneFile(projectRef.current.path, newFileId, content)
          } catch {
            await writeSceneFile(projectRef.current.path, newFileId, '')
          }
        }
        return { ...n, id: newId, file: newFileId, label: `${n.label} (copy)`, title: `${n.title} (copy)` }
      } else {
        const clonedChildren = await Promise.all((n as FolderNode).children.map(cloneNode))
        return { ...n, id: newId, label: `${n.label} (copy)`, children: clonedChildren }
      }
    }

    const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]

    const insertAfter = async (nodes: TreeNode[]): Promise<boolean> => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) {
          const clone = await cloneNode(nodes[i])
          nodes.splice(i + 1, 0, clone)
          return true
        }
        if (nodes[i].type === 'folder') {
          if (await insertAfter((nodes[i] as FolderNode).children)) return true
        }
      }
      return false
    }

    await insertAfter(newTree)
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
  }

  // Completes a drag/drop move inside the binder tree.
  const handleDrop = (targetId: number) => {
    const currentDragId = dragIdRef.current
    const currentDropTarget = dropTargetRef.current
    if (currentDragId === null || currentDropTarget === null || currentDragId === targetId) {
      setDragId(null)
      setDropTarget(null)
      return
    }
    setTree(prev => {
      const clone = JSON.parse(JSON.stringify(prev)) as TreeNode[]
      const dragged = findNode(clone, currentDragId)
      if (!dragged) return prev
      removeNode(clone, currentDragId)
      const result = insertNode(clone, dragged, currentDropTarget)
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: result }, activeIdRef.current ?? undefined)
      return result
    })
    setDragId(null)
    setDropTarget(null)
  }

  // Derived editor visibility state.
  const activeNode = activeId !== null ? findNode(tree, activeId) : null
  const showEditor = activeNode?.type === 'doc' || isTrashPreview

  // #endregion

  // #region === RENDER HELPERS: BINDER TREE ===

  // Renders one trash entry, including nested deleted folders.
  const renderTrashItem = (sidecarId: string, node: TreeNode, originalFolderId: number, depth: number): React.ReactNode => {
    const isExpanded = trashExpanded.has(`${sidecarId}-${node.id}`)
    const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation()
      setTrashExpanded(prev => {
        const next = new Set(prev)
        const key = `${sidecarId}-${node.id}`
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    return (
      <div key={`${sidecarId}-${node.id}`}>
        <div
          className="tree-item"
          onClick={() => {
            if (node.type === 'doc') previewTrashScene(node)
            else toggleExpand({ stopPropagation: () => { } } as React.MouseEvent)
          }}
        >
          <span style={{ width: depth * 14 + 4, flexShrink: 0, display: 'inline-block' }} />
          {node.type === 'folder'
            ? <span className="toggle" onClick={toggleExpand}>
              <i className={`ti ti-chevron-${isExpanded ? 'down' : 'right'}`} aria-hidden="true" />
            </span>
            : <span style={{ width: 16, flexShrink: 0 }} />
          }
          <span className="item-icon">
            <i className={`ti ti-${node.type === 'folder' ? 'folder' : 'file-text'}`} aria-hidden="true" />
          </span>
          <span className="item-label">{node.label}</span>
          <span className="item-actions" onClick={e => e.stopPropagation()}>
            <button
              title="Restore"
              onClick={e => {
                e.stopPropagation()
                const isChildNode = node.id !== trashItems.find(i => i.sidecarId === sidecarId)?.node.id
                restoreFromTrash(sidecarId, node, originalFolderId, isChildNode ? sidecarId : undefined)
              }}
            >
              <i className="ti ti-restore" aria-hidden="true" />
            </button>
            <button
              title="Delete permanently"
              onClick={e => { e.stopPropagation(); setConfirmDelete({ sidecarId, node }) }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </span>
        </div>
        {node.type === 'folder' && isExpanded && node.children.map(child =>
          renderTrashItem(sidecarId, child, originalFolderId, depth + 1)
        )}
      </div>
    )
  }

  // Recursively renders the binder tree with drag/drop affordances.
  const renderNodes = (nodes: TreeNode[], depth: number): React.ReactNode => {
    return nodes.map(n => {
      const isProtected = n.id === 1 || n.id === 2
      const isDragging = dragId === n.id
      const isDropFolder = dropTarget?.type === 'inside' && dropTarget.id === n.id
      const isDropBefore = dropTarget?.type === 'before' && dropTarget.id === n.id
      const isDropAfter = dropTarget?.type === 'after' && dropTarget.id === n.id

      return (
        <div key={n.id} style={{ opacity: isDragging ? 0.4 : 1 }}>
          {isDropBefore && !isProtected && <div className="drop-line" />}
          <div
            className={`tree-item${activeId === n.id ? ' active' : ''}${isDropFolder ? ' drag-over-folder' : ''}`}
            draggable={!isProtected && renamingId !== n.id}
            onDragStart={(!isProtected && renamingId !== n.id) ? e => {
              e.stopPropagation()
              dragIdRef.current = n.id
              setDragId(n.id)
              e.dataTransfer.effectAllowed = 'move'
              document.getElementById('tree')?.classList.add('dragging')
            } : undefined}
            onDragEnd={(!isProtected && renamingId !== n.id) ? () => {
              document.getElementById('tree')?.classList.remove('dragging')
              setDragId(null)
              setDropTarget(null)
              dragIdRef.current = null
              dropTargetRef.current = null
            } : undefined}
            onDragOver={e => {
              e.preventDefault()
              e.stopPropagation()
              if (dragIdRef.current === n.id) return
              if (isProtected && n.type === 'folder') {
                dropTargetRef.current = { type: 'inside', id: n.id }
                setDropTarget({ type: 'inside', id: n.id })
                return
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const y = e.clientY - rect.top
              const h = rect.height
              let next: DropTarget
              if (n.type === 'folder') {
                if (y < h * 0.25) next = { type: 'before', id: n.id }
                else if (y > h * 0.75) next = { type: 'after', id: n.id }
                else next = { type: 'inside', id: n.id }
              } else {
                if (y < h * 0.5) next = { type: 'before', id: n.id }
                else next = { type: 'after', id: n.id }
              }
              dropTargetRef.current = next
              setDropTarget(next)
            }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(n.id) }}
            onClick={() => {
              if (dragIdRef.current !== null) return
              n.type === 'doc' ? selectDoc(n.id) : toggleFolder(n.id)
            }}
            onDoubleClick={() => {
              if (n.id === 1 || n.id === 2) return
              setRenamingId(n.id)
            }}
            onContextMenu={e => {
              e.preventDefault()
              e.stopPropagation()
              setContextMenu({ x: e.clientX, y: e.clientY, node: n, depth })
            }}
          >
            <span style={{ width: depth * 14 + 4, flexShrink: 0, display: 'inline-block' }} />
            {n.type === 'folder'
              ? <span className="toggle"><i className={`ti ti-chevron-${n.open ? 'down' : 'right'}`} aria-hidden="true" /></span>
              : <span style={{ width: 16, flexShrink: 0 }} />
            }
            <span className="item-icon">
              <i className={`ti ti-${n.id === 1 ? 'book-2' :
                n.id === 2 ? 'notebook' :
                  n.type === 'folder' ? 'folder' :
                    'file-text'
                }`} aria-hidden="true" />
            </span>
            {renamingId === n.id
              ? <input
                className="inline-rename"
                defaultValue={n.label}
                autoFocus
                ref={el => { if (el) { el.focus(); el.select() } }}
                onClick={e => e.stopPropagation()}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameNode(n.id, (e.target as HTMLInputElement).value || n.label)
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onBlur={e => renameNode(n.id, e.target.value || n.label)}
              />
              : <span className="item-label">
                {n.label}
              </span>
            }
            {n.type === 'folder' && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                <button title="New scene" onClick={e => { e.stopPropagation(); addDoc(n.id) }}>
                  <i className="ti ti-file-plus" aria-hidden="true" />
                </button>
                {depth < 1 && (
                  <button title="New folder" onClick={e => { e.stopPropagation(); addFolder(n.id) }}>
                    <i className="ti ti-folder-plus" aria-hidden="true" />
                  </button>
                )}
                {!isProtected && (
                  <>
                    <button title="Rename" onClick={e => { e.stopPropagation(); setRenamingId(n.id) }}>
                      <i className="ti ti-pencil" aria-hidden="true" />
                    </button>
                    <button title="Delete" onClick={e => {
                      e.stopPropagation()
                      setConfirmBinDelete({ id: n.id, label: n.label })
                    }}>
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </>
                )}
              </span>
            )}
            {n.type === 'doc' && !isProtected && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                <button title="Rename" onClick={e => { e.stopPropagation(); setRenamingId(n.id) }}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
                <button title="Delete" onClick={e => {
                  e.stopPropagation()
                  setConfirmBinDelete({ id: n.id, label: n.label })
                }}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {n.type === 'folder' && n.open && renderNodes(n.children, depth + 1)}
          {isDropAfter && !isProtected && <div className="drop-line" />}
        </div>
      )
    })
  }

  // #endregion

  // #region === RENDER HELPERS: INSPECTOR DRAWER ===

  // Inspector Panel.
  const InspectorDrawer = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div className="inspector-drawer">
      <div
        className="inspector-drawer-header"
        onClick={() => setDrawerOpen(prev => ({ ...prev, [id]: !prev[id] }))}
      >
        <i className={`ti ti-chevron-${drawerOpen[id] ? 'down' : 'right'}`} aria-hidden="true" />
        <span>{label}</span>
      </div>
      {drawerOpen[id] && (
        <div className="inspector-drawer-body">
          {children}
        </div>
      )}
    </div>
  )



  // #endregion

  // #region === RENDER HELPERS: MODALS ===

  // Modal for adjusting chapter/body typography settings.
  const StylesModal = () => {
    const [local, setLocal] = useState<ProjectStyles>(styles)

    const applyStyles = () => {
      setStyles(local)
      setProject(prev => prev ? { ...prev, styles: local } : prev)
      if (projectRef.current) {
        projectRef.current = { ...projectRef.current, styles: local }
        saveProjectToDisk({ ...projectRef.current, styles: local }, activeIdRef.current ?? undefined)
      }
      setShowStyles(false)
    }

    const saveAsDefault = async () => {
      await saveDefaultStyles(local)
      applyStyles()
    }

    const fonts = ['Georgia', 'Times New Roman', 'Garamond', 'Palatino', 'Arial', 'Helvetica', 'Courier New']

    return (
      <div className="modal-overlay">
        <div className="modal-box">
          <p className="modal-title">Styles</p>
          <div className="modal-tabs">
            {(['chapter', 'body'] as const).map(tab => (
              <button
                key={tab}
                className={`modal-tab${stylesTab === tab ? ' active' : ''}`}
                onClick={() => setStylesTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {stylesTab === 'chapter' && (
            <div className="modal-fields">
              <div className="modal-field">
                <label className="modal-label">Font</label>
                <select className="modal-select" value={local.chapter.font}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, font: e.target.value } }))}>
                  {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label className="modal-label">Size (pt)</label>
                <input className="modal-input modal-input-sm" type="number" min={8} max={72}
                  value={local.chapter.size}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, size: Number(e.target.value) } }))} />
              </div>
              <div className="modal-checkboxes">
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={local.chapter.bold}
                    onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, bold: e.target.checked } }))} />
                  Bold
                </label>
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={local.chapter.italic}
                    onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, italic: e.target.checked } }))} />
                  Italic
                </label>
              </div>
              <div className="modal-preview" style={{
                fontFamily: local.chapter.font,
                fontSize: local.chapter.size * 0.75,
                fontWeight: local.chapter.bold ? 700 : 400,
                fontStyle: local.chapter.italic ? 'italic' : 'normal',
              }}>
                Chapter One
              </div>
            </div>
          )}

          {stylesTab === 'body' && (
            <div className="modal-fields">
              <div className="modal-field">
                <label className="modal-label">Font</label>
                <select className="modal-select" value={local.body.font}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, font: e.target.value } }))}>
                  {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="modal-field">
                <label className="modal-label">Size (pt)</label>
                <input className="modal-input modal-input-sm" type="number" min={8} max={72}
                  value={local.body.size}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, size: Number(e.target.value) } }))} />
              </div>
              <div className="modal-field">
                <label className="modal-label">Justification</label>
                <select className="modal-select" value={local.body.justification}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, justification: e.target.value as BodyStyle['justification'] } }))}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="both">Justified</option>
                </select>
              </div>
              <label className="modal-checkbox-label">
                <input type="checkbox" checked={local.body.firstLineIndent}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, firstLineIndent: e.target.checked } }))} />
                First line indent
              </label>
              <div className="modal-field">
                <label className="modal-label">Line spacing (pt)</label>
                <input className="modal-input modal-input-sm" type="number" min={0} max={72} step={0.5}
                  value={local.body.lineSpacing}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, lineSpacing: Number(e.target.value) } }))} />
              </div>
              <div className="modal-preview" style={{
                fontFamily: local.body.font,
                fontSize: local.body.size * 0.75,
                textAlign: local.body.justification === 'both' ? 'justify' : local.body.justification,
              }}>
                <span style={{ display: 'inline-block', textIndent: local.body.firstLineIndent ? '2em' : '0' }}>
                  The road out of Calver runs north until it doesn't. Maren had driven it a hundred times in childhood, always in the passenger seat, watching the tree line blur.
                </span>
              </div>
            </div>
          )}

          <div className="modal-footer-split">
            <button className="welcome-btn" onClick={saveAsDefault}>Save as default</button>
            <div className="modal-footer-actions">
              <button className="welcome-btn" onClick={() => setShowStyles(false)}>Cancel</button>
              <button className="welcome-btn" onClick={applyStyles}>Apply</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // #endregion

  // #region === RENDER HELPERS: MENUS ===

  // Top menu: project/file actions.
  const FileMenu = () => (
    <div className={`menu-item${fileMenuOpen ? ' open' : ''}`} ref={fileMenuRef}>
      <button onClick={() => setFileMenuOpen(v => !v)}>File</button>
      {fileMenuOpen && (
        <div className="menu-dropdown">
          <button onClick={() => { setFileMenuOpen(false); setShowNewProject(true) }}>New Project</button>
          <button onClick={openProject}>Open Project…</button>
          <div className="sep" />
          <button onClick={closeProject} disabled={!project}>Close Project</button>
          <div className="sep" />
          <button onClick={compileProject} disabled={!project}>Compile</button>
          <div className="sep" />
          <button onClick={() => exit(0)}>Exit</button>
        </div>
      )}
    </div>
  )

  // Top menu: editing, styles, search, and find/replace actions.
  const EditMenu = () => (
    <div className={`menu-item${editMenuOpen ? ' open' : ''}`} ref={editMenuRef}>
      <button onClick={() => setEditMenuOpen(v => !v)}>Edit</button>
      {editMenuOpen && (
        <div className="menu-dropdown">
          <button
            onClick={() => { setEditMenuOpen(false); editor?.chain().focus().undo().run() }}
            disabled={!project || !editor?.can().undo()}
          >
            Undo
          </button>
          <button
            onClick={() => { setEditMenuOpen(false); editor?.chain().focus().redo().run() }}
            disabled={!project || !editor?.can().redo()}
          >
            Redo
          </button>
          <button
            onClick={() => { setEditMenuOpen(false); editor?.chain().focus().selectAll().run() }}
            disabled={!project}
          >
            Select All
          </button>
          <div className="sep" />
          <button
            onClick={() => { setEditMenuOpen(false); setShowStyles(true) }}
            disabled={!project}
          >
            Styles…
          </button>
          <div className="sep" />
          <button
            onClick={() => { setEditMenuOpen(false); setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
            disabled={!project}
          >
            Search Project…
          </button>
          <button
            onClick={() => { setEditMenuOpen(false); setShowFnR(true); setTimeout(() => fnrInputRef.current?.focus(), 50) }}
            disabled={!project}
          >
            Find & Replace…
          </button>
        </div>
      )}
    </div>
  )

  // #endregion

  // #region === RENDER HELPERS: CONFIRM MODALS ===

  // Modal for creating a new project folder.
  const NewProjectModal = () => (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 400 }}>
        <p className="modal-title">New Project</p>
        <div className="modal-field">
          <label className="modal-label">Project name</label>
          <input
            className="modal-input"
            type="text"
            autoFocus
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createProject() }}
            placeholder="My Novel"
          />
        </div>
        <div className="modal-field">
          <label className="modal-label">Location</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className={`modal-input modal-path-display${!newProjectParent ? ' modal-path-empty' : ''}`}>
              {newProjectParent || 'No folder selected'}
            </div>
            <button className="welcome-btn" style={{ whiteSpace: 'nowrap' }} onClick={pickParentFolder}>Browse…</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectParent('') }}>Cancel</button>
          <button className="welcome-btn modal-btn-create" onClick={createProject}
            style={{ opacity: newProjectName.trim() && newProjectParent ? 1 : 0.4 }}>
            Create
          </button>
        </div>
      </div>
    </div>
  )

  // Confirmation modal for permanent trash deletion.
  const ConfirmDeleteModal = () => {
    if (!confirmDelete) return null
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-danger" style={{ width: 380 }}>
          <p className="modal-title">Permanently delete?</p>
          <p className="modal-danger-text">
            <strong style={{ color: '#cc8888' }}>{confirmDelete.node.label}</strong> will be permanently deleted and cannot be recovered.
          </p>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="welcome-btn modal-btn-danger" onClick={() => permanentlyDelete(confirmDelete.sidecarId, confirmDelete.node)}>
              Delete permanently
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation modal for moving active binder items to trash.
  const ConfirmBinDeleteModal = () => {
    if (!confirmBinDelete) return null
    return (
      <div className="modal-overlay">
        <div className="modal-box" style={{ width: 380 }}>
          <p className="modal-title">Move to trash?</p>
          <p className="modal-danger-text">
            <strong style={{ color: '#d4d4d4' }}>{confirmBinDelete.label}</strong> will be moved to the trash.
          </p>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setConfirmBinDelete(null)}>Cancel</button>
            <button className="welcome-btn" onClick={() => { deleteNode(confirmBinDelete.id); setConfirmBinDelete(null) }}>
              Move to trash
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation modal for permanently emptying trash.
  const ConfirmEmptyTrashModal = () => {
    if (!confirmEmptyTrash) return null
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-danger" style={{ width: 380 }}>
          <p className="modal-title">Empty Trash?</p>
          <p className="modal-danger-text">
            {(() => {
              const total = trashItems.reduce((acc, item) => {
                if (item.node.type === 'folder') return acc + 1 + collectDocs(item.node).length
                return acc + 1
              }, 0)
              return <>All <strong style={{ color: '#cc8888' }}>{total} {total === 1 ? 'item' : 'items'}</strong> in the trash will be permanently deleted and cannot be recovered.</>
            })()}
          </p>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setConfirmEmptyTrash(false)}>Cancel</button>
            <button className="welcome-btn modal-btn-danger" onClick={() => { emptyTrash(); setConfirmEmptyTrash(false) }}>
              Empty Trash
            </button>
          </div>
        </div>
      </div>
    )
  }

  // App message modal for showing custom alert prompts.
  const AppMessageModal = () => {
    if (!appMessage) return null
    const colors = {
      info: { border: '#1f6a9a', icon: 'ti-info-circle', iconColor: '#4fc3f7' },
      warning: { border: '#9a7a1f', icon: 'ti-alert-triangle', iconColor: '#ffd54f' },
      error: { border: '#9a1f1f', icon: 'ti-circle-x', iconColor: '#ef9a9a' },
    }
    const c = colors[appMessage.kind]
    return (
      <div className="modal-overlay" style={{ zIndex: 200 }}>
        <div className="modal-box" style={{ width: 380, borderColor: c.border }}>
          <div className="modal-message-header">
            <i className={`ti ${c.icon}`} style={{ color: c.iconColor }} aria-hidden="true" />
            <p className="modal-title">{appMessage.title}</p>
          </div>
          <p className="modal-danger-text">{appMessage.body}</p>
          <div className="modal-footer">
            {appMessage.action && (
              <button className="welcome-btn" onClick={() => { appMessage.action!.onClick(); setAppMessage(null) }}>
                {appMessage.action.label}
              </button>
            )}
            <button className="welcome-btn" onClick={() => setAppMessage(null)}>OK</button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation modal for permanently soft-deleting a scene tab.
  const ConfirmDeleteTabModal = () => {
    if (confirmDeleteTab === null) return null
    const tab = sceneTabs[confirmDeleteTab]
    return (
      <div className="modal-overlay">
        <div className="modal-box modal-danger" style={{ width: 380 }}>
          <p className="modal-title">Delete tab?</p>
          <p className="modal-danger-text">
            <strong style={{ color: '#cc8888' }}>{tab?.name}</strong> will be removed. Its content will be preserved in the scene file and can be manually recovered if needed.
          </p>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setConfirmDeleteTab(null)}>Cancel</button>
            <button className="welcome-btn modal-btn-danger" onClick={() => deleteTab(confirmDeleteTab)}>
              Delete
            </button>
          </div>
        </div>
      </div>
    )
  }

  // #endregion

  // #region === HANDLERS: WORD COUNT ===

  // Recounts every scene under Manuscript.
  const computeManuscriptWordCount = useCallback(async () => {
    if (!projectRef.current) return
    const manuscript = findNode(treeRef.current, 1)
    if (!manuscript || manuscript.type !== 'folder') return
    const docs = collectDocs(manuscript)
    let total = 0
    for (const doc of docs) {
      const content = await readSceneFile(projectRef.current.path, doc.file)
      const div = document.createElement('div')
      div.innerHTML = content
      const text = div.textContent ?? ''
      if (text.trim()) total += text.trim().split(/\s+/).length
    }
    setManuscriptWordCount(total)
  }, [])

  // Recounts the current scene's parent folder/chapter.
  const computeChapterWordCount = useCallback(async () => {
    if (!projectRef.current || activeIdRef.current === null) {
      setChapterWordCount(0)
      return
    }
    const parent = findParentFolder(treeRef.current, activeIdRef.current)
    if (!parent) {
      setChapterWordCount(0)
      return
    }
    const docs = collectDocs(parent)
    let total = 0
    for (const doc of docs) {
      const content = await readSceneFile(projectRef.current.path, doc.file)
      const div = document.createElement('div')
      div.innerHTML = content
      const text = div.textContent ?? ''
      if (text.trim()) total += text.trim().split(/\s+/).length
    }
    setChapterWordCount(total)
  }, [])

  // #endregion

  // #region === RENDER: WELCOME SCREEN ===
  // ───────────────────────────────────────────────────────────────────────────
  // Render: welcome screen shown when no project is open
  // ───────────────────────────────────────────────────────────────────────────
  if (!project) {
    return (
      <div id="app" className="app-welcome">
        <div id="menubar">
          <FileMenu />
          <EditMenu />
          <span className="project-title">Scrivus</span>
        </div>
        {showNewProject && <NewProjectModal />}
        {showStyles && <StylesModal />}
        {confirmDelete && <ConfirmDeleteModal />}
        {confirmBinDelete && <ConfirmBinDeleteModal />}
        {appMessage && <AppMessageModal />}
        {confirmEmptyTrash && <ConfirmEmptyTrashModal />}
        {confirmDeleteTab !== null && <ConfirmDeleteTabModal />}
        <i className="ti ti-feather welcome-icon" aria-hidden="true" />
        <p className="welcome-label">No project open</p>
        <div className={`welcome-actions${recentProjects.length ? ' welcome-actions-spaced' : ''}`}>
          <button className="welcome-btn" onClick={() => setShowNewProject(true)}>
            <i className="ti ti-folder-plus" aria-hidden="true" /> New project
          </button>
          <button className="welcome-btn" onClick={openProject}>
            <i className="ti ti-folder-open" aria-hidden="true" /> Open project
          </button>
        </div>
        {recentProjects.length > 0 && (
          <div className="welcome-recent">
            <p className="welcome-recent-heading">Recent projects</p>
            <div className="welcome-recent-list">
              {recentProjects.map(r => (
                <button key={r.path} className="welcome-recent-item" onClick={() => openProjectByPath(r.path)}>
                  <i className="ti ti-book welcome-recent-icon" aria-hidden="true" />
                  <div className="welcome-recent-text">
                    <p className="welcome-recent-name">{r.name}</p>
                    <p className="welcome-recent-path">{r.path}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // #endregion

  // #region === RENDER: MAIN EDITOR WORKSPACE ===
  // ───────────────────────────────────────────────────────────────────────────
  // Render: main editor workspace
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div id="app" style={{ position: 'relative' }}>
      <div id="menubar">
        <FileMenu />
        <EditMenu />
        <span className="project-title">{project.name}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#858585', paddingRight: 12 }}>{saveLabel}</span>
      </div>

      <div id="sidebar" className={`${binderOpen ? '' : 'collapsed'} ${workspace !== 'editor' ? 'hidden' : ''}`}>
        <div id="sidebar-header">
          {binderOpen && <span>Binder</span>}
          <div style={{ display: 'flex', flexDirection: binderOpen ? 'row' : 'column', gap: 2, alignItems: 'center' }}>
            {!binderOpen && (
              <button
                title="Expand binder"
                onClick={() => setBinderOpen(true)}
              >
                <i className="ti ti-chevrons-right" aria-hidden="true" />
              </button>
            )}
            <button
              title="Find and replace"
              className={showFnR ? 'active' : ''}
              onClick={() => {
                if (showFnR) {
                  setShowFnR(false)
                  setFnrFind('')
                  setFnrReplace('')
                  setFnrStatus('')
                  setFnrUndoSnapshot([])
                } else {
                  setShowFnR(true)
                  setShowSearch(false)
                  setSearchQuery('')
                  setSearchResults([])
                  setTimeout(() => fnrInputRef.current?.focus(), 50)
                }
              }}
              disabled={!project}
            >
              <i className="ti ti-replace" aria-hidden="true" />
            </button>
            <button
              title="Search project"
              className={showSearch ? 'active' : ''}
              onClick={() => {
                if (showSearch) {
                  setShowSearch(false)
                  setSearchQuery('')
                  setSearchResults([])
                } else {
                  setShowSearch(true)
                  setShowFnR(false)
                  setFnrFind('')
                  setFnrReplace('')
                  setFnrStatus('')
                  setFnrUndoSnapshot([])
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
              disabled={!project}
            >
              <i className="ti ti-search" aria-hidden="true" />
            </button>
            {binderOpen && (
              <>
                <div className="sidebar-sep" />
                <button
                  title="Collapse binder"
                  onClick={() => setBinderOpen(false)}
                >
                  <i className="ti ti-chevrons-left" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        {binderOpen && <div id="tree">
          {renderNodes(tree, 0)}
          <div
            style={{ flex: 1, minHeight: 40 }}
            onDragOver={e => {
              e.preventDefault()
              const lastNode = tree[tree.length - 1]
              if (lastNode) {
                dropTargetRef.current = { type: 'after', id: lastNode.id }
                setDropTarget({ type: 'after', id: lastNode.id })
              }
            }}
            onDrop={e => { e.preventDefault(); handleDrop(-1) }}
          />
          <div
            className="tree-item"
            onClick={() => { setTrashOpen(v => !v); if (!trashOpen) loadTrash() }}
            style={{ marginTop: 4, borderTop: '1px solid #2a2d2e', paddingTop: 6 }}
          >
            <span style={{ width: 4, flexShrink: 0, display: 'inline-block' }} />
            <span className="toggle">
              <i className={`ti ti-chevron-${trashOpen ? 'down' : 'right'}`} aria-hidden="true" />
            </span>
            <span className="item-icon">
              <i className="ti ti-trash" aria-hidden="true" />
            </span>
            <span className="item-label">Trash</span>
            {trashItems.length > 0 && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                <button
                  title="Empty Trash"
                  onClick={e => { e.stopPropagation(); setConfirmEmptyTrash(true) }}
                >
                  <i className="ti ti-trash-x" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {trashOpen && (
            <div>
              {trashItems.length === 0
                ? <div style={{ padding: '4px 8px 4px 32px', fontSize: 12, color: '#4a4a4a', fontStyle: 'italic' }}>Empty</div>
                : trashItems.map(item => renderTrashItem(item.sidecarId, item.node, item.originalFolderId, 1))
              }
            </div>
          )}
        </div>}
      </div>

      {showSearch && workspace === 'editor' && (
        <div id="search-panel">
          <div id="search-panel-header">
            Search
            <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
          <div id="search-input-wrap">
            <input
              id="search-input"
              ref={searchInputRef}
              type="text"
              placeholder="Search all scenes…"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
                runSearch(e.target.value)
              }}
              onKeyDown={e => {
                if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }
              }}
            />
          </div>
          <div id="search-results">
            {searchLoading && <div id="search-empty">Searching…</div>}
            {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
              <div id="search-empty">No results found</div>
            )}
            {!searchLoading && !searchQuery.trim() && (
              <div id="search-empty">Type to search</div>
            )}
            {!searchLoading && searchResults.map((result, i) => (
              <div key={i} className="search-result" onClick={() => openSearchResult(result)}>
                <div className="search-result-title">{result.title}</div>
                <div className="search-result-excerpt">
                  {(() => {
                    const q = searchQuery.toLowerCase()
                    const idx = result.excerpt.toLowerCase().indexOf(q)
                    if (idx === -1) return result.excerpt
                    return (
                      <>
                        {result.excerpt.slice(0, idx)}
                        <mark>{result.excerpt.slice(idx, idx + searchQuery.length)}</mark>
                        {result.excerpt.slice(idx + searchQuery.length)}
                      </>
                    )
                  })()}
                </div>
                <div className="search-result-source">{result.source}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showSearch && workspace === 'editor' && (
        <div id="fnr-panel">
          <div id="fnr-panel-header">
            Find & Replace
            <button onClick={() => { setShowFnR(false); setFnrFind(''); setFnrReplace(''); setFnrStatus(''); setFnrUndoSnapshot([]) }}>
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
          <div id="fnr-body">
            <input
              ref={fnrInputRef}
              type="text"
              placeholder="Find…"
              value={fnrFind}
              onChange={e => { setFnrFind(e.target.value); setFnrStatus('') }}
              onKeyDown={e => {
                if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                if (e.key === 'Escape') { setShowFnR(false); setFnrFind(''); setFnrReplace(''); setFnrStatus(''); setFnrUndoSnapshot([]) }
              }}
            />
            <input
              type="text"
              placeholder="Replace with…"
              value={fnrReplace}
              onChange={e => { setFnrReplace(e.target.value); setFnrStatus('') }}
              onKeyDown={e => {
                if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                if (e.key === 'Escape') { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }
              }}
            />
            <div id="fnr-scope">
              <button
                className={fnrScope === 'scene' ? 'active' : ''}
                onClick={() => setFnrScope('scene')}
              >
                Current scene
              </button>
              <button
                className={fnrScope === 'manuscript' ? 'active' : ''}
                onClick={() => setFnrScope('manuscript')}
              >
                Manuscript
              </button>
            </div>
            <div id="fnr-actions">
              <button disabled={!fnrFind.trim()} onClick={fnrReplaceOne}>
                Replace
              </button>
              <button disabled={!fnrFind.trim()} onClick={fnrReplaceAll}>
                Replace All
              </button>
            </div>
            {fnrUndoSnapshot.length > 0 && fnrScope === 'manuscript' && (
              <button onClick={fnrUndoReplaceAll} style={{
                width: '100%', border: '1px solid #3c3c3c', background: '#2d2d2d',
                cursor: 'pointer', padding: '6px 8px', borderRadius: 4,
                fontSize: 11, color: '#cccccc', fontFamily: 'inherit',
              }}>
                Undo last Replace All
              </button>
            )}
          </div>
          <div id="fnr-status">{fnrStatus}</div>
        </div>
      )}

      <div id="editor-area">
        <div id="workspace-bar">
          <button
            className={workspace === 'editor' ? 'active' : ''}
            onClick={() => setWorkspace('editor')}
            title="Editor"
          >
            <i className="ti ti-edit" aria-hidden="true" />
            <span>Editor</span>
          </button>
          <button
            className={workspace === 'lorebook' ? 'active' : ''}
            onClick={() => setWorkspace('lorebook')}
            title="Lore Book"
          >
            <i className="ti ti-book-2" aria-hidden="true" />
            <span>Lore Book</span>
          </button>
          <button
            className={workspace === 'mindmap' ? 'active' : ''}
            onClick={() => setWorkspace('mindmap')}
            title="Mind Map"
          >
            <i className="ti ti-git-fork" aria-hidden="true" />
            <span>Mind Map</span>
          </button>
        </div>

        {workspace === 'editor' && showEditor && (
          <div id="scene-tab-bar">
            {sceneTabs.map((tab, index) => {
              const isActive = index === activeTabIndex
              const isDragging = tabDragIndex === index
              const isDropTarget = tabDropIndex === index
              return (
                <div key={index} style={{ display: 'flex', alignItems: 'stretch' }}>
                  {isDropTarget && tabDragIndex !== index && (
                    <div className="tab-drop-line" />
                  )}
                  <div
                    className={`scene-tab${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}`}
                    draggable={renamingTabIndex !== index}
                    onDragStart={renamingTabIndex !== index ? e => {
                      e.stopPropagation()
                      tabDragIndexRef.current = index
                      setTabDragIndex(index)
                      e.dataTransfer.effectAllowed = 'move'
                    } : undefined}
                    onDragEnd={() => {
                      setTabDragIndex(null)
                      setTabDropIndex(null)
                      tabDragIndexRef.current = null
                    }}
                    onDragOver={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setTabDropIndex(index)
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleTabDrop(index)
                    }}
                    onClick={() => {
                      if (renamingTabIndex === index) return
                      switchTab(index)
                    }}
                    onDoubleClick={() => setRenamingTabIndex(index)}
                    onContextMenu={e => {
                      e.preventDefault()
                      e.stopPropagation()
                      setTabContextMenu({ x: e.clientX, y: e.clientY, index })
                    }}
                  >
                    {renamingTabIndex === index
                      ? <input
                        className="tab-rename-input"
                        defaultValue={tab.name}
                        autoFocus
                        ref={el => { if (el) { el.focus(); el.select() } }}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                          if (e.key === 'Enter') renameTab(index, (e.target as HTMLInputElement).value)
                          if (e.key === 'Escape') setRenamingTabIndex(null)
                        }}
                        onBlur={e => renameTab(index, e.target.value)}
                      />
                      : <span className="tab-label">{tab.name}</span>
                    }
                  </div>
                </div>
              )
            })}
            <button
              className="tab-add-btn"
              title="Add tab"
              onClick={addTab}
            >
              <i className="ti ti-plus" aria-hidden="true" />
            </button>
          </div>
        )}

        {workspace === 'editor' && (
          <div id="editor-toolbar">
            <button
              className={editor?.isActive('bold') ? 'active' : ''}
              onClick={() => editor?.chain().focus().toggleBold().run()}
              title="Bold"
            >
              <i className="ti ti-bold" aria-hidden="true" />
            </button>
            <button
              className={editor?.isActive('italic') ? 'active' : ''}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              title="Italic"
            >
              <i className="ti ti-italic" aria-hidden="true" />
            </button>
          </div>
        )}

        {workspace === 'lorebook' && (
          <div id="workspace-placeholder">
            <i className="ti ti-book-2" aria-hidden="true" />
            <p>Lore Book</p>
            <p className="empty-state-hint">Coming soon</p>
          </div>
        )}

        {workspace === 'mindmap' && (
          <div id="workspace-placeholder">
            <i className="ti ti-git-fork" aria-hidden="true" />
            <p>Mind Map</p>
            <p className="empty-state-hint">Coming soon</p>
          </div>
        )}

        {workspace === 'editor' && (showEditor
          ? <>
            <div id="editor-scroll">
              <div id="editor-wrap">
                {isTrashPreview && (
                  <div className="trash-preview-banner">
                    <i className="ti ti-trash" aria-hidden="true" />
                    This scene is in the trash — read only. Restore it to edit.
                  </div>
                )}
                <div id="editor-title">{titleValue}</div>
                <div className="tiptap-wrap">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
            {!isNarrow && (
              <div id="statusbar">
                <span title="Words in current scene">
                  Scene: {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
                </span>
                <span className="statusbar-sep">·</span>
                <span title="Words in current chapter">
                  Chapter: {chapterWordCount > 0 ? `${chapterWordCount.toLocaleString()} ${chapterWordCount === 1 ? 'word' : 'words'}` : '—'}
                </span>
                <span className="statusbar-sep">·</span>
                <span title="Estimated reading time for current chapter at 238 wpm">
                  {chapterWordCount > 0 ? (() => {
                    const minutes = Math.ceil(chapterWordCount / 238)
                    if (minutes < 60) return `~${minutes} min chapter`
                    const hours = Math.floor(minutes / 60)
                    const mins = minutes % 60
                    return mins > 0 ? `~${hours}h ${mins}m chapter` : `~${hours}h chapter`
                  })() : '— chapter'}
                </span>
                <span className="statusbar-sep">·</span>
                <span title="Total words in Manuscript">
                  Manuscript: {manuscriptWordCount.toLocaleString()} {manuscriptWordCount === 1 ? 'word' : 'words'}
                </span>
                <span className="statusbar-sep">·</span>
                <span title="Estimated reading time for full manuscript at 238 wpm">
                  {(() => {
                    const minutes = Math.ceil(manuscriptWordCount / 238)
                    if (minutes < 60) return `~${minutes} min manuscript`
                    const hours = Math.floor(minutes / 60)
                    const mins = minutes % 60
                    return mins > 0 ? `~${hours}h ${mins}m manuscript` : `~${hours}h manuscript`
                  })()}
                </span>
                <div className="zoom-control">
                  <button className="zoom-btn" onClick={() => setZoomOpen(o => !o)}>
                    {zoom}% <i className="ti ti-chevron-up" />
                  </button>
                  {zoomOpen && (
                    <div className="zoom-dropdown">
                      {ZOOM_PRESETS.map(p => (
                        <button
                          key={p}
                          className={zoom === p ? 'active' : ''}
                          onClick={() => { setZoom(p); setZoomOpen(false) }}
                        >
                          {p === zoom ? <i className="ti ti-circle-filled zoom-active-dot" /> : <span className="zoom-inactive-dot" />}
                          {p}%
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
          : <div id="empty-state">
            <i className="ti ti-file-text" aria-hidden="true" />
            <p>Select a scene to start writing</p>
            <p className="empty-state-hint">or add one using the + buttons</p>
          </div>
        )}
      </div>
      <div id="inspector" className={`${inspectorOpen ? '' : 'collapsed'} ${workspace !== 'editor' ? 'hidden' : ''}`}>
        <div id="inspector-header">
          <div style={{ display: 'flex', flexDirection: inspectorOpen ? 'row' : 'column', gap: 2, alignItems: 'center' }}>
            {!inspectorOpen && (
              <button title="Expand inspector" onClick={() => setInspectorOpen(true)}>
                <i className="ti ti-chevrons-left" aria-hidden="true" />
              </button>
            )}
            {inspectorOpen && (
              <>
                <button title="Collapse inspector" onClick={() => setInspectorOpen(false)}>
                  <i className="ti ti-chevrons-right" aria-hidden="true" />
                </button>
                <div className="sidebar-sep" />
              </>
            )}
          </div>
          {inspectorOpen && <span>Quick Tools</span>}
        </div>
        {inspectorOpen && (
          <div id="inspector-body">
            <InspectorDrawer id="quickNote" label="Quick Note">
              <textarea
                key={project?.path ?? 'none'}
                defaultValue={quickNote}
                onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                onChange={e => {
                  const val = e.target.value
                  quickNoteRef.current = val
                  if (quickNoteTimerRef.current) clearTimeout(quickNoteTimerRef.current)
                  quickNoteTimerRef.current = setTimeout(async () => {
                    if (!projectRef.current) return
                    await writeNotesFile(projectRef.current.path, {
                      quickNote: quickNoteRef.current,
                      checklist: checklistRef.current,
                    })
                  }, 600)
                }}
                placeholder="Project scratch pad…"
                className="inspector-textarea inspector-textarea-tall"

              />
            </InspectorDrawer>
            <InspectorDrawer id="checklist" label="Checklist">
              {(() => {
                const unchecked = checklist
                  .filter(i => !i.checked)
                  .sort((a, b) => a.order - b.order)
                const checked = checklist.filter(i => i.checked)

                const renderItem = (item: ChecklistItem, index: number) => {
                  const isDragging = checklistDragId === item.id
                  const isDropTarget = checklistDropIndex === index

                  return (
                    <div key={item.id}>
                      {isDropTarget && <div className="checklist-drop-line" />}
                      <div
                        className="checklist-item"
                        style={{ opacity: isDragging ? 0.4 : 1 }}
                        onDragOver={!item.checked ? e => {
                          e.preventDefault()
                          e.stopPropagation()
                          setChecklistDropIndex(index)
                        } : undefined}
                        onDrop={!item.checked ? e => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleChecklistDrop(index)
                        } : undefined}
                      >
                        {!item.checked
                          ? <span
                            className="card-drag-handle"
                            draggable={renamingChecklistId !== item.id}
                            onDragStart={renamingChecklistId !== item.id ? e => {
                              e.stopPropagation()
                              checklistDragIdRef.current = item.id
                              e.dataTransfer.effectAllowed = 'move'
                              requestAnimationFrame(() => setChecklistDragId(item.id))
                            } : undefined}
                            onDragEnd={() => {
                              setChecklistDragId(null)
                              setChecklistDropIndex(null)
                              checklistDragIdRef.current = null
                            }}
                            onClick={e => e.stopPropagation()}
                          >
                            <i className="ti ti-grip-vertical" aria-hidden="true" />
                          </span>
                          : <span style={{ width: 20, flexShrink: 0 }} />
                        }
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleChecklistItem(item.id)}
                          className="checklist-checkbox"
                        />
                        {renamingChecklistId === item.id
                          ? <input
                            className="checklist-rename"
                            defaultValue={item.label}
                            autoFocus
                            ref={el => { if (el) { el.focus(); el.select() } }}
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                              if (e.key === 'Enter') renameChecklistItem(item.id, (e.target as HTMLInputElement).value)
                              if (e.key === 'Escape') setRenamingChecklistId(null)
                            }}
                            onBlur={e => renameChecklistItem(item.id, e.target.value)}
                          />
                          : <>
                            <span
                              className="checklist-label"
                              style={{ textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? '#4a4a4a' : '#c8c8c8' }}
                              onDoubleClick={() => { if (!item.checked) setRenamingChecklistId(item.id) }}
                            >
                              {item.label}
                            </span>
                            {!item.checked && (
                              <button
                                className="checklist-delete"
                                title="Rename"
                                onClick={e => { e.stopPropagation(); setRenamingChecklistId(item.id) }}
                              >
                                <i className="ti ti-pencil" aria-hidden="true" />
                              </button>
                            )}
                          </>
                        }
                        {item.checked && (
                          <button
                            className="checklist-delete"
                            title="Delete"
                            onClick={() => deleteChecklistItem(item.id)}
                          >
                            <i className="ti ti-x" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="checklist-wrap">
                    {unchecked.map((item, index) => renderItem(item, index))}
                    {checked.map(item => renderItem(item, unchecked.length))}
                    <button className="checklist-add" onClick={addChecklistItem}>
                      <i className="ti ti-plus" aria-hidden="true" /> Add item
                    </button>
                  </div>
                )
              })()}
            </InspectorDrawer>
          </div>
        )}
      </div>
      
      {tabContextMenu && (
        <div
          style={{
            position: 'fixed',
            top: tabContextMenu.y,
            left: tabContextMenu.x,
            background: '#2d2d2d',
            border: '1px solid #111',
            borderRadius: 4,
            padding: '4px 0',
            minWidth: 140,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button className="ctx-menu-item" onClick={() => {
            setRenamingTabIndex(tabContextMenu.index)
            setTabContextMenu(null)
          }}>
            <i className="ti ti-pencil" /> Rename
          </button>
          <div style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
          <button
            className="ctx-menu-item"
            style={{ color: sceneTabs.length <= 1 ? '#4a4a4a' : '#cc8888' }}
            disabled={sceneTabs.length <= 1}
            onClick={() => {
              if (sceneTabs.length <= 1) return
              setConfirmDeleteTab(tabContextMenu.index)
              setTabContextMenu(null)
            }}
          >
            <i className="ti ti-trash" /> Delete
          </button>
        </div>
      )}
      
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#2d2d2d',
            border: '1px solid #111',
            borderRadius: 4,
            padding: '4px 0',
            minWidth: 160,
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Rename — not for protected nodes */}
          {contextMenu.node.id !== 1 && contextMenu.node.id !== 2 && (
            <button className="ctx-menu-item" onClick={() => {
              setRenamingId(contextMenu.node.id)
              setContextMenu(null)
            }}>
              <i className="ti ti-pencil" /> Rename
            </button>
          )}

          {/* Duplicate — not for protected nodes */}
          {contextMenu.node.id !== 1 && contextMenu.node.id !== 2 && (
            <button className="ctx-menu-item" onClick={async () => {
              console.log('duplicate clicked, node:', contextMenu.node)
              await duplicateNode(contextMenu.node.id)
              setContextMenu(null)
            }}>
              <i className="ti ti-copy" /> Duplicate
            </button>
          )}

          {/* Add Scene */}
          <button className="ctx-menu-item" onClick={() => {
            if (contextMenu.node.type === 'folder') {
              // Add scene as child of this folder
              addDoc(contextMenu.node.id)
            } else {
              // Add scene after this scene in its parent folder
              const parent = findParentFolder(treeRef.current, contextMenu.node.id)
              if (parent) {
                const newId = nextId++
                const fileId = generateFileId()
                const newDoc: DocNode = { id: newId, type: 'doc', label: 'New scene', title: 'New scene', file: fileId }
                const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
                const parentNode = findNode(newTree, parent.id) as FolderNode
                const idx = parentNode.children.findIndex(c => c.id === contextMenu.node.id)
                parentNode.children.splice(idx + 1, 0, newDoc)
                setTree(newTree)
                treeRef.current = newTree
                if (projectRef.current) {
                  writeSceneFile(projectRef.current.path, fileId, '')
                  saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
                }
                setRenamingId(newId)
                setActiveId(newId)
                setTitleValue('New scene')
                bodyHtmlRef.current = ''
                editor?.commands.setContent('')
              }
            }
            setContextMenu(null)
          }}>
            <i className="ti ti-file-plus" /> Add Scene
          </button>

          {/* Add Folder — only at depth 0 (top-level folders) or on a folder */}
          {(contextMenu.node.type === 'folder' || contextMenu.depth === 0) && (
            <button className="ctx-menu-item" onClick={() => {
              if (contextMenu.node.type === 'folder') {
                // Add folder after this folder
                const newId = nextId++
                const newFolder: FolderNode = { id: newId, type: 'folder', label: 'New folder', open: true, children: [] }
                const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
                const manuscript = findNode(newTree, 1) as FolderNode
                const idx = manuscript.children.findIndex(c => c.id === contextMenu.node.id)
                manuscript.children.splice(idx + 1, 0, newFolder)
                setTree(newTree)
                treeRef.current = newTree
                if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
                setRenamingId(newId)
              } else {
                // Scene — add folder after its parent folder
                const parent = findParentFolder(treeRef.current, contextMenu.node.id)
                if (parent) addFolder(parent.id)
              }
              setContextMenu(null)
            }}>
              <i className="ti ti-folder-plus" /> Add Folder
            </button>
          )}

          {/* Separator + Trash — not for protected nodes */}
          {contextMenu.node.id !== 1 && contextMenu.node.id !== 2 && (
            <>
              <div style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
              <button className="ctx-menu-item" style={{ color: '#cc8888' }} onClick={() => {
                setConfirmBinDelete({ id: contextMenu.node.id, label: contextMenu.node.label })
                setContextMenu(null)
              }}>
                <i className="ti ti-trash" /> Move to Trash
              </button>
            </>
          )}
        </div>
      )}

      {showNewProject && <NewProjectModal />}
      {showStyles && <StylesModal />}
      {confirmDelete && <ConfirmDeleteModal />}
      {confirmBinDelete && <ConfirmBinDeleteModal />}
      {appMessage && <AppMessageModal />}
      {confirmEmptyTrash && <ConfirmEmptyTrashModal />}
      {confirmDeleteTab !== null && <ConfirmDeleteTabModal />}
      
    </div>
  )

  // #endregion
}

// #endregion