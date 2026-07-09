import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  Atlas,
  AtlasImageSampling,
  AtlasImportCandidate,
  AtlasMap,
  AtlasMarker,
  AtlasMarkerKind,
  AtlasMarkerVisibility,
  AtlasViewport,
  LoreBook,
} from '../types'

const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
const VISIBILITY_MIN_ZOOM: Record<AtlasMarkerVisibility, number> = {
  always: 0,
  medium: 0.65,
  close: 1.2,
}

const MARKER_KINDS: { value: AtlasMarkerKind; label: string; icon: string }[] = [
  { value: 'town', label: 'Town', icon: 'ti-building-community' },
  { value: 'city', label: 'City', icon: 'ti-building-skyscraper' },
  { value: 'capital', label: 'Capital', icon: 'ti-building-castle' },
  { value: 'village', label: 'Village', icon: 'ti-home' },
  { value: 'camp', label: 'Camp', icon: 'ti-tent' },
  { value: 'landmark', label: 'Landmark', icon: 'ti-map-pin' },
  { value: 'ruin', label: 'Ruin', icon: 'ti-building-fortress' },
  { value: 'dungeon', label: 'Dungeon', icon: 'ti-key' },
  { value: 'region', label: 'Region', icon: 'ti-border-corners' },
  { value: 'route', label: 'Route Note', icon: 'ti-route' },
  { value: 'border', label: 'Border', icon: 'ti-border-style-2' },
  { value: 'water', label: 'Water', icon: 'ti-droplet' },
  { value: 'danger', label: 'Danger', icon: 'ti-alert-triangle' },
  { value: 'note', label: 'Note', icon: 'ti-notes' },
]

const VISIBILITY_OPTIONS: { value: AtlasMarkerVisibility; label: string }[] = [
  { value: 'always', label: 'Always show' },
  { value: 'medium', label: 'Medium zoom' },
  { value: 'close', label: 'Close-up only' },
]

const SAMPLING_OPTIONS: { value: AtlasImageSampling; label: string }[] = [
  { value: 'linear', label: 'Smooth' },
  { value: 'point', label: 'Point' },
]

type AtlasViewProps = {
  atlas: Atlas
  projectPath: string | null
  onChange: (atlas: Atlas) => void
  onChooseImage: () => Promise<AtlasImportCandidate | null>
  onImportMap: (candidate: AtlasImportCandidate) => Promise<void>
  onDeleteMap: (mapId: string) => Promise<void>
  onReplaceMapImage: (mapId: string, candidate: AtlasImportCandidate) => Promise<void>
  loreBook: LoreBook
  onOpenLoreEntry: (categoryId: string, entryId: string) => void
  onCreateLoreEntry: (categoryId: string, name: string) => Promise<{ categoryId: string; entryId: string } | null>
}

type DragState = {
  startX: number
  startY: number
  viewport: AtlasViewport
} | null

type ContextMenuState =
  | { type: 'canvas'; x: number; y: number; imageX: number; imageY: number }
  | { type: 'marker'; x: number; y: number; markerId: string }
  | null

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function formatMegapixels(megapixels: number) {
  return `${megapixels.toFixed(1)} MP`
}

