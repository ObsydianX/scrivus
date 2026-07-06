import type {
  Atlas,
  AtlasImageSampling,
  AtlasMarkerKind,
  AtlasMarkerVisibility,
  BackupSettings,
  Manuscript,
  MindMap,
  MindMapNodeColor,
  MindMapNodeKind,
  ProjectSettings,
  ProjectStyles,
  SceneMetadata,
  WritingStats,
} from './types'

export const SCRIVUS_VERSION = '0.3.0'
export const PROJECT_FORMAT_VERSION = 2
export const DEFAULT_MANUSCRIPT_ID = 'main'

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  intervalMinutes: 15,
  retentionCount: 20,
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  author: '',
  title: '',
  subtitle: '',
  coverImage: '',
  backups: DEFAULT_BACKUP_SETTINGS,
}

export function normalizeBackupSettings(settings?: Partial<BackupSettings> | null): BackupSettings {
  const intervalMinutes = Number(settings?.intervalMinutes)
  const retentionCount = Number(settings?.retentionCount)
  return {
    enabled: settings?.enabled !== false,
    intervalMinutes: Number.isFinite(intervalMinutes)
      ? Math.min(120, Math.max(1, Math.round(intervalMinutes)))
      : DEFAULT_BACKUP_SETTINGS.intervalMinutes,
    retentionCount: Number.isFinite(retentionCount)
      ? Math.min(100, Math.max(1, Math.round(retentionCount)))
      : DEFAULT_BACKUP_SETTINGS.retentionCount,
  }
}

export function normalizeProjectSettings(settings?: Partial<ProjectSettings> | null): ProjectSettings {
  return {
    ...DEFAULT_PROJECT_SETTINGS,
    ...(settings ?? {}),
    coverImage: typeof settings?.coverImage === 'string' ? settings.coverImage : '',
    backups: normalizeBackupSettings(settings?.backups),
  }
}

function cleanRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, T>
    : {}
}

export function createDefaultManuscript(
  projectName: string,
  folderId = 1,
  settings?: Partial<ProjectSettings> | null,
  name = 'Manuscript',
  compileSelections?: unknown,
  compileIncludes?: unknown,
  compileCollapsed?: unknown,
): Manuscript {
  const normalizedSettings = normalizeProjectSettings(settings)
  return {
    id: DEFAULT_MANUSCRIPT_ID,
    folderId,
    name,
    title: normalizedSettings.title || projectName || 'Untitled Manuscript',
    subtitle: normalizedSettings.subtitle,
    author: normalizedSettings.author,
    coverImage: normalizedSettings.coverImage,
    lastActiveId: null,
    lastActiveTabIndex: 0,
    compileSelections: cleanRecord<string>(compileSelections),
    compileIncludes: cleanRecord<boolean>(compileIncludes),
    compileCollapsed: cleanRecord<boolean>(compileCollapsed),
  }
}

export function normalizeManuscripts(
  manuscripts: unknown,
  projectName: string,
  settings?: Partial<ProjectSettings> | null,
  compileSelections?: unknown,
  compileIncludes?: unknown,
  compileCollapsed?: unknown,
): Manuscript[] {
  const seen = new Set<string>()
  const normalized = Array.isArray(manuscripts)
    ? manuscripts
      .filter(item => item && typeof item === 'object')
      .map((item, index) => {
        const raw = item as Partial<Manuscript>
        const idBase = typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : index === 0 ? DEFAULT_MANUSCRIPT_ID : `manuscript-${index + 1}`
        let id = idBase
        let suffix = 2
        while (seen.has(id)) {
          id = `${idBase}-${suffix}`
          suffix += 1
        }
        seen.add(id)
        return {
          id,
          folderId: Number.isFinite(Number(raw.folderId)) ? Number(raw.folderId) : 1,
          name: typeof raw.name === 'string' && raw.name.trim()
            ? raw.name
            : id === DEFAULT_MANUSCRIPT_ID || index === 0
              ? 'Manuscript'
              : typeof raw.title === 'string' && raw.title.trim()
              ? raw.title
              : `Manuscript ${index + 1}`,
          title: typeof raw.title === 'string' && raw.title.trim()
            ? raw.title
            : projectName || 'Untitled Manuscript',
          subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
          author: typeof raw.author === 'string' ? raw.author : '',
          coverImage: typeof raw.coverImage === 'string' ? raw.coverImage : '',
          lastActiveId: typeof raw.lastActiveId === 'number' ? raw.lastActiveId : null,
          lastActiveTabIndex: Number.isInteger(raw.lastActiveTabIndex) ? raw.lastActiveTabIndex : 0,
          compileSelections: cleanRecord<string>(raw.compileSelections),
          compileIncludes: cleanRecord<boolean>(raw.compileIncludes),
          compileCollapsed: cleanRecord<boolean>(raw.compileCollapsed),
        }
      })
    : []

  return normalized.length > 0
    ? normalized
    : [createDefaultManuscript(projectName, 1, settings, 'Manuscript', compileSelections, compileIncludes, compileCollapsed)]
}

