import type {
  Atlas,
  AtlasImageSampling,
  AtlasMarkerKind,
  AtlasMarkerVisibility,
  BackupSettings,
  MindMap,
  MindMapNodeColor,
  MindMapNodeKind,
  ProjectSettings,
  ProjectStyles,
  SceneMetadata,
} from './types'

export const SCRIVUS_VERSION = '0.2.4'
export const PROJECT_FORMAT_VERSION = 1

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  intervalMinutes: 15,
  retentionCount: 20,
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  author: '',
  title: '',
  subtitle: '',
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
    backups: normalizeBackupSettings(settings?.backups),
  }
}

export const DEFAULT_SCENE_METADATA: SceneMetadata = {
  status: 'draft',
  pov: '',
  location: '',
  timeline: '',
  tags: [],
  synopsis: '',
}

export function normalizeSceneMetadata(metadata?: Partial<SceneMetadata> | null): SceneMetadata {
  const status = metadata?.status
  return {
    ...DEFAULT_SCENE_METADATA,
    ...(metadata ?? {}),
    status:
      status === 'draft' || status === 'revised' || status === 'needsWork' || status === 'complete'
        ? status
        : DEFAULT_SCENE_METADATA.status,
    tags: Array.isArray(metadata?.tags)
      ? metadata.tags.map(tag => tag.trim()).filter(Boolean)
      : DEFAULT_SCENE_METADATA.tags,
  }
}

export const DEFAULT_MIND_MAP: MindMap = {
  nodes: [],
  edges: [],
  viewport: {
    x: 0,
    y: 0,
    zoom: 1,
  },
}

export function normalizeMindMap(data?: Partial<MindMap> | null): MindMap {
  const nodes = Array.isArray(data?.nodes)
    ? data.nodes
      .filter(node => node && typeof node.id === 'string')
      .map(node => {
        const kind: MindMapNodeKind = node.kind === 'scene' || node.kind === 'character' || node.kind === 'location' || node.kind === 'note'
          ? node.kind
          : 'idea'
        const color: MindMapNodeColor = node.color === 'blue' || node.color === 'green' || node.color === 'rose' || node.color === 'gold' || node.color === 'violet'
          ? node.color
          : 'default'
        return {
          id: String(node.id),
          x: Number.isFinite(Number(node.x)) ? Number(node.x) : 0,
          y: Number.isFinite(Number(node.y)) ? Number(node.y) : 0,
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
      }))
    : DEFAULT_MIND_MAP.edges
  const zoom = Number(data?.viewport?.zoom)

  return {
    nodes,
    edges,
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
  const maps = Array.isArray(data?.maps)
    ? data.maps
      .filter(map => map && typeof map.id === 'string' && typeof map.imagePath === 'string')
      .map(map => {
        const markers = Array.isArray(map.markers)
          ? map.markers
            .filter(marker => marker && typeof marker.id === 'string')
            .map(marker => {
              const kind: AtlasMarkerKind =
                marker.kind === 'landmark' || marker.kind === 'region' || marker.kind === 'route' || marker.kind === 'note'
                  ? marker.kind
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
              }
            })
          : []
        const zoom = Number(map.viewport?.zoom)
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