export function AtlasView({
  atlas,
  projectPath,
  onChange,
  onChooseImage,
  onImportMap,
  onDeleteMap,
  onReplaceMapImage,
  loreBook,
  onOpenLoreEntry,
  onCreateLoreEntry,
}: AtlasViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [importCandidate, setImportCandidate] = useState<AtlasImportCandidate | null>(null)
  const [replaceCandidate, setReplaceCandidate] = useState<AtlasImportCandidate | null>(null)
  const [confirmDeleteMap, setConfirmDeleteMap] = useState<AtlasMap | null>(null)
  const [importing, setImporting] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 })
  const [renamingMapId, setRenamingMapId] = useState<string | null>(null)
  const [mapRenameDraft, setMapRenameDraft] = useState('')
  const [mapSelectorMenu, setMapSelectorMenu] = useState<{ x: number; y: number } | null>(null)
  const [markerSearchQuery, setMarkerSearchQuery] = useState('')
  const [markerListMode, setMarkerListMode] = useState<'alpha' | 'type'>('alpha')
  const [loreActionMenu, setLoreActionMenu] = useState<{ type: 'link' | 'create'; x: number; y: number; markerId: string } | null>(null)

  const activeMap = atlas.maps.find(map => map.id === atlas.activeMapId) ?? atlas.maps[0] ?? null
  const selectedMarker = activeMap?.markers.find(marker => marker.id === selectedMarkerId) ?? null
  const sortedLoreCategories = useMemo(() => (
    [...loreBook.categories].sort((first, second) => first.name.localeCompare(second.name))
  ), [loreBook.categories])
  const activeHiddenMarkerKinds = new Set(activeMap?.hiddenMarkerKinds ?? [])
  const usedMarkerKinds = activeMap
    ? MARKER_KINDS.filter(kind => activeMap.markers.some(marker => marker.kind === kind.value))
    : []
  const getMarkerKind = (kind: AtlasMarkerKind) => MARKER_KINDS.find(item => item.value === kind) ?? MARKER_KINDS[0]
  const visibleMarkerList = useMemo(() => {
    if (!activeMap) return []
    const query = markerSearchQuery.trim().toLocaleLowerCase()
    const markerKindIndex = new Map(MARKER_KINDS.map((kind, index) => [kind.value, index]))
    return activeMap.markers
      .filter(marker => {
        if (!query) return true
        const kind = getMarkerKind(marker.kind)
        return marker.label.toLocaleLowerCase().includes(query) || kind.label.toLocaleLowerCase().includes(query)
      })
      .sort((first, second) => {
        const firstKind = getMarkerKind(first.kind)
        const secondKind = getMarkerKind(second.kind)
        if (markerListMode === 'type') {
          const kindOrder = (markerKindIndex.get(first.kind) ?? 0) - (markerKindIndex.get(second.kind) ?? 0)
          if (kindOrder !== 0) return kindOrder
        }
        return first.label.localeCompare(second.label) || firstKind.label.localeCompare(secondKind.label)
      })
  }, [activeMap, markerSearchQuery, markerListMode])
  const markerListGroups = useMemo(() => {
    if (markerListMode === 'alpha') return [{ id: 'alpha', label: '', markers: visibleMarkerList }]
    return MARKER_KINDS.map(kind => ({
      id: kind.value,
      label: kind.label,
      markers: visibleMarkerList.filter(marker => marker.kind === kind.value),
    })).filter(group => group.markers.length > 0)
  }, [visibleMarkerList, markerListMode])
  const getLinkedLoreEntry = (marker: AtlasMarker | null) => {
    if (!marker?.linkedLoreCategoryId || !marker.linkedLoreEntryId) return null
    const category = loreBook.categories.find(item => item.id === marker.linkedLoreCategoryId)
    const entry = category?.entries.find(item => item.id === marker.linkedLoreEntryId)
    return category && entry ? { category, entry } : null
  }
  const selectedMarkerLoreLink = getLinkedLoreEntry(selectedMarker)
  useEffect(() => {
    let cancelled = false
    if (!projectPath || !activeMap) {
      setImageSrc(null)
      return
    }
    join(projectPath, activeMap.imagePath).then(path => {
      if (!cancelled) setImageSrc(convertFileSrc(path))
    })
    return () => { cancelled = true }
  }, [projectPath, activeMap?.imagePath, activeMap?.id])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const updateSize = () => {
      setCanvasSize({
        width: Math.max(1, viewport.clientWidth),
        height: Math.max(1, viewport.clientHeight),
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement || !activeMap) return

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = viewportElement.getBoundingClientRect()
      const oldZoom = activeMap.viewport.zoom
      const nextZoom = clampZoom(oldZoom + (event.deltaY > 0 ? -0.12 : 0.12))
      const pointerX = event.clientX - rect.left - rect.width / 2
      const pointerY = event.clientY - rect.top - rect.height / 2
      const imageX = activeMap.viewport.x + pointerX / oldZoom
      const imageY = activeMap.viewport.y + pointerY / oldZoom
      updateViewport({
        x: imageX - pointerX / nextZoom,
        y: imageY - pointerY / nextZoom,
        zoom: nextZoom,
      })
    }

    viewportElement.addEventListener('wheel', handleNativeWheel, { passive: false })
    return () => viewportElement.removeEventListener('wheel', handleNativeWheel)
  }, [activeMap])

  const updateAtlas = (next: Atlas) => onChange(next)
  const updateActiveMap = (patch: Partial<AtlasMap>) => {
    if (!activeMap) return
    updateAtlas({
      ...atlas,
      activeMapId: activeMap.id,
      maps: atlas.maps.map(map => map.id === activeMap.id ? { ...map, ...patch } : map),
    })
  }
  const updateViewport = (viewport: AtlasViewport) => {
    updateActiveMap({ viewport: { ...viewport, zoom: clampZoom(viewport.zoom) } })
  }
  const updateMarker = (markerId: string, patch: Partial<AtlasMarker>) => {
    if (!activeMap) return
    updateActiveMap({
      markers: activeMap.markers.map(marker => marker.id === markerId ? { ...marker, ...patch } : marker),
    })
  }
  const closeMenus = () => {
    setContextMenu(null)
    setMapSelectorMenu(null)
    setLoreActionMenu(null)
  }
  const startRenameMap = () => {
    if (!activeMap) return
    setRenamingMapId(activeMap.id)
    setMapRenameDraft(activeMap.name)
    setMapSelectorMenu(null)
  }
  const commitRenameMap = () => {
    if (!activeMap || renamingMapId !== activeMap.id) return
    const name = mapRenameDraft.trim()
    updateActiveMap({ name: name || 'Untitled Map' })
    setRenamingMapId(null)
  }
  const cancelRenameMap = () => {
    setRenamingMapId(null)
    setMapRenameDraft('')
  }
  const toggleMarkerKindVisibility = (kind: AtlasMarkerKind) => {
    if (!activeMap) return
    const hidden = new Set(activeMap.hiddenMarkerKinds ?? [])
    if (hidden.has(kind)) hidden.delete(kind)
    else hidden.add(kind)
    updateActiveMap({ hiddenMarkerKinds: Array.from(hidden) })
    if (selectedMarker?.kind === kind && hidden.has(kind)) setSelectedMarkerId(null)
  }
  const focusMarker = (marker: AtlasMarker) => {
    if (!activeMap) return
    const hidden = new Set(activeMap.hiddenMarkerKinds ?? [])
    hidden.delete(marker.kind)
    const viewport = {
      ...activeMap.viewport,
      x: marker.x,
      y: marker.y,
      zoom: clampZoom(activeMap.viewport.zoom),
    }
    updateAtlas({
      ...atlas,
      activeMapId: activeMap.id,
      maps: atlas.maps.map(map => map.id === activeMap.id
        ? { ...map, hiddenMarkerKinds: Array.from(hidden), viewport }
        : map),
    })
    setSelectedMarkerId(marker.id)
    closeMenus()
  }
  const linkMarkerToLoreEntry = (markerId: string, categoryId: string, entryId: string) => {
    updateMarker(markerId, { linkedLoreCategoryId: categoryId, linkedLoreEntryId: entryId })
    closeMenus()
  }
  const createLoreEntryFromMarker = async (markerId: string, categoryId: string) => {
    const marker = activeMap?.markers.find(item => item.id === markerId)
    const name = marker?.label.replace(/\s+/g, ' ').trim() || 'New marker'
    const created = await onCreateLoreEntry(categoryId, name)
    if (!created) return
    updateMarker(markerId, {
      linkedLoreCategoryId: created.categoryId,
      linkedLoreEntryId: created.entryId,
    })
    closeMenus()
    onOpenLoreEntry(created.categoryId, created.entryId)
  }
  const openMarkerLoreEntry = (marker: AtlasMarker) => {
    const link = getLinkedLoreEntry(marker)
    if (!link) return
    closeMenus()
    onOpenLoreEntry(link.category.id, link.entry.id)
  }

  const screenToImage = (clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect || !activeMap) return { x: 0, y: 0 }
    const x = activeMap.viewport.x + (clientX - rect.left - rect.width / 2) / activeMap.viewport.zoom
    const y = activeMap.viewport.y + (clientY - rect.top - rect.height / 2) / activeMap.viewport.zoom
    return {
      x: Math.min(activeMap.imageWidth, Math.max(0, x)),
      y: Math.min(activeMap.imageHeight, Math.max(0, y)),
    }
  }

  const addMarker = (x: number, y: number) => {
    if (!activeMap) return
    const marker: AtlasMarker = {
      id: createId('marker'),
      x,
      y,
      label: 'New marker',
      kind: 'town',
      visibility: 'always',
    }
    updateActiveMap({ markers: [...activeMap.markers, marker] })
    setSelectedMarkerId(marker.id)
    closeMenus()
  }

  const deleteMarker = (markerId: string) => {
    if (!activeMap) return
    updateActiveMap({ markers: activeMap.markers.filter(marker => marker.id !== markerId) })
    setSelectedMarkerId(null)
    closeMenus()
  }

  const deleteActiveMap = async () => {
    if (!confirmDeleteMap) return
    await onDeleteMap(confirmDeleteMap.id)
    setConfirmDeleteMap(null)
    setSelectedMarkerId(null)
    closeMenus()
  }

  const startImport = async () => {
    const candidate = await onChooseImage()
    if (candidate) setImportCandidate(candidate)
  }

  const startReplaceImage = async () => {
    if (!activeMap) return
    const candidate = await onChooseImage()
    if (candidate) setReplaceCandidate(candidate)
  }

  const confirmImport = async () => {
    if (!importCandidate) return
    setImporting(true)
    try {
      await onImportMap(importCandidate)
      setImportCandidate(null)
    } finally {
      setImporting(false)
    }
  }

  const confirmReplace = async () => {
    if (!activeMap || !replaceCandidate) return
    if (replaceCandidate.width !== activeMap.imageWidth || replaceCandidate.height !== activeMap.imageHeight) return
    setImporting(true)
    try {
      await onReplaceMapImage(activeMap.id, replaceCandidate)
      setReplaceCandidate(null)
    } finally {
      setImporting(false)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeMap || event.button !== 0) return
    const target = event.target as Element
    if (
      target.closest('.atlas-marker') ||
      target.closest('.atlas-context-menu') ||
      target.closest('.atlas-marker-legend') ||
      target.closest('.atlas-map-overlay')
    ) return
    closeMenus()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      viewport: activeMap.viewport,
    }
    document.body.classList.add('atlas-dragging')
    window.getSelection()?.removeAllRanges()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || !activeMap) return
    const dx = (drag.startX - event.clientX) / drag.viewport.zoom
    const dy = (drag.startY - event.clientY) / drag.viewport.zoom
    updateViewport({
      ...drag.viewport,
      x: drag.viewport.x + dx,
      y: drag.viewport.y + dy,
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    document.body.classList.remove('atlas-dragging')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMap) return
    event.preventDefault()
    setMapSelectorMenu(null)
    setLoreActionMenu(null)
    const point = screenToImage(event.clientX, event.clientY)
    setSelectedMarkerId(null)
    setContextMenu({
      type: 'canvas',
      x: event.clientX,
      y: event.clientY,
      imageX: point.x,
      imageY: point.y,
    })
  }

  const mapTransform = activeMap
    ? `matrix(${activeMap.viewport.zoom}, 0, 0, ${activeMap.viewport.zoom}, ${canvasSize.width / 2 - activeMap.viewport.x * activeMap.viewport.zoom}, ${canvasSize.height / 2 - activeMap.viewport.y * activeMap.viewport.zoom})`
    : undefined

  return (
    <div id="atlas-view">
      <div id="atlas-toolbar">
        <div className="atlas-toolbar-group">
          <button className="atlas-tool-btn atlas-tool-btn-primary" onClick={startImport} title="Import map">
            <i className="ti ti-photo-plus" aria-hidden="true" />
            <span>Import Map</span>
          </button>
          <button className="atlas-tool-btn" onClick={startReplaceImage} disabled={!activeMap} title="Replace map image">
            <i className="ti ti-photo-edit" aria-hidden="true" />
            <span>Replace</span>
          </button>
          <button className="atlas-tool-btn" onClick={() => activeMap && setConfirmDeleteMap(activeMap)} disabled={!activeMap} title="Delete active map">
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
          <button className="atlas-tool-btn" onClick={() => activeMap && updateViewport({ x: activeMap.imageWidth / 2, y: activeMap.imageHeight / 2, zoom: 1 })} disabled={!activeMap} title="Reset view">
            <i className="ti ti-focus-centered" aria-hidden="true" />
          </button>
          <button className="atlas-tool-btn" onClick={() => activeMap && updateViewport({ ...activeMap.viewport, zoom: activeMap.viewport.zoom + 0.12 })} disabled={!activeMap} title="Zoom in">
            <i className="ti ti-zoom-in" aria-hidden="true" />
          </button>
          <button className="atlas-tool-btn" onClick={() => activeMap && updateViewport({ ...activeMap.viewport, zoom: activeMap.viewport.zoom - 0.12 })} disabled={!activeMap} title="Zoom out">
            <i className="ti ti-zoom-out" aria-hidden="true" />
          </button>
        </div>

        <div className="atlas-toolbar-group atlas-toolbar-group-wide">
          {selectedMarker && (
            <>
              <label className="atlas-field">
                <span>Label</span>
                <input value={selectedMarker.label} onChange={event => updateMarker(selectedMarker.id, { label: event.target.value })} />
              </label>
              <label className="atlas-field atlas-field-short">
                <span>Type</span>
                <select value={selectedMarker.kind} onChange={event => updateMarker(selectedMarker.id, { kind: event.target.value as AtlasMarkerKind })}>
                  {MARKER_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </select>
              </label>
              <label className="atlas-field atlas-field-short">
                <span>Visibility</span>
                <select value={selectedMarker.visibility} onChange={event => updateMarker(selectedMarker.id, { visibility: event.target.value as AtlasMarkerVisibility })}>
                  {VISIBILITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="atlas-toolbar-spacer" />
              {selectedMarkerLoreLink ? (
                <button className="atlas-tool-btn" onClick={() => openMarkerLoreEntry(selectedMarker)} title="Open linked Lore Book entry">
                  <i className="ti ti-book" aria-hidden="true" />
                  <span>Open Lore</span>
                </button>
              ) : (
                <>
                  <button
                    className="atlas-tool-btn"
                    onClick={event => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setLoreActionMenu({ type: 'link', x: rect.left, y: rect.bottom + 4, markerId: selectedMarker.id })
                      setContextMenu(null)
                    }}
                    title="Link marker to an existing Lore Book entry"
                  >
                    <i className="ti ti-link-plus" aria-hidden="true" />
                    <span>Link Lore</span>
                  </button>
                  <button
                    className="atlas-tool-btn"
                    onClick={event => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setLoreActionMenu({ type: 'create', x: rect.left, y: rect.bottom + 4, markerId: selectedMarker.id })
                      setContextMenu(null)
                    }}
                    title="Create a Lore Book entry from marker"
                  >
                    <i className="ti ti-book-upload" aria-hidden="true" />
                    <span>Create Lore</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div
        ref={viewportRef}
        id="atlas-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {!activeMap && (
          <div className="atlas-empty">
            <i className="ti ti-map-2" aria-hidden="true" />
            <p>No atlas maps yet</p>
            <button className="atlas-tool-btn atlas-tool-btn-primary" onClick={startImport}>
              <i className="ti ti-photo-plus" aria-hidden="true" />
              <span>Import Map</span>
            </button>
          </div>
        )}

        <div
          className="atlas-map-overlay"
          data-gradient-include=""
          aria-label="Active map selector"
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
          onContextMenu={event => {
            event.preventDefault()
            event.stopPropagation()
            if (activeMap) setMapSelectorMenu({ x: event.clientX, y: event.clientY })
          }}
        >
          <label className="atlas-map-overlay-picker">
            <span>Map</span>
            {activeMap && renamingMapId === activeMap.id ? (
              <input
                className="atlas-map-rename-input"
                value={mapRenameDraft}
                onChange={event => setMapRenameDraft(event.target.value)}
                onBlur={commitRenameMap}
                onKeyDown={event => {
                  if (event.key === 'Enter') commitRenameMap()
                  if (event.key === 'Escape') cancelRenameMap()
                  if (event.key === 'z' || event.key === 'y') event.stopPropagation()
                }}
                autoFocus
              />
            ) : (
              <select
                value={activeMap?.id ?? ''}
                onChange={event => {
                  updateAtlas({ ...atlas, activeMapId: event.target.value || null })
                  setMapSelectorMenu(null)
                }}
                onDoubleClick={startRenameMap}
                disabled={atlas.maps.length === 0}
                title="Double-click or right-click to rename"
              >
                {atlas.maps.length === 0 && <option value="">No maps</option>}
                {atlas.maps.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}
              </select>
            )}
          </label>
          {activeMap && (
            <label className="atlas-map-overlay-picker">
              <span>Sampling</span>
              <select
                value={activeMap.imageSampling}
                onChange={event => updateActiveMap({ imageSampling: event.target.value as AtlasImageSampling })}
              >
                {SAMPLING_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          )}
          {activeMap && (
            <section className="atlas-marker-list-panel" aria-label="Marker search list">
              <div className="atlas-marker-list-header">
                <span>Marker List</span>
                <button
                  type="button"
                  onClick={() => setMarkerListMode(mode => mode === 'alpha' ? 'type' : 'alpha')}
                  title={markerListMode === 'alpha' ? 'Organize by type' : 'Organize alphabetically'}
                >
                  <i className={`ti ${markerListMode === 'alpha' ? 'ti-sort-ascending-letters' : 'ti-category'}`} aria-hidden="true" />
                </button>
              </div>
              <input
                className="atlas-marker-search-input"
                value={markerSearchQuery}
                onChange={event => setMarkerSearchQuery(event.target.value)}
                placeholder="Search markers"
                aria-label="Search markers"
              />
              <div className="atlas-marker-list">
                {visibleMarkerList.length === 0 ? (
                  <div className="atlas-marker-list-empty">No markers found.</div>
                ) : (
                  markerListGroups.map(group => (
                    <div className="atlas-marker-list-group" key={group.id}>
                      {markerListMode === 'type' && <div className="atlas-marker-list-group-heading">{group.label}</div>}
                      {group.markers.map(marker => {
                        const kind = getMarkerKind(marker.kind)
                        return (
                          <div className={selectedMarkerId === marker.id ? 'atlas-marker-list-item selected' : 'atlas-marker-list-item'} key={marker.id}>
                            <button
                              type="button"
                              className="atlas-marker-list-focus"
                              onClick={() => focusMarker(marker)}
                              title={`Center ${marker.label}`}
                              aria-label={`Center ${marker.label}`}
                            >
                              <i className={`ti ${kind.icon}`} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="atlas-marker-list-name"
                              onClick={() => focusMarker(marker)}
                              title={marker.label}
                            >
                              <span>{marker.label || 'Unnamed marker'}</span>
                              <small>{kind.label}</small>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>

        {activeMap && imageSrc && (
          <div className="atlas-map-layer" data-gradient-exclude="" style={{ transform: mapTransform, width: activeMap.imageWidth, height: activeMap.imageHeight }}>
            <img className={activeMap.imageSampling === 'point' ? 'atlas-map-image atlas-map-image-point' : 'atlas-map-image'} src={imageSrc} alt={activeMap.name} draggable={false} />
            {activeMap.markers
              .filter(marker =>
                activeMap.viewport.zoom >= VISIBILITY_MIN_ZOOM[marker.visibility] &&
                !activeHiddenMarkerKinds.has(marker.kind)
              )
              .map(marker => {
                const kind = getMarkerKind(marker.kind)
                return (
                  <button
                    key={marker.id}
                    className={selectedMarkerId === marker.id ? 'atlas-marker selected' : 'atlas-marker'}
                    style={{
                      left: marker.x,
                      top: marker.y,
                      transform: `translate(-50%, -50%) scale(${1 / activeMap.viewport.zoom})`,
                    }}
                    onPointerDown={event => event.stopPropagation()}
                    onClick={() => {
                      setSelectedMarkerId(marker.id)
                      closeMenus()
                    }}
                    onContextMenu={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedMarkerId(marker.id)
                      setLoreActionMenu(null)
                      setContextMenu({ type: 'marker', x: event.clientX, y: event.clientY, markerId: marker.id })
                    }}
                  >
                    <i className={`ti ${kind.icon}`} aria-hidden="true" />
                    <span>{marker.label}</span>
                  </button>
                )
              })}
          </div>
        )}

        {activeMap && usedMarkerKinds.length > 0 && (
          <div
            className="atlas-marker-legend"
            data-gradient-include=""
            aria-label="Marker category visibility"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
          >
            <div className="atlas-marker-legend-title">
              <i className="ti ti-map-pin" aria-hidden="true" />
              <span>Markers</span>
            </div>
            <div className="atlas-marker-toggles">
              {usedMarkerKinds.map(kind => {
                const hidden = activeHiddenMarkerKinds.has(kind.value)
                return (
                  <button
                    key={kind.value}
                    type="button"
                    className={`atlas-marker-toggle${hidden ? '' : ' active'}`}
                    onClick={() => toggleMarkerKindVisibility(kind.value)}
                    title={`${hidden ? 'Show' : 'Hide'} ${kind.label} markers`}
                    aria-pressed={!hidden}
                  >
                    <i className={`ti ${kind.icon}`} aria-hidden="true" />
                    <span>{kind.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {mapSelectorMenu && activeMap && (
          <div
            className="atlas-context-menu atlas-map-selector-menu"
            data-gradient-include=""
            style={{ left: mapSelectorMenu.x, top: mapSelectorMenu.y }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            <button onClick={startRenameMap}>
              <i className="ti ti-pencil" aria-hidden="true" />
              <span>Rename map</span>
            </button>
          </div>
        )}

        {activeMap && (
          <div className="atlas-scale-readout" data-gradient-include="">
            {(activeMap.viewport.zoom * 100).toFixed(0)}%
          </div>
        )}

        {contextMenu && (
          <div
            className="atlas-context-menu"
            data-gradient-include=""
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {contextMenu.type === 'canvas' && (
              <button onClick={() => addMarker(contextMenu.imageX, contextMenu.imageY)}>
                <i className="ti ti-map-pin-plus" aria-hidden="true" />
                <span>Add marker here</span>
              </button>
            )}
            {contextMenu.type === 'marker' && (
              <>
                {(() => {
                  const marker = activeMap?.markers.find(item => item.id === contextMenu.markerId) ?? null
                  const link = getLinkedLoreEntry(marker)
                  if (!marker) return null
                  return link ? (
                    <button onClick={() => openMarkerLoreEntry(marker)}>
                      <i className="ti ti-book" aria-hidden="true" />
                      <span>Open linked Lore entry</span>
                    </button>
                  ) : (
                    <>
                      <div className="atlas-context-submenu-wrap">
                        <button>
                          <i className="ti ti-link-plus" aria-hidden="true" />
                          <span>Link to Lore Book Entry</span>
                          <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                        </button>
                        <div className="atlas-context-submenu atlas-context-submenu-level-1" data-gradient-include="">
                          {sortedLoreCategories.filter(category => category.entries.length > 0).map(category => (
                            <div className="atlas-context-submenu-wrap" key={category.id}>
                              <button>
                                <i className="ti ti-folder" aria-hidden="true" />
                                <span>{category.name}</span>
                                <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                              </button>
                              <div className="atlas-context-submenu atlas-context-submenu-level-2" data-gradient-include="">
                                {category.entries.map(entry => (
                                  <button key={entry.id} onClick={() => linkMarkerToLoreEntry(marker.id, category.id, entry.id)}>
                                    <i className="ti ti-book" aria-hidden="true" />
                                    <span>{entry.name || 'Unnamed entry'}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="atlas-context-submenu-wrap">
                        <button>
                          <i className="ti ti-book-upload" aria-hidden="true" />
                          <span>Create Lore Book Entry</span>
                          <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                        </button>
                        <div className="atlas-context-submenu atlas-context-submenu-level-1" data-gradient-include="">
                          {sortedLoreCategories.map(category => (
                            <div className="atlas-context-submenu-wrap" key={category.id}>
                              <button>
                                <i className="ti ti-folder" aria-hidden="true" />
                                <span>{category.name}</span>
                                <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                              </button>
                              <div className="atlas-context-submenu atlas-context-submenu-level-2" data-gradient-include="">
                                <button onClick={() => createLoreEntryFromMarker(marker.id, category.id)}>
                                  <i className="ti ti-plus" aria-hidden="true" />
                                  <span>New Entry</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )
                })()}
                <div className="atlas-context-sep" />
                <button className="atlas-context-danger" onClick={() => deleteMarker(contextMenu.markerId)}>
                  <i className="ti ti-trash" aria-hidden="true" />
                  <span>Delete marker</span>
                </button>
              </>
            )}
          </div>
        )}
        {loreActionMenu && (
          <div
            className="atlas-context-menu atlas-lore-action-menu"
            data-gradient-include=""
            style={{ left: loreActionMenu.x, top: loreActionMenu.y }}
            onPointerDown={event => event.stopPropagation()}
            onClick={event => event.stopPropagation()}
            onContextMenu={event => {
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {loreActionMenu.type === 'link'
              ? sortedLoreCategories.filter(category => category.entries.length > 0).map(category => (
                <div className="atlas-context-submenu-wrap" key={category.id}>
                  <button>
                    <i className="ti ti-folder" aria-hidden="true" />
                    <span>{category.name}</span>
                    <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                  </button>
                  <div className="atlas-context-submenu atlas-context-submenu-level-1 atlas-context-submenu-scroll" data-gradient-include="">
                    {category.entries.map(entry => (
                      <button key={entry.id} onClick={() => linkMarkerToLoreEntry(loreActionMenu.markerId, category.id, entry.id)}>
                        <i className="ti ti-book" aria-hidden="true" />
                        <span>{entry.name || 'Unnamed entry'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
              : sortedLoreCategories.map(category => (
                <div className="atlas-context-submenu-wrap" key={category.id}>
                  <button>
                    <i className="ti ti-folder" aria-hidden="true" />
                    <span>{category.name}</span>
                    <i className="ti ti-chevron-right atlas-context-chevron" aria-hidden="true" />
                  </button>
                  <div className="atlas-context-submenu atlas-context-submenu-level-1 atlas-context-submenu-scroll" data-gradient-include="">
                    <button onClick={() => createLoreEntryFromMarker(loreActionMenu.markerId, category.id)}>
                      <i className="ti ti-plus" aria-hidden="true" />
                      <span>New Entry</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {importCandidate && (
        <div className="modal-overlay">
          <div className="modal-box atlas-import-modal">
            <div className="modal-title">Import Atlas Map</div>
            <div className="atlas-import-summary">
              <div>
                <span>Name</span>
                <strong>{importCandidate.name}</strong>
              </div>
              <div>
                <span>Dimensions</span>
                <strong>{importCandidate.width.toLocaleString()} x {importCandidate.height.toLocaleString()} px</strong>
              </div>
              <div>
                <span>Megapixels</span>
                <strong>{formatMegapixels(importCandidate.megapixels)}</strong>
              </div>
            </div>
            {importCandidate.overWarningThreshold && (
              <div className="atlas-import-warning">
                Large maps may use significant memory and render more slowly.
              </div>
            )}
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setImportCandidate(null)} disabled={importing}>Cancel</button>
              <button className="welcome-btn" onClick={confirmImport} disabled={importing}>
                {importing ? 'Importing...' : importCandidate.overWarningThreshold ? 'Import Anyway' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
      {replaceCandidate && activeMap && (
        <div className="modal-overlay">
          <div className="modal-box atlas-import-modal">
            <div className="modal-title">Replace Atlas Map Image</div>
            <div className="modal-body">This will replace the image for {activeMap.name} and permanently delete the previous image file. Existing markers will remain.</div>
            <div className="atlas-import-summary">
              <div>
                <span>Name</span>
                <strong>{replaceCandidate.name}</strong>
              </div>
              <div>
                <span>Dimensions</span>
                <strong>{replaceCandidate.width.toLocaleString()} x {replaceCandidate.height.toLocaleString()} px</strong>
              </div>
              <div>
                <span>Megapixels</span>
                <strong>{formatMegapixels(replaceCandidate.megapixels)}</strong>
              </div>
            </div>
            {replaceCandidate.overWarningThreshold && (
              <div className="atlas-import-warning">
                Large maps may use significant memory and render more slowly.
              </div>
            )}
            {(replaceCandidate.width !== activeMap.imageWidth || replaceCandidate.height !== activeMap.imageHeight) && (
              <div className="atlas-import-warning atlas-import-warning-danger">
                Replacement images must match the current map dimensions exactly. Current map: {activeMap.imageWidth.toLocaleString()} x {activeMap.imageHeight.toLocaleString()} px.
              </div>
            )}
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setReplaceCandidate(null)} disabled={importing}>Cancel</button>
              <button
                className="welcome-btn"
                onClick={confirmReplace}
                disabled={importing || replaceCandidate.width !== activeMap.imageWidth || replaceCandidate.height !== activeMap.imageHeight}
              >
                {importing ? 'Replacing...' : replaceCandidate.overWarningThreshold ? 'Replace Anyway' : 'Replace'}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmDeleteMap && (
        <div className="modal-overlay">
          <div className="modal-box modal-danger" style={{ width: 440 }}>
            <p className="modal-title">Delete Atlas Map</p>
            <p className="modal-danger-text">
              This will permanently delete <strong style={{ color: '#cc8888' }}>{confirmDeleteMap.name}</strong> and its map image. This cannot be undone.
            </p>
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setConfirmDeleteMap(null)}>Cancel</button>
              <button className="welcome-btn modal-btn-danger" onClick={deleteActiveMap}>Delete Map</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
