// #region === IMPORTS ===
// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TextSelection } from '@tiptap/pm/state'
import { open, save } from '@tauri-apps/plugin-dialog'
import { exists, readFile, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { exit } from '@tauri-apps/plugin-process'
import { Packer, Document, Paragraph, HeadingLevel, AlignmentType, Header, PageBreak, PageNumber, TextRun } from 'docx'
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import changelog from '../CHANGELOG.md?raw'
import projectFormatCompatibility from '../PROJECT_FORMAT.md?raw'
import privacyNote from '../PRIVACY.md?raw'
import thirdPartyLicenses from '../THIRD_PARTY_LICENSES.txt?raw'
import {
  AboutModal,
  AppMessageModal,
  ConfirmBinDeleteModal,
  ConfirmDeleteLoreCategoryModal,
  ConfirmDeleteLoreEntryModal,
  ConfirmDeleteModal,
  ConfirmDeleteTabModal,
  ConfirmEmptyTrashModal,
  ProjectRecoveryModal,
  RestoreBackupModal,
  type AppMessage,
} from './components/ConfirmModals'
import { AppMenus } from './components/AppMenus'
import {
  createProjectBackup,
  getProjectBackupRoot,
  listProjectBackups,
  restoreLatestProjectBackup,
  restoreProjectBackup,
  type BackupReason,
  type ProjectBackup,
} from './backups'
import { BinderSidebar } from './components/BinderSidebar'
import { CompileModal } from './components/CompileModal'
import { BinderContextMenu, EditorContextMenu, SpellcheckContextMenu, TabContextMenu } from './components/ContextMenus'
import { DraftDiffModal } from './components/DraftDiffModal'
import { LorePresenceModal } from './components/LorePresenceModal'
import { InspectorPanel } from './components/InspectorPanel'
import {
  LoreEntryEditorModal,
  LoreTemplateEditorModal,
} from './components/LoreEditorModals'
import {
  NewProjectModal,
  PreferencesModal,
  ProjectSettingsModal,
  StylesModal,
  THEME_OPTIONS,
  type CoverImageAction,
} from './components/ProjectModals'
import {
  addDocToTree,
  addFolderToTree,
  duplicateNodesInTree,
  duplicateNodeInTree,
  moveNodeInTree,
  moveNodesInTree,
  removeNodesFromTree,
  removeNodeFromTree,
  renameNodeInTree,
  setFolderRoleInTree,
  toggleFolderInTree,
} from './binderMutations'
import {
  FindReplacePanel,
  SearchPanel,
} from './components/SearchReplacePanels'
import { RevisionCommentsPane } from './components/RevisionView'
import { WorkspaceShell, type Workspace } from './components/WorkspaceShell'
import { buildCompileChapters, collectCompileNodesFromSelection } from './compile'
import {
  COMPILE_STYLE_PRESETS,
  ATLAS_MAX_SIDE,
  ATLAS_WARNING_MEGAPIXELS,
  DEFAULT_ATLAS,
  DEFAULT_MIND_MAP,
  PROJECT_FORMAT_VERSION,
  SCRIVUS_VERSION,
  DEFAULT_SCENE_METADATA,
  DEFAULT_STYLES,
  normalizeMindMap,
  normalizeAtlas,
  normalizeProjectSettings,
  normalizeSceneMetadata,
  normalizeProjectStyles,
  normalizeWritingStats,
} from './constants'
import { htmlFragmentText, parseHtmlFragment } from './html'
import { allocateNextId, getNextIdValue, setNextIdValue } from './idCounter'
import { buildLoreBacklinks, type LoreBacklink } from './loreBacklinks'
import { createImportedProjectOnDisk, createProjectOnDisk, projectPackageFolderName, readProjectJson } from './projectFiles'
import { migrateProjectData } from './projectMigrations'
import { clearProjectSearchCache, searchProject, type SearchResult } from './search'
import { parseSceneTabs, serializeSceneTabs, softDeleteTab } from './sceneTabs'
import { createSpellchecker, findWordAt, type Spellchecker } from './spellcheck'
import { SCRIVUS_GITHUB_URL, checkForScrivusUpdate } from './updates'
import {
  addToRecentProjects,
  copyAtlasImage,
  copyCoverImage,
  copyLoreImage,
  deleteAtlasImage,
  deleteCoverImage,
  deleteLoreImage,
  generateFileId,
  loadRecentData,
  loadRecentProjects,
  readLoreBookFile,
  readAtlasFile,
  readCanvasFile,
  readNotesFile,
  readProjectDictionary,
  readRevisionFile,
  readSceneFile,
  saveDefaultStyles,
  saveProjectToDisk,
  saveRecentProjects,
  trashNode,
  writeProjectDictionary,
  writeAtlasFile,
  writeLoreBookFile,
  writeCanvasFile,
  writeNotesFile,
  writeRevisionFile,
  writeSceneFile,
} from './storage'
import { parseWordDocxProject } from './wordImport'
import { countHtmlWords, countLatestRevisionWords } from './wordCount'
import { buildEpub, type EpubCoverImage } from './epubCompile'
import {
  emptyTrashFolder,
  loadTrashItems,
  permanentlyDeleteTrashItem,
  readTrashPreviewContent,
  restoreTrashItem,
  type TrashItem,
} from './trash'
import {
  CommentEnd,
  CommentStart,
  FnrHighlight,
  LoreLinkExtension,
  loreLinkPluginKey,
  PageBreakNode,
  SpellcheckExtension,
  spellcheckPluginKey,
  UnderlineMark,
  type LoreLinkMatch,
} from './tiptapExtensions'
import {
  collectDocs,
  findNode,
  findParentFolder,
  getMaxTreeId,
} from './tree'
import type {
  Atlas,
  AtlasImportCandidate,
  AtlasMap,
  ChecklistItem,
  CompileChapterEntry,
  DocNode,
  DropTarget,
  FolderNode,
  LoreBook,
  LoreCategory,
  LoreEntry,
  MindMap,
  MindMapNode,
  MindMapSceneOption,
  OutlineRow,
  Project,
  ProjectSettings,
  ProjectStyles,
  RevisionComment,
  SceneMetadata,
  CompileFormat,
  SceneStatus,
  SceneTab,
  SprintTimerState,
  ThemeId,
  TreeNode,
} from './types'
import './App.css'

// #endregion

type WelcomeUpdateStatus =
  | { status: 'checking'; currentVersion: string }
  | { status: 'available'; currentVersion: string; latestVersion: string; releaseUrl: string }
  | { status: 'current'; currentVersion: string; latestVersion: string }
  | { status: 'failed'; currentVersion: string }

type LoreLinkChoiceTarget = {
  entryId: string
  categoryId: string
  entryName: string
  categoryName: string
}

type LoreLinkChoice = {
  x: number
  y: number
  targets: LoreLinkChoiceTarget[]
}

// #region === APP COMPONENT ===
// ─────────────────────────────────────────────────────────────────────────────
// Main application component
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  // #region === STATE ===
  const SIDE_PANEL_LOCK_WIDTH = 960

  // ── App Message system ──
  const [appMessage, setAppMessage] = useState<AppMessage | null>(null)

  // ── Binder drag/drop and project selection state ──
  const [dragId, setDragId] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [selectedBinderIds, setSelectedBinderIds] = useState<Set<number>>(new Set())
  const [binderSelectionAnchorId, setBinderSelectionAnchorId] = useState<number | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [titleValue, setTitleValue] = useState('')
  const [saveLabel, setSaveLabel] = useState('')

  // ── Project creation, menus, and style modal state ──
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectParent, setNewProjectParent] = useState('')
  const [importDocxPath, setImportDocxPath] = useState<string | null>(null)
  const [recentProjects, setRecentProjects] = useState<{ name: string; path: string }[]>([])
  const [startupLoaded, setStartupLoaded] = useState(false)
  const [welcomeUpdateStatus, setWelcomeUpdateStatus] = useState<WelcomeUpdateStatus>({
    status: 'checking',
    currentVersion: SCRIVUS_VERSION,
  })
  const [fileMenuOpen, setFileMenuOpen] = useState(false)
  const [styles, setStyles] = useState<ProjectStyles>(DEFAULT_STYLES)
  const [showStyles, setShowStyles] = useState(false)
  const [stylesTab, setStylesTab] = useState<'chapter' | 'body'>('chapter')
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [projectSettingsTab, setProjectSettingsTab] = useState<'book' | 'styles' | 'backups' | 'dictionary'>('book')
  const [projectDictionary, setProjectDictionary] = useState<string[]>([])
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [helpMenuOpen, setHelpMenuOpen] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showPreferences, setShowPreferences] = useState(false)
  const [projectRecovery, setProjectRecovery] = useState<{ name: string; path: string; details: string } | null>(null)
  const [openingProject, setOpeningProject] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)

  // ── Editor stats and trash state ──
  const [wordCount, setWordCount] = useState(0)
  const [, setCharCount] = useState(0)
  const [trashItems, setTrashItems] = useState<TrashItem[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashExpanded, setTrashExpanded] = useState<Set<string>>(new Set())
  const [isTrashPreview, setIsTrashPreview] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ sidecarId: string; node: TreeNode } | null>(null)
  const [confirmBinDelete, setConfirmBinDelete] = useState<{ id: number; label: string } | null>(null)
  const [confirmBulkBinDelete, setConfirmBulkBinDelete] = useState<{ ids: number[]; label: string } | null>(null)
  const [bulkRenameTarget, setBulkRenameTarget] = useState<{ ids: number[]; value: string } | null>(null)
  const [confirmEmptyTrash, setConfirmEmptyTrash] = useState(false)
  const sceneActiveTabRef = useRef<Record<number, number>>({})
  const [restoreBackupOpen, setRestoreBackupOpen] = useState(false)
  const [availableBackups, setAvailableBackups] = useState<ProjectBackup[]>([])
  const [selectedBackupName, setSelectedBackupName] = useState<string | null>(null)

// ── Workspace state ──
  const [workspace, setWorkspace] = useState<Workspace>('editor')
  const [focusMode, setFocusMode] = useState(false)

  // ── Binder states ──
  const [binderOpen, setBinderOpen] = useState(window.innerWidth >= SIDE_PANEL_LOCK_WIDTH)

  // ── Context Menu states ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode; depth: number } | null>(null)
  const [spellcheckMenu, setSpellcheckMenu] = useState<{
    x: number
    y: number
    word: string
    from: number
    to: number
    suggestions: string[]
  } | null>(null)
  const [editorContextMenu, setEditorContextMenu] = useState<{ x: number; y: number; showFormatting: boolean; hasSelection: boolean; selectedText: string } | null>(null)


  // ── Mutable refs used by async handlers and delayed saves ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const projectRef = useRef<Project | null>(null)
  const treeRef = useRef<TreeNode[]>([])
  const activeIdRef = useRef<number | null>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  const editMenuRef = useRef<HTMLDivElement>(null)
  const helpMenuRef = useRef<HTMLDivElement>(null)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const dragIdRef = useRef<number | null>(null)
  const dropTargetRef = useRef<DropTarget>(null)
  const selectedBinderIdsRef = useRef<Set<number>>(new Set())
  const spellcheckerRef = useRef<Spellchecker | null>(null)
  const projectDictionaryRef = useRef<string[]>([])
  const bodyHtmlRef = useRef<string>('')
  const backupInProgressRef = useRef(false)


  // ── Manuscript/chapter statistics ──
  const [manuscriptWordCount, setManuscriptWordCount] = useState(0)
  const [chapterWordCount, setChapterWordCount] = useState(0)
  const [sessionWordDelta, setSessionWordDelta] = useState(0)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const sceneWordCountsRef = useRef<Record<string, number>>({})
  const sessionWordDeltaRef = useRef(0)


  // ── Project search panel state ──
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<number | null>(null)
  const searchRequestIdRef = useRef(0)


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
  const [inspectorOpen, setInspectorOpen] = useState(window.innerWidth >= SIDE_PANEL_LOCK_WIDTH)
  const [sidePanelsLocked, setSidePanelsLocked] = useState(window.innerWidth < SIDE_PANEL_LOCK_WIDTH)

  // ── Statusbar Panel ──
  const [isNarrow, setIsNarrow] = useState(window.innerWidth < 600);


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

  // â”€â”€ Outline workspace state â”€â”€
  const [outlineRows, setOutlineRows] = useState<OutlineRow[]>([])
  const [outlineCollapsedFolderIds, setOutlineCollapsedFolderIds] = useState<Set<number>>(new Set())
  const outlineWordCountsRef = useRef<Map<number, number>>(new Map())
  const outlineProjectPathRef = useRef<string | null>(null)

  // Mind Map workspace state
  const [mindMap, setMindMap] = useState<MindMap>(DEFAULT_MIND_MAP)
  const mindMapRef = useRef<MindMap>(DEFAULT_MIND_MAP)
  const mindMapSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Atlas workspace state
  const [atlas, setAtlas] = useState<Atlas>(DEFAULT_ATLAS)
  const atlasRef = useRef<Atlas>(DEFAULT_ATLAS)
  const atlasSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Scene Tabs state ──
  const [sceneTabs, setSceneTabs] = useState<SceneTab[]>([])
  const [activeTabIndex, setActiveTabIndex] = useState(0)
  const activeTabIndexRef = useRef(0)
  const sceneTabsRef = useRef<SceneTab[]>([])
  const rawFileRef = useRef<string>('')
  const [renamingTabIndex, setRenamingTabIndex] = useState<number | null>(null)
  const [tabDragIndex, setTabDragIndex] = useState<number | null>(null)
  const [tabDropIndex, setTabDropIndex] = useState<number | null>(null)
  const tabDragIndexRef = useRef<number | null>(null)
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; index: number } | null>(null)
  const [confirmDeleteTab, setConfirmDeleteTab] = useState<number | null>(null)
  const [editorSplitTabIndex, setEditorSplitTabIndex] = useState<number | null>(null)
  const editorSplitTabBySceneRef = useRef<Record<number, number | null>>({})
  

  // ── Lore Book state ──
  const [loreBook, setLoreBook] = useState<LoreBook>({ categories: [] })
  const loreBookRef = useRef<LoreBook>({ categories: [] })
  const loreLinkMatchesRef = useRef<LoreLinkMatch[]>([])
  const [loreBacklinks, setLoreBacklinks] = useState<Record<string, LoreBacklink[]>>({})
  const [loreBacklinkVersion, setLoreBacklinkVersion] = useState(0)
  const [loreView, setLoreView] = useState<'home' | 'category' | 'entry'>('home')
  const [activeLoreCategoryId, setActiveLoreCategoryId] = useState<string | null>(null)
  const [loreTemplateEditor, setLoreTemplateEditor] = useState<LoreCategory | null>(null)
  const [loreTemplateIsNew, setLoreTemplateIsNew] = useState(false)
  const [loreEntryEditor, setLoreEntryEditor] = useState<LoreEntry | null>(null)
  const [confirmDeleteLoreCategory, setConfirmDeleteLoreCategory] = useState<LoreCategory | null>(null)
  const [confirmDeleteLoreEntry, setConfirmDeleteLoreEntry] = useState<LoreEntry | null>(null)
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)
  const [loreLinkChoice, setLoreLinkChoice] = useState<LoreLinkChoice | null>(null)
  const lastLoreMouseBackRef = useRef(0)
  const loreMouseBackArmedRef = useRef(false)

  // ── Compile modal state ──
  const [showCompile, setShowCompile] = useState(false)
  const [compileChapters, setCompileChapters] = useState<CompileChapterEntry[]>([])
  const [compileLoading, setCompileLoading] = useState(false)
  // compileFormat lives with the other settings-backed states below.
  const [compileStyle, setCompileStyle] = useState<typeof COMPILE_STYLE_PRESETS[number]>(COMPILE_STYLE_PRESETS[0])

  // ── Revision workspace state ──
  const [revisionComments, setRevisionComments] = useState<RevisionComment[]>([])
  const revisionCommentsRef = useRef<RevisionComment[]>([])
  const [revisionActiveId, setRevisionActiveId] = useState<number | null>(null)
  const [revisionTabs, setRevisionTabs] = useState<SceneTab[]>([])
  const [revisionActiveTabIndex, setRevisionActiveTabIndex] = useState(0)
  const [revisionContent, setRevisionContent] = useState<string>('')    // read-only HTML
  const [revisionTitle, setRevisionTitle] = useState<string>('')
  const [revisionPendingComment, setRevisionPendingComment] = useState<{
    quote: string
    wrappedHtml: string
    startOffset: number
    endOffset: number
  } | null>(null)
  const [revisionActiveCommentId, setRevisionActiveCommentId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [confirmDeleteRevisionComment, setConfirmDeleteRevisionComment] = useState<string | null>(null)
  const revisionScrollRef = useRef<HTMLDivElement>(null)



  // Settings helpers
  const THEME_IDS: ThemeId[] = [
    'dark',
    'light',
    'contrastLight',
    'contrastDark',
    'lavenderLight',
    'lavenderDark',
    'mintLight',
    'mintDark',
    'roseLight',
    'roseDark',
    'skyLight',
    'skyDark',
    'softPaperLight',
    'softSageLight',
    'softPeachLight',
    'softLilacLight',
    'neonCyber',
    'neonViolet',
    'neonEmber',
    'neonLagoon',
  ]

  function normalizeTheme(theme: unknown): ThemeId {
    return typeof theme === 'string' && THEME_IDS.includes(theme as ThemeId) ? theme as ThemeId : 'dark'
  }

  const DEFAULT_SETTINGS = {
    zoom: 100,
    theme: 'dark' as ThemeId,
    incrementNewNodeNumbers: false,
    loreLinksEnabled: true,
    typewriterScrolling: false,
    readingWpm: 240,
    defaultSceneTargetWordCount: 0,
    goals: {
      monthlyTargetWordCount: 0,
      dailyTargetWordCount: 0,
      sessionTargetWordCount: 0,
    },
    compile: {
      frontMatter: false,
      includeActHeadings: true,
      includeSceneTitles: false,
      format: 'docx' as CompileFormat,
    },
    window: {
      fullscreen: false,
      maximized: false,
    },
  };

  type AppSettings = typeof DEFAULT_SETTINGS;

  function loadSettings(): AppSettings {
    try {
      const raw = localStorage.getItem('scrivus-settings');
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      return {
        ...parsed,
        theme: normalizeTheme(parsed.theme),
        incrementNewNodeNumbers: parsed.incrementNewNodeNumbers === true,
        loreLinksEnabled: parsed.loreLinksEnabled !== false,
        typewriterScrolling: parsed.typewriterScrolling === true,
        readingWpm: Number.isFinite(Number(parsed.readingWpm))
          ? Math.min(1000, Math.max(50, Math.round(Number(parsed.readingWpm))))
          : DEFAULT_SETTINGS.readingWpm,
        defaultSceneTargetWordCount: Number.isFinite(Number(parsed.defaultSceneTargetWordCount))
          ? Math.min(999999, Math.max(0, Math.round(Number(parsed.defaultSceneTargetWordCount))))
          : DEFAULT_SETTINGS.defaultSceneTargetWordCount,
        goals: {
          ...DEFAULT_SETTINGS.goals,
          ...(typeof parsed.goals === 'object' && parsed.goals ? parsed.goals : {}),
          monthlyTargetWordCount: Number.isFinite(Number(parsed.goals?.monthlyTargetWordCount))
            ? Math.min(9999999, Math.max(0, Math.round(Number(parsed.goals.monthlyTargetWordCount))))
            : DEFAULT_SETTINGS.goals.monthlyTargetWordCount,
          dailyTargetWordCount: Number.isFinite(Number(parsed.goals?.dailyTargetWordCount))
            ? Math.min(999999, Math.max(0, Math.round(Number(parsed.goals.dailyTargetWordCount))))
            : DEFAULT_SETTINGS.goals.dailyTargetWordCount,
          sessionTargetWordCount: Number.isFinite(Number(parsed.goals?.sessionTargetWordCount))
            ? Math.min(999999, Math.max(0, Math.round(Number(parsed.goals.sessionTargetWordCount))))
            : DEFAULT_SETTINGS.goals.sessionTargetWordCount,
        },
        compile: {
          ...DEFAULT_SETTINGS.compile,
          ...(typeof parsed.compile === 'object' && parsed.compile ? parsed.compile : {}),
          format: parsed.compile?.format === 'epub' ? 'epub' as const : 'docx' as const,
        },
        window: {
          ...DEFAULT_SETTINGS.window,
          ...(typeof parsed.window === 'object' && parsed.window ? parsed.window : {}),
        },
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings: AppSettings) {
    localStorage.setItem('scrivus-settings', JSON.stringify(settings));
  }

  // --- ZOOM STATE ---
  const ZOOM_PRESETS = [50, 75, 90, 100, 110, 125, 150, 175, 200, 300];
  const initialSettings = loadSettings()
  const [compileFrontMatter, setCompileFrontMatter] = useState(() => initialSettings.compile.frontMatter)
  const [compileFormat, setCompileFormat] = useState<CompileFormat>(() => initialSettings.compile.format)
  const [compileIncludeActHeadings, setCompileIncludeActHeadings] = useState(() => initialSettings.compile.includeActHeadings)
  const [compileIncludeSceneTitles, setCompileIncludeSceneTitles] = useState(() => initialSettings.compile.includeSceneTitles)
  const [zoom, setZoom] = useState(() => initialSettings.zoom);
  const [appTheme, setAppTheme] = useState<ThemeId>(() => initialSettings.theme);
  const [incrementNewNodeNumbers, setIncrementNewNodeNumbers] = useState(() => initialSettings.incrementNewNodeNumbers)
  const [loreLinksEnabled, setLoreLinksEnabled] = useState(() => initialSettings.loreLinksEnabled)
  const loreLinksEnabledRef = useRef(initialSettings.loreLinksEnabled)
  const [typewriterScrolling, setTypewriterScrolling] = useState(() => initialSettings.typewriterScrolling)
  const typewriterScrollingRef = useRef(initialSettings.typewriterScrolling)
  const [sprint, setSprint] = useState<SprintTimerState | null>(null)
  const [draftDiff, setDraftDiff] = useState<{ left: number; right: number } | null>(null)
  const [showLorePresence, setShowLorePresence] = useState(false)
  const [readingWpm, setReadingWpm] = useState(() => initialSettings.readingWpm)
  const [defaultSceneTargetWordCount, setDefaultSceneTargetWordCount] = useState(() => initialSettings.defaultSceneTargetWordCount)
  const [goals, setGoals] = useState(() => initialSettings.goals)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [previewTheme, setPreviewTheme] = useState<ThemeId | null>(null)
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false);

  const formatSceneTabTitle = (sceneTitle: string, tabs: SceneTab[], tabIndex: number) => {
    const tabName = tabs[tabIndex]?.name
    return tabs.length > 1 && tabName ? `${sceneTitle} - ${tabName}` : sceneTitle
  }

  const openAncestorFoldersForNode = (nodes: TreeNode[], targetId: number): { nodes: TreeNode[]; found: boolean } => {
    let foundInNodes = false
    const nextNodes = nodes.map(node => {
      if (node.id === targetId) {
        foundInNodes = true
        return node
      }
      if (node.type !== 'folder') return node

      const childResult = openAncestorFoldersForNode(node.children, targetId)
      if (!childResult.found) return node

      foundInNodes = true
      return { ...node, open: true, children: childResult.nodes }
    })

    return { nodes: nextNodes, found: foundInNodes }
  }

  // ── TipTap editor configuration ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ underline: false }),
      Placeholder.configure({ placeholder: 'Begin writing…' }),
      UnderlineMark,
      PageBreakNode,
      FnrHighlight,
      SpellcheckExtension.configure({
        getSpellchecker: () => spellcheckerRef.current,
      }),
      LoreLinkExtension.configure({
        getMatches: () => loreLinkMatchesRef.current,
        enabled: () => loreLinksEnabledRef.current,
      }),
      CommentStart,
      CommentEnd,
    ],
    content: '',
    immediatelyRender: false,
    editorProps: {
      attributes: {
        spellcheck: 'false',
      },
      handleKeyDown: (_view: unknown, _event: KeyboardEvent) => {
        const active = document.activeElement
        const editorEl = document.querySelector('.ProseMirror')
        if (active && active !== editorEl && !editorEl?.contains(active)) {
          return true
        }
        return false
      },
      handleDOMEvents: {
        click: (_view: unknown, event: Event) => {
          const mouseEvent = event as MouseEvent
          if (!mouseEvent.ctrlKey && !mouseEvent.metaKey) return false
          const target = mouseEvent.target as HTMLElement | null
          const link = target?.closest?.('.lore-link-highlight') as HTMLElement | null
          if (!link) return false
          const entryId = link.dataset.loreEntryId
          const categoryId = link.dataset.loreCategoryId
          if (!entryId || !categoryId) return false
          mouseEvent.preventDefault()
          const targets = (() => {
            try {
              const parsed = link.dataset.loreTargets ? JSON.parse(link.dataset.loreTargets) : null
              if (!Array.isArray(parsed)) return []
              return parsed.filter((target): target is LoreLinkChoiceTarget =>
                typeof target?.entryId === 'string' &&
                typeof target?.categoryId === 'string' &&
                typeof target?.entryName === 'string' &&
                typeof target?.categoryName === 'string'
              )
            } catch {
              return []
            }
          })()
          const fallbackTargets: LoreLinkChoiceTarget[] = targets.length > 0
            ? targets
            : [{ entryId, categoryId, entryName: 'Lore entry', categoryName: 'Lore Book' }]
          const uniqueTargets = Array.from(
            new Map(fallbackTargets.map(target => [`${target.categoryId}:${target.entryId}`, target])).values(),
          )
          if (uniqueTargets.length <= 1) {
            const [target] = uniqueTargets
            setWorkspace('lorebook')
            setLoreView('entry')
            setActiveLoreCategoryId(target.categoryId)
            setExpandedEntryId(target.entryId)
            setLoreLinkChoice(null)
          } else {
            setLoreLinkChoice({
              x: mouseEvent.clientX,
              y: mouseEvent.clientY,
              targets: uniqueTargets,
            })
          }
          return true
        },
        contextmenu: (view, event) => {
          event.preventDefault()
          const mouseEvent = event as MouseEvent
          const coords = view.posAtCoords({ left: mouseEvent.clientX, top: mouseEvent.clientY })
          const selection = view.state.selection
          const hasEditorSelection = !selection.empty
          const showEditorFormatting = Boolean(coords && !selection.empty && coords.pos >= selection.from && coords.pos <= selection.to)
          const selectedText = hasEditorSelection
            ? view.state.doc.textBetween(selection.from, selection.to, '\n\n').replace(/\s+/g, ' ').trim()
            : ''
          const openEditorContextMenu = () => {
            setSpellcheckMenu(null)
            setEditorContextMenu({
              x: mouseEvent.clientX,
              y: mouseEvent.clientY,
              showFormatting: showEditorFormatting,
              hasSelection: hasEditorSelection,
              selectedText,
            })
          }
          if (showEditorFormatting) {
            openEditorContextMenu()
            return true
          }
          const spellchecker = spellcheckerRef.current
          if (!coords || !spellchecker) {
            openEditorContextMenu()
            return true
          }

          const resolved = view.state.doc.resolve(coords.pos)
          const parentOffset = resolved.parentOffset
          const after = resolved.parent.childAfter(parentOffset)
          const before = resolved.parent.childBefore(parentOffset)
          const textNodeInfo = after.node?.isText
            ? after
            : before.node?.isText
              ? before
              : null
          const textNode = textNodeInfo?.node ?? null
          if (!textNode?.isText || !textNode.text) {
            openEditorContextMenu()
            return true
          }

          const textOffset = parentOffset - (textNodeInfo?.offset ?? parentOffset)
          const word = findWordAt(textNode.text, textOffset)
          if (!word || spellchecker.check(word.word)) {
            openEditorContextMenu()
            return true
          }

          const from = resolved.start() + (textNodeInfo?.offset ?? 0) + word.start
          setEditorContextMenu(null)
          setSpellcheckMenu({
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            word: word.word,
            from,
            to: from + word.word.length,
            suggestions: spellchecker.suggest(word.word),
          })
          return true
        },
      }
    },
    editable: true,
    onUpdate: ({ editor }) => {
      // Strip fnr highlight marks from saved content
      // const json = editor.getJSON()
      const html = editor.getHTML().replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
      bodyHtmlRef.current = html
      const tabs = sceneTabsRef.current.map((tab, index) =>
        index === activeTabIndexRef.current ? { ...tab, content: html } : tab)
      setWordCount(countLatestRevisionWords(tabs))
      setCharCount(htmlFragmentText(html).length)
      triggerSave()

      // Typewriter scrolling: keep the caret line vertically centered while typing.
      if (typewriterScrollingRef.current) {
        window.requestAnimationFrame(() => {
          if (editor.isDestroyed) return
          const scroll = document.getElementById('editor-scroll')
          if (!scroll) return
          const caret = editor.view.coordsAtPos(editor.state.selection.head)
          const rect = scroll.getBoundingClientRect()
          const delta = caret.top - (rect.top + rect.height / 2)
          if (Math.abs(delta) > 1) {
            scroll.scrollTo({ top: scroll.scrollTop + delta, behavior: 'instant' })
          }
        })
      }
    },
  })

  // ───────────────────────────────────────────────────────────────────────────
  // Effects: refs, project loading, styles, menus, trash preview, shortcuts
  // ───────────────────────────────────────────────────────────────────────────

  const getSceneCountTabs = (node: DocNode) => {
    if (node.id !== activeIdRef.current) return null
    return sceneTabsRef.current.map((tab, index) =>
      index === activeTabIndexRef.current ? { ...tab, content: bodyHtmlRef.current } : tab)
  }

  const refreshOutlineRows = useCallback(async () => {
    if (!projectRef.current) {
      setOutlineRows([])
      outlineWordCountsRef.current.clear()
      outlineProjectPathRef.current = null
      return
    }

    if (outlineProjectPathRef.current !== projectRef.current.path) {
      outlineWordCountsRef.current.clear()
      outlineProjectPathRef.current = projectRef.current.path
    }

    const manuscript = findNode(treeRef.current, 1)
    if (!manuscript || manuscript.type !== 'folder') {
      setOutlineRows([])
      return
    }

    const rows: OutlineRow[] = []
    const getSceneWordCount = async (node: DocNode) => {
      const activeTabs = getSceneCountTabs(node)
      if (activeTabs) {
        const count = countLatestRevisionWords(activeTabs)
        outlineWordCountsRef.current.set(node.id, count)
        return count
      }

      const cached = outlineWordCountsRef.current.get(node.id)
      if (cached !== undefined) return cached

      const tabs = parseSceneTabs(await readSceneFile(projectRef.current!.path, node.file))
      const count = countLatestRevisionWords(tabs)
      outlineWordCountsRef.current.set(node.id, count)
      return count
    }

    const buildSceneRow = async (node: DocNode, chapterLabel: string, depth: number): Promise<OutlineRow> => {
      const metadata = normalizeSceneMetadata(node.metadata)
      return {
        id: node.id,
        type: 'scene',
        chapter: chapterLabel,
        title: node.title,
        wordCount: await getSceneWordCount(node),
        depth,
        status: metadata.status,
        metadata,
      }
    }

    const visit = async (nodes: TreeNode[], chapterLabel: string, depth: number): Promise<OutlineRow[]> => {
      const collected: OutlineRow[] = []
      for (const node of nodes) {
        if (node.type === 'folder') {
          const role = node.role ?? 'chapter'
          const nextChapterLabel = role === 'chapter' ? node.label : chapterLabel
          const childRows = await visit(node.children, nextChapterLabel, depth + 1)
          const childScenes = childRows.filter(row => row.type === 'scene')
          collected.push({
            id: node.id,
            type: 'chapter',
            role,
            chapter: chapterLabel,
            title: node.label,
            wordCount: childScenes.reduce((total, row) => total + row.wordCount, 0),
            depth,
            status: childScenes.length > 0 && childScenes.every(row => row.status === 'complete')
              ? 'complete'
              : 'inProgress',
          })
          collected.push(...childRows)
          continue
        }

        collected.push(await buildSceneRow(node, chapterLabel, depth))
      }
      return collected
    }

    rows.push(...await visit(manuscript.children, manuscript.label, 0))
    setOutlineRows(rows)
  }, [])

  // #endregion

  const clearSaveTimers = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (saveLabelTimer.current) {
      clearTimeout(saveLabelTimer.current)
      saveLabelTimer.current = null
    }
  }, [])

  const clearSaveStatus = useCallback(() => {
    clearSaveTimers()
    setSaveLabel('')
  }, [clearSaveTimers])

  // #region === EFFECTS ===

  useEffect(() => { projectRef.current = project }, [project])
  useEffect(() => { treeRef.current = tree }, [tree])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { dragIdRef.current = dragId }, [dragId])
  useEffect(() => { dropTargetRef.current = dropTarget }, [dropTarget])
  useEffect(() => { selectedBinderIdsRef.current = selectedBinderIds }, [selectedBinderIds])
  useEffect(() => { activeTabIndexRef.current = activeTabIndex }, [activeTabIndex])
  useEffect(() => { loreLinksEnabledRef.current = loreLinksEnabled }, [loreLinksEnabled])
  useEffect(() => { typewriterScrollingRef.current = typewriterScrolling }, [typewriterScrolling])
  useEffect(() => { mindMapRef.current = mindMap }, [mindMap])
  useEffect(() => { atlasRef.current = atlas }, [atlas])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.getSelection()?.removeAllRanges()
      if (!editor || editor.isDestroyed) return
      const { view } = editor
      const selection = TextSelection.atStart(view.state.doc)
      view.dispatch(view.state.tr.setSelection(selection))
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeId, activeTabIndex, editor])

  useEffect(() => {
    refreshOutlineRows()
  }, [project?.path, tree, refreshOutlineRows])

  const mindMapSceneOptions = useMemo<MindMapSceneOption[]>(() => (
    outlineRows
      .filter(row => row.type === 'scene')
      .map(row => ({
        id: row.id,
        title: row.title,
        chapter: row.chapter,
      }))
  ), [outlineRows])

  useEffect(() => {
    let cancelled = false
    loadRecentProjects()
      .then(recents => {
        if (!cancelled) setRecentProjects(recents)
      })
      .finally(() => {
        if (!cancelled) setStartupLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setWelcomeUpdateStatus({ status: 'checking', currentVersion: SCRIVUS_VERSION })
    checkForScrivusUpdate(SCRIVUS_VERSION)
      .then(result => {
        if (cancelled) return
        setWelcomeUpdateStatus(result)
      })
      .catch(() => {
        if (!cancelled) setWelcomeUpdateStatus({ status: 'failed', currentVersion: SCRIVUS_VERSION })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    projectDictionaryRef.current = projectDictionary
    spellcheckerRef.current = createSpellchecker(projectDictionary)
    if (editor) {
      editor.view.dispatch(editor.state.tr.setMeta(spellcheckPluginKey, true))
    }
  }, [projectDictionary, editor])

  useEffect(() => {
    const seen = new Set<string>()
    const matches: LoreLinkMatch[] = []
    loreBook.categories.forEach(category => {
      category.entries.forEach(entry => {
        const keywords = [entry.name, ...(entry.keywords ?? [])]
        keywords.forEach(keyword => {
          const normalized = keyword.trim()
          if (normalized.length < 2) return
          const key = `${category.id}:${entry.id}:${normalized.toLowerCase()}`
          if (seen.has(key)) return
          seen.add(key)
          matches.push({
            keyword: normalized,
            entryId: entry.id,
            categoryId: category.id,
            entryName: entry.name,
            categoryName: category.name,
          })
        })
      })
    })
    loreLinkMatchesRef.current = matches
    if (editor) editor.view.dispatch(editor.state.tr.setMeta(loreLinkPluginKey, true))
  }, [loreBook, loreLinksEnabled, editor])

  useEffect(() => {
    if (!project?.path) {
      setLoreBacklinks({})
      return
    }
    let cancelled = false
    buildLoreBacklinks(project.path, tree, loreBook)
      .then(backlinks => {
        if (!cancelled) setLoreBacklinks(backlinks)
      })
      .catch(() => {
        if (!cancelled) setLoreBacklinks({})
      })
    return () => {
      cancelled = true
    }
  }, [project?.path, tree, loreBook, loreBacklinkVersion])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--editor-body-font', styles.editor.font)
    root.style.setProperty('--editor-body-size', `${styles.editor.size}pt`)
    root.style.setProperty('--editor-body-indent', styles.body.firstLineIndent ? '2em' : '0')
    root.style.setProperty('--editor-body-align',
      styles.body.justification === 'both' ? 'justify' : styles.body.justification)
    root.style.setProperty('--editor-chapter-font', styles.chapter.font)
    root.style.setProperty('--editor-chapter-size', `${styles.chapter.size}pt`)
    root.style.setProperty('--editor-chapter-weight', styles.chapter.bold ? '700' : '400')
    root.style.setProperty('--editor-chapter-style', styles.chapter.italic ? 'italic' : 'normal')
    root.style.setProperty('--editor-body-line-height', String(styles.editor.lineHeight))
    root.style.setProperty('--editor-content-width', `${styles.editor.contentWidth}px`)
  }, [styles])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false)
      }
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false)
      }
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target as Node)) {
        setHelpMenuOpen(false)
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
        setPreviewTheme(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handleLoreMouseBack = (event: MouseEvent) => {
      if (event.button !== 3) return
      const canNavigateLoreBack = workspace === 'lorebook'
        && loreView !== 'home'
        && !loreEntryEditor
        && !loreTemplateEditor
        && !confirmDeleteLoreCategory
        && !confirmDeleteLoreEntry

      const target = event.target as HTMLElement | null
      const isEditingTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], .modal-overlay'))
      if (!canNavigateLoreBack || isEditingTarget) {
        loreMouseBackArmedRef.current = false
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (event.type === 'mousedown') {
        loreMouseBackArmedRef.current = true
        return
      }

      if (event.type === 'auxclick') return
      if (!loreMouseBackArmedRef.current) return
      loreMouseBackArmedRef.current = false

      const now = performance.now()
      if (now - lastLoreMouseBackRef.current < 650) return
      lastLoreMouseBackRef.current = now

      setLoreView(loreView === 'entry' ? 'category' : 'home')
    }

    window.addEventListener('mousedown', handleLoreMouseBack, true)
    window.addEventListener('mouseup', handleLoreMouseBack, true)
    window.addEventListener('auxclick', handleLoreMouseBack, true)
    return () => {
      window.removeEventListener('mousedown', handleLoreMouseBack, true)
      window.removeEventListener('mouseup', handleLoreMouseBack, true)
      window.removeEventListener('auxclick', handleLoreMouseBack, true)
    }
  }, [workspace, loreView, loreEntryEditor, loreTemplateEditor, confirmDeleteLoreCategory, confirmDeleteLoreEntry])

  useEffect(() => {
    if (!themeMenuOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setThemeMenuOpen(false)
      setPreviewTheme(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [themeMenuOpen])

  useEffect(() => {
    if (!focusMode) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setFocusMode(false)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [focusMode])

  useEffect(() => {
    if (!focusMode) return
    setFileMenuOpen(false)
    setEditMenuOpen(false)
    setHelpMenuOpen(false)
    setThemeMenuOpen(false)
    setPreviewTheme(null)
    cancelPendingSearch()
    setShowSearch(false)
    setShowFnR(false)
    setContextMenu(null)
    setTabContextMenu(null)
    setSpellcheckMenu(null)
    setEditorContextMenu(null)
  }, [focusMode])

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
    if (!import.meta.env.PROD) return

    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const isReloadShortcut = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && key === 'r')
      const isDevtoolsShortcut = e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(key))
      if (!isReloadShortcut && !isDevtoolsShortcut) return
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    const ignoredInputTypes = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'radio', 'range', 'reset', 'submit'])
    const hardenInputs = (root: globalThis.Document | globalThis.Element) => {
      root.querySelectorAll('form').forEach(form => {
        form.setAttribute('autocomplete', 'off')
      })
      root.querySelectorAll('input, textarea').forEach(control => {
        if (control instanceof HTMLInputElement) {
          const type = (control.getAttribute('type') ?? 'text').toLowerCase()
          if (ignoredInputTypes.has(type)) return
        }
        control.setAttribute('autocomplete', 'off')
        control.setAttribute('autocorrect', 'off')
        control.setAttribute('autocapitalize', 'off')
      })
    }

    hardenInputs(document)
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof globalThis.Element) hardenInputs(node)
        })
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [])

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

  useEffect(() => {
    document.documentElement.dataset.theme = previewTheme ?? appTheme
  }, [appTheme, previewTheme])

  useEffect(() => {
    saveSettings({ ...loadSettings(), theme: appTheme })
  }, [appTheme])

  useEffect(() => {
    saveSettings({ ...loadSettings(), loreLinksEnabled })
  }, [loreLinksEnabled])

  useEffect(() => {
    saveSettings({ ...loadSettings(), typewriterScrolling })
  }, [typewriterScrolling])

  useEffect(() => {
    saveSettings({
      ...loadSettings(),
      compile: {
        frontMatter: compileFrontMatter,
        includeActHeadings: compileIncludeActHeadings,
        includeSceneTitles: compileIncludeSceneTitles,
        format: compileFormat,
      },
    })
  }, [compileFrontMatter, compileIncludeActHeadings, compileIncludeSceneTitles, compileFormat])

  useEffect(() => {
    if (!isTauri()) return

    const appWindow = getCurrentWindow()
    let cancelled = false
    let applyingSavedWindowState = false
    let lastSavedWindowState = loadSettings().window

    const saveWindowState = async () => {
      if (applyingSavedWindowState) return
      try {
        const fullscreen = await appWindow.isFullscreen()
        const maximized = await appWindow.isMaximized()
        if (cancelled) return
        if (
          fullscreen === lastSavedWindowState.fullscreen &&
          maximized === lastSavedWindowState.maximized
        ) return
        lastSavedWindowState = { fullscreen, maximized }
        const currentSettings = loadSettings()
        saveSettings({
          ...currentSettings,
          window: {
            ...currentSettings.window,
            fullscreen,
            maximized,
          },
        })
      } catch {
        // Window APIs are only available in the Tauri runtime.
      }
    }

    const applySavedWindowState = async () => {
      try {
        const { fullscreen: savedFullscreen, maximized: savedMaximized } = lastSavedWindowState
        const currentFullscreen = await appWindow.isFullscreen()
        const currentMaximized = await appWindow.isMaximized()
        if (cancelled) return

        applyingSavedWindowState = true
        if (savedFullscreen !== currentFullscreen) {
          await appWindow.setFullscreen(savedFullscreen)
        }
        if (!savedFullscreen && savedMaximized !== currentMaximized) {
          if (savedMaximized) await appWindow.maximize()
          else await appWindow.unmaximize()
        }
      } catch {
        // Window APIs are only available in the Tauri runtime.
      } finally {
        applyingSavedWindowState = false
      }
    }

    const setupListeners = async () => {
      try {
        const unlistenResize = await appWindow.onResized(() => { void saveWindowState() })
        const unlistenFocus = await appWindow.onFocusChanged(() => { void saveWindowState() })
        if (cancelled) {
          unlistenResize()
          unlistenFocus()
        }
        return () => {
          unlistenResize()
          unlistenFocus()
        }
      } catch {
        return undefined
      }
    }

    void applySavedWindowState()
    let cleanup: (() => void) | undefined
    void setupListeners().then(unlisten => {
      cleanup = unlisten
      if (cancelled) cleanup?.()
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  // --- Collapse panels on small window EFFECT --- 
  useEffect(() => {
    const handleResize = () => {
      const locked = window.innerWidth < SIDE_PANEL_LOCK_WIDTH;
      setIsNarrow(locked);
      setSidePanelsLocked(locked);
      if (locked) {
        setBinderOpen(false);
        setInspectorOpen(false);
      }
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

  useEffect(() => {
    if (!spellcheckMenu) return
    const handle = () => setSpellcheckMenu(null)
    window.addEventListener('click', handle)
    return () => window.removeEventListener('click', handle)
  }, [spellcheckMenu])

  useEffect(() => {
    if (!editorContextMenu) return
    const handle = () => setEditorContextMenu(null)
    window.addEventListener('click', handle)
    return () => window.removeEventListener('click', handle)
  }, [editorContextMenu])

  useEffect(() => {
    if (!contextMenu && !tabContextMenu && !spellcheckMenu && !editorContextMenu) return
    const handle = () => {
      setContextMenu(null)
      setTabContextMenu(null)
      setSpellcheckMenu(null)
      setEditorContextMenu(null)
    }
    window.addEventListener('scroll', handle, true)
    return () => window.removeEventListener('scroll', handle, true)
  }, [contextMenu, tabContextMenu, spellcheckMenu, editorContextMenu])

  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleTextSelect, 10)
    }
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [revisionActiveId, revisionPendingComment])
  

  // #endregion

  // #region === HANDLERS: SAVE & EDITOR ===

  const localDateKey = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const recordSceneWordDelta = (fileId: string, nextWordCount: number) => {
    const previousWordCount = sceneWordCountsRef.current[fileId] ?? nextWordCount
    sceneWordCountsRef.current[fileId] = nextWordCount
    const delta = nextWordCount - previousWordCount
    if (delta === 0 || !projectRef.current) return

    sessionWordDeltaRef.current = Math.max(0, sessionWordDeltaRef.current + delta)
    setSessionWordDelta(sessionWordDeltaRef.current)

    const dayKey = localDateKey()
    const writingStats = normalizeWritingStats(projectRef.current.writingStats)
    const nextWritingStats = {
      dailyWordDeltas: {
        ...writingStats.dailyWordDeltas,
        [dayKey]: (writingStats.dailyWordDeltas[dayKey] ?? 0) + delta,
      },
    }
    const updatedProject = { ...projectRef.current, writingStats: nextWritingStats }
    projectRef.current = updatedProject
  }

  const saveProjectState = (project: Project, activeId: number | null = activeIdRef.current, activeTabIndex = activeTabIndexRef.current) => {
    const updatedProject = { ...project, lastActiveTabIndex: activeTabIndex }
    projectRef.current = updatedProject
    setProject(updatedProject)
    saveProjectToDisk(updatedProject, activeId ?? undefined, activeTabIndex)
  }

  // Saves the currently active scene and project metadata.
  const saveActive = useCallback((currentTree?: TreeNode[]) => {
    if (activeIdRef.current === null) return
    const workingTree = currentTree ?? treeRef.current
    const clone = JSON.parse(JSON.stringify(workingTree)) as TreeNode[]
    const node = findNode(clone, activeIdRef.current)
    if (node && node.type === 'doc' && projectRef.current) {
      const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
      const updatedTabs = sceneTabsRef.current.map((t, i) =>
        i === activeTabIndexRef.current ? { ...t, content: cleanHtml } : t  // ← use ref
      )
      sceneTabsRef.current = updatedTabs
      const serialized = serializeSceneTabs(updatedTabs, rawFileRef.current)
      rawFileRef.current = serialized
      recordSceneWordDelta(node.file, countLatestRevisionWords(updatedTabs))
      writeSceneFile(projectRef.current.path, node.file, serialized)
      setLoreBacklinkVersion(version => version + 1)
    }
    setTree(clone)
    treeRef.current = clone
    if (projectRef.current) {
      saveProjectState({ ...projectRef.current, tree: clone })
    }
  }, [])

  // Debounces autosave while the editor is changing.
  const triggerSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (saveLabelTimer.current) {
      clearTimeout(saveLabelTimer.current)
      saveLabelTimer.current = null
    }
    setSaveLabel('editing…')
    saveTimer.current = setTimeout(() => {
      saveActive()
      computeManuscriptWordCount()
      computeChapterWordCount()
      refreshOutlineRows()
      saveTimer.current = null
      setSaveLabel('saved')
      saveLabelTimer.current = setTimeout(() => {
        setSaveLabel('')
        saveLabelTimer.current = null
      }, 1200)
    }, 900)
  }, [saveActive, refreshOutlineRows])

  // #region === WRITING SPRINTS ===

  const startSprint = (minutes: number) => {
    setSprint({
      endsAt: Date.now() + minutes * 60_000,
      durationMinutes: minutes,
      baselineWords: sessionWordDeltaRef.current,
      finished: false,
      finalWords: 0,
    })
  }

  const stopSprint = () => setSprint(null)

  const sprintWords = sprint && !sprint.finished
    ? Math.max(0, sessionWordDelta - sprint.baselineWords)
    : 0

  useEffect(() => {
    if (!sprint || sprint.finished) return
    const timeout = window.setTimeout(() => {
      // Flush the debounced autosave so words typed in the last second count.
      saveActive()
      setSprint(prev => prev && !prev.finished
        ? { ...prev, finished: true, finalWords: Math.max(0, sessionWordDeltaRef.current - prev.baselineWords) }
        : prev)
    }, Math.max(0, sprint.endsAt - Date.now()))
    return () => window.clearTimeout(timeout)
  }, [sprint, saveActive])

  // The session word baseline resets with the project, so the sprint goes with it.
  useEffect(() => {
    setSprint(null)
  }, [project?.path])

  // #endregion

  // The draft comparison is scoped to the scene it was opened from.
  useEffect(() => {
    setDraftDiff(null)
  }, [activeId, project?.path])

  useEffect(() => {
    setShowLorePresence(false)
  }, [project?.path])

  // Opens a scene from the binder and loads its content into TipTap.
  const selectDoc = async (id: number) => {
    clearSaveTimers()
    saveActive()
    setIsTrashPreview(false)
    setActiveId(id)
    activeIdRef.current = id
    setSelectedBinderIds(new Set())
    selectedBinderIdsRef.current = new Set()
    setBinderSelectionAnchorId(id)
    const node = findNode(treeRef.current, id)
    if (node && node.type === 'doc' && projectRef.current) {
      const raw = await readSceneFile(projectRef.current.path, node.file)
      rawFileRef.current = raw
      const tabs = parseSceneTabs(raw)
      sceneWordCountsRef.current[node.file] = countLatestRevisionWords(tabs)
      setSceneTabs(tabs)
      sceneTabsRef.current = tabs
      const rememberedIndex = sceneActiveTabRef.current[id]
      const safeIndex =
        rememberedIndex !== undefined && rememberedIndex >= 0 && rememberedIndex < tabs.length
          ? rememberedIndex
          : tabs.length - 1
      const rememberedSplitIndex = editorSplitTabBySceneRef.current[id]
      const safeSplitIndex =
        rememberedSplitIndex !== null &&
          rememberedSplitIndex !== undefined &&
          rememberedSplitIndex >= 0 &&
          rememberedSplitIndex < tabs.length &&
          rememberedSplitIndex !== safeIndex
          ? rememberedSplitIndex
          : null

      setActiveTabIndex(safeIndex)
      activeTabIndexRef.current = safeIndex
      setEditorSplitTabIndex(safeSplitIndex)

      const content = tabs[safeIndex]?.content ?? ''
      bodyHtmlRef.current = content
      editor?.commands.setContent(content, { emitUpdate: false })
      const text = htmlFragmentText(content)
      setWordCount(sceneWordCountsRef.current[node.file])
      setCharCount(text.length)
      setTitleValue(formatSceneTabTitle(node.title, tabs, safeIndex))
      const revisionContent = tabs[safeIndex]?.content ?? ''
      setRevisionTabs(tabs)
      setRevisionActiveTabIndex(safeIndex)
      setRevisionContent(revisionContent)
      setRevisionTitle(node.title)
      setRevisionActiveId(id)
      computeChapterWordCount()
      computeManuscriptWordCount()
      saveProjectState({ ...projectRef.current, tree: treeRef.current }, id, safeIndex)
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

  const flushProjectFiles = async () => {
    if (!projectRef.current) return

    if (activeIdRef.current !== null) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
        const updatedTabs = sceneTabsRef.current.map((tab, index) =>
          index === activeTabIndexRef.current ? { ...tab, content: cleanHtml } : tab)
        sceneTabsRef.current = updatedTabs
        const serialized = serializeSceneTabs(updatedTabs, rawFileRef.current)
        rawFileRef.current = serialized
        await writeSceneFile(projectRef.current.path, node.file, serialized)
      }
    }

    await writeNotesFile(projectRef.current.path, {
      quickNote: quickNoteRef.current,
      checklist: checklistRef.current,
    })
    if (mindMapSaveTimerRef.current) {
      clearTimeout(mindMapSaveTimerRef.current)
      mindMapSaveTimerRef.current = null
    }
    await writeCanvasFile(projectRef.current.path, mindMapRef.current)
    if (atlasSaveTimerRef.current) {
      clearTimeout(atlasSaveTimerRef.current)
      atlasSaveTimerRef.current = null
    }
    await writeAtlasFile(projectRef.current.path, atlasRef.current)
    saveProjectState({ ...projectRef.current, tree: treeRef.current })
  }

  const runProjectBackup = async (reason: BackupReason, showNotification = false) => {
    if (!projectRef.current || backupInProgressRef.current) return
    backupInProgressRef.current = true
    const currentProject = projectRef.current
    try {
      if (reason !== 'open') await flushProjectFiles()
      const backup = await createProjectBackup(
        currentProject.path,
        currentProject.name,
        reason,
        normalizeProjectSettings(currentProject.settings).backups.retentionCount,
      )
      if (showNotification) {
        showMessage(`Backup created:\n${backup.name}`, 'Backup Complete')
      }
    } catch (e) {
      if (showNotification) showMessage('Backup failed: ' + String(e), 'Backup Failed', 'error')
    } finally {
      backupInProgressRef.current = false
    }
  }

  const restoreLatestBackup = async () => {
    if (!projectRef.current) return
    const currentProject = projectRef.current
    try {
      await flushProjectFiles()
      const restored = await restoreLatestProjectBackup(
        currentProject.path,
        currentProject.name,
        normalizeProjectSettings(currentProject.settings).backups.retentionCount,
      )
      if (!restored) {
        showMessage('No backups were found for this project yet.', 'No Backups', 'warning')
        return
      }
      const data = await readProjectJson(currentProject.path)
      if (!data) {
        showMessage('The backup was copied, but project.json could not be loaded.', 'Restore Warning', 'warning')
        return
      }
      await loadProjectData(data, currentProject.path)
      showMessage(`Restored backup:\n${restored.name}`, 'Backup Restored')
    } catch (e) {
      showMessage('Restore failed: ' + String(e), 'Restore Failed', 'error')
    }
  }

  const openRestoreBackupPicker = async () => {
    if (!projectRef.current) return
    setFileMenuOpen(false)
    try {
      const backups = await listProjectBackups(projectRef.current.path, projectRef.current.name)
      setAvailableBackups(backups)
      setSelectedBackupName(backups[0]?.name ?? null)
      setRestoreBackupOpen(true)
    } catch (e) {
      showMessage('Failed to load backups: ' + String(e), 'Backup Restore Failed', 'error')
    }
  }

  const restoreSelectedBackup = async () => {
    if (!projectRef.current) return
    const selected = availableBackups.find(backup => backup.name === selectedBackupName)
    if (!selected) return
    const currentProject = projectRef.current
    try {
      setRestoreBackupOpen(false)
      await flushProjectFiles()
      const restored = await restoreProjectBackup(
        currentProject.path,
        currentProject.name,
        selected,
        normalizeProjectSettings(currentProject.settings).backups.retentionCount,
      )
      const data = await readProjectJson(currentProject.path)
      if (!data) {
        showMessage('The backup was copied, but project.json could not be loaded.', 'Restore Warning', 'warning')
        return
      }
      await loadProjectData(data, currentProject.path)
      showMessage(`Restored backup:\n${restored.name}`, 'Backup Restored')
    } catch (e) {
      showMessage('Restore failed: ' + String(e), 'Restore Failed', 'error')
    }
  }

  useEffect(() => {
    if (!project?.path) return
    const backupSettings = normalizeProjectSettings(project.settings).backups
    if (!backupSettings.enabled) return
    const interval = window.setInterval(() => {
      runProjectBackup('auto')
    }, backupSettings.intervalMinutes * 60 * 1000)
    return () => window.clearInterval(interval)
  }, [project?.path, project?.settings.backups.enabled, project?.settings.backups.intervalMinutes])

  // Generates a short unique id for lore entries and fields.
  const generateLoreId = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  // Saves the lorebook to disk.
  const saveLoreBook = async (data: LoreBook) => {
    if (!projectRef.current) return
    loreBookRef.current = data
    setLoreBook(data)
    await writeLoreBookFile(projectRef.current.path, data)
  }

  // Returns the active lore category or null.
  const getActiveLoreCategory = (): LoreCategory | null => {
    if (!activeLoreCategoryId) return null
    return loreBookRef.current.categories.find(c => c.id === activeLoreCategoryId) ?? null
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

  const rememberEditorSplitTab = (index: number | null) => {
    setEditorSplitTabIndex(index)
    if (activeIdRef.current !== null) {
      editorSplitTabBySceneRef.current[activeIdRef.current] = index
    }
  }

  const openEditorSplitTab = (index: number) => {
    if (index < 0 || index >= sceneTabsRef.current.length || index === activeTabIndexRef.current) return
    rememberEditorSplitTab(index)
    setTabContextMenu(null)
  }

  const closeEditorSplitTab = () => {
    rememberEditorSplitTab(null)
    setTabContextMenu(null)
  }

  const selectEditorSplitTab = (index: number) => {
    if (index < 0 || index >= sceneTabsRef.current.length) return
    if (index === editorSplitTabIndex) return
    if (index === activeTabIndexRef.current) {
      if (editorSplitTabIndex !== null) switchTab(editorSplitTabIndex)
      return
    }
    rememberEditorSplitTab(index)
  }

  // Switches to a tab, saving current tab content first.
  const switchTab = (index: number) => {
    if (index === activeTabIndex) return
    const previousActiveIndex = activeTabIndex
    const nextSplitIndex = index === editorSplitTabIndex ? previousActiveIndex : editorSplitTabIndex
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
        saveProjectState({ ...projectRef.current, tree: treeRef.current }, activeIdRef.current, index)
        setTitleValue(formatSceneTabTitle(node.title, updatedTabs, index))
      }
    }
    // Load new tab
    setActiveTabIndex(index)
    if (activeIdRef.current !== null) {
      sceneActiveTabRef.current[activeIdRef.current] = index
    }
    if (nextSplitIndex !== editorSplitTabIndex) {
      rememberEditorSplitTab(nextSplitIndex)
    }
    const content = updatedTabs[index]?.content ?? ''
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    const text = htmlFragmentText(content)
    setWordCount(countLatestRevisionWords(updatedTabs))
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
    activeTabIndexRef.current = newIndex
    if (activeIdRef.current !== null) {
      sceneActiveTabRef.current[activeIdRef.current] = newIndex
    }
    bodyHtmlRef.current = ''
    editor?.commands.setContent('', { emitUpdate: false })
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(newTabs, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
        saveProjectState({ ...projectRef.current, tree: treeRef.current }, activeIdRef.current, newIndex)
        setTitleValue(formatSceneTabTitle(node.title, newTabs, newIndex))
      }
    }
    setRenamingTabIndex(newIndex)
  }

  const getDuplicateTabName = (name: string, tabs: SceneTab[]) => {
    const existingNames = new Set(tabs.map(tab => tab.name))
    const baseName = `${name} copy`
    if (!existingNames.has(baseName)) return baseName
    let suffix = 2
    while (existingNames.has(`${baseName} ${suffix}`)) suffix += 1
    return `${baseName} ${suffix}`
  }

  const duplicateTab = (index: number) => {
    const sourceTab = sceneTabsRef.current[index]
    if (!sourceTab) return
    const cleanHtml = bodyHtmlRef.current.replace(/<mark data-fnr="" class="fnr-highlight">(.*?)<\/mark>/g, '$1')
    const updatedTabs = sceneTabsRef.current.map((t, i) =>
      i === activeTabIndex ? { ...t, content: cleanHtml } : t
    )
    const source = updatedTabs[index]
    const newTab: SceneTab = {
      name: getDuplicateTabName(source.name, updatedTabs),
      content: source.content,
    }
    const newTabs = [...updatedTabs, newTab]
    const newIndex = newTabs.length - 1
    sceneTabsRef.current = newTabs
    setSceneTabs(newTabs)
    setActiveTabIndex(newIndex)
    activeTabIndexRef.current = newIndex
    if (activeIdRef.current !== null) {
      sceneActiveTabRef.current[activeIdRef.current] = newIndex
    }
    bodyHtmlRef.current = newTab.content
    editor?.commands.setContent(newTab.content, { emitUpdate: false })
    const text = htmlFragmentText(newTab.content)
    setWordCount(countLatestRevisionWords(newTabs))
    setCharCount(text.length)
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(newTabs, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
        saveProjectState({ ...projectRef.current, tree: treeRef.current }, activeIdRef.current, newIndex)
        setTitleValue(formatSceneTabTitle(node.title, newTabs, newIndex))
      }
    }
    setRenamingTabIndex(newIndex)
    setTabContextMenu(null)
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
    const node = findNode(treeRef.current, activeIdRef.current ?? -1)
    if (node && node.type === 'doc') {
      setTitleValue(formatSceneTabTitle(node.title, updatedTabs, index))
      if (projectRef.current) {
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
    const splitWasOpen = editorSplitTabIndex !== null
    let nextSplitIndex = editorSplitTabIndex === null ? null
      : editorSplitTabIndex === index ? null
        : editorSplitTabIndex > index ? editorSplitTabIndex - 1
          : editorSplitTabIndex
    if (splitWasOpen && (nextSplitIndex === null || nextSplitIndex === newIndex)) {
      const fallbackIndex = newTabs.findIndex((_, i) => i !== newIndex)
      nextSplitIndex = fallbackIndex >= 0 ? fallbackIndex : null
    }
    rememberEditorSplitTab(nextSplitIndex)
    setActiveTabIndex(newIndex)
    activeTabIndexRef.current = newIndex
    if (activeIdRef.current !== null) {
      sceneActiveTabRef.current[activeIdRef.current] = newIndex
    }
    const content = newTabs[newIndex]?.content ?? ''
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        writeSceneFile(projectRef.current.path, node.file, newRaw)
        saveProjectState({ ...projectRef.current, tree: treeRef.current }, activeIdRef.current, newIndex)
      }
    }
    setWordCount(countLatestRevisionWords(newTabs))
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
    const splitTab = editorSplitTabIndex !== null ? savedTabs[editorSplitTabIndex] : null
    const reordered = [...savedTabs]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    // Track where the active tab ended up
    const newActiveIndex = reordered.findIndex(t => t === savedTabs[activeTabIndex])
    const newSplitIndex = splitTab ? reordered.findIndex(t => t === splitTab) : null
    sceneTabsRef.current = reordered
    setSceneTabs(reordered)
    setActiveTabIndex(newActiveIndex)
    activeTabIndexRef.current = newActiveIndex
    if (activeIdRef.current !== null) {
      sceneActiveTabRef.current[activeIdRef.current] = newActiveIndex
    }
    rememberEditorSplitTab(newSplitIndex !== null && newSplitIndex >= 0 && newSplitIndex !== newActiveIndex ? newSplitIndex : null)
    setTabDragIndex(null)
    setTabDropIndex(null)
    tabDragIndexRef.current = null
    if (activeIdRef.current !== null && projectRef.current) {
      const node = findNode(treeRef.current, activeIdRef.current)
      if (node && node.type === 'doc') {
        const serialized = serializeSceneTabs(reordered, rawFileRef.current)
        rawFileRef.current = serialized
        writeSceneFile(projectRef.current.path, node.file, serialized)
        saveProjectState({ ...projectRef.current, tree: treeRef.current }, activeIdRef.current, newActiveIndex)
      }
    }
  }

  // #endregion

  // #region === HANDLERS: REVISION ===

  const getRevisionActiveComments = () => {
    const legacyCommentTabIndex = Math.max(revisionTabs.length - 1, 0)
    return revisionCommentsRef.current.filter(c =>
      c.sceneId === revisionActiveId &&
      (c.tabIndex ?? legacyCommentTabIndex) === revisionActiveTabIndex
    )
  }

  const rangeIntersectsCommentHighlight = (range: Range, root: HTMLElement) => {
    const startElement = range.startContainer instanceof HTMLElement
      ? range.startContainer
      : range.startContainer.parentElement
    const endElement = range.endContainer instanceof HTMLElement
      ? range.endContainer
      : range.endContainer.parentElement

    if (startElement?.closest('[data-comment-id]') || endElement?.closest('[data-comment-id]')) return true

    const marks = Array.from(root.querySelectorAll('[data-comment-id]'))
    return marks.some(mark => {
      try {
        return range.intersectsNode(mark)
      } catch {
        return false
      }
    })
  }

  const commentOffsetsOverlap = (startOffset: number, endOffset: number) =>
    getRevisionActiveComments().some(comment =>
      startOffset < comment.endOffset && endOffset > comment.startOffset
    )

  const handleTextSelect = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return
    if (revisionPendingComment) return
    const quote = sel.toString().trim()
    const range = sel.getRangeAt(0).cloneRange()
    if (range.collapsed) return
    const revisionBody = document.getElementById('revision-body')
    if (!revisionBody || !revisionBody.contains(range.commonAncestorContainer)) return
    if (rangeIntersectsCommentHighlight(range, revisionBody)) {
      const element = range.startContainer instanceof HTMLElement
        ? range.startContainer
        : range.startContainer.parentElement
      const existingId = element?.closest('[data-comment-id]')?.getAttribute('data-comment-id')
      if (existingId) setRevisionActiveCommentId(existingId)
      window.getSelection()?.removeAllRanges()
      return
    }

    const preSelectionRange = range.cloneRange()
    preSelectionRange.selectNodeContents(revisionBody)
    preSelectionRange.setEnd(range.startContainer, range.startOffset)
    const startOffset = preSelectionRange.toString().length
    const endOffset = startOffset + range.toString().length
    if (commentOffsetsOverlap(startOffset, endOffset)) {
      window.getSelection()?.removeAllRanges()
      return
    }

    const tempId = 'pending'
    const endMarker = document.createElement('x-comment-end')
    endMarker.setAttribute('data-id', tempId)
    const endRange = range.cloneRange()
    endRange.collapse(false)
    endRange.insertNode(endMarker)

    const startMarker = document.createElement('x-comment-start')
    startMarker.setAttribute('data-id', tempId)
    const startRange = range.cloneRange()
    startRange.collapse(true)
    startRange.insertNode(startMarker)

    window.getSelection()?.removeAllRanges()

    const wrappedHtml = revisionBody.innerHTML
    setRevisionPendingComment({ quote, wrappedHtml, startOffset, endOffset })
    setDraftText('')
  }

  // #region === HANDLERS: LORE BOOK ===

  // Opens the template editor for a new category.
  const openNewCategoryEditor = () => {
    const newCat: LoreCategory = {
      id: generateLoreId(),
      name: 'New Category',
      subcategories: [],
      template: [],
      entries: [],
    }
    setLoreTemplateEditor(newCat)
    setLoreTemplateIsNew(true)
  }

  // Opens the template editor for an existing category.
  const openEditCategoryEditor = (cat: LoreCategory) => {
    setLoreTemplateEditor(JSON.parse(JSON.stringify(cat)))
    setLoreTemplateIsNew(false)
  }

  // Saves the template editor result.
  const saveLoreTemplate = async (edited: LoreCategory) => {
    const updated = { ...loreBookRef.current }
    const subcategoryIds = new Set((edited.subcategories ?? []).map(subcategory => subcategory.id))
    const normalizedEdited = {
      ...edited,
      subcategories: (edited.subcategories ?? []).map(subcategory => ({
        ...subcategory,
        name: subcategory.name.trim() || 'Unnamed Subcategory',
      })),
      entries: edited.entries.map(entry =>
        entry.subcategoryId && !subcategoryIds.has(entry.subcategoryId)
          ? { ...entry, subcategoryId: undefined }
          : entry
      ),
    }
    if (loreTemplateIsNew) {
      updated.categories = [...updated.categories, normalizedEdited]
    } else {
      updated.categories = updated.categories.map(c => c.id === edited.id ? normalizedEdited : c)
    }
    await saveLoreBook(updated)
    setLoreTemplateEditor(null)
  }

  // Deletes a category and all its entries.
  const deleteLoreCategory = async (categoryId: string) => {
    const updated = {
      ...loreBookRef.current,
      categories: loreBookRef.current.categories.filter(c => c.id !== categoryId),
    }
    await saveLoreBook(updated)
    if (activeLoreCategoryId === categoryId) {
      setActiveLoreCategoryId(null)
      setLoreView('home')
    }
    setConfirmDeleteLoreCategory(null)
  }

  // #region === HANDLERS: REVISION ===

  // Generates a unique revision comment id.
  const generateRevisionId = () =>
    `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

  // Loads a scene into the revision viewer (read-only).
  const selectRevisionDoc = async (id: number) => {
    await selectDoc(id)
    const node = findNode(treeRef.current, id)
    if (node && node.type === 'doc' && projectRef.current) {
      const raw = await readSceneFile(projectRef.current.path, node.file)
      const tabs = parseSceneTabs(raw)
      const rememberedIndex = sceneActiveTabRef.current[id]
      const safeIndex =
        rememberedIndex !== undefined && rememberedIndex >= 0 && rememberedIndex < tabs.length
          ? rememberedIndex
          : tabs.length - 1
      setRevisionTabs(tabs)
      setRevisionActiveTabIndex(safeIndex)
      setRevisionContent(tabs[safeIndex]?.content ?? '')
    }
  }

  const switchRevisionTab = (index: number) => {
    if (index < 0 || index >= revisionTabs.length) return
    setRevisionPendingComment(null)
    setDraftText('')
    setRevisionActiveCommentId(null)
    setRevisionActiveTabIndex(index)
    setRevisionContent(revisionTabs[index]?.content ?? '')
    if (revisionActiveId !== null) {
      sceneActiveTabRef.current[revisionActiveId] = index
    }
  }

  // Adds a new comment anchored to the current text selection.
  const addRevisionComment = async (quote: string, text: string) => {
    if (!projectRef.current || !revisionActiveId || !revisionPendingComment) return
    const id = generateRevisionId()
    const newComment: RevisionComment = {
      id, sceneId: revisionActiveId, tabIndex: revisionActiveTabIndex, quote, text,
      createdAt: Date.now(), resolved: false,
      startOffset: revisionPendingComment.startOffset,
      endOffset: revisionPendingComment.endOffset,
    }

    // Replace the temporary 'pending' id with the real comment id
    const wrapped = revisionPendingComment.wrappedHtml
      .replace(/data-id="pending"/g, `data-id="${id}"`)

    const node = findNode(treeRef.current, revisionActiveId)
    if (node && node.type === 'doc') {
      const raw = await readSceneFile(projectRef.current.path, node.file)
      const tabs = parseSceneTabs(raw)
      const safeIndex = Math.min(Math.max(revisionActiveTabIndex, 0), tabs.length - 1)
      const updatedTabs = tabs.map((t, i) => i === safeIndex ? { ...t, content: wrapped } : t)
      const serialized = serializeSceneTabs(updatedTabs, raw)
      await writeSceneFile(projectRef.current.path, node.file, serialized)
      rawFileRef.current = serialized
      setRevisionTabs(updatedTabs)
      setRevisionContent(wrapped)
      if (revisionActiveId === activeIdRef.current) {
        const editorTabs = sceneTabsRef.current.map((t, i) =>
          i === safeIndex ? { ...t, content: wrapped } : t
        )
        sceneTabsRef.current = editorTabs
        setSceneTabs(editorTabs)
        if (activeTabIndexRef.current === safeIndex) {
          bodyHtmlRef.current = wrapped
          editor?.commands.setContent(wrapped, { emitUpdate: false })
        }
      }
    }

    const updated = [...revisionCommentsRef.current, newComment]
    revisionCommentsRef.current = updated
    setRevisionComments(updated)
    setRevisionPendingComment(null)
    setRevisionActiveCommentId(id)
    await writeRevisionFile(projectRef.current.path, updated)
  }

  // Resolves (hides) a comment.
  const resolveRevisionComment = async (id: string) => {
    if (!projectRef.current) return
    const updated = revisionCommentsRef.current.map(c =>
      c.id === id ? { ...c, resolved: true } : c
    )
    revisionCommentsRef.current = updated
    setRevisionComments(updated)
    if (revisionActiveCommentId === id) setRevisionActiveCommentId(null)
    await writeRevisionFile(projectRef.current.path, updated)
  }

  // Permanently deletes a comment.
  const deleteRevisionComment = async (id: string) => {
    if (!projectRef.current) return

    // Strip delimiters from scene file
    const comment = revisionCommentsRef.current.find(c => c.id === id)
    if (comment) {
      const node = findNode(treeRef.current, comment.sceneId)
      if (node && node.type === 'doc') {
        const raw = await readSceneFile(projectRef.current.path, node.file)
        const stripped = raw
          .replace(new RegExp(`<x-comment-start data-id="${id}"></x-comment-start>`, 'g'), '')
          .replace(new RegExp(`<x-comment-end data-id="${id}"></x-comment-end>`, 'g'), '')
        await writeSceneFile(projectRef.current.path, node.file, stripped)
        if (comment.sceneId === activeIdRef.current) {
          const tabs = parseSceneTabs(stripped)
          sceneTabsRef.current = tabs
          setSceneTabs(tabs)
          const safeEditorIndex = Math.min(activeTabIndexRef.current, Math.max(tabs.length - 1, 0))
          if (safeEditorIndex !== activeTabIndexRef.current) setActiveTabIndex(safeEditorIndex)
          const content = tabs[safeEditorIndex]?.content ?? ''
          bodyHtmlRef.current = content
          editor?.commands.setContent(content, { emitUpdate: false })
          rawFileRef.current = stripped
        }
        if (comment.sceneId === revisionActiveId) {
          const tabs = parseSceneTabs(stripped)
          const safeIndex = Math.min(revisionActiveTabIndex, Math.max(tabs.length - 1, 0))
          setRevisionTabs(tabs)
          setRevisionActiveTabIndex(safeIndex)
          setRevisionContent(tabs[safeIndex]?.content ?? '')
        }
      }
    }

    const updated = revisionCommentsRef.current.filter(c => c.id !== id)
    revisionCommentsRef.current = updated
    setRevisionComments(updated)
    if (revisionActiveCommentId === id) setRevisionActiveCommentId(null)
    await writeRevisionFile(projectRef.current.path, updated)
  }

  const unresolveRevisionComment = async (id: string) => {
    if (!projectRef.current) return
    const updated = revisionCommentsRef.current.map(c =>
      c.id === id ? { ...c, resolved: false } : c
    )
    revisionCommentsRef.current = updated
    setRevisionComments(updated)
    await writeRevisionFile(projectRef.current.path, updated)
  }

  // #endregion

  // Opens entry editor for a new entry.
  const openNewEntryEditor = () => {
    const newEntry: LoreEntry = { id: generateLoreId(), name: '', fields: {} }
    setLoreEntryEditor(newEntry)
  }

  // Opens entry editor for an existing entry.
  const openEditEntryEditor = (entry: LoreEntry) => {
    setLoreEntryEditor(JSON.parse(JSON.stringify(entry)))
  }

  // Saves an entry.
  const saveLoreEntry = async (categoryId: string, entry: LoreEntry) => {
    const updated = { ...loreBookRef.current }
    updated.categories = updated.categories.map(c => {
      if (c.id !== categoryId) return c
      const subcategoryIds = new Set((c.subcategories ?? []).map(subcategory => subcategory.id))
      const normalizedEntry = entry.subcategoryId && !subcategoryIds.has(entry.subcategoryId)
        ? { ...entry, subcategoryId: undefined }
        : entry
      const exists = c.entries.find(e => e.id === entry.id)
      const entries = exists
        ? c.entries.map(e => e.id === entry.id ? normalizedEntry : e)
        : [...c.entries, normalizedEntry]
      return { ...c, entries }
    })
    await saveLoreBook(updated)
    setLoreEntryEditor(null)
  }

  const toggleLoreEntryPinned = async (categoryId: string, entryId: string, pinned: boolean) => {
    const updated = {
      ...loreBookRef.current,
      categories: loreBookRef.current.categories.map(category => {
        if (category.id !== categoryId) return category
        return {
          ...category,
          entries: category.entries.map(entry =>
            entry.id === entryId ? { ...entry, pinned } : entry
          ),
        }
      }),
    }
    await saveLoreBook(updated)
  }

  const addLoreKeywordFromSelection = async (categoryId: string, entryId: string, keyword: string) => {
    const normalizedKeyword = keyword.replace(/\s+/g, ' ').trim()
    if (!normalizedKeyword) {
      setEditorContextMenu(null)
      return
    }
    const updated = {
      ...loreBookRef.current,
      categories: loreBookRef.current.categories.map(category => {
        if (category.id !== categoryId) return category
        return {
          ...category,
          entries: category.entries.map(entry => {
            if (entry.id !== entryId) return entry
            const keywords = entry.keywords ?? []
            const exists = keywords.some(existing =>
              existing.trim().toLocaleLowerCase() === normalizedKeyword.toLocaleLowerCase()
            )
            return exists ? entry : { ...entry, keywords: [...keywords, normalizedKeyword] }
          }),
        }
      }),
    }
    await saveLoreBook(updated)
    setEditorContextMenu(null)
  }

  const createLoreEntryFromSelection = async (categoryId: string, name: string) => {
    const normalizedName = name.replace(/\s+/g, ' ').trim()
    if (!normalizedName) {
      setEditorContextMenu(null)
      return
    }
    const entry: LoreEntry = {
      id: generateLoreId(),
      name: normalizedName,
      keywords: [normalizedName],
      fields: {},
    }
    const updated = {
      ...loreBookRef.current,
      categories: loreBookRef.current.categories.map(category =>
        category.id === categoryId
          ? { ...category, entries: [...category.entries, entry] }
          : category
      ),
    }
    await saveLoreBook(updated)
    setActiveLoreCategoryId(categoryId)
    setExpandedEntryId(entry.id)
    setLoreView('entry')
    setWorkspace('lorebook')
    setEditorContextMenu(null)
  }

  const createLoreEntryFromAtlasMarker = async (categoryId: string, name: string): Promise<{ categoryId: string; entryId: string } | null> => {
    const normalizedName = name.replace(/\s+/g, ' ').trim()
    if (!normalizedName) return null
    const entry: LoreEntry = {
      id: generateLoreId(),
      name: normalizedName,
      keywords: [normalizedName],
      fields: {},
    }
    const updated = {
      ...loreBookRef.current,
      categories: loreBookRef.current.categories.map(category =>
        category.id === categoryId
          ? { ...category, entries: [...category.entries, entry] }
          : category
      ),
    }
    await saveLoreBook(updated)
    return { categoryId, entryId: entry.id }
  }

  const openLoreEntryById = (categoryId: string, entryId: string) => {
    setWorkspace('lorebook')
    setLoreView('entry')
    setActiveLoreCategoryId(categoryId)
    setExpandedEntryId(entryId)
  }

  // Deletes an entry.
  const deleteLoreEntry = async (categoryId: string, entryId: string) => {
    const updated = { ...loreBookRef.current }
    updated.categories = updated.categories.map(c => {
      if (c.id !== categoryId) return c
      return { ...c, entries: c.entries.filter(e => e.id !== entryId) }
    })
    await saveLoreBook(updated)
    setConfirmDeleteLoreEntry(null)
  }

  // #endregion
  
  // #region === HANDLERS: TRASH ===

  // Reads trash sidecar files so deleted scenes/folders can be listed.
  const loadTrash = async () => {
    if (!projectRef.current) return
    setTrashItems(await loadTrashItems(projectRef.current.path))
  }

  // Restores a trashed scene/folder and moves its files back into scenes.
  const restoreFromTrash = async (sidecarId: string, node: TreeNode, originalFolderId: number, parentSidecarId?: string) => {
    if (!projectRef.current) return
    try {
      const restored = await restoreTrashItem({
        projectPath: projectRef.current.path,
        tree: treeRef.current,
        sidecarId,
        node,
        originalFolderId,
        parentSidecarId,
      })

      setTree(restored.tree)
      treeRef.current = restored.tree
      setTrashItems(restored.trashItems)
      saveProjectToDisk({ ...projectRef.current, tree: restored.tree }, activeIdRef.current ?? undefined)

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
      await emptyTrashFolder(projectRef.current.path)
      setTrashItems([])
      setTrashOpen(false)
    } catch (e) {
      showMessage('Failed to empty trash: ' + String(e), 'Error', 'error')
    }
  }

  // #endregion
  // #region === HANDLERS: SEARCH ===

  const cancelPendingSearch = () => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    searchRequestIdRef.current += 1
    setSearchLoading(false)
  }

  // Searches manuscript, notes, and trash for a text query after typing settles.
  const runSearch = (query: string) => {
    if (searchDebounceRef.current !== null) {
      window.clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }

    const requestId = searchRequestIdRef.current + 1
    searchRequestIdRef.current = requestId

    if (!projectRef.current || !query.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    searchDebounceRef.current = window.setTimeout(async () => {
      searchDebounceRef.current = null
      try {
        const activeProject = projectRef.current
        if (!activeProject) return
        const results = await searchProject(activeProject.path, treeRef.current, query)
        if (searchRequestIdRef.current === requestId) setSearchResults(results)
      } catch (e) {
        if (searchRequestIdRef.current === requestId) {
          setSearchResults([])
          showMessage('Search failed: ' + String(e), 'Search Error', 'error')
        }
      } finally {
        if (searchRequestIdRef.current === requestId) setSearchLoading(false)
      }
    }, 300)
  }

  const textOffsetToEditorPosition = (textOffset: number) => {
    if (!editor) return null
    let remaining = Math.max(0, textOffset)
    let resolvedPosition: number | null = null

    editor.state.doc.descendants((node, pos) => {
      if (resolvedPosition !== null) return false
      if (!node.isText) return true
      const length = node.text?.length ?? 0
      if (remaining <= length) {
        resolvedPosition = pos + remaining
        return false
      }
      remaining -= length
      return true
    })

    return resolvedPosition
  }

  const getEditorText = () => {
    let text = ''
    editor?.state.doc.descendants(node => {
      if (node.isText) text += node.text ?? ''
      return true
    })
    return text
  }

  const jumpToSearchMatch = (query: string) => {
    if (!editor) return
    const needle = query.trim()
    if (!needle) return
    const editorText = getEditorText()
    const matchIndex = editorText.toLowerCase().indexOf(needle.toLowerCase())
    if (matchIndex === -1) return
    const from = textOffsetToEditorPosition(matchIndex)
    const to = textOffsetToEditorPosition(matchIndex + needle.length)
    if (from === null || to === null) return
    const safeFrom = Math.max(1, Math.min(from, editor.state.doc.content.size))
    const safeTo = Math.max(safeFrom, Math.min(to, editor.state.doc.content.size))
    editor
      .chain()
      .focus()
      .setTextSelection({ from: safeFrom, to: safeTo })
      .scrollIntoView()
      .run()
  }

  const switchToSearchResultTab = (result: SearchResult) => {
    const tabs = sceneTabsRef.current
    if (result.tabIndex < 0 || result.tabIndex >= tabs.length) return
    const node = findNode(treeRef.current, activeIdRef.current ?? -1)
    if (!node || node.type !== 'doc') return
    setActiveTabIndex(result.tabIndex)
    activeTabIndexRef.current = result.tabIndex
    sceneActiveTabRef.current[node.id] = result.tabIndex
    setEditorSplitTabIndex(current => current === result.tabIndex ? null : current)
    const content = tabs[result.tabIndex]?.content ?? ''
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    setCharCount(htmlFragmentText(content).length)
    setTitleValue(formatSceneTabTitle(node.title, tabs, result.tabIndex))
  }

  const scheduleSearchMatchJump = (query: string) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => jumpToSearchMatch(query))
    })
  }

  // Opens a selected search result, previewing trash results read-only.
  const openSearchResult = async (result: SearchResult) => {
    if (result.isTrash) {
      // Preview trash scene
      const doc = result.trashNode ? collectDocs(result.trashNode).find(d => d.file === result.fileId) : null
      if (doc) {
        await previewTrashScene(doc)
        if (result.tabIndex === 0) scheduleSearchMatchJump(searchQuery)
      }
      return
    }
    // Open normal scene
    const node = findNode(treeRef.current, result.docId)
    if (node && node.type === 'doc') {
      await selectDoc(result.docId)
      switchToSearchResultTab(result)
      scheduleSearchMatchJump(searchQuery)
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
    const div = parseHtmlFragment(html)
    div.querySelectorAll('mark.fnr-highlight').forEach(mark => {
      mark.replaceWith(mark.textContent ?? '')
    })
    return div.innerHTML
  }

  // Performs case-insensitive text replacement inside actual text nodes.
  // This preserves existing HTML tags and treats replacement text as plain text.
  const replaceInHtml = (
    html: string,
    find: string,
    replaceWith: string,
    onlyFirst = false
  ): { result: string; count: number } => {
    const root = parseHtmlFragment(html)

    const needle = find.toLowerCase()
    if (!needle) return { result: root.innerHTML, count: 0 }

    let count = 0

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const text = node.nodeValue ?? ''
          return text.toLowerCase().includes(needle)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT
        },
      }
    )

    const textNodes: Text[] = []
    let current = walker.nextNode()

    while (current) {
      textNodes.push(current as Text)
      current = walker.nextNode()
    }

    for (const textNode of textNodes) {
      const original = textNode.nodeValue ?? ''
      const lower = original.toLowerCase()

      let searchFrom = 0
      let matchIndex = lower.indexOf(needle, searchFrom)

      if (matchIndex === -1) continue

      const fragment = document.createDocumentFragment()

      while (matchIndex !== -1) {
        fragment.appendChild(document.createTextNode(original.slice(searchFrom, matchIndex)))
        fragment.appendChild(document.createTextNode(replaceWith))

        count++
        searchFrom = matchIndex + find.length

        if (onlyFirst) break

        matchIndex = lower.indexOf(needle, searchFrom)
      }

      fragment.appendChild(document.createTextNode(original.slice(searchFrom)))

      textNode.parentNode?.replaceChild(fragment, textNode)

      if (onlyFirst && count > 0) break
    }

    return { result: root.innerHTML, count }
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
          const tabs = parseSceneTabs(result)
          outlineWordCountsRef.current.set(doc.id, countLatestRevisionWords(tabs))
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
          const tabs = parseSceneTabs(result)
          outlineWordCountsRef.current.set(doc.id, countLatestRevisionWords(tabs))
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

  // #region === HANDLERS: SPELLCHECK ===

  const refreshSpellcheck = () => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta(spellcheckPluginKey, true))
  }

  const replaceMisspelledWord = (replacement: string) => {
    if (!editor || !spellcheckMenu) return
    editor.chain().focus().insertContentAt({ from: spellcheckMenu.from, to: spellcheckMenu.to }, replacement).run()
    setSpellcheckMenu(null)
    refreshSpellcheck()
  }

  const addWordToProjectDictionary = async (word: string) => {
    if (!projectRef.current) return
    const normalizedWord = word.trim()
    if (!normalizedWord) return
    const next = Array.from(new Set([...projectDictionaryRef.current, normalizedWord]))
      .sort((a, b) => a.localeCompare(b))
    projectDictionaryRef.current = next
    setProjectDictionary(next)
    await writeProjectDictionary(projectRef.current.path, next)
    setSpellcheckMenu(null)
    refreshSpellcheck()
  }

  const closeEditorContextMenu = () => setEditorContextMenu(null)

  const runEditorContextCommand = (command: () => void) => {
    command()
    closeEditorContextMenu()
  }

  const getSelectedEditorText = () => {
    if (!editor || editor.state.selection.empty) return ''
    const { from, to } = editor.state.selection
    return editor.state.doc.textBetween(from, to, '\n\n')
  }

  const copySelectedEditorText = async () => {
    const text = getSelectedEditorText()
    if (!text) {
      closeEditorContextMenu()
      return
    }
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard access may be unavailable in some browser contexts.
    } finally {
      closeEditorContextMenu()
    }
  }

  const cutSelectedEditorText = async () => {
    if (!editor) return
    const text = getSelectedEditorText()
    if (!text) {
      closeEditorContextMenu()
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      editor.chain().focus().deleteSelection().run()
    } catch {
      // Clipboard access may be unavailable in some browser contexts.
    } finally {
      closeEditorContextMenu()
    }
  }

  const pastePlainTextIntoEditor = async () => {
    if (!editor) return
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      const normalized = text
        .replace(/\r\n?/g, '\n')
        .replace(/^\n+|\n+$/g, '')
        .replace(/\n{2,}/g, '\n\n')
      const escapeHtml = (value: string) => value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const html = normalized
        .split('\n')
        .map(line => line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p></p>')
        .join('')
      editor.chain().focus().insertContent(html).run()
    } catch {
      // Clipboard access may be unavailable in some browser contexts.
    } finally {
      closeEditorContextMenu()
    }
  }

  // #endregion

  // #region === HANDLERS: PROJECT MANAGEMENT ===

  // Flushes pending changes and returns to the welcome screen.
  const closeProject = () => {
    clearSaveTimers()
    if (mindMapSaveTimerRef.current) {
      clearTimeout(mindMapSaveTimerRef.current)
      mindMapSaveTimerRef.current = null
      if (projectRef.current) writeCanvasFile(projectRef.current.path, mindMapRef.current)
    }
    if (atlasSaveTimerRef.current) {
      clearTimeout(atlasSaveTimerRef.current)
      atlasSaveTimerRef.current = null
      if (projectRef.current) writeAtlasFile(projectRef.current.path, atlasRef.current)
    }
    saveActive()
    setProject(null)
    projectRef.current = null
    setOutlineCollapsedFolderIds(new Set())
    outlineWordCountsRef.current.clear()
    outlineProjectPathRef.current = null
    setTree([])
    treeRef.current = []
    sceneWordCountsRef.current = {}
    sessionWordDeltaRef.current = 0
    setSessionWordDelta(0)
    setSessionStartedAt(null)
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
    setSceneTabs([])
    sceneTabsRef.current = []
    rawFileRef.current = ''
    setActiveTabIndex(0)
    setRenamingTabIndex(null)
    setTabContextMenu(null)
    setConfirmDeleteTab(null)
    setLoreBook({ categories: [] })
    loreBookRef.current = { categories: [] }
    setLoreBacklinks({})
    setLoreView('home')
    setActiveLoreCategoryId(null)
    setLoreTemplateEditor(null)
    setLoreEntryEditor(null)
    setRevisionComments([])
    revisionCommentsRef.current = []
    setRevisionActiveId(null)
    setRevisionContent('')
    setRevisionTitle('')
    setRevisionPendingComment(null)
    setRevisionActiveCommentId(null)
    setDraftText('')
    setProjectDictionary([])
    setMindMap(DEFAULT_MIND_MAP)
    mindMapRef.current = DEFAULT_MIND_MAP
    setAtlas(DEFAULT_ATLAS)
    atlasRef.current = DEFAULT_ATLAS
    setSpellcheckMenu(null)
  }

  // Exports the manuscript folder to a DOCX document.
  // Opens the compile modal, reading all scene tabs up front.
  const openCompileModal = async () => {
    if (!project) return
    setFileMenuOpen(false)
    setCompileLoading(true)
    setCompileChapters([])
    setShowCompile(true)

    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    try {
      await runProjectBackup('compile')
      const chapters = await buildCompileChapters(tree, project.path)
      // Restore saved tab and inclusion selections, defaulting to the current tree.
      const selections = projectRef.current?.compileSelections ?? {}
      const includes = projectRef.current?.compileIncludes ?? {}
      const ancestorIncludedByDepth: boolean[] = []
      const restored = chapters.map(ch => {
        const depth = ch.depth ?? 0
        ancestorIncludedByDepth.length = depth
        const ancestorsIncluded = ancestorIncludedByDepth.every(included => included !== false)
        const folderIncluded = includes[`folder:${ch.folderId}`] ?? ancestorsIncluded
        ancestorIncludedByDepth[depth] = folderIncluded
        return {
          ...ch,
          included: folderIncluded,
          scenes: ch.scenes.map(s => ({
            ...s,
            selectedTab: selections[s.fileId] ?? '__last__',
            included: includes[`scene:${s.fileId}`] ?? folderIncluded,
          })),
        }
      })
      setCompileChapters(restored)
    } catch (e) {
      setShowCompile(false)
      showMessage('Failed to prepare compile screen: ' + String(e), 'Compile Failed', 'error')
    } finally {
      setCompileLoading(false)
    }
  }

  const saveCompileProjectMetadata = (project: Project) => {
    projectRef.current = project
    saveProjectToDisk(project, activeIdRef.current ?? undefined)
  }

  const updateCompileSelection = (fileId: string, value: string) => {
    if (!projectRef.current) return
    const updated: Project = {
      ...projectRef.current,
      compileSelections: {
        ...projectRef.current.compileSelections,
        [fileId]: value,
      },
    }
    saveCompileProjectMetadata(updated)
  }

  const updateCompileIncludes = (updates: Record<string, boolean>) => {
    if (!projectRef.current) return
    const updated: Project = {
      ...projectRef.current,
      compileIncludes: {
        ...projectRef.current.compileIncludes,
        ...updates,
      },
    }
    saveCompileProjectMetadata(updated)
  }

  const updateCompileCollapsed = (updates: Record<string, boolean>) => {
    if (!projectRef.current) return
    const updated: Project = {
      ...projectRef.current,
      compileCollapsed: {
        ...(projectRef.current.compileCollapsed ?? {}),
        ...updates,
      },
    }
    saveCompileProjectMetadata(updated)
  }

  type CompileMarks = {
    bold?: boolean
    italics?: boolean
    underline?: boolean
  }

  const isProofCompileStyle = () => compileStyle === 'Proof Copy'
  const isShunnCompileStyle = () => compileStyle === 'Manuscript (Shunn)'
  const compileBodyFont = () => isProofCompileStyle() ? 'Courier New' : isShunnCompileStyle() ? 'Times New Roman' : styles.body.font
  const compileChapterFont = () => isProofCompileStyle() ? 'Courier New' : isShunnCompileStyle() ? 'Times New Roman' : styles.chapter.font
  const compileBodySize = () => isProofCompileStyle() || isShunnCompileStyle() ? 12 : styles.body.size
  const compileChapterSize = () => isProofCompileStyle() || isShunnCompileStyle() ? 12 : styles.chapter.size
  const compileLineSpacing = () => isProofCompileStyle() || isShunnCompileStyle() ? 2 : styles.body.lineSpacing

  const createCompileRun = (text: string, marks: CompileMarks) => new TextRun({
    text,
    font: compileBodyFont(),
    size: compileBodySize() * 2,
    bold: marks.bold,
    italics: marks.italics,
    underline: marks.underline ? {} : undefined,
  })

  const collectTextRuns = (node: Node, marks: CompileMarks = {}): TextRun[] => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      return text ? [createCompileRun(text, marks)] : []
    }

    if (!(node instanceof HTMLElement)) return []

    if (node.tagName === 'BR') {
      return [new TextRun({ break: 1 })]
    }

    const nextMarks: CompileMarks = {
      ...marks,
      bold: marks.bold || node.tagName === 'STRONG' || node.tagName === 'B',
      italics: marks.italics || node.tagName === 'EM' || node.tagName === 'I',
      underline: marks.underline || node.tagName === 'U',
    }

    return Array.from(node.childNodes).flatMap(child => collectTextRuns(child, nextMarks))
  }

  const collectListItemRuns = (item: HTMLElement): TextRun[] => {
    const runs: TextRun[] = []
    item.childNodes.forEach(child => {
      if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) return
      if (child instanceof HTMLElement && child.tagName === 'P') {
        child.childNodes.forEach(pChild => runs.push(...collectTextRuns(pChild)))
        return
      }
      runs.push(...collectTextRuns(child))
    })
    return runs
  }

  const bodyParagraphOptions = () => ({
    spacing: {
      after: 0,
      line: compileLineSpacing() * 240,
      lineRule: 'auto' as const,
    },
    // Shunn manuscript format is left-aligned (ragged right).
    alignment: isShunnCompileStyle() ? AlignmentType.LEFT
      : isProofCompileStyle() ? AlignmentType.JUSTIFIED : styles.body.justification === 'both' ? AlignmentType.JUSTIFIED
        : styles.body.justification === 'center' ? AlignmentType.CENTER
          : styles.body.justification === 'right' ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
    indent: isProofCompileStyle() || isShunnCompileStyle() ? { firstLine: 720 } : styles.body.firstLineIndent ? { firstLine: 720 } : undefined,
  })

  const createCompileHeadingParagraph = (label: string, kind: 'folder' | 'scene', pageBreakBefore = false) => {
    if (isShunnCompileStyle()) {
      // Chapters start a third of the way down a fresh page, centered, in the
      // same plain 12pt type as the body — no bold in manuscript format.
      return new Paragraph({
        pageBreakBefore,
        children: [new TextRun({
          text: label,
          font: 'Times New Roman',
          size: 12 * 2,
        })],
        alignment: AlignmentType.CENTER,
        spacing: {
          before: kind === 'folder' ? 3200 : 480,
          after: 480,
          line: 480,
          lineRule: 'auto' as const,
        },
      })
    }

    if (isProofCompileStyle()) {
      const marker = kind === 'folder' ? '##' : '#'
      return new Paragraph({
        pageBreakBefore,
        children: [new TextRun({
          text: `${marker} ${label.toUpperCase()} ${marker}`,
          font: 'Courier New',
          size: 12 * 2,
          bold: true,
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: kind === 'folder' ? 400 : 240, after: 200 },
      })
    }

    return new Paragraph({
      pageBreakBefore,
      text: label,
      heading: kind === 'scene' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1,
      spacing: { before: kind === 'scene' ? 240 : 400, after: 200 },
    })
  }

  const createInlineHeadingParagraph = (runs: TextRun[], level: 1 | 2) => new Paragraph({
    children: runs,
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    alignment: AlignmentType.CENTER,
    spacing: { before: level === 1 ? 480 : 360, after: 240 },
  })

  const compileHtmlToParagraphs = (html: string): Paragraph[] => {
    const root = parseHtmlFragment(html)
    const paragraphs: Paragraph[] = []

    const addTextParagraph = (runs: TextRun[], extra: Record<string, unknown> = {}) => {
      if (runs.length === 0) return
      paragraphs.push(new Paragraph({
        ...bodyParagraphOptions(),
        ...extra,
        children: runs,
      }))
    }

    const processList = (list: HTMLElement, depth = 0) => {
      const ordered = list.tagName === 'OL'
      const listItems = Array.from(list.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === 'LI')
      listItems.forEach((item, index) => {
        const prefix = ordered
          ? `${index + 1}. `
          : depth === 0 ? '• ' : depth === 1 ? '◦ ' : '▪ '
        addTextParagraph([
          createCompileRun(prefix, {}),
          ...collectListItemRuns(item),
        ], {
          indent: { left: 720 + depth * 360, hanging: 360 },
        })

        Array.from(item.children).forEach(child => {
          if (child instanceof HTMLElement && (child.tagName === 'UL' || child.tagName === 'OL')) {
            processList(child, depth + 1)
          }
        })
      })
    }

    const processBlock = (element: HTMLElement) => {
      if (element.tagName === 'P') {
        addTextParagraph(collectTextRuns(element))
      } else if (element.tagName === 'H1' || element.tagName === 'H2') {
        paragraphs.push(createInlineHeadingParagraph(
          collectTextRuns(element, { bold: true }),
          element.tagName === 'H1' ? 1 : 2
        ))
      } else if (element.tagName === 'HR') {
        paragraphs.push(new Paragraph({
          // Shunn scene breaks are a centered hash mark.
          children: [createCompileRun(isShunnCompileStyle() ? '#' : '* * *', {})],
          spacing: { before: 200, after: 200, ...(isShunnCompileStyle() ? { line: 480, lineRule: 'auto' as const } : {}) },
          alignment: AlignmentType.CENTER,
        }))
      } else if (element.hasAttribute('data-page-break') || element.classList.contains('page-break-node')) {
        paragraphs.push(new Paragraph({ children: [new PageBreak()] }))
      } else if (element.tagName === 'BLOCKQUOTE') {
        const quoteBlocks = Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
        const targets = quoteBlocks.length ? quoteBlocks : [element]
        targets.forEach(target => {
          addTextParagraph(collectTextRuns(target, { italics: true }), {
            indent: { left: 1440, right: 720, firstLine: 0 },
            spacing: { before: 120, after: 120, line: compileLineSpacing() * 240, lineRule: 'auto' as const },
          })
        })
      } else if (element.tagName === 'UL' || element.tagName === 'OL') {
        processList(element)
      }
    }

    Array.from(root.children).forEach(child => {
      if (child instanceof HTMLElement) processBlock(child)
    })

    return paragraphs
  }

  // Reports a finished export and offers to reveal the file.
  const reportExportComplete = (outputPath: string) => {
    setShowCompile(false)
    showMessage(
      `Exported to ${outputPath}`,
      'Export Complete',
      'info',
      {
        label: 'Show in Folder',
        onClick: () => revealItemInDir(outputPath)
      }
    )
  }

  // Exports the manuscript using the current compile selection and format.
  const compileProject = async (chaptersToCompile = compileChapters) => {
    if (!project) return

    const nodes = await collectCompileNodesFromSelection(chaptersToCompile, project.path, {
      includeActHeadings: compileIncludeActHeadings,
    })
    if (nodes.length === 0) {
      showMessage('Nothing to export — no scenes are selected.', 'Nothing to Export', 'warning')
      return
    }

    const settings = normalizeProjectSettings(project.settings)
    const bookTitle = (settings.title || project.name).trim()
    const bookSubtitle = settings.subtitle.trim()
    const bookAuthor = settings.author.trim()

    if (compileFormat === 'epub') {
      try {
        // The cover set in Project Settings ships inside the EPUB.
        let cover: EpubCoverImage | undefined
        if (settings.coverImage) {
          try {
            const coverPath = await join(project.path, settings.coverImage)
            if (await exists(coverPath)) {
              const extension = settings.coverImage.split('.').pop()?.toLowerCase() ?? 'jpg'
              cover = {
                bytes: await readFile(coverPath),
                extension: extension === 'jpeg' ? 'jpg' : extension,
                mediaType: extension === 'png' ? 'image/png' : extension === 'gif' ? 'image/gif' : 'image/jpeg',
              }
            }
          } catch {
            // export continues without a cover
          }
        }

        const epubBytes = await buildEpub(nodes, {
          title: bookTitle,
          subtitle: bookSubtitle || undefined,
          author: bookAuthor,
          includeSceneTitles: compileIncludeSceneTitles,
          frontMatter: compileFrontMatter,
          cover,
        })

        const outputPath = await save({
          title: 'Export Manuscript',
          defaultPath: `${project.name}.epub`,
          filters: [{ name: 'EPUB', extensions: ['epub'] }],
        })
        if (!outputPath) return

        await writeFile(outputPath, epubBytes)
        reportExportComplete(outputPath)
      } catch (e) {
        showMessage('Export failed: ' + String(e), 'Export Failed', 'error')
      }
      return
    }

    const paragraphs = []
    const isShunn = isShunnCompileStyle()
    const manuscriptWords = nodes.reduce(
      (total, node) => node.type === 'body' ? total + countHtmlWords(node.html) : total,
      0,
    )

    if (compileFrontMatter && isShunn) {
      // Shunn first page: author top-left, rounded word count top-right,
      // title and byline centered a third of the way down. The text follows
      // on the same page.
      const aboutWords = Math.max(100, Math.round(manuscriptWords / 100) * 100)
      const shunnRun = (text: string) => new TextRun({ text, font: 'Times New Roman', size: 12 * 2 })
      paragraphs.push(
        new Paragraph({
          children: [shunnRun(bookAuthor || bookTitle)],
          alignment: AlignmentType.LEFT,
          spacing: { after: 0 },
        }),
        new Paragraph({
          children: [shunnRun(`about ${aboutWords.toLocaleString('en-US')} words`)],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 0 },
        }),
        new Paragraph({
          children: [shunnRun(bookTitle)],
          alignment: AlignmentType.CENTER,
          spacing: { before: 3200, after: bookAuthor ? 0 : 480, line: 480, lineRule: 'auto' as const },
        }),
      )
      if (bookAuthor) {
        paragraphs.push(new Paragraph({
          children: [shunnRun(`by ${bookAuthor}`)],
          alignment: AlignmentType.CENTER,
          spacing: { after: 480, line: 480, lineRule: 'auto' as const },
        }))
      }
    } else if (compileFrontMatter) {
      const coverTitle = bookTitle
      const coverSubtitle = bookSubtitle
      const coverAuthor = bookAuthor

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: coverTitle.toUpperCase(),
              font: compileChapterFont(),
              size: 32 * 2,
              bold: true,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 3300, after: 240 },
        })
      )

      if (coverSubtitle) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: coverSubtitle.toUpperCase(),
                font: compileBodyFont(),
                size: 12 * 2,
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 520 },
          })
        )
      }

      paragraphs.push(
        new Paragraph({
          children: [
            ...(coverAuthor
              ? [new TextRun({
                text: coverAuthor.toUpperCase(),
                font: compileBodyFont(),
                size: 14 * 2,
              })]
              : []),
            new PageBreak(),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: coverSubtitle ? 420 : 760, after: 0 },
        })
      )
    }

    // ── Body ──
    let firstHeading = true
    for (const node of nodes) {
      if (node.type === 'heading') {
        const pageBreakBefore = !firstHeading
        firstHeading = false
        paragraphs.push(createCompileHeadingParagraph(node.label, 'folder', pageBreakBefore))
      } else {
        if (compileIncludeSceneTitles) {
          paragraphs.push(createCompileHeadingParagraph(node.label, 'scene'))
        }
        paragraphs.push(...compileHtmlToParagraphs(node.html))
      }
    }

    if (isShunn) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: 'END', font: 'Times New Roman', size: 12 * 2 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 480, line: 480, lineRule: 'auto' as const },
      }))
    }

    // Shunn running header: "Surname / TITLE / page", omitted on the first page.
    const shunnSurname = bookAuthor.split(/\s+/).pop() ?? ''
    const shunnHeader = new Header({
      children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `${shunnSurname ? `${shunnSurname} / ` : ''}${bookTitle.toUpperCase()} / `,
            font: 'Times New Roman',
            size: 12 * 2,
          }),
          new TextRun({
            children: [PageNumber.CURRENT],
            font: 'Times New Roman',
            size: 12 * 2,
          }),
        ],
      })],
    })

    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'Heading1',
            name: 'Heading 1',
            basedOn: 'Normal',
            run: {
              font: compileChapterFont(),
              size: compileChapterSize() * 2,
              bold: isProofCompileStyle() ? true : styles.chapter.bold,
              italics: isProofCompileStyle() ? false : styles.chapter.italic,
            },
          },
          {
            id: 'Heading2',
            name: 'Heading 2',
            basedOn: 'Normal',
            run: {
              font: compileChapterFont(),
              size: compileChapterSize() * 2,
              bold: isProofCompileStyle() ? true : styles.chapter.bold,
              italics: isProofCompileStyle() ? false : styles.chapter.italic,
            },
            paragraph: {
              spacing: { before: 240, after: 200 },
            },
          },
        ],
      },
      sections: [{
        ...(isShunn
          ? {
            properties: { titlePage: true },
            headers: {
              default: shunnHeader,
              first: new Header({ children: [] }),
            },
          }
          : {}),
        children: paragraphs,
      }],
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
      reportExportComplete(outputPath)
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

  const projectNameFromImportPath = (path: string) => {
    const filename = path.split(/[\\/]/).pop() ?? ''
    return filename.replace(/\.docx$/i, '').trim() || 'Imported Project'
  }

  const startNewProject = () => {
    setImportDocxPath(null)
    setNewProjectName('')
    setNewProjectParent('')
    setShowNewProject(true)
  }

  const startImportWordDoc = async () => {
    const selectedPath = await open({
      title: 'Import Word Document',
      filters: [{ name: 'Word Document', extensions: ['docx'] }],
    })
    if (!selectedPath || Array.isArray(selectedPath)) return
    setImportDocxPath(selectedPath)
    setNewProjectName(projectNameFromImportPath(selectedPath))
    setShowNewProject(true)
  }

  const closeNewProjectModal = () => {
    setShowNewProject(false)
    setNewProjectName('')
    setNewProjectParent('')
    setImportDocxPath(null)
  }

  // Creates a new project folder, default tree, and project.json.
  const createProject = async () => {
    if (creatingProject) return
    if (!newProjectName.trim() || !newProjectParent) return
    let restoreNextId: number | null = null
    try {
      const packageName = projectPackageFolderName(newProjectName)
      const projectPath = await join(newProjectParent, packageName)
      if (await exists(projectPath)) {
        showMessage(
          `A project package named "${packageName}" already exists in that location. Choose a different project name or location.`,
          'Project Package Exists',
          'warning',
        )
        return
      }

      setCreatingProject(true)
      await waitForUiPaint()

      const { defaultStyles } = await loadRecentData()
      let firstSceneId: number
      let newProj: Project

      if (importDocxPath) {
        restoreNextId = getNextIdValue()
        setNextIdValue(10)
        const imported = await parseWordDocxProject(importDocxPath, allocateNextId, generateFileId)
        restoreNextId = null
        closeProject()
        firstSceneId = imported.firstSceneId
        newProj = await createImportedProjectOnDisk({
          parentPath: newProjectParent,
          name: newProjectName.trim(),
          tree: imported.tree,
          sceneFiles: imported.sceneFiles,
          styles: defaultStyles,
        })
      } else {
        closeProject()
        setNextIdValue(10)
        const chapterId = allocateNextId()
        const sceneId = allocateNextId()
        const defaultFileId = generateFileId()
        firstSceneId = sceneId
        newProj = await createProjectOnDisk({
          parentPath: newProjectParent,
          name: newProjectName.trim(),
          chapterId,
          sceneId,
          sceneFileId: defaultFileId,
          styles: defaultStyles,
        })
      }

      setNextIdValue(Math.max(getNextIdValue(), 12))
      await addToRecentProjects(newProj.name, newProj.path)
      const loadedLoreBook = await readLoreBookFile(newProj.path)
      const loadedMindMap = await readCanvasFile(newProj.path)
      const loadedAtlas = await readAtlasFile(newProj.path)
      setProject(newProj)
      projectRef.current = newProj
      sceneWordCountsRef.current = {}
      sessionWordDeltaRef.current = 0
      setSessionWordDelta(0)
      setSessionStartedAt(Date.now())
      setStyles(defaultStyles)
      setProjectDictionary([])
      setLoreBook(loadedLoreBook)
      loreBookRef.current = loadedLoreBook
      setMindMap(loadedMindMap)
      mindMapRef.current = loadedMindMap
      setAtlas(loadedAtlas)
      atlasRef.current = loadedAtlas
      setTree(newProj.tree)
      treeRef.current = newProj.tree
      setShowNewProject(false)
      setNewProjectName('')
      setNewProjectParent('')
      setImportDocxPath(null)
      setRecentProjects(await loadRecentProjects())
      await selectDoc(firstSceneId)
    } catch (e) {
      if (restoreNextId !== null) setNextIdValue(restoreNextId)
      showMessage(`Failed to ${importDocxPath ? 'import document' : 'create project'}: ` + String(e), 'Error', 'error')
    } finally {
      setCreatingProject(false)
    }
  }
  // Hydrates project state from project.json and restores the last active scene.
  const loadProjectData = async (data: Record<string, unknown>, path: string) => {
    clearSaveStatus()
    clearProjectSearchCache()
    const loadedStyles = normalizeProjectStyles(data.styles as Partial<ProjectStyles> | undefined)
    const loadedTree = data.tree as TreeNode[]
    const restoredId = (data.lastActiveId as number | null) ?? null
    const restoredTabIndex = Number.isInteger(data.lastActiveTabIndex) ? data.lastActiveTabIndex as number : 0
    const visibleTree = restoredId !== null
      ? openAncestorFoldersForNode(loadedTree, restoredId).nodes
      : loadedTree
    setNextIdValue(Math.max(Number(data.nextId) || 10, getMaxTreeId(visibleTree) + 1, 10))
    const loadedSettings = normalizeProjectSettings(data.settings as Partial<ProjectSettings> | undefined)
    const loadedProject: Project = {
      name: data.name as string,
      path,
      tree: visibleTree,
      styles: loadedStyles,
      settings: loadedSettings,
      lastActiveTabIndex: restoredTabIndex,
      compileSelections: (data.compileSelections as Record<string, string>) ?? {},
      compileIncludes: (data.compileIncludes as Record<string, boolean>) ?? {},
      compileCollapsed: (data.compileCollapsed as Record<string, boolean>) ?? {},
      writingStats: normalizeWritingStats(data.writingStats as Partial<Project['writingStats']> | undefined),
    }
    sceneWordCountsRef.current = {}
    sessionWordDeltaRef.current = 0
    setSessionWordDelta(0)
    setSessionStartedAt(Date.now())
    setProject(loadedProject)
    setOutlineCollapsedFolderIds(new Set())
    projectRef.current = loadedProject
    setTree(visibleTree)
    treeRef.current = visibleTree
    const notes = await readNotesFile(path)
    setQuickNote(notes.quickNote)
    quickNoteRef.current = notes.quickNote
    setChecklist(notes.checklist)
    checklistRef.current = notes.checklist
    const lore = await readLoreBookFile(path)
    setLoreBook(lore)
    loreBookRef.current = lore
    const revComments = await readRevisionFile(path)
    setRevisionComments(revComments)
    revisionCommentsRef.current = revComments
    const loadedMindMap = await readCanvasFile(path)
    setMindMap(loadedMindMap)
    mindMapRef.current = loadedMindMap
    const loadedAtlas = await readAtlasFile(path)
    setAtlas(loadedAtlas)
    atlasRef.current = loadedAtlas
    const dictionaryWords = await readProjectDictionary(path)
    setProjectDictionary(dictionaryWords)
    setStyles(loadedStyles)
    setActiveId(restoredId)
    activeIdRef.current = restoredId
    if (restoredId !== null) {
      const restoredNode = findNode(visibleTree, restoredId)
      if (restoredNode && restoredNode.type === 'doc') {
        setTitleValue(restoredNode.title)
        const raw = await readSceneFile(path, restoredNode.file)
        rawFileRef.current = raw
        const tabs = parseSceneTabs(raw)
        setSceneTabs(tabs)
        sceneTabsRef.current = tabs
        const safeTabIndex = restoredTabIndex >= 0 && restoredTabIndex < tabs.length
          ? restoredTabIndex
          : Math.max(tabs.length - 1, 0)
        sceneActiveTabRef.current[restoredId] = safeTabIndex
        setActiveTabIndex(safeTabIndex)
        activeTabIndexRef.current = safeTabIndex
        const content = tabs[safeTabIndex]?.content ?? ''
        bodyHtmlRef.current = content
        editor?.commands.setContent(content, { emitUpdate: false })
        setRevisionActiveId(restoredId)
        setRevisionTitle(restoredNode.title)
        setRevisionTabs(tabs)
        setRevisionActiveTabIndex(safeTabIndex)
        setRevisionContent(tabs[safeTabIndex]?.content ?? '')
        const text = htmlFragmentText(content)
        setWordCount(countLatestRevisionWords(tabs))
        setCharCount(text.length)
        setTitleValue(formatSceneTabTitle(restoredNode.title, tabs, safeTabIndex))
      } else {
        setRevisionActiveId(null)
        setRevisionTitle('')
        setRevisionContent('')
      }
    } else {
      setTitleValue('')
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
      setRevisionActiveId(null)
      setRevisionTitle('')
      setRevisionContent('')
      setWordCount(0)
      setCharCount(0)
    }
    setTimeout(() => loadTrash(), 100)
    setTimeout(() => {
      computeManuscriptWordCount()
      computeChapterWordCount()
    }, 200)
  }

  const saveProjectSettings = async (
    settings: ProjectSettings,
    nextStyles: ProjectStyles,
    dictionaryWords: string[],
    coverAction: CoverImageAction,
  ) => {
    if (!projectRef.current) return
    const normalizedStyles = normalizeProjectStyles(nextStyles)
    const normalizedSettings = normalizeProjectSettings(settings)
    const normalizedDictionary = Array.from(new Set(dictionaryWords.map(word => word.trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b))

    if (coverAction.type === 'set') {
      try {
        const previousCover = normalizedSettings.coverImage
        normalizedSettings.coverImage = await copyCoverImage(projectRef.current.path, coverAction.sourcePath)
        if (previousCover) await deleteCoverImage(projectRef.current.path, previousCover)
      } catch (e) {
        showMessage('Could not copy the cover image into the project: ' + String(e), 'Cover Image', 'error')
      }
    } else if (coverAction.type === 'remove') {
      if (normalizedSettings.coverImage) {
        await deleteCoverImage(projectRef.current.path, normalizedSettings.coverImage)
      }
      normalizedSettings.coverImage = ''
    }
    const updated = { ...projectRef.current, settings: normalizedSettings, styles: normalizedStyles }
    projectRef.current = updated
    setProject(updated)
    setStyles(normalizedStyles)
    setProjectDictionary(normalizedDictionary)
    writeProjectDictionary(updated.path, normalizedDictionary)
    saveProjectToDisk(updated, activeIdRef.current ?? undefined)
    setShowProjectSettings(false)
  }

  const savePreferences = (
    theme: ThemeId,
    shouldIncrementNewNodeNumbers: boolean,
    nextReadingWpm: number,
    nextDefaultSceneTargetWordCount: number,
  ) => {
    const normalizedReadingWpm = Math.min(1000, Math.max(50, Math.round(nextReadingWpm)))
    const normalizedDefaultSceneTargetWordCount = Math.min(999999, Math.max(0, Math.round(nextDefaultSceneTargetWordCount)))
    setAppTheme(theme)
    setIncrementNewNodeNumbers(shouldIncrementNewNodeNumbers)
    setReadingWpm(normalizedReadingWpm)
    setDefaultSceneTargetWordCount(normalizedDefaultSceneTargetWordCount)
    saveSettings({
      ...loadSettings(),
      theme,
      incrementNewNodeNumbers: shouldIncrementNewNodeNumbers,
      readingWpm: normalizedReadingWpm,
      defaultSceneTargetWordCount: normalizedDefaultSceneTargetWordCount,
    })
    setShowPreferences(false)
  }

  const projectNameFromPath = (path: string) => {
    return path.split(/[\\/]/).filter(Boolean).pop() ?? 'Project'
  }

  const waitForUiPaint = () =>
    new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

  const showProjectRecovery = (path: string, name: string, details: unknown) => {
    setProjectRecovery({
      path,
      name: name.trim() || projectNameFromPath(path),
      details: String(details),
    })
  }

  const loadProjectWithRecovery = async (data: Record<string, unknown>, path: string, name: string) => {
    try {
      await loadProjectAndRemember(data, path)
      return true
    } catch (e) {
      showProjectRecovery(path, name, e)
      return false
    }
  }

  const openLoadedProject = async (data: Record<string, unknown>, path: string) => {
    const migration = migrateProjectData(data)
    const projectName = typeof migration.data.name === 'string' && migration.data.name.trim()
      ? migration.data.name
      : 'Untitled Project'

    if (migration.toFormatVersion > PROJECT_FORMAT_VERSION) {
      showMessage(
        `This project uses Scrivus project format ${migration.toFormatVersion}, but this copy of Scrivus only supports format ${PROJECT_FORMAT_VERSION}. Please update Scrivus before opening it.`,
        'Project Is Too New',
        'warning',
      )
      return false
    }

    const settings = normalizeProjectSettings(migration.data.settings as Partial<ProjectSettings> | undefined)
    try {
      await createProjectBackup(path, projectName, 'open', settings.backups.retentionCount)
    } catch (e) {
      showMessage(
        `Scrivus could not create a safety backup before opening this project.\n\n${String(e)}`,
        'Backup Failed',
        'warning',
        {
          label: 'Open Anyway',
          onClick: () => {
            void loadProjectWithRecovery(migration.data, path, projectName)
          },
        },
      )
      return false
    }

    if (migration.changed) {
      try {
        await writeTextFile(await join(path, 'project.json'), JSON.stringify(migration.data, null, 2))
      } catch (e) {
        showMessage(
          `Scrivus created a safety backup, but could not save the migrated project metadata.\n\n${String(e)}`,
          'Migration Save Failed',
          'warning',
          {
            label: 'Open Anyway',
            onClick: () => {
              void loadProjectWithRecovery(migration.data, path, projectName)
            },
          },
        )
        return false
      }
    }

    return loadProjectWithRecovery(migration.data, path, projectName)
  }

  const loadProjectAndRemember = async (data: Record<string, unknown>, path: string) => {
    await loadProjectData(data, path)
    const projectName = typeof data.name === 'string' && data.name.trim() ? data.name : 'Untitled Project'
    await addToRecentProjects(projectName, path)
    setRecentProjects(await loadRecentProjects())
  }

  const openProjectFromPath = async (path: string, missingMessage: string, missingTitle: string) => {
    setOpeningProject(true)
    await waitForUiPaint()

    try {
      const data = await readProjectJson(path)
      if (!data) {
        showMessage(missingMessage, missingTitle, 'warning')
        return 'missing' as const
      }
      return await openLoadedProject(data, path) ? 'opened' as const : 'failed' as const
    } catch (e) {
      const recent = recentProjects.find(project => project.path === path)
      showProjectRecovery(path, recent?.name ?? projectNameFromPath(path), e)
      return 'failed' as const
    } finally {
      setOpeningProject(false)
    }
  }

  const checkForUpdates = async () => {
    setHelpMenuOpen(false)
    showMessage('Checking GitHub Releases for the latest Scrivus version.', 'Checking for Updates')

    try {
      const result = await checkForScrivusUpdate(SCRIVUS_VERSION)
      setWelcomeUpdateStatus(result)
      if (result.status === 'available') {
        showMessage(
          `Scrivus ${result.latestVersion} is available. You are currently running ${result.currentVersion}.`,
          'Update Available',
          'info',
          {
            label: 'View Release',
            onClick: () => {
              void openUrl(result.releaseUrl)
            },
          },
        )
        return
      }

      showMessage(
        `You are up to date. Scrivus ${result.currentVersion} is the latest released version.`,
        'Scrivus Is Up to Date',
      )
    } catch (e) {
      setWelcomeUpdateStatus({ status: 'failed', currentVersion: SCRIVUS_VERSION })
      showMessage(
        `Scrivus could not check GitHub Releases right now.\n\n${String(e)}`,
        'Update Check Failed',
        'warning',
      )
    }
  }

  const restoreRecoveryBackup = async () => {
    if (!projectRecovery) return
    const target = projectRecovery
    setProjectRecovery(null)
    try {
      const restored = await restoreLatestProjectBackup(target.path, target.name)
      if (!restored) {
        showMessage('No backups were found for this project yet.', 'No Backups', 'warning')
        return
      }
      const data = await readProjectJson(target.path)
      if (!data) {
        showMessage('The backup was restored, but project.json could not be loaded.', 'Restore Warning', 'warning')
        return
      }
      await openLoadedProject(data, target.path)
      showMessage(`Restored backup:\n${restored.name}`, 'Backup Restored')
    } catch (e) {
      showMessage('Restore failed: ' + String(e), 'Restore Failed', 'error')
    }
  }

  const openRecoveryBackupFolder = async () => {
    if (!projectRecovery) return
    try {
      const backupRoot = await getProjectBackupRoot(projectRecovery.path, projectRecovery.name)
      await revealItemInDir(backupRoot)
    } catch (e) {
      showMessage('Could not open the backup folder: ' + String(e), 'Backup Folder Failed', 'warning')
    }
  }

  // Opens an existing project by asking the user for a project folder.
  const openProject = async () => {
    clearSaveTimers()
    saveActive()
    setFileMenuOpen(false)
    const selectedPath = await open({ title: 'Open Project', directory: true })
    if (!selectedPath || Array.isArray(selectedPath)) return
    const path = selectedPath as string
    await openProjectFromPath(path, 'That folder does not contain a Scrivus project.', 'Invalid Project')
  }

  // Opens a recent project directly from its saved path.
  const openProjectByPath = async (path: string) => {
    clearSaveTimers()
    saveActive()
    const status = await openProjectFromPath(
      path,
      'That project could not be found. It may have been moved or deleted.',
      'Project Not Found',
    )
    if (status === 'missing') {
      const updated = recentProjects.filter(r => r.path !== path)
      setRecentProjects(updated)
      await saveRecentProjects(updated)
    }
  }

  // #endregion

  // #region === HANDLERS: BINDER (TREE, DRAG & DROP, SCENES) ===

  const isSelectableBinderNode = (id: number) => id !== 1 && id !== 2

  const collectVisibleBinderIds = (nodes: TreeNode[]): number[] => {
    const ids: number[] = []
    const visit = (items: TreeNode[]) => {
      items.forEach(node => {
        ids.push(node.id)
        if (node.type === 'folder' && node.open) visit(node.children)
      })
    }
    visit(nodes)
    return ids
  }

  const getSelectedBinderActionIds = (nodeId: number) => {
    if (!isSelectableBinderNode(nodeId)) return []
    const selected = selectedBinderIdsRef.current.has(nodeId)
      ? selectedBinderIdsRef.current
      : new Set([nodeId])
    return collectVisibleBinderIds(treeRef.current)
      .filter(id => selected.has(id) && isSelectableBinderNode(id))
  }

  const getTopLevelBinderActionIds = (ids: number[]) => {
    const selected = new Set(ids)
    const topLevelIds: number[] = []
    const visit = (nodes: TreeNode[], ancestorSelected = false) => {
      nodes.forEach(node => {
        const isSelected = selected.has(node.id)
        if (isSelected && !ancestorSelected && isSelectableBinderNode(node.id)) {
          topLevelIds.push(node.id)
        }
        if (node.type === 'folder') visit(node.children, ancestorSelected || isSelected)
      })
    }
    visit(treeRef.current)
    return topLevelIds
  }

  const getBulkRenameSeed = (ids: number[]) => {
    const firstNode = findNode(treeRef.current, ids[0])
    return firstNode?.label ?? 'Scene 1'
  }

  const updateBinderSelection = (id: number, mode: 'toggle' | 'range') => {
    if (!isSelectableBinderNode(id)) return

    if (mode === 'range') {
      const visibleIds = collectVisibleBinderIds(treeRef.current).filter(isSelectableBinderNode)
      const anchor = binderSelectionAnchorId ?? activeIdRef.current ?? id
      const anchorIndex = visibleIds.indexOf(anchor)
      const idIndex = visibleIds.indexOf(id)
      if (anchorIndex === -1 || idIndex === -1) {
        setSelectedBinderIds(new Set([id]))
        setBinderSelectionAnchorId(id)
        return
      }
      const [start, end] = anchorIndex < idIndex ? [anchorIndex, idIndex] : [idIndex, anchorIndex]
      setSelectedBinderIds(new Set(visibleIds.slice(start, end + 1)))
      return
    }

    setSelectedBinderIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBinderSelectionAnchorId(id)
  }

  // Expands or collapses a binder folder.
  const toggleFolder = (id: number) => {
    setTree(prev => {
      const newTree = toggleFolderInTree(prev, id)
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
      return newTree
    })
  }

  const setAllBinderFoldersOpen = (open: boolean) => {
    const updateFolders = (nodes: TreeNode[]): TreeNode[] => nodes.map(node => {
      if (node.type !== 'folder') return node
      return {
        ...node,
        open,
        children: updateFolders(node.children),
      }
    })

    const newTree = updateFolders(treeRef.current)
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
  }

  const getFolderChildren = (targetFolderId?: number) => {
    const folder = findNode(treeRef.current, targetFolderId ?? 1)
    return folder?.type === 'folder' ? folder.children : treeRef.current
  }

  const allocateNextBinderNodeId = () => {
    setNextIdValue(Math.max(getNextIdValue(), getMaxTreeId(treeRef.current) + 1, 10))
    return allocateNextId()
  }

  const extractNumberedLabelValue = (label: string, prefix: 'Scene' | 'Chapter' | 'Act') => {
    const match = label.trim().match(new RegExp(`^${prefix}\\s+(\\d+)$`, 'i'))
    return match ? Number.parseInt(match[1], 10) : null
  }

  const getNextNumberedLabel = (targetFolderId: number | undefined, prefix: 'Scene' | 'Chapter' | 'Act', role?: 'act' | 'chapter') => {
    if (!incrementNewNodeNumbers) return prefix === 'Scene' ? 'New scene' : 'New folder'
    const siblings = getFolderChildren(targetFolderId)
    const matchingSiblings = siblings.filter(node => {
      if (prefix === 'Scene') return node.type === 'doc'
      return node.type === 'folder' && (node.role ?? 'chapter') === role
    })
    const highestExplicitNumber = matchingSiblings.reduce((highest, node) => {
      const value = extractNumberedLabelValue(node.label, prefix)
      return value !== null && value > highest ? value : highest
    }, 0)
    const nextNumber = highestExplicitNumber > 0 ? highestExplicitNumber + 1 : matchingSiblings.length + 1
    return `${prefix} ${nextNumber}`
  }

  const inferNewFolderRole = (targetFolderId?: number): NonNullable<FolderNode['role']> => {
    const target = findNode(treeRef.current, targetFolderId ?? 1)
    if (target?.type === 'folder' && target.role === 'act') return 'chapter'
    const folderSiblings = getFolderChildren(targetFolderId).filter((node): node is FolderNode => node.type === 'folder')
    const lastFolder = folderSiblings[folderSiblings.length - 1]
    return lastFolder?.role === 'act' ? 'act' : 'chapter'
  }

  const createDefaultSceneMetadata = (): SceneMetadata => ({
    ...DEFAULT_SCENE_METADATA,
    tags: [...DEFAULT_SCENE_METADATA.tags],
    targetWordCount: defaultSceneTargetWordCount,
  })

  const createNewDocNode = (targetFolderId?: number): DocNode => {
    const id = allocateNextBinderNodeId()
    const fileId = generateFileId()
    const label = getNextNumberedLabel(targetFolderId, 'Scene')
    return { id, type: 'doc', label, title: label, file: fileId, metadata: createDefaultSceneMetadata() }
  }

  const createNewFolderNode = (targetFolderId?: number): FolderNode => {
    const id = allocateNextBinderNodeId()
    const role = inferNewFolderRole(targetFolderId)
    const label = getNextNumberedLabel(targetFolderId, role === 'act' ? 'Act' : 'Chapter', role)
    return { id, type: 'folder', label, open: true, role, children: [] }
  }

  // Adds a new scene to the selected folder, then starts rename mode.
  const addDoc = async (targetFolderId?: number) => {
    const node = createNewDocNode(targetFolderId)
    const newTree = addDocToTree(treeRef.current, targetFolderId, node)
    sceneWordCountsRef.current[node.file] = 0
    setTree(newTree)
    treeRef.current = newTree
    setSelectedBinderIds(new Set())
    setBinderSelectionAnchorId(null)
    const defaultTabs: SceneTab[] = [{ name: 'First Draft', content: '' }]
    const defaultRaw = serializeSceneTabs(defaultTabs, '')
    if (projectRef.current) {
      await writeSceneFile(projectRef.current.path, node.file, defaultRaw)
      await saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    }
    setRenamingId(node.id)
    await selectDoc(node.id)
  }

  const updateMindMap = (nextMap: MindMap) => {
    const normalized = normalizeMindMap(nextMap)
    setMindMap(normalized)
    mindMapRef.current = normalized
    if (!projectRef.current) return
    const projectPath = projectRef.current.path
    if (mindMapSaveTimerRef.current) clearTimeout(mindMapSaveTimerRef.current)
    mindMapSaveTimerRef.current = setTimeout(() => {
      writeCanvasFile(projectPath, mindMapRef.current)
      mindMapSaveTimerRef.current = null
    }, 350)
  }

  const createSceneFromMindMapNode = async (mindMapNode: MindMapNode): Promise<number | null> => {
    if (!projectRef.current) return null
    const title = mindMapNode.title?.trim() ||
      mindMapNode.text.trim().split(/\s+/).slice(0, 8).join(' ') ||
      'New scene'
    const id = allocateNextBinderNodeId()
    const fileId = generateFileId()
    const node: DocNode = { id, type: 'doc', label: title, title, file: fileId, metadata: createDefaultSceneMetadata() }
    const newTree = addDocToTree(treeRef.current, 1, node)
    sceneWordCountsRef.current[fileId] = 0
    const defaultTabs: SceneTab[] = [{ name: 'First Draft', content: '' }]
    const defaultRaw = serializeSceneTabs(defaultTabs, '')

    setTree(newTree)
    treeRef.current = newTree
    setSelectedBinderIds(new Set())
    selectedBinderIdsRef.current = new Set()
    setBinderSelectionAnchorId(id)
    await writeSceneFile(projectRef.current.path, fileId, defaultRaw)
    await saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    await selectDoc(id)
    return id
  }

  const updateAtlas = (nextAtlas: Atlas) => {
    const normalized = normalizeAtlas(nextAtlas)
    setAtlas(normalized)
    atlasRef.current = normalized
    if (!projectRef.current) return
    const projectPath = projectRef.current.path
    if (atlasSaveTimerRef.current) clearTimeout(atlasSaveTimerRef.current)
    atlasSaveTimerRef.current = setTimeout(() => {
      writeAtlasFile(projectPath, atlasRef.current)
      atlasSaveTimerRef.current = null
    }, 350)
  }

  const getImageDimensions = async (sourcePath: string): Promise<{ width: number; height: number }> => {
    const bytes = await readFile(sourcePath)
    const blobUrl = URL.createObjectURL(new Blob([bytes]))
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
        image.onerror = () => reject(new Error('The selected image could not be loaded.'))
        image.src = blobUrl
      })
    } finally {
      URL.revokeObjectURL(blobUrl)
    }
  }

  const chooseAtlasImage = async (): Promise<AtlasImportCandidate | null> => {
    const selectedPath = await open({
      title: 'Import Atlas Map',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    })
    if (!selectedPath || Array.isArray(selectedPath)) return null
    try {
      const { width, height } = await getImageDimensions(selectedPath as string)
      const megapixels = (width * height) / 1_000_000
      if (width > ATLAS_MAX_SIDE || height > ATLAS_MAX_SIDE) {
        showMessage(
          `This map is ${width.toLocaleString()} x ${height.toLocaleString()} px. Atlas maps are limited to ${ATLAS_MAX_SIDE.toLocaleString()} px on either side.`,
          'Map Too Large',
          'warning',
        )
        return null
      }
      const fileName = (selectedPath as string).split(/[\\/]/).pop() ?? 'Untitled Map'
      const name = fileName.replace(/\.[^.]+$/, '') || 'Untitled Map'
      return {
        sourcePath: selectedPath as string,
        name,
        width,
        height,
        megapixels,
        overWarningThreshold: megapixels > ATLAS_WARNING_MEGAPIXELS,
      }
    } catch (e) {
      showMessage('Failed to read map image: ' + String(e), 'Import Failed', 'error')
      return null
    }
  }

  const importAtlasMap = async (candidate: AtlasImportCandidate) => {
    if (!projectRef.current) return
    const mapId = `map_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const imagePath = await copyAtlasImage(projectRef.current.path, candidate.sourcePath, mapId)
    const nextMap: AtlasMap = {
      id: mapId,
      name: candidate.name,
      imagePath,
      imageWidth: candidate.width,
      imageHeight: candidate.height,
      imageSampling: 'linear',
      viewport: {
        x: candidate.width / 2,
        y: candidate.height / 2,
        zoom: 1,
      },
      markers: [],
    }
    updateAtlas({
      activeMapId: mapId,
      maps: [...atlasRef.current.maps, nextMap],
    })
  }

  const deleteAtlasMap = async (mapId: string) => {
    if (!projectRef.current) return
    const target = atlasRef.current.maps.find(map => map.id === mapId)
    if (!target) return
    await deleteAtlasImage(projectRef.current.path, target.imagePath)
    const maps = atlasRef.current.maps.filter(map => map.id !== mapId)
    updateAtlas({
      activeMapId: maps[0]?.id ?? null,
      maps,
    })
  }

  const replaceAtlasMapImage = async (mapId: string, candidate: AtlasImportCandidate) => {
    if (!projectRef.current) return
    const target = atlasRef.current.maps.find(map => map.id === mapId)
    if (!target) return
    const oldImagePath = target.imagePath
    const replacementAssetId = `${mapId}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
    const imagePath = await copyAtlasImage(projectRef.current.path, candidate.sourcePath, mapId, replacementAssetId)
    await deleteAtlasImage(projectRef.current.path, oldImagePath)
    updateAtlas({
      activeMapId: mapId,
      maps: atlasRef.current.maps.map(map => map.id === mapId
        ? {
          ...map,
          imagePath,
          imageWidth: candidate.width,
          imageHeight: candidate.height,
          viewport: {
            x: candidate.width / 2,
            y: candidate.height / 2,
            zoom: 1,
          },
        }
        : map),
    })
  }

  // Adds a new binder folder, then starts rename mode.
  const addFolder = (targetFolderId?: number) => {
    const newFolder = createNewFolderNode(targetFolderId)
    const newTree = addFolderToTree(treeRef.current, targetFolderId, newFolder)
    setTree(newTree)
    treeRef.current = newTree
    setSelectedBinderIds(new Set())
    setBinderSelectionAnchorId(null)
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    setRenamingId(newFolder.id)
  }

  const setFolderRole = (id: number, role: 'act' | 'chapter') => {
    const newTree = setFolderRoleInTree(treeRef.current, id, role)
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    setContextMenu(null)
  }

  // Moves a binder node to trash instead of deleting it permanently.
  // The node is only removed from the binder once its files are safely in trash.
  const deleteNode = async (id: number) => {
    const node = findNode(treeRef.current, id)
    if (!node || !projectRef.current) return
    const parentFolder = findParentFolder(treeRef.current, id)
    const folderId = parentFolder?.id ?? 1
    try {
      await trashNode(projectRef.current.path, node, folderId)
    } catch (e) {
      showMessage(`Could not move "${node.label}" to the trash:\n${String(e)}`, 'Delete Failed', 'error')
      return
    }
    loadTrash()
    setSelectedBinderIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setTree(prev => {
      const newTree = removeNodeFromTree(prev, id)
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
      return newTree
    })
    if (activeId === id) {
      setActiveId(null)
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
    }
  }

  const deleteNodes = async (ids: number[]) => {
    if (!projectRef.current) return
    const actionIds = getTopLevelBinderActionIds(ids)
    if (actionIds.length === 0) return

    const nodesToTrash = actionIds
      .map(id => {
        const node = findNode(treeRef.current, id)
        if (!node) return null
        const parentFolder = findParentFolder(treeRef.current, id)
        return { id, node, folderId: parentFolder?.id ?? 1 }
      })
      .filter((entry): entry is { id: number; node: TreeNode; folderId: number } => Boolean(entry))

    const results = await Promise.allSettled(nodesToTrash.map(entry =>
      trashNode(projectRef.current!.path, entry.node, entry.folderId).then(() => entry)
    ))
    const trashed = results
      .filter((result): result is PromiseFulfilledResult<typeof nodesToTrash[number]> => result.status === 'fulfilled')
      .map(result => result.value)
    const failures = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[]
    await loadTrash()

    // Only drop the nodes that actually made it into the trash.
    const trashedIds = trashed.map(entry => entry.id)
    if (trashedIds.length > 0) {
      const newTree = removeNodesFromTree(treeRef.current, trashedIds)
      setTree(newTree)
      treeRef.current = newTree
      saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    }

    setSelectedBinderIds(prev => {
      const next = new Set(prev)
      trashedIds.forEach(id => next.delete(id))
      return next
    })
    if (activeIdRef.current !== null && findNode(trashed.map(entry => entry.node), activeIdRef.current)) {
      setActiveId(null)
      bodyHtmlRef.current = ''
      editor?.commands.setContent('')
    }
    if (failures.length > 0) {
      showMessage(
        `Could not move ${failures.length} item${failures.length === 1 ? '' : 's'} to the trash:\n${String(failures[0].reason)}`,
        'Delete Failed',
        'error',
      )
    }
  }

  // Deletes trashed files and sidecar metadata permanently.
  const permanentlyDelete = async (sidecarId: string, node: TreeNode) => {
    if (!projectRef.current) return

    try {
      await permanentlyDeleteTrashItem(projectRef.current.path, sidecarId, node)
      setTrashItems(prev => prev.filter(i => i.sidecarId !== sidecarId))
      setConfirmDelete(null)

      if (isTrashPreview) {
        setIsTrashPreview(false)
        setActiveId(null)
        setTitleValue('')
        bodyHtmlRef.current = ''
        editor?.commands.setContent('', { emitUpdate: false })
      }
    } catch (e) {
      showMessage('Failed to delete: ' + String(e), 'Error', 'error')
    }
  }

  // Loads a trashed scene into the editor in read-only preview mode.
  const previewTrashScene = async (doc: DocNode) => {
    if (!projectRef.current) return

    const raw = await readTrashPreviewContent(projectRef.current.path, doc)
    const tabs = parseSceneTabs(raw)
    const content = tabs[tabs.length - 1]?.content ?? tabs[0]?.content ?? ''
    setIsTrashPreview(true)
    setTitleValue(formatSceneTabTitle(doc.title, tabs, tabs.length - 1))
    bodyHtmlRef.current = content
    editor?.commands.setContent(content, { emitUpdate: false })
    const text = htmlFragmentText(content)
    setWordCount(countLatestRevisionWords(tabs))
    setCharCount(text.length)
  }

  // Renames a binder item and syncs document titles for scenes.
  const renameNode = (id: number, label: string) => {
    setTree(prev => {
      const newTree = renameNodeInTree(prev, id, label)
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
      return newTree
    })
    if (id === activeIdRef.current) {
      setTitleValue(label)
    }
    setRenamingId(null)
  }

  const parseBulkRenameStart = (value: string) => {
    const match = value.trim().match(/^(.*?)(\d+)$/)
    if (!match) return null
    return {
      prefix: match[1],
      start: Number(match[2]),
      width: match[2].length,
    }
  }

  const applyBulkRename = () => {
    if (!bulkRenameTarget) return
    const parsed = parseBulkRenameStart(bulkRenameTarget.value)
    if (!parsed) return

    let newTree = treeRef.current
    bulkRenameTarget.ids.forEach((id, index) => {
      const nextNumber = String(parsed.start + index).padStart(parsed.width, '0')
      newTree = renameNodeInTree(newTree, id, `${parsed.prefix}${nextNumber}`)
    })
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
    if (activeIdRef.current !== null && bulkRenameTarget.ids.includes(activeIdRef.current)) {
      const activeNode = findNode(newTree, activeIdRef.current)
      if (activeNode) setTitleValue(activeNode.label)
    }
    setBulkRenameTarget(null)
  }

  const copySceneForDuplicate = async (doc: DocNode) => {
    const newFileId = generateFileId()
    if (projectRef.current) {
      try {
        const srcPath = await join(projectRef.current.path, 'scenes', `${doc.file}.md`)
        const content = await readTextFile(srcPath)
        await writeSceneFile(projectRef.current.path, newFileId, content)
      } catch {
        await writeSceneFile(projectRef.current.path, newFileId, '')
      }
    }
    return newFileId
  }

  const duplicateBinderNodes = async (ids: number[]) => {
    const actionIds = getTopLevelBinderActionIds(ids)
    if (actionIds.length === 0) return
    const newTree = actionIds.length === 1
      ? await duplicateNodeInTree(treeRef.current, actionIds[0], allocateNextBinderNodeId, copySceneForDuplicate)
      : await duplicateNodesInTree(treeRef.current, actionIds, allocateNextBinderNodeId, copySceneForDuplicate)
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
    const selectedDragIds = selectedBinderIdsRef.current.has(currentDragId)
      ? Array.from(selectedBinderIdsRef.current)
      : [currentDragId]
    setTree(prev => {
      const newTree = selectedDragIds.length > 1
        ? moveNodesInTree(prev, selectedDragIds, currentDropTarget)
        : moveNodeInTree(prev, currentDragId, currentDropTarget)
      if (!newTree) return prev
      treeRef.current = newTree
      if (projectRef.current) saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
      return newTree
    })
    setDragId(null)
    setDropTarget(null)
  }

  const updateSceneMetadata = (id: number, metadata: SceneMetadata) => {
    if (isTrashPreview) return
    const normalized = normalizeSceneMetadata(metadata)
    const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
    const node = findNode(newTree, id)
    if (!node || node.type !== 'doc') return
    node.metadata = normalized
    setTree(newTree)
    treeRef.current = newTree
    if (projectRef.current) {
      const updatedProject = { ...projectRef.current, tree: newTree }
      projectRef.current = updatedProject
      setProject(updatedProject)
      saveProjectToDisk(updatedProject, activeIdRef.current ?? undefined)
    }
  }

  const updateActiveSceneMetadata = (metadata: SceneMetadata) => {
    if (activeIdRef.current === null) return
    updateSceneMetadata(activeIdRef.current, metadata)
  }

  const updateOutlineSceneStatus = (id: number, status: SceneStatus) => {
    const node = findNode(treeRef.current, id)
    if (!node || node.type !== 'doc') return
    updateSceneMetadata(id, { ...normalizeSceneMetadata(node.metadata), status })
  }

  // Derived editor visibility state.
  const activeNode = activeId !== null ? findNode(tree, activeId) : null
  const showEditor = activeNode?.type === 'doc' || isTrashPreview
  const activeSceneMetadata =
    activeNode?.type === 'doc' && !isTrashPreview
      ? normalizeSceneMetadata(activeNode.metadata)
      : null
  useEffect(() => {
    if (workspace !== 'editor' || !showEditor) setFocusMode(false)
  }, [workspace, showEditor])

  const manuscriptSceneIds = useMemo(() => {
    const manuscript = findNode(tree, 1)
    return manuscript?.type === 'folder'
      ? collectDocs(manuscript).map(doc => doc.id)
      : []
  }, [tree])
  const activeManuscriptSceneIndex = activeId !== null && !isTrashPreview
    ? manuscriptSceneIds.indexOf(activeId)
    : -1
  const previousSceneId = activeManuscriptSceneIndex > 0
    ? manuscriptSceneIds[activeManuscriptSceneIndex - 1]
    : null
  const nextSceneId = activeManuscriptSceneIndex >= 0 && activeManuscriptSceneIndex < manuscriptSceneIds.length - 1
    ? manuscriptSceneIds[activeManuscriptSceneIndex + 1]
    : null

  const selectPreviousScene = () => {
    if (previousSceneId === null) return
    void selectDoc(previousSceneId)
  }

  const selectNextScene = () => {
    if (nextSceneId === null) return
    void selectDoc(nextSceneId)
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
      const activeTabs = getSceneCountTabs(doc)
      const tabs = activeTabs ?? parseSceneTabs(await readSceneFile(projectRef.current.path, doc.file))
      total += countLatestRevisionWords(tabs)
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
      const activeTabs = getSceneCountTabs(doc)
      const tabs = activeTabs ?? parseSceneTabs(await readSceneFile(projectRef.current.path, doc.file))
      total += countLatestRevisionWords(tabs)
    }
    setChapterWordCount(total)
  }, [])

  // #endregion

  // #region === HANDLERS: CONTEXT MENUS ===

  const handleTabContextRename = (index: number) => {
    setRenamingTabIndex(index)
    setTabContextMenu(null)
  }

  // Opens the draft comparison with the clicked tab against the latest draft
  // (or against the previous draft when the clicked tab is the latest).
  const handleTabContextCompare = (index: number) => {
    setTabContextMenu(null)
    if (sceneTabs.length < 2) return
    const latest = sceneTabs.length - 1
    setDraftDiff(index === latest
      ? { left: latest - 1, right: latest }
      : { left: index, right: latest })
  }

  const handleTabContextDuplicate = (index: number) => {
    duplicateTab(index)
  }

  const handleTabContextDelete = (index: number) => {
    if (sceneTabs.length <= 1) return
    setConfirmDeleteTab(index)
    setTabContextMenu(null)
  }

  const handleBinderContextRename = (nodeId: number) => {
    setRenamingId(nodeId)
    setContextMenu(null)
  }

  const handleBinderContextDuplicate = async (nodeId: number) => {
    const actionIds = getSelectedBinderActionIds(nodeId)
    await duplicateBinderNodes(actionIds)
    setContextMenu(null)
  }

  const handleBinderContextBulkRename = (nodeId: number) => {
    const actionIds = getSelectedBinderActionIds(nodeId)
    if (actionIds.length === 0) return
    setBulkRenameTarget({ ids: actionIds, value: getBulkRenameSeed(actionIds) })
    setContextMenu(null)
  }

  const handleBinderContextAddScene = async (node: TreeNode) => {
    if (node.type === 'folder') {
      await addDoc(node.id)
    } else {
      const parent = findParentFolder(treeRef.current, node.id)
      if (parent) {
        const newDoc = createNewDocNode(parent.id)
        const newTree = JSON.parse(JSON.stringify(treeRef.current)) as TreeNode[]
        const parentNode = findNode(newTree, parent.id) as FolderNode
        const idx = parentNode.children.findIndex(c => c.id === node.id)
        parentNode.children.splice(idx + 1, 0, newDoc)
        sceneWordCountsRef.current[newDoc.file] = 0
        setTree(newTree)
        treeRef.current = newTree
        const defaultTabs: SceneTab[] = [{ name: 'First Draft', content: '' }]
        const defaultRaw = serializeSceneTabs(defaultTabs, '')
        if (projectRef.current) {
          await writeSceneFile(projectRef.current.path, newDoc.file, defaultRaw)
          await saveProjectToDisk({ ...projectRef.current, tree: newTree }, activeIdRef.current ?? undefined)
        }
        setRenamingId(newDoc.id)
        await selectDoc(newDoc.id)
      }
    }
    setContextMenu(null)
  }

  const handleBinderContextAddFolder = (node: TreeNode) => {
    if (node.type === 'folder') {
      addFolder(node.id)
    } else {
      const parent = findParentFolder(treeRef.current, node.id)
      if (parent) addFolder(parent.id)
    }
    setContextMenu(null)
  }

  const handleBinderContextMoveToTrash = (node: TreeNode) => {
    const actionIds = getSelectedBinderActionIds(node.id)
    if (actionIds.length > 1) {
      setConfirmBulkBinDelete({ ids: actionIds, label: `${actionIds.length} selected items` })
    } else {
      setConfirmBinDelete({ id: node.id, label: node.label })
    }
    setContextMenu(null)
  }

  // #endregion

  const exitApp = async () => {
    if (isTauri()) {
      try {
        const appWindow = getCurrentWindow()
        const fullscreen = await appWindow.isFullscreen()
        const maximized = await appWindow.isMaximized()
        const currentSettings = loadSettings()
        saveSettings({
          ...currentSettings,
          window: {
            ...currentSettings.window,
            fullscreen,
            maximized,
          },
        })
      } catch {
        // Fall through to exit even if the window state cannot be read.
      }
    }
    await exit(0)
  }

  const MenuBarMenus = () => (
    <AppMenus
      projectOpen={Boolean(project)}
      fileMenuOpen={fileMenuOpen}
      editMenuOpen={editMenuOpen}
      helpMenuOpen={helpMenuOpen}
      fileMenuRef={fileMenuRef}
      editMenuRef={editMenuRef}
      helpMenuRef={helpMenuRef}
      canUndo={Boolean(editor?.can().undo())}
      canRedo={Boolean(editor?.can().redo())}
      onFileMenuToggle={() => {
        setThemeMenuOpen(false)
        setPreviewTheme(null)
        setFileMenuOpen(v => !v)
      }}
      onEditMenuToggle={() => {
        setThemeMenuOpen(false)
        setPreviewTheme(null)
        setEditMenuOpen(v => !v)
      }}
      onHelpMenuToggle={() => {
        setThemeMenuOpen(false)
        setPreviewTheme(null)
        setHelpMenuOpen(v => !v)
      }}
      onNewProject={() => { setFileMenuOpen(false); startNewProject() }}
      onOpenProject={openProject}
      onNewProjectFromWordDoc={() => { setFileMenuOpen(false); void startImportWordDoc() }}
      onCloseProject={closeProject}
      onBackupNow={() => { setFileMenuOpen(false); runProjectBackup('manual', true) }}
      onRestoreBackupPicker={openRestoreBackupPicker}
      onRestoreBackup={() => {
        setFileMenuOpen(false)
        showMessage(
          'This will copy the latest backup over the current project files. Scrivus will create a pre-restore backup first.',
          'Restore Latest Backup?',
          'warning',
          { label: 'Restore', onClick: restoreLatestBackup },
        )
      }}
      onCompile={() => openCompileModal()}
      onExit={() => { void exitApp() }}
      onUndo={() => { setEditMenuOpen(false); editor?.chain().focus().undo().run() }}
      onRedo={() => { setEditMenuOpen(false); editor?.chain().focus().redo().run() }}
      onSelectAll={() => { setEditMenuOpen(false); editor?.chain().focus().selectAll().run() }}
      onProjectSettings={() => { setEditMenuOpen(false); setShowProjectSettings(true) }}
      onPreferences={() => { setEditMenuOpen(false); setShowPreferences(true) }}
      onSearch={() => { setEditMenuOpen(false); setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
      onFindReplace={() => { setEditMenuOpen(false); setShowFnR(true); setTimeout(() => fnrInputRef.current?.focus(), 50) }}
      onAbout={() => { setHelpMenuOpen(false); setShowAbout(true) }}
      onCheckForUpdates={() => { void checkForUpdates() }}
    />
  )

  const ThemeMenu = () => {
    const activeTheme = THEME_OPTIONS.find(theme => theme.id === (previewTheme ?? appTheme)) ?? THEME_OPTIONS[0]
    const lightThemes = THEME_OPTIONS.filter(theme => theme.id === 'light' || theme.id.endsWith('Light'))
    const darkThemes = THEME_OPTIONS.filter(theme => !lightThemes.some(lightTheme => lightTheme.id === theme.id))

    const openThemeMenu = () => {
      setFileMenuOpen(false)
      setEditMenuOpen(false)
      setHelpMenuOpen(false)
      if (themeMenuOpen) setPreviewTheme(null)
      setThemeMenuOpen(!themeMenuOpen)
    }

    const commitTheme = (theme: ThemeId) => {
      setAppTheme(theme)
      setPreviewTheme(null)
      setThemeMenuOpen(false)
    }

    return (
      <div className={`theme-menu${themeMenuOpen ? ' open' : ''}`} ref={themeMenuRef}>
        <button
          className="theme-menu-trigger"
          onClick={openThemeMenu}
          title="Theme"
          aria-label="Theme"
          aria-expanded={themeMenuOpen}
        >
          <span className="theme-menu-trigger-swatches" aria-hidden="true">
            {activeTheme.swatches.map(color => (
              <span key={color} style={{ background: color }} />
            ))}
          </span>
        </button>
        {themeMenuOpen && (
          <div className="theme-menu-dropdown" onMouseLeave={() => setPreviewTheme(null)}>
            {[darkThemes, lightThemes].map((themes, columnIndex) => (
              <div
                key={columnIndex === 0 ? 'dark' : 'light'}
                className="theme-menu-column"
                aria-label={columnIndex === 0 ? 'Dark themes' : 'Light themes'}
              >
                {themes.map(theme => (
                  <button
                    key={theme.id}
                    className={`theme-menu-option${appTheme === theme.id ? ' active' : ''}`}
                    onMouseEnter={() => setPreviewTheme(theme.id)}
                    onFocus={() => setPreviewTheme(theme.id)}
                    onClick={() => commitTheme(theme.id)}
                    title={theme.name}
                    aria-label={theme.name}
                  >
                    <span className="theme-menu-option-swatches" aria-hidden="true">
                      {theme.swatches.map(color => (
                        <span key={color} style={{ background: color }} />
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const WelcomeUpdateNotice = () => {
    const statusClass = welcomeUpdateStatus.status === 'available'
      ? ' available'
      : welcomeUpdateStatus.status === 'failed'
        ? ' failed'
        : ''
    const title = welcomeUpdateStatus.status === 'available'
      ? 'Update Available'
      : welcomeUpdateStatus.status === 'current'
        ? 'Latest Version Up to Date'
        : welcomeUpdateStatus.status === 'checking'
          ? 'Checking for Updates'
          : 'Update Check Unavailable'
    const versionText = welcomeUpdateStatus.status === 'available'
      ? `Scrivus ${welcomeUpdateStatus.currentVersion} -> ${welcomeUpdateStatus.latestVersion}`
      : `Scrivus Version ${welcomeUpdateStatus.currentVersion}`

    const content = (
      <>
        <span className="welcome-update-title">{title}</span>
        <span className="welcome-update-version">{versionText}</span>
      </>
    )

    if (welcomeUpdateStatus.status === 'available') {
      return (
        <button
          className={`welcome-update-notice${statusClass}`}
          onClick={() => { void openUrl(welcomeUpdateStatus.releaseUrl) }}
        >
          {content}
        </button>
      )
    }

    return (
      <div className={`welcome-update-notice${statusClass}`}>
        {content}
      </div>
    )
  }

  const GoalModal = () => {
    const [monthlyTarget, setMonthlyTarget] = useState(String(goals.monthlyTargetWordCount || ''))
    const [dailyTarget, setDailyTarget] = useState(String(goals.dailyTargetWordCount || ''))
    const [sessionTarget, setSessionTarget] = useState(String(goals.sessionTargetWordCount || ''))
    const [sceneTarget, setSceneTarget] = useState(String(activeSceneMetadata?.targetWordCount || ''))
    const writingStats = normalizeWritingStats(projectRef.current?.writingStats)
    const todayKey = localDateKey()
    const monthKey = todayKey.slice(0, 7)
    const dailyProgress = writingStats.dailyWordDeltas[todayKey] ?? 0
    const monthlyProgress = Object.entries(writingStats.dailyWordDeltas)
      .filter(([key]) => key.startsWith(monthKey))
      .reduce((total, [, value]) => total + value, 0)
    const sceneProgress = wordCount
    const sessionStartedLabel = sessionStartedAt
      ? new Date(sessionStartedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : 'this project session'
    const sessionElapsedLabel = (() => {
      if (!sessionStartedAt) return ''
      const elapsedMinutes = Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 60000))
      if (elapsedMinutes < 60) return `${elapsedMinutes}m elapsed`
      const hours = Math.floor(elapsedMinutes / 60)
      const minutes = elapsedMinutes % 60
      return minutes > 0 ? `${hours}h ${minutes}m elapsed` : `${hours}h elapsed`
    })()

    useEffect(() => {
      setMonthlyTarget(String(goals.monthlyTargetWordCount || ''))
      setDailyTarget(String(goals.dailyTargetWordCount || ''))
      setSessionTarget(String(goals.sessionTargetWordCount || ''))
      setSceneTarget(String(activeSceneMetadata?.targetWordCount || ''))
    }, [activeSceneMetadata?.targetWordCount, goals])

    const cleanInput = (value: string) => value.replace(/\D/g, '')
    const normalizeGoal = (value: string, max: number) => {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? Math.min(max, Math.max(0, Math.round(parsed))) : 0
    }

    const saveGoals = () => {
      const nextGoals = {
        monthlyTargetWordCount: normalizeGoal(monthlyTarget, 9999999),
        dailyTargetWordCount: normalizeGoal(dailyTarget, 999999),
        sessionTargetWordCount: normalizeGoal(sessionTarget, 999999),
      }
      const nextSceneTarget = normalizeGoal(sceneTarget, 999999)
      setGoals(nextGoals)
      saveSettings({
        ...loadSettings(),
        goals: nextGoals,
      })
      if (activeSceneMetadata) {
        updateActiveSceneMetadata({
          ...activeSceneMetadata,
          targetWordCount: nextSceneTarget,
        })
      }
      setShowGoalModal(false)
    }

    const GoalProgressRow = ({
      label,
      progress,
      target,
      detail,
    }: {
      label: string
      progress: number
      target: number
      detail: string
    }) => {
      const width = target > 0 ? Math.min(100, Math.max(0, (progress / target) * 100)) : 0
      return (
        <div className="goal-progress-row">
          <div className="goal-progress-header">
            <span>{label}</span>
            <span>{target > 0 ? `${progress.toLocaleString()} / ${target.toLocaleString()}` : 'No target'}</span>
          </div>
          <div className="goal-progress-track" aria-hidden="true">
            <span style={{ width: `${width}%` }} />
          </div>
          <div className="goal-progress-detail">{detail}</div>
        </div>
      )
    }

    return (
      <div className="modal-overlay">
        <div className="modal-box goal-modal">
          <p className="modal-title">Writing Goals</p>
          <div className="goal-progress-list">
            <GoalProgressRow
              label="Monthly"
              progress={monthlyProgress}
              target={goals.monthlyTargetWordCount}
              detail={`Tracked for ${monthKey}`}
            />
            <GoalProgressRow
              label="Daily"
              progress={dailyProgress}
              target={goals.dailyTargetWordCount}
              detail={`Tracked for ${todayKey}`}
            />
            <GoalProgressRow
              label="Session"
              progress={sessionWordDelta}
              target={goals.sessionTargetWordCount}
              detail={`Words since ${sessionStartedLabel}${sessionElapsedLabel ? ` · ${sessionElapsedLabel}` : ''}`}
            />
            <GoalProgressRow
              label="Current scene"
              progress={sceneProgress}
              target={activeSceneMetadata?.targetWordCount ?? 0}
              detail={activeSceneMetadata ? 'Current scene word count' : 'No scene selected'}
            />
          </div>
          <div className="goal-fields">
            <label className="modal-field">
              <span className="modal-label">Monthly target</span>
              <input
                className="modal-input"
                inputMode="numeric"
                value={monthlyTarget}
                onChange={e => setMonthlyTarget(cleanInput(e.target.value))}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span className="modal-label">Daily target</span>
              <input
                className="modal-input"
                inputMode="numeric"
                value={dailyTarget}
                onChange={e => setDailyTarget(cleanInput(e.target.value))}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span className="modal-label">Session target</span>
              <input
                className="modal-input"
                inputMode="numeric"
                value={sessionTarget}
                onChange={e => setSessionTarget(cleanInput(e.target.value))}
                placeholder="0"
              />
            </label>
            <label className="modal-field">
              <span className="modal-label">Current scene target</span>
              <input
                className="modal-input"
                inputMode="numeric"
                value={sceneTarget}
                onChange={e => setSceneTarget(cleanInput(e.target.value))}
                placeholder="0"
                disabled={!activeSceneMetadata}
              />
            </label>
          </div>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setShowGoalModal(false)}>Cancel</button>
            <button className="welcome-btn" onClick={saveGoals}>Save</button>
          </div>
        </div>
      </div>
    )
  }

  const handleWorkspaceChange = (nextWorkspace: Workspace) => {
    if (workspace === 'editor' && nextWorkspace !== 'editor' && saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      saveActive()
      computeManuscriptWordCount()
      computeChapterWordCount()
      refreshOutlineRows()
      if (saveLabelTimer.current) clearTimeout(saveLabelTimer.current)
      setSaveLabel('saved')
      saveLabelTimer.current = setTimeout(() => {
        setSaveLabel('')
        saveLabelTimer.current = null
      }, 1200)
    }
    if (nextWorkspace === 'revision' && revisionActiveId !== null) {
      const tabs = sceneTabsRef.current
      const updatedTabs = tabs.map((t, i) =>
        i === activeTabIndex ? { ...t, content: bodyHtmlRef.current } : t
      )
      const safeIndex = Math.min(activeTabIndex, Math.max(updatedTabs.length - 1, 0))
      setRevisionTabs(updatedTabs)
      setRevisionActiveTabIndex(safeIndex)
      setRevisionContent(updatedTabs[safeIndex]?.content ?? '')
    }
    setWorkspace(nextWorkspace)
    if (nextWorkspace !== 'editor') setFocusMode(false)
  }

  const openOutlineScene = async (id: number) => {
    setWorkspace('editor')
    await selectDoc(id)
  }


  const SharedModals = () => (
    <>
      {(openingProject || creatingProject) && (
        <div className="modal-overlay modal-overlay-blocking">
          <div className="modal-box opening-project-modal">
            <p className="opening-project-title">
              {creatingProject ? 'Creating project' : 'Opening project'}<span className="compile-loading-ellipsis" aria-hidden="true">...</span>
            </p>
          </div>
        </div>
      )}
      {showNewProject && !creatingProject && (
        <NewProjectModal
          name={newProjectName}
          parent={newProjectParent}
          onNameChange={setNewProjectName}
          onCancel={closeNewProjectModal}
          onBrowse={pickParentFolder}
          onCreate={createProject}
        />
      )}
      {showProjectSettings && project && (
        <ProjectSettingsModal
          settings={normalizeProjectSettings(project.settings)}
          styles={styles}
          dictionaryWords={projectDictionary}
          projectPath={project.path}
          activeTab={projectSettingsTab}
          onTabChange={setProjectSettingsTab}
          onPickCoverImage={async () => {
            const selected = await open({
              title: 'Choose Cover Image',
              filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
            })
            return !selected || Array.isArray(selected) ? null : selected
          }}
          onCancel={() => setShowProjectSettings(false)}
          onSave={saveProjectSettings}
        />
      )}
      {showStyles && (
        <StylesModal
          styles={styles}
          activeTab={stylesTab}
          onTabChange={setStylesTab}
          onCancel={() => setShowStyles(false)}
          overlayZIndex={showCompile ? 2100 : undefined}
          onApply={local => {
            setStyles(local)
            setProject(prev => prev ? { ...prev, styles: local } : prev)
            if (projectRef.current) {
              projectRef.current = { ...projectRef.current, styles: local }
              saveProjectToDisk({ ...projectRef.current, styles: local }, activeIdRef.current ?? undefined)
            }
            setShowStyles(false)
          }}
          onSaveAsDefault={async local => {
            await saveDefaultStyles(local)
            setStyles(local)
            setProject(prev => prev ? { ...prev, styles: local } : prev)
            if (projectRef.current) {
              projectRef.current = { ...projectRef.current, styles: local }
              saveProjectToDisk({ ...projectRef.current, styles: local }, activeIdRef.current ?? undefined)
            }
            setShowStyles(false)
          }}
        />
      )}
      <ConfirmDeleteModal
        target={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={permanentlyDelete}
      />
      <ConfirmBinDeleteModal
        target={confirmBinDelete}
        onCancel={() => setConfirmBinDelete(null)}
        onConfirm={id => { deleteNode(id); setConfirmBinDelete(null) }}
      />
      {confirmBulkBinDelete && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 380 }}>
            <p className="modal-title">Move to trash?</p>
            <p className="modal-danger-text">
              <strong style={{ color: '#d4d4d4' }}>{confirmBulkBinDelete.label}</strong> will be moved to the trash.
            </p>
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setConfirmBulkBinDelete(null)}>Cancel</button>
              <button
                className="welcome-btn"
                onClick={async () => {
                  await deleteNodes(confirmBulkBinDelete.ids)
                  setConfirmBulkBinDelete(null)
                }}
              >
                Move to trash
              </button>
            </div>
          </div>
        </div>
      )}
      {bulkRenameTarget && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 420 }}>
            <p className="modal-title">Bulk rename selected scenes</p>
            <p className="modal-danger-text">
              Enter the first name in the sequence. The name must end with a number.
            </p>
            <input
              className="modal-input"
              value={bulkRenameTarget.value}
              autoFocus
              onChange={e => setBulkRenameTarget(prev => prev ? { ...prev, value: e.target.value } : prev)}
              onKeyDown={e => {
                if (e.key === 'Enter' && parseBulkRenameStart(bulkRenameTarget.value)) applyBulkRename()
                if (e.key === 'Escape') setBulkRenameTarget(null)
              }}
            />
            {!parseBulkRenameStart(bulkRenameTarget.value) && (
              <p className="modal-danger-text">Example: Scene 5</p>
            )}
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setBulkRenameTarget(null)}>Cancel</button>
              <button
                className="welcome-btn"
                disabled={!parseBulkRenameStart(bulkRenameTarget.value)}
                onClick={applyBulkRename}
              >
                Rename {bulkRenameTarget.ids.length} items
              </button>
            </div>
          </div>
        </div>
      )}
      {loreLinkChoice && (
        <div className="lore-link-choice-layer" onMouseDown={() => setLoreLinkChoice(null)}>
          <div
            className="lore-link-choice-popover"
            style={{
              left: Math.min(loreLinkChoice.x + 12, window.innerWidth - 300),
              top: Math.min(loreLinkChoice.y + 12, window.innerHeight - 220),
            }}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="lore-link-choice-title">Open lore entry</div>
            <div className="lore-link-choice-list">
              {loreLinkChoice.targets.map(target => (
                <button
                  key={`${target.categoryId}:${target.entryId}`}
                  type="button"
                  className="lore-link-choice-item"
                  onClick={() => {
                    openLoreEntryById(target.categoryId, target.entryId)
                    setLoreLinkChoice(null)
                  }}
                >
                  <span>{target.entryName}</span>
                  <small>{target.categoryName}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <AppMessageModal
        message={appMessage}
        onClose={() => setAppMessage(null)}
      />
      <ProjectRecoveryModal
        target={projectRecovery}
        onRestoreLatest={restoreRecoveryBackup}
        onOpenBackupFolder={openRecoveryBackupFolder}
        onDismiss={() => setProjectRecovery(null)}
      />
      <AboutModal
        open={showAbout}
        version={SCRIVUS_VERSION}
        changelog={changelog}
        projectFormatCompatibility={projectFormatCompatibility}
        privacyNote={privacyNote}
        thirdPartyLicenses={thirdPartyLicenses}
        onClose={() => setShowAbout(false)}
        onOpenGithub={() => openUrl(SCRIVUS_GITHUB_URL)}
      />
      {showPreferences && (
        <PreferencesModal
          theme={appTheme}
          incrementNewNodeNumbers={incrementNewNodeNumbers}
          readingWpm={readingWpm}
          defaultSceneTargetWordCount={defaultSceneTargetWordCount}
          onCancel={() => setShowPreferences(false)}
          onSave={savePreferences}
        />
      )}
      {showGoalModal && <GoalModal />}
      <RestoreBackupModal
        open={restoreBackupOpen}
        backups={availableBackups}
        selectedBackupName={selectedBackupName}
        onSelectBackup={setSelectedBackupName}
        onCancel={() => setRestoreBackupOpen(false)}
        onRestore={restoreSelectedBackup}
      />
      <ConfirmEmptyTrashModal
        open={confirmEmptyTrash}
        trashItems={trashItems}
        onCancel={() => setConfirmEmptyTrash(false)}
        onConfirm={() => { emptyTrash(); setConfirmEmptyTrash(false) }}
      />
      {confirmDeleteTab !== null && (
        <ConfirmDeleteTabModal
          tabName={sceneTabs[confirmDeleteTab]?.name}
          onCancel={() => setConfirmDeleteTab(null)}
          onConfirm={() => deleteTab(confirmDeleteTab)}
        />
      )}
      <LoreTemplateEditorModal
        category={loreTemplateEditor}
        generateId={generateLoreId}
        onCancel={() => setLoreTemplateEditor(null)}
        onSave={saveLoreTemplate}
      />
      <LoreEntryEditorModal
        category={getActiveLoreCategory()}
        entry={loreEntryEditor}
        projectPath={projectRef.current?.path ?? null}
        onCancel={() => setLoreEntryEditor(null)}
        onSave={saveLoreEntry}
        onPickImage={async (entryId, fieldId, previousImagePath) => {
          if (!projectRef.current) return null
          const selected = await open({
            title: 'Select image',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
          })
          if (!selected || Array.isArray(selected)) return null
          const imagePath = await copyLoreImage(projectRef.current.path, selected as string, entryId, fieldId)
          if (previousImagePath && previousImagePath !== imagePath) {
            await deleteLoreImage(projectRef.current.path, previousImagePath)
          }
          return imagePath
        }}
      />
      <ConfirmDeleteLoreCategoryModal
        category={confirmDeleteLoreCategory}
        onCancel={() => setConfirmDeleteLoreCategory(null)}
        onConfirm={deleteLoreCategory}
      />
      <ConfirmDeleteLoreEntryModal
        entry={confirmDeleteLoreEntry}
        categoryId={getActiveLoreCategory()?.id ?? null}
        onCancel={() => setConfirmDeleteLoreEntry(null)}
        onConfirm={deleteLoreEntry}
      />
      {showCompile && (
        <CompileModal
          loading={compileLoading}
          chapters={compileChapters}
          format={compileFormat}
          frontMatter={compileFrontMatter}
          includeActHeadings={compileIncludeActHeadings}
          includeSceneTitles={compileIncludeSceneTitles}
          collapsed={projectRef.current?.compileCollapsed ?? {}}
          style={compileStyle}
          projectStyles={styles}
          onClose={() => setShowCompile(false)}
          onFormatChange={setCompileFormat}
          onStyleChange={setCompileStyle}
          onFrontMatterChange={setCompileFrontMatter}
          onIncludeActHeadingsChange={setCompileIncludeActHeadings}
          onIncludeSceneTitlesChange={setCompileIncludeSceneTitles}
          onSelectionChange={updateCompileSelection}
          onIncludeChange={updateCompileIncludes}
          onCollapsedChange={updateCompileCollapsed}
          onOpenStyles={() => {
            setStylesTab('chapter')
            setShowStyles(true)
          }}
          onExport={compileProject}
        />
      )}
    </>
  )

  // #region === RENDER: WELCOME SCREEN ===
  // ───────────────────────────────────────────────────────────────────────────
  // Render: welcome screen shown when no project is open
  // ───────────────────────────────────────────────────────────────────────────
  if (!startupLoaded) {
    return (
      <div id="app" className="app-startup" aria-label="Loading Scrivus">
        <i className="ti ti-feather welcome-icon" aria-hidden="true" />
      </div>
    )
  }

  if (!project) {
    return (
      <div id="app" className="app-welcome">
        <div id="menubar">
          <MenuBarMenus />
          <span className="project-title">Scrivus</span>
          <ThemeMenu />
        </div>
        <SharedModals />

        <i className="ti ti-feather welcome-icon" aria-hidden="true" />
        <p className="welcome-label">No project open</p>
        <div className={`welcome-action-stack${recentProjects.length ? ' welcome-actions-spaced' : ''}`}>
          <div className="welcome-actions">
            <button className="welcome-btn" onClick={startNewProject}>
              <i className="ti ti-folder-plus" aria-hidden="true" /> New project
            </button>
            <button className="welcome-btn" onClick={openProject}>
              <i className="ti ti-folder-open" aria-hidden="true" /> Open project
            </button>
          </div>
          <div className="welcome-actions welcome-actions-secondary">
            <button className="welcome-btn" onClick={startImportWordDoc}>
              <i className="ti ti-file-import" aria-hidden="true" /> Import from Word Doc
            </button>
          </div>
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
        <WelcomeUpdateNotice />
      </div>
    )
  }

  // #endregion

  // #region === RENDER: MAIN EDITOR WORKSPACE ===
  // ───────────────────────────────────────────────────────────────────────────
  // Render: main editor workspace
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div id="app" className={focusMode ? 'editor-focus-mode' : undefined} style={{ position: 'relative' }}>
      <div id="menubar">
        <MenuBarMenus />
        <span className="project-title">{project.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', paddingRight: 8 }}>{saveLabel}</span>
        <ThemeMenu />
      </div>

      <BinderSidebar
        binderOpen={binderOpen}
        workspace={workspace}
        projectOpen={!!project}
        showFnR={showFnR}
        showSearch={showSearch}
        tree={tree}
        activeId={activeId}
        bookmarkedSceneId={activeId}
        selectedIds={selectedBinderIds}
        panelLockActive={sidePanelsLocked}
        renamingId={renamingId}
        dragId={dragId}
        dropTarget={dropTarget}
        trashOpen={trashOpen}
        trashItems={trashItems}
        trashExpanded={trashExpanded}
        dragIdRef={dragIdRef}
        dropTargetRef={dropTargetRef}
        onBinderOpenChange={open => {
          if (open && sidePanelsLocked) return
          setBinderOpen(open)
        }}
        onExpandAllFolders={() => setAllBinderFoldersOpen(true)}
        onCollapseAllFolders={() => setAllBinderFoldersOpen(false)}
        onToggleFindReplace={() => {
          if (showFnR) {
            setShowFnR(false)
            setFnrFind('')
            setFnrReplace('')
            setFnrStatus('')
            setFnrUndoSnapshot([])
          } else {
            setShowFnR(true)
            cancelPendingSearch()
            setShowSearch(false)
            setSearchQuery('')
            setSearchResults([])
            setTimeout(() => fnrInputRef.current?.focus(), 50)
          }
        }}
        onToggleSearch={() => {
          if (showSearch) {
            cancelPendingSearch()
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
        onDragIdChange={setDragId}
        onDropTargetChange={setDropTarget}
        onSelectNode={updateBinderSelection}
        onClearSelection={(anchorId?: number) => {
          setSelectedBinderIds(new Set())
          setBinderSelectionAnchorId(anchorId ?? null)
        }}
        onRenamingIdChange={setRenamingId}
        onContextMenuChange={setContextMenu}
        onTrashOpenChange={setTrashOpen}
        onTrashExpandedChange={setTrashExpanded}
        onConfirmBinDeleteChange={setConfirmBinDelete}
        onConfirmDeleteChange={setConfirmDelete}
        onConfirmEmptyTrashChange={setConfirmEmptyTrash}
        onLoadTrash={loadTrash}
        onSelectDoc={selectDoc}
        onSelectRevisionDoc={selectRevisionDoc}
        onToggleFolder={toggleFolder}
        onRenameNode={renameNode}
        onAddDoc={addDoc}
        onAddFolder={addFolder}
        onDrop={handleDrop}
        onPreviewTrashScene={previewTrashScene}
        onRestoreFromTrash={restoreFromTrash}
      />
      <SearchPanel
        open={showSearch && workspace === 'editor' && !focusMode}
        query={searchQuery}
        results={searchResults}
        loading={searchLoading}
        inputRef={searchInputRef}
        onQueryChange={value => {
          setSearchQuery(value)
          runSearch(value)
        }}
        onClose={() => { cancelPendingSearch(); setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
        onOpenResult={openSearchResult}
      />

      <FindReplacePanel
        open={showFnR && workspace === 'editor' && !focusMode}
        find={fnrFind}
        replace={fnrReplace}
        scope={fnrScope}
        status={fnrStatus}
        undoAvailable={fnrUndoSnapshot.length > 0}
        inputRef={fnrInputRef}
        onFindChange={value => { setFnrFind(value); setFnrStatus('') }}
        onReplaceChange={value => { setFnrReplace(value); setFnrStatus('') }}
        onScopeChange={setFnrScope}
        onClose={() => { setShowFnR(false); setFnrFind(''); setFnrReplace(''); setFnrStatus(''); setFnrUndoSnapshot([]) }}
        onReplaceOne={fnrReplaceOne}
        onReplaceAll={fnrReplaceAll}
        onUndoReplaceAll={fnrUndoReplaceAll}
      />
      <WorkspaceShell
        workspace={workspace}
        onWorkspaceChange={handleWorkspaceChange}
        editorState={{
          showEditor,
          editor,
          focusMode,
          typewriterScrolling,
          isNarrow,
          isTrashPreview,
          titleValue,
          titleBookmarked: activeId !== null && !isTrashPreview,
          loreLinksEnabled,
          onFocusModeChange: setFocusMode,
          onTypewriterScrollingChange: setTypewriterScrolling,
          onLoreLinksEnabledChange: setLoreLinksEnabled,
        }}
        tabState={{
          sceneTabs,
          activeTabIndex,
          canSelectPreviousScene: previousSceneId !== null,
          canSelectNextScene: nextSceneId !== null,
          splitTabIndex: editorSplitTabIndex,
          activeSceneId: activeId,
          revisionComments,
          renamingTabIndex,
          tabDragIndex,
          tabDropIndex,
          tabDragIndexRef,
          onTabDragIndexChange: setTabDragIndex,
          onTabDropIndexChange: setTabDropIndex,
          onRenamingTabIndexChange: setRenamingTabIndex,
          onTabContextMenuChange: setTabContextMenu,
          onSelectPreviousScene: selectPreviousScene,
          onSelectNextScene: selectNextScene,
          onSwitchTab: switchTab,
          onSelectSplitTab: selectEditorSplitTab,
          onCloseSplitTab: closeEditorSplitTab,
          onAddTab: addTab,
          onRenameTab: renameTab,
          onTabDrop: handleTabDrop,
        }}
        statusState={{
          wordCount,
          targetWordCount: activeSceneMetadata?.targetWordCount,
          onGoalClick: () => setShowGoalModal(true),
          chapterWordCount,
          manuscriptWordCount,
          readingWpm,
          sprint,
          sprintWords,
          onSprintStart: startSprint,
          onSprintStop: stopSprint,
          zoom,
          zoomOpen,
          zoomPresets: ZOOM_PRESETS,
          onZoomOpenChange: setZoomOpen,
          onZoomChange: setZoom,
        }}
        outlineState={{
          rows: outlineRows,
          manuscriptWordCount,
          readingWpm,
          collapsedFolderIds: outlineCollapsedFolderIds,
          onCollapsedFolderIdsChange: setOutlineCollapsedFolderIds,
          onOpenScene: openOutlineScene,
          onSceneStatusChange: updateOutlineSceneStatus,
        }}
        mindMapState={{
          map: mindMap,
          scenes: mindMapSceneOptions,
          onChange: updateMindMap,
          onOpenScene: openOutlineScene,
          onCreateSceneFromNode: createSceneFromMindMapNode,
        }}
        atlasState={{
          atlas,
          projectPath: projectRef.current?.path ?? null,
          onChange: updateAtlas,
          onChooseImage: chooseAtlasImage,
          onImportMap: importAtlasMap,
          onDeleteMap: deleteAtlasMap,
          onReplaceMapImage: replaceAtlasMapImage,
          loreBook,
          onOpenLoreEntry: openLoreEntryById,
          onCreateLoreEntry: createLoreEntryFromAtlasMarker,
        }}
        loreState={{
          loreBook,
          loreView,
          activeLoreCategoryId,
          expandedEntryId,
          projectPath: projectRef.current?.path ?? null,
          backlinks: loreBacklinks,
          onLoreViewChange: setLoreView,
          onActiveLoreCategoryChange: setActiveLoreCategoryId,
          onExpandedEntryChange: setExpandedEntryId,
          onNewCategory: openNewCategoryEditor,
          onEditCategory: openEditCategoryEditor,
          onDeleteCategoryRequest: setConfirmDeleteLoreCategory,
          onNewEntry: openNewEntryEditor,
          onEditEntry: openEditEntryEditor,
          onDeleteEntryRequest: setConfirmDeleteLoreEntry,
          onToggleEntryPinned: toggleLoreEntryPinned,
          onOpenScene: openOutlineScene,
          onOpenPresence: () => setShowLorePresence(true),
        }}
        revisionState={{
          revisionActiveId,
          revisionComments,
          revisionActiveCommentId,
          revisionContent,
          revisionTitle,
          revisionTabs,
          revisionActiveTabIndex,
          revisionPendingComment,
          draftText,
          revisionScrollRef,
          confirmDeleteRevisionComment,
          onRevisionActiveCommentChange: setRevisionActiveCommentId,
          onSwitchRevisionTab: switchRevisionTab,
          onDraftTextChange: setDraftText,
          onDismissPendingComment: () => setRevisionPendingComment(null),
          onCancelPendingComment: stripped => {
            setRevisionContent(stripped)
            setRevisionPendingComment(null)
          },
          onAddRevisionComment: addRevisionComment,
          onResolveRevisionComment: resolveRevisionComment,
          onUnresolveRevisionComment: unresolveRevisionComment,
          onDeleteRevisionCommentRequest: setConfirmDeleteRevisionComment,
          onClearDeleteRevisionComment: () => setConfirmDeleteRevisionComment(null),
          onConfirmDeleteRevisionComment: async () => {
            if (!confirmDeleteRevisionComment) return
            await deleteRevisionComment(confirmDeleteRevisionComment)
            setConfirmDeleteRevisionComment(null)
          },
        }}
      />
      {workspace === 'revision' && revisionActiveId !== null && (
        <RevisionCommentsPane
          activeId={revisionActiveId}
          comments={revisionComments}
          activeCommentId={revisionActiveCommentId}
          activeTabIndex={revisionActiveTabIndex}
          tabs={revisionTabs}
          pendingComment={revisionPendingComment}
          content={revisionContent}
          draftText={draftText}
          onActiveCommentChange={setRevisionActiveCommentId}
          onDraftTextChange={setDraftText}
          onDismissPendingComment={() => setRevisionPendingComment(null)}
          onCancelPendingComment={stripped => {
            setRevisionContent(stripped)
            setRevisionPendingComment(null)
          }}
          onAddComment={addRevisionComment}
          onResolveComment={resolveRevisionComment}
          onUnresolveComment={unresolveRevisionComment}
          onDeleteCommentRequest={setConfirmDeleteRevisionComment}
        />
      )}
      <InspectorPanel
        open={inspectorOpen}
        panelLockActive={sidePanelsLocked}
        workspace={workspace}
        project={project}
        activeSceneId={activeNode?.type === 'doc' && !isTrashPreview ? activeNode.id : null}
        activeSceneMetadata={activeSceneMetadata}
        quickNote={quickNote}
        checklist={checklist}
        renamingChecklistId={renamingChecklistId}
        checklistDragId={checklistDragId}
        checklistDropIndex={checklistDropIndex}
        checklistDragIdRef={checklistDragIdRef}
        onOpenChange={open => {
          if (open && sidePanelsLocked) return
          setInspectorOpen(open)
        }}
        onSceneMetadataChange={updateActiveSceneMetadata}
        onQuickNoteChange={val => {
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
        onToggleChecklistItem={toggleChecklistItem}
        onRenameChecklistItem={renameChecklistItem}
        onDeleteChecklistItem={deleteChecklistItem}
        onChecklistDrop={handleChecklistDrop}
        onRenamingChecklistIdChange={setRenamingChecklistId}
        onChecklistDragIdChange={setChecklistDragId}
        onChecklistDropIndexChange={setChecklistDropIndex}
        onAddChecklistItem={addChecklistItem}
      />
      <TabContextMenu
        menu={tabContextMenu}
        canDelete={sceneTabs.length > 1}
        canCompare={sceneTabs.length > 1}
        canOpenSplit={Boolean(tabContextMenu && sceneTabs.length > 1 && tabContextMenu.index !== activeTabIndex)}
        splitOpen={editorSplitTabIndex !== null}
        onRename={handleTabContextRename}
        onDuplicate={handleTabContextDuplicate}
        onCompare={handleTabContextCompare}
        onDelete={handleTabContextDelete}
        onOpenSplit={openEditorSplitTab}
        onCloseSplit={closeEditorSplitTab}
      />

      {draftDiff && activeId !== null && sceneTabs.length > 1 && (
        <DraftDiffModal
          tabs={sceneTabs.map((tab, index) =>
            index === activeTabIndex ? { ...tab, content: bodyHtmlRef.current } : tab)}
          sceneTitle={(findNode(tree, activeId) as DocNode | null)?.title ?? 'Scene'}
          leftIndex={draftDiff.left}
          rightIndex={draftDiff.right}
          onLeftIndexChange={index => setDraftDiff(current => current ? { ...current, left: index } : current)}
          onRightIndexChange={index => setDraftDiff(current => current ? { ...current, right: index } : current)}
          onClose={() => setDraftDiff(null)}
        />
      )}

      {showLorePresence && (
        <LorePresenceModal
          loreBook={loreBook}
          backlinks={loreBacklinks}
          outlineRows={outlineRows}
          onOpenScene={openOutlineScene}
          onClose={() => setShowLorePresence(false)}
        />
      )}
      
      <BinderContextMenu
        menu={contextMenu}
        workspace={workspace}
        selectedCount={contextMenu ? getSelectedBinderActionIds(contextMenu.node.id).length : 0}
        onRename={handleBinderContextRename}
        onDuplicate={handleBinderContextDuplicate}
        onBulkRename={handleBinderContextBulkRename}
        onAddScene={handleBinderContextAddScene}
        onAddFolder={handleBinderContextAddFolder}
        onSetFolderRole={setFolderRole}
        onMoveToTrash={handleBinderContextMoveToTrash}
      />
      <SpellcheckContextMenu
        menu={spellcheckMenu}
        onReplace={replaceMisspelledWord}
        onAddToDictionary={addWordToProjectDictionary}
      />
      <EditorContextMenu
        menu={editorContextMenu}
        loreBook={loreBook}
        onBold={() => runEditorContextCommand(() => editor?.chain().focus().toggleBold().run())}
        onItalic={() => runEditorContextCommand(() => editor?.chain().focus().toggleItalic().run())}
        onUnderline={() => runEditorContextCommand(() => editor?.chain().focus().toggleMark('underline').run())}
        onBulletList={() => runEditorContextCommand(() => editor?.chain().focus().toggleBulletList().run())}
        onOrderedList={() => runEditorContextCommand(() => editor?.chain().focus().toggleOrderedList().run())}
        onBlockQuote={() => runEditorContextCommand(() => editor?.chain().focus().toggleBlockquote().run())}
        onLinkLoreKeyword={addLoreKeywordFromSelection}
        onCreateLoreEntry={createLoreEntryFromSelection}
        onCut={cutSelectedEditorText}
        onCopy={copySelectedEditorText}
        onPastePlainText={pastePlainTextIntoEditor}
        onSelectAll={() => runEditorContextCommand(() => editor?.chain().focus().selectAll().run())}
      />
      <SharedModals />

      
    </div>
  )

  // #endregion
}

// #endregion