export const DEFAULT_SCENE_METADATA: SceneMetadata = {
  status: 'draft',
  pov: '',
  location: '',
  timeline: '',
  targetWordCount: 0,
  tags: [],
  synopsis: '',
}

export function normalizeSceneMetadata(metadata?: Partial<SceneMetadata> | null): SceneMetadata {
  const status = metadata?.status
  const targetWordCount = Number(metadata?.targetWordCount)
  return {
    ...DEFAULT_SCENE_METADATA,
    ...(metadata ?? {}),
    targetWordCount: Number.isFinite(targetWordCount)
      ? Math.min(999999, Math.max(0, Math.round(targetWordCount)))
      : DEFAULT_SCENE_METADATA.targetWordCount,
    status:
      status === 'draft' || status === 'revised' || status === 'needsWork' || status === 'complete'
        ? status
        : DEFAULT_SCENE_METADATA.status,
    tags: Array.isArray(metadata?.tags)
      ? metadata.tags.map(tag => tag.trim()).filter(Boolean)
      : DEFAULT_SCENE_METADATA.tags,
  }
}

export const DEFAULT_WRITING_STATS: WritingStats = {
  dailyWordDeltas: {},
}

export function normalizeWritingStats(data?: Partial<WritingStats> | null): WritingStats {
  const dailyWordDeltas: Record<string, number> = {}
  if (data?.dailyWordDeltas && typeof data.dailyWordDeltas === 'object' && !Array.isArray(data.dailyWordDeltas)) {
    Object.entries(data.dailyWordDeltas).forEach(([key, value]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return
      const numeric = Number(value)
      if (Number.isFinite(numeric) && numeric !== 0) dailyWordDeltas[key] = Math.round(numeric)
    })
  }
  return { dailyWordDeltas }
}

export const DEFAULT_MIND_MAP: MindMap = {
  nodes: [],
  edges: [],
  colorLabels: {},
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
}

export function normalizeMindMap(data?: Partial<MindMap> | null): MindMap {
  const validColors: MindMapNodeColor[] = ['default', 'blue', 'green', 'rose', 'gold', 'violet', 'cyan', 'orange', 'red', 'slate']
  const nodes = Array.isArray(data?.nodes)
    ? data.nodes
      .filter(node => node && typeof node.id === 'string')
      .map(node => {
        const kind: MindMapNodeKind = node.kind === 'scene' || node.kind === 'character' || node.kind === 'location' || node.kind === 'note'
          ? node.kind
          : 'idea'
        const color: MindMapNodeColor = validColors.includes(node.color as MindMapNodeColor)
          ? node.color as MindMapNodeColor
          : 'default'
        return {
          id: String(node.id),
          x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
          y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
          title: typeof node.title === 'string' ? node.title : undefined,
          text: typeof node.text === 'string' ? node.text : '',
          kind,
          color,
          linkedSceneId: typeof node.linkedSceneId === 'number' ? node.linkedSceneId : undefined,
        }
      })
    : DEFAULT_MIND_MAP.nodes
  const nodeIds = new Set(nodes.map(node => node.id))
  const edges = Array.isArray(data?.edges)
    ? data.edges
      .filter(edge =>
        edge &&
        typeof edge.id === 'string' &&
        typeof edge.fromNodeId === 'string' &&
        typeof edge.toNodeId === 'string' &&
        nodeIds.has(edge.fromNodeId) &&
        nodeIds.has(edge.toNodeId) &&
        edge.fromNodeId !== edge.toNodeId
      )
      .map(edge => ({
        id: String(edge.id),
        fromNodeId: String(edge.fromNodeId),
        toNodeId: String(edge.toNodeId),
        label: typeof edge.label === 'string' ? edge.label : undefined,
        routePoints: Array.isArray(edge.routePoints)
          ? edge.routePoints
            .filter(point => point && typeof point.id === 'string')
            .map(point => ({
              id: String(point.id),
              x: Number.isFinite(Number(point.x)) ? Number(point.x) : 0,
              y: Number.isFinite(Number(point.y)) ? Number(point.y) : 0,
            }))
          : undefined,
      }))
    : DEFAULT_MIND_MAP.edges
  const colorLabels: Partial<Record<MindMapNodeColor, string>> = {}
  if (data?.colorLabels && typeof data.colorLabels === 'object') {
    validColors.forEach(color => {
      const label = data.colorLabels?.[color]
      if (typeof label === 'string') colorLabels[color] = label
    })
  }
  const zoom = Number(data?.viewport?.zoom)

  return {
    nodes,
    edges,
    colorLabels,
    viewport: {
      x: Number.isFinite(Number(data?.viewport?.x)) ? Number(data?.viewport?.x) : DEFAULT_MIND_MAP.viewport.x,
      y: Number.isFinite(Number(data?.viewport?.y)) ? Number(data?.viewport?.y) : DEFAULT_MIND_MAP.viewport.y,
      zoom: Number.isFinite(zoom) ? Math.min(2, Math.max(0.35, zoom)) : DEFAULT_MIND_MAP.viewport.zoom,
    },
  }
}

export const ATLAS_MAX_SIDE = 8192
export const ATLAS_WARNING_MEGAPIXELS = 50

export const DEFAULT_ATLAS: Atlas = {
  activeMapId: null,
  maps: [],
}

export function normalizeAtlas(data?: Partial<Atlas> | null): Atlas {
  const validMarkerKinds: AtlasMarkerKind[] = ['town', 'city', 'capital', 'village', 'camp', 'landmark', 'ruin', 'dungeon', 'region', 'route', 'border', 'water', 'danger', 'note']
  const maps = Array.isArray(data?.maps)
    ? data.maps
      .filter(map => map && typeof map.id === 'string' && typeof map.imagePath === 'string')
      .map(map => {
        const markers = Array.isArray(map.markers)
          ? map.markers
            .filter(marker => marker && typeof marker.id === 'string')
            .map(marker => {
              const kind: AtlasMarkerKind =
                validMarkerKinds.includes(marker.kind as AtlasMarkerKind)
                  ? marker.kind as AtlasMarkerKind
                  : 'town'
              const visibility: AtlasMarkerVisibility =
                marker.visibility === 'medium' || marker.visibility === 'close'
                  ? marker.visibility
                  : 'always'
              return {
                id: String(marker.id),
                x: Number.isFinite(Number(marker.x)) ? Number(marker.x) : 0,
                y: Number.isFinite(Number(marker.y)) ? Number(marker.y) : 0,
                label: typeof marker.label === 'string' ? marker.label : '',
                kind,
                visibility,
                linkedLoreCategoryId: typeof marker.linkedLoreCategoryId === 'string' ? marker.linkedLoreCategoryId : undefined,
                linkedLoreEntryId: typeof marker.linkedLoreEntryId === 'string' ? marker.linkedLoreEntryId : undefined,
              }
            })
          : []
        const zoom = Number(map.viewport?.zoom)
        const hiddenMarkerKinds = Array.isArray(map.hiddenMarkerKinds)
          ? Array.from(new Set(map.hiddenMarkerKinds.filter(kind => validMarkerKinds.includes(kind as AtlasMarkerKind)))) as AtlasMarkerKind[]
          : []
        return {
          id: String(map.id),
          name: typeof map.name === 'string' && map.name.trim() ? map.name : 'Untitled Map',
          imagePath: String(map.imagePath),
          imageWidth: Number.isFinite(Number(map.imageWidth)) ? Number(map.imageWidth) : 1,
          imageHeight: Number.isFinite(Number(map.imageHeight)) ? Number(map.imageHeight) : 1,
          imageSampling: (map.imageSampling === 'point' ? 'point' : 'linear') as AtlasImageSampling,
          viewport: {
            x: Number.isFinite(Number(map.viewport?.x)) ? Number(map.viewport?.x) : 0,
            y: Number.isFinite(Number(map.viewport?.y)) ? Number(map.viewport?.y) : 0,
            zoom: Number.isFinite(zoom) ? Math.min(4, Math.max(0.1, zoom)) : 1,
          },
          markers,
          hiddenMarkerKinds,
        }
      })
    : []
  const activeMapId = typeof data?.activeMapId === 'string' && maps.some(map => map.id === data.activeMapId)
    ? data.activeMapId
    : maps[0]?.id ?? null

  return { activeMapId, maps }
}

export const COMPILE_STYLE_PRESETS = [
  'Standard Manuscript',
  'Proof Copy',
  'Manuscript (Shunn)',
] as const

export const LOREM_PREVIEW = `Lorem ipsum odor amet, consectetuer adipiscing elit. Rutrum quisque himenaeos volutpat dui faucibus ridiculus. Mus semper auctor nibh; mollis taciti natoque congue. Dis aliquam hendrerit ullamcorper accumsan fringilla. Pharetra dapibus consequat fringilla senectus porta. Tortor nisi quisque class fermentum amet tortor faucibus. Nascetur mi aptent facilisi; augue duis praesent condimentum lacinia. Vitae conubia blandit scelerisque nisi consequat proin feugiat netus eros.

    Morbi fames eros facilisi scelerisque eleifend felis. Proin senectus pulvinar feugiat; rhoncus facilisi porta. Amet augue consequat porttitor per sodales. Taciti nascetur tempor porttitor egestas senectus vel.`

export const DEFAULT_STYLES: ProjectStyles = {
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
    lineSpacing: 1.5,
  },
  editor: {
    font: 'Georgia',
    size: 12,
    lineHeight: 1.85,
    contentWidth: 760,
  },
}

export function normalizeProjectStyles(styles?: Partial<ProjectStyles> | null): ProjectStyles {
  const body = {
    ...DEFAULT_STYLES.body,
    ...(styles?.body ?? {}),
  }
  if (body.lineSpacing <= 0) body.lineSpacing = DEFAULT_STYLES.body.lineSpacing

  return {
    chapter: {
      ...DEFAULT_STYLES.chapter,
      ...(styles?.chapter ?? {}),
    },
    body,
    editor: {
      ...DEFAULT_STYLES.editor,
      ...(styles?.editor ?? {}),
    },
  }
}
