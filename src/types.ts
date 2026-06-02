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
  compileSelections: Record<string, string>
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

export type LoreEntry = {
  id: string
  name: string
  keywords?: string[]
  fields: Record<string, string>
}

export type LoreCategory = {
  id: string
  name: string
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

export type MindMapNodeColor = 'default' | 'blue' | 'green' | 'rose' | 'gold' | 'violet'

export type MindMapNode = {
  id: string
  x: number
  y: number
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
}

export type MindMapSceneOption = {
  id: number
  title: string
  chapter: string
}

export type AtlasMarkerKind = 'town' | 'landmark' | 'region' | 'route' | 'note'

export type AtlasMarkerVisibility = 'always' | 'medium' | 'close'

export type AtlasImageSampling = 'linear' | 'point'

export type AtlasMarker = {
  id: string
  x: number
  y: number
  label: string
  kind: AtlasMarkerKind
  visibility: AtlasMarkerVisibility
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
