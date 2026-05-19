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
import './App.css'

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
    justification: 'left',
    firstLineIndent: true,
    lineSpacing: 0,
  },
}

// Runtime id counter for newly-created folders/scenes. Persisted in project.json.
let nextId = 10

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

// Counts words from HTML by reading its text content.
function wordCountFromHtml(html: string): number {
  const div = document.createElement('div')
  div.innerHTML = html
  const text = div.textContent ?? ''
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

// Removes temporary find-and-replace highlight marks from saved HTML.
function stripFnrHighlights(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('mark.fnr-highlight').forEach(mark => {
    mark.replaceWith(mark.textContent ?? '')
  })
  return div.innerHTML
}

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
          const html = await readSceneFile(projectPath, child.file)
          if (html.trim()) result.push({ type: 'body', html })
        }
      }
    } else if (n.type === 'doc') {
      const html = await readSceneFile(projectPath, n.file)
      if (html.trim()) result.push({ type: 'body', html })
    }
  }
  return result
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Main application component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
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
  const [charCount, setCharCount] = useState(0)
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
      handleKeyDown: (_view, event) => {
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
      const json = editor.getJSON()
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
        const content = node.body || ''
        bodyHtmlRef.current = content
        editor.commands.setContent(content, false)
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

  // Saves the currently active scene and project metadata.
  const saveActive = useCallback((currentTree?: TreeNode[]) => {
    if (activeIdRef.current === null) return
    const workingTree = currentTree ?? treeRef.current
    const clone = JSON.parse(JSON.stringify(workingTree)) as TreeNode[]
    const node = findNode(clone, activeIdRef.current)
    if (node && node.type === 'doc' && projectRef.current) {
      const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
      writeSceneFile(projectRef.current.path, node.file, cleanHtml)
    }
    setTree(clone)
    treeRef.current = clone
    if (projectRef.current) {
      saveProjectToDisk({ ...projectRef.current, tree: clone }, activeIdRef.current ?? undefined)
    }
  }, [])

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
      const content = await readSceneFile(projectRef.current.path, node.file)
      bodyHtmlRef.current = content
      editor?.commands.setContent(content, false)
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
  const restoreFromTrash = async (sidecarId: string, node: TreeNode, originalFolderId: number) => {
    if (!projectRef.current) return
    try {
      // Move all doc files back to scenes
      const docs = collectDocs(node)
      for (const doc of docs) {
        const from = await join(projectRef.current.path, 'trash', `${doc.file}.md`)
        const to = await join(projectRef.current.path, 'scenes', `${doc.file}.md`)
        const fileExists = await exists(from)
        if (fileExists) await rename(from, to)
      }

      // Delete the sidecar
      const sidecar = await join(projectRef.current.path, 'trash', `${sidecarId}.json`)
      await remove(sidecar)

      // Re-insert into tree
      const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
      const targetFolder = findNode(newTree, originalFolderId) as FolderNode | null
      const manuscript = findNode(newTree, 1) as FolderNode | null
      if (targetFolder && targetFolder.type === 'folder') {
        targetFolder.children.push(node)
      } else if (manuscript && manuscript.type === 'folder') {
        manuscript.children.push(node)
      } else {
        newTree.push(node)
      }
      setTree(newTree)
      treeRef.current = newTree
      saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
      setTrashItems(prev => prev.filter(i => i.sidecarId !== sidecarId))
    } catch (e) {
      alert('Failed to restore: ' + String(e))
    }
  }

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
      editor?.commands.setContent(result, false)

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
            editor?.commands.setContent(result, false)
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
      editor?.commands.setContent(result, false)
      saveActive()
      totalCount = count
    } else {
      const manuscript = findNode(treeRef.current, 1)
      if (!manuscript || manuscript.type !== 'folder') return
      const docs = collectDocs(manuscript)
      for (const doc of docs) {
        const content = await readSceneFile(projectRef.current.path, doc.file)
        const { result, count } = replaceInHtml(content, fnrFind, fnrReplace)
        if (count > 0) {
          await writeSceneFile(projectRef.current.path, doc.file, result)
          if (activeIdRef.current === doc.id) {
            bodyHtmlRef.current = result
            editor?.commands.setContent(result, false)
          }
          totalCount += count
        }
      }
      if (totalCount === 0) { setFnrStatus('No matches found in manuscript.'); return }
    }

    setFnrStatus(`Replaced ${totalCount} match${totalCount !== 1 ? 'es' : ''}.`)
    editor?.commands.focus()
    setFnrVersion(v => v + 1)
  }


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
  }

  // Exports the manuscript folder to a DOCX document.
  const compileProject = async () => {
    if (!project) return
    setFileMenuOpen(false)

    const nodes = await collectCompileNodes(tree, project.path)
    if (nodes.length === 0) {
      alert('Nothing to export — add some content first.')
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
      alert(`Exported to ${outputPath}`)
    } catch (e) {
      alert('Export failed: ' + String(e))
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
      const defaultTree: TreeNode[] = [
        { id: 1, type: 'folder', label: 'Manuscript', open: true, children: [] },
        { id: 2, type: 'folder', label: 'Notes', open: true, children: [] },
      ]
      nextId = 10
      const { defaultStyles } = await loadRecentData()
      const newProj: Project = { name: newProjectName.trim(), path: projectPath, tree: defaultTree, styles: defaultStyles }
      await saveProjectToDisk(newProj)
      await addToRecentProjects(newProjectName.trim(), projectPath)
      setProject(newProj)
      setStyles(defaultStyles)
      projectRef.current = newProj
      setTree(defaultTree)
      setActiveId(null)
      setTitleValue('')
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
      setShowNewProject(false)
      setNewProjectName('')
      setNewProjectParent('')
      setRecentProjects(await loadRecentProjects())
    } catch (e) {
      alert('Failed to create project: ' + String(e))
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
    setStyles(loadedStyles)
    const restoredId = (data.lastActiveId as number | null) ?? null
    setActiveId(restoredId)
    if (restoredId !== null) {
      const restoredNode = findNode(loadedTree, restoredId)
      if (restoredNode && restoredNode.type === 'doc') {
        setTitleValue(restoredNode.title)
        const content = await readSceneFile(path, restoredNode.file)
        bodyHtmlRef.current = content
        editor?.commands.setContent(content, false)
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
    if (!fileExists) { alert('That folder does not contain a Scrivus project.'); return }
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
        alert('That project could not be found. It may have been moved or deleted.')
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
      alert('Failed to open project: ' + String(e))
    }
  }

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
    if (projectRef.current) {
      writeSceneFile(projectRef.current.path, fileId, '')
      saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    }
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
    } catch (e) {
      alert('Failed to delete: ' + String(e))
    }
  }

  // Loads a trashed scene into the editor in read-only preview mode.
  const previewTrashScene = async (doc: DocNode) => {
    if (!projectRef.current) return
    const content = await readSceneFile(projectRef.current.path, doc.file)
      .catch(async () => {
        // file is in trash folder, not scenes
        const filePath = await join(projectRef.current!.path, 'trash', `${doc.file}.md`)
        const fileExists = await exists(filePath)
        if (!fileExists) return ''
        return await readTextFile(filePath)
      })
    setIsTrashPreview(true)
    setTitleValue(doc.title)
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, false)
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
  const showEditor = activeNode?.type === 'doc'

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
              onClick={e => { e.stopPropagation(); restoreFromTrash(sidecarId, node, originalFolderId) }}
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
              : <span className="item-label">{n.label}</span>
            }
            {n.type === 'folder' && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                <button title="New scene" onClick={e => { e.stopPropagation(); addDoc(n.id) }}>
                  <i className="ti ti-file-plus" aria-hidden="true" />
                </button>
                <button title="New folder" onClick={e => { e.stopPropagation(); addFolder(n.id) }}>
                  <i className="ti ti-folder-plus" aria-hidden="true" />
                </button>
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
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}>
        <div style={{
          background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8,
          padding: '24px 28px', width: 440, display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Styles</p>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #3c3c3c' }}>
            {(['chapter', 'body'] as const).map(tab => (
              <button key={tab} onClick={() => setStylesTab(tab)} style={{
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '6px 16px', fontSize: 12, fontFamily: 'inherit',
                color: stylesTab === tab ? '#d4d4d4' : '#858585',
                borderBottom: stylesTab === tab ? '2px solid #007acc' : '2px solid transparent',
                marginBottom: -1,
              }}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {stylesTab === 'chapter' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Font</label>
                <select value={local.chapter.font}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, font: e.target.value } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit' }}>
                  {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Size (pt)</label>
                <input type="number" min={8} max={72} value={local.chapter.size}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, size: Number(e.target.value) } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit', width: 80 }} />
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cccccc', cursor: 'pointer' }}>
                  <input type="checkbox" checked={local.chapter.bold}
                    onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, bold: e.target.checked } }))} />
                  Bold
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cccccc', cursor: 'pointer' }}>
                  <input type="checkbox" checked={local.chapter.italic}
                    onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, italic: e.target.checked } }))} />
                  Italic
                </label>
              </div>
              <div style={{
                marginTop: 8, padding: '12px 16px', background: '#1e1e1e',
                borderRadius: 4, border: '1px solid #3c3c3c',
                fontFamily: local.chapter.font, fontSize: local.chapter.size * 0.75,
                fontWeight: local.chapter.bold ? 700 : 400,
                fontStyle: local.chapter.italic ? 'italic' : 'normal', color: '#d4d4d4',
              }}>Chapter One</div>
            </div>
          )}

          {stylesTab === 'body' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Font</label>
                <select value={local.body.font}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, font: e.target.value } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit' }}>
                  {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Size (pt)</label>
                <input type="number" min={8} max={72} value={local.body.size}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, size: Number(e.target.value) } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit', width: 80 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Justification</label>
                <select value={local.body.justification}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, justification: e.target.value as BodyStyle['justification'] } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit' }}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                  <option value="both">Justified</option>
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cccccc', cursor: 'pointer' }}>
                <input type="checkbox" checked={local.body.firstLineIndent}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, firstLineIndent: e.target.checked } }))} />
                First line indent
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Line spacing (pt)</label>
                <input type="number" min={0} max={72} step={0.5} value={local.body.lineSpacing}
                  onChange={e => setLocal(p => ({ ...p, body: { ...p.body, lineSpacing: Number(e.target.value) } }))}
                  style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', fontFamily: 'inherit', width: 80 }} />
              </div>
              <div style={{
                marginTop: 8, padding: '12px 16px', background: '#1e1e1e',
                borderRadius: 4, border: '1px solid #3c3c3c',
                fontFamily: local.body.font, fontSize: local.body.size * 0.75,
                textAlign: local.body.justification === 'both' ? 'justify' : local.body.justification,
                color: '#c8c8c8', lineHeight: 1.6,
              }}>
                <span style={{ display: 'inline-block', textIndent: local.body.firstLineIndent ? '2em' : '0' }}>
                  The road out of Calver runs north until it doesn't. Maren had driven it a hundred times in childhood, always in the passenger seat, watching the tree line blur.
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
            <button className="welcome-btn" onClick={saveAsDefault}>Save as default</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="welcome-btn" onClick={() => setShowStyles(false)}>Cancel</button>
              <button className="welcome-btn" onClick={applyStyles}>Apply</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

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

  // Modal for creating a new project folder.
  const NewProjectModal = () => (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div style={{
        background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8,
        padding: '24px 28px', width: 400, display: 'flex', flexDirection: 'column', gap: 16
      }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>New Project</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Project name</label>
          <input type="text" autoFocus value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createProject() }}
            placeholder="My Novel"
            style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4, color: '#d4d4d4', fontSize: 13, padding: '7px 10px', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              flex: 1, background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 4,
              color: newProjectParent ? '#d4d4d4' : '#4a4a4a', fontSize: 12,
              padding: '7px 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {newProjectParent || 'No folder selected'}
            </div>
            <button className="welcome-btn" onClick={pickParentFolder} style={{ whiteSpace: 'nowrap' }}>Browse…</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="welcome-btn" onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectParent('') }}>Cancel</button>
          <button className="welcome-btn" onClick={createProject}
            style={{ opacity: newProjectName.trim() && newProjectParent ? 1 : 0.4 }}>Create</button>
        </div>
      </div>
    </div>
  )

  // Confirmation modal for permanent trash deletion.
  const ConfirmDeleteModal = () => {
    if (!confirmDelete) return null
    return (
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}>
        <div style={{
          background: '#252526', border: '1px solid #6b3333', borderRadius: 8,
          padding: '24px 28px', width: 380, display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Permanently delete?</p>
          <p style={{ fontSize: 13, color: '#858585', lineHeight: 1.5 }}>
            <strong style={{ color: '#cc8888' }}>{confirmDelete.node.label}</strong> will be permanently deleted and cannot be recovered.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="welcome-btn" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              className="welcome-btn"
              onClick={() => permanentlyDelete(confirmDelete.sidecarId, confirmDelete.node)}
              style={{ borderColor: '#6b3333', color: '#cc8888' }}
            >
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
      <div style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
      }}>
        <div style={{
          background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8,
          padding: '24px 28px', width: 380, display: 'flex', flexDirection: 'column', gap: 16
        }}>
          <p style={{ fontSize: 14, fontWeight: 500, color: '#d4d4d4' }}>Move to trash?</p>
          <p style={{ fontSize: 13, color: '#858585', lineHeight: 1.5 }}>
            <strong style={{ color: '#d4d4d4' }}>{confirmBinDelete.label}</strong> will be moved to the trash.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="welcome-btn" onClick={() => setConfirmBinDelete(null)}>
              Cancel
            </button>
            <button
              className="welcome-btn"
              onClick={() => { deleteNode(confirmBinDelete.id); setConfirmBinDelete(null) }}
            >
              Move to trash
            </button>
          </div>
        </div>
      </div>
    )
  }

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

  // ───────────────────────────────────────────────────────────────────────────
  // Render: welcome screen shown when no project is open
  // ───────────────────────────────────────────────────────────────────────────
  if (!project) {
    return (
      <div id="app" style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div id="menubar">
          <FileMenu />
          <EditMenu />
          <span className="project-title">Scrivus</span>
        </div>
        {showNewProject && <NewProjectModal />}
        {showStyles && <StylesModal />}
        {confirmDelete && <ConfirmDeleteModal />}
        {confirmBinDelete && <ConfirmBinDeleteModal />}
        <i className="ti ti-feather" aria-hidden="true" style={{ fontSize: 48, color: '#4a4a4a', marginTop: 36 }} />
        <p style={{ color: '#858585', fontSize: 14, marginBottom: 8 }}>No project open</p>
        <div style={{ display: 'flex', gap: 10, marginBottom: recentProjects.length ? 32 : 0 }}>
          <button className="welcome-btn" onClick={() => setShowNewProject(true)}>
            <i className="ti ti-folder-plus" aria-hidden="true" /> New project
          </button>
          <button className="welcome-btn" onClick={openProject}>
            <i className="ti ti-folder-open" aria-hidden="true" /> Open project
          </button>
        </div>
        {recentProjects.length > 0 && (
          <div style={{ width: 340 }}>
            <p style={{ fontSize: 10, color: '#858585', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Recent projects</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentProjects.map(r => (
                <button key={r.path} onClick={() => openProjectByPath(r.path)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 5, textAlign: 'left', width: '100%' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#2a2d2e')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <i className="ti ti-book" aria-hidden="true" style={{ fontSize: 15, color: '#858585', flexShrink: 0 }} />
                  <div style={{ overflow: 'hidden' }}>
                    <p style={{ fontSize: 13, color: '#cccccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</p>
                    <p style={{ fontSize: 11, color: '#4a4a4a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.path}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

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

      <div id="sidebar">
        <div id="sidebar-header">
          Binder
          <div style={{ display: 'flex', gap: 2 }}>
            <button
              title="Find and replace"
              className={showFnR ? 'active' : ''}
              onClick={() => {
                if (showFnR) {
                  setShowFnR(false)
                  setFnrFind('')
                  setFnrReplace('')
                  setFnrStatus('')
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
                  setTimeout(() => searchInputRef.current?.focus(), 50)
                }
              }}
              disabled={!project}
            >
              <i className="ti ti-search" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div id="tree">
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
          </div>
          {trashOpen && (
            <div>
              {trashItems.length === 0
                ? <div style={{ padding: '4px 8px 4px 32px', fontSize: 12, color: '#4a4a4a', fontStyle: 'italic' }}>Empty</div>
                : trashItems.map(item => renderTrashItem(item.sidecarId, item.node, item.originalFolderId, 1))
              }
            </div>
          )}
        </div>
      </div>

      {showSearch && (
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

      {showFnR && (
        <div id="fnr-panel">
          <div id="fnr-panel-header">
            Find & Replace
            <button onClick={() => { setShowFnR(false); setFnrFind(''); setFnrReplace(''); setFnrStatus('') }}>
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
                if (e.key === 'Escape') { setShowFnR(false); setFnrFind(''); setFnrReplace(''); setFnrStatus('') }
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
          </div>
          <div id="fnr-status">{fnrStatus}</div>
        </div>
      )}

      <div id="editor-area">
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

        {showEditor
          ? <>
            <div id="editor-scroll">
              <div id="editor-wrap">
                {isTrashPreview && (
                  <div style={{
                    background: '#3c2a2a', border: '1px solid #6b3333', borderRadius: 4,
                    padding: '6px 12px', marginBottom: 16, fontSize: 12, color: '#cc8888',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
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
            <div id="statusbar">
              <span title="Words in current scene">
                Scene: {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span title="Words in current chapter">
                Chapter: {chapterWordCount > 0 ? `${chapterWordCount.toLocaleString()} ${chapterWordCount === 1 ? 'word' : 'words'}` : '—'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span title="Estimated reading time for current chapter at 238 wpm">
                {chapterWordCount > 0 ? (() => {
                  const minutes = Math.ceil(chapterWordCount / 238)
                  if (minutes < 60) return `~${minutes} min chapter`
                  const hours = Math.floor(minutes / 60)
                  const mins = minutes % 60
                  return mins > 0 ? `~${hours}h ${mins}m chapter` : `~${hours}h chapter`
                })() : '— chapter'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span title="Total words in Manuscript">
                Manuscript: {manuscriptWordCount.toLocaleString()} {manuscriptWordCount === 1 ? 'word' : 'words'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span title="Estimated reading time for full manuscript at 238 wpm">
                {(() => {
                  const minutes = Math.ceil(manuscriptWordCount / 238)
                  if (minutes < 60) return `~${minutes} min manuscript`
                  const hours = Math.floor(minutes / 60)
                  const mins = minutes % 60
                  return mins > 0 ? `~${hours}h ${mins}m manuscript` : `~${hours}h manuscript`
                })()}
              </span>
            </div>
          </>
          : <div id="empty-state">
            <i className="ti ti-file-text" aria-hidden="true" />
            <p>Select a scene to start writing</p>
            <p style={{ fontSize: 12 }}>or add one using the + buttons</p>
          </div>
        }
      </div>

      {showNewProject && <NewProjectModal />}
      {showStyles && <StylesModal />}
      {confirmDelete && <ConfirmDeleteModal />}
      {confirmBinDelete && <ConfirmBinDeleteModal />}
    </div>
  )
}