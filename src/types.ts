export type DocNode = {
  id: number
  type: 'doc'
  label: string
  title: string
  file: string
  metadata?: SceneMetadata
}

export type FolderNode = {
  id: number
  type: 'folder'
  label: string
  open: boolean
  role?: 'act' | 'chapter'
  children: TreeNode[]
}

export type TreeNode = DocNode | FolderNode

export type DropTarget =
  | { type: 'before'; id: number }
  | { type: 'after'; id: number }
  | { type: 'inside'; id: number }
  | null

export type Project = {
  name: string
  path: string
  tree: TreeNode[]
  styles: ProjectStyles
  settings: ProjectSettings
  lastActiveTabIndex?: number
  compileSelections: Record<string, string>
  compileIncludes: Record<string, boolean>
  compileCollapsed: Record<string, boolean>
  writingStats: WritingStats
}

export type WritingStats = {
  dailyWordDeltas: Record<string, number>
}

export type ChapterStyle = {
  font: string
  size: number
  bold: boolean
  italic: boolean
}

export type BodyStyle = {
  font: string
  size: number
  justification: 'left' | 'center' | 'right' | 'both'
  firstLineIndent: boolean
  lineSpacing: number
}

export type EditorStyle = {
  font: string
  size: number
  lineHeight: number
  contentWidth: number
}

export type ProjectStyles = {
  chapter: ChapterStyle
  body: BodyStyle
  editor: EditorStyle
}

export type ChecklistItem = {
  id: number
  label: string
  checked: boolean
  order: number
}

export type SceneTab = {
  name: string
  content: string
}

export type CompileFormat = 'docx' | 'epub'

export type SprintTimerState = {
  endsAt: number
  durationMinutes: number
  baselineWords: number
  finished: boolean
  finalWords: number
}

export type SceneStatus =
  | 'draft'
  | 'revised'
  | 'needsWork'
  | 'complete'

export type SceneMetadata = {
  status: SceneStatus
  pov: string
  location: string
  timeline: string
  targetWordCount: number
  tags: string[]
  synopsis: string
}

export type LoreFieldType = 'field' | 'textarea' | 'image' | 'divider'

export type LoreTemplateElement = {
  id: string
  type: LoreFieldType
  label?: string
  removed: boolean
}

export type LoreSubcategory = {
  id: string
  name: string
  color?: LoreSubcategoryColor
}

export type LoreSubcategoryColor = 'default' | 'blue' | 'green' | 'rose' | 'gold' | 'violet' | 'cyan' | 'orange' | 'red' | 'slate'

export type LoreEntry = {
  id: string
  name: string
  pinned?: boolean
  subcategoryId?: string
  keywords?: string[]
  fields: Record<string, LoreFieldValue>
}

export type LoreFieldValue = string | LoreImageValue

export type LoreImageValue = {
  path: string
  crop?: LoreImageCrop
  fullWidth?: boolean
  ignoreEntryCrop?: boolean
}

export type LoreImageCrop = {
  zoom: number
  x: number
  y: number
}

export type LoreCategory = {
  id: string
  name: string
  subcategories?: LoreSubcategory[]
  template: LoreTemplateElement[]
  entries: LoreEntry[]
}

export type LoreBook = {
  categories: LoreCategory[]
}

export type ProjectSettings = {
  author: string
  title: string
  subtitle: string
  // Project-relative path to the book cover image (used by the EPUB export).
  coverImage: string
  backups: BackupSettings
}

export type BackupSettings = {
  enabled: boolean
  intervalMinutes: number
  retentionCount: number
}

export type ThemeId =
  | 'dark'
  | 'light'
  | 'contrastLight'
  | 'contrastDark'
  | 'lavenderLight'
  | 'lavenderDark'
  | 'mintLight'
  | 'mintDark'
  | 'roseLight'
  | 'roseDark'
  | 'skyLight'
  | 'skyDark'
  | 'softPaperLight'
  | 'softSageLight'
  | 'softPeachLight'
  | 'softLilacLight'
  | 'neonCyber'
  | 'neonViolet'
  | 'neonEmber'
  | 'neonLagoon'

export type CompileSceneEntry = {
  docId: number
  fileId: string
  label: string
  tabs: string[]
  selectedTab: string
  included: boolean
}

export type CompileChapterEntry = {
  folderId: number
  label: string
  role?: 'act' | 'chapter'
  depth?: number
  included: boolean
  scenes: CompileSceneEntry[]
}

export type RevisionComment = {
  id: string
  sceneId: number
  tabIndex?: number
  quote: string
  text: string
  createdAt: number
  resolved: boolean
  startOffset: number
  endOffset: number
}

export type OutlineRow = {
  id: number
  type: 'chapter' | 'scene'
  role?: 'act' | 'chapter'
  chapter: string
  title: string
  wordCount: number
  depth: number
  status: SceneStatus | 'inProgress'
  metadata?: SceneMetadata
}

export type MindMapNodeKind = 'idea' | 'scene' | 'character' | 'location' | 'note'

export type MindMapNodeColor = 'default' | 'blue' | 'green' | 'rose' | 'gold' | 'violet' | 'cyan' | 'orange' | 'red' | 'slate'

export type MindMapNode = {
  id: string
  x: number
  y: number
  title?: string
  text: string
  kind: MindMapNodeKind
  color: MindMapNodeColor
  linkedSceneId?: number
}

export type MindMapEdge = {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string
  routePoints?: MindMapRoutePoint[]
}

export type MindMapRoutePoint = {
  id: string
  x: number
  y: number
}

export type MindMapViewport = {
  x: number
  y: number
  zoom: number
}

export type MindMap = {
  nodes: MindMapNode[]
  edges: MindMapEdge[]
  viewport: MindMapViewport
  colorLabels?: Partial<Record<MindMapNodeColor, string>>
}

export type MindMapSceneOption = {
  id: number
  title: string
  chapter: string
}

export type AtlasMarkerKind = 'town' | 'city' | 'capital' | 'village' | 'camp' | 'landmark' | 'ruin' | 'dungeon' | 'region' | 'route' | 'border' | 'water' | 'danger' | 'note'

export type AtlasMarkerVisibility = 'always' | 'medium' | 'close'

export type AtlasImageSampling = 'linear' | 'point'

export type AtlasMarker = {
  id: string
  x: number
  y: number
  label: string
  kind: AtlasMarkerKind
  visibility: AtlasMarkerVisibility
  linkedLoreCategoryId?: string
  linkedLoreEntryId?: string
}

export type AtlasViewport = {
  x: number
  y: number
  zoom: number
}

export type AtlasMap = {
  id: string
  name: string
  imagePath: string
  imageWidth: number
  imageHeight: number
  imageSampling: AtlasImageSampling
  viewport: AtlasViewport
  markers: AtlasMarker[]
  hiddenMarkerKinds?: AtlasMarkerKind[]
}

export type Atlas = {
  activeMapId: string | null
  maps: AtlasMap[]
}

export type AtlasImportCandidate = {
  sourcePath: string
  name: string
  width: number
  height: number
  megapixels: number
  overWarningThreshold: boolean
}
