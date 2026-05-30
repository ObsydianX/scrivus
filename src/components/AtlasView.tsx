import { convertFileSrc } from '@tauri-apps/api/core'
import { join } from '@tauri-apps/api/path'
import { useEffect, useRef, useState } from 'react'
import type {
  Atlas,
  AtlasImageSampling,
  AtlasImportCandidate,
  AtlasMap,
  AtlasMarker,
  AtlasMarkerKind,
  AtlasMarkerVisibility,
  AtlasViewport,
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
  { value: 'landmark', label: 'Landmark', icon: 'ti-map-pin' },
  { value: 'region', label: 'Region', icon: 'ti-border-corners' },
  { value: 'route', label: 'Route Note', icon: 'ti-route' },
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
}: AtlasViewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [importCandidate, setImportCandidate] = useState<AtlasImportCandidate | null>(null)
  const [replaceCandidate, setReplaceCandidate] = useState<AtlasImportCandidate | null>(null)
  const [importing, setImporting] = useState(false)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 })

  const activeMap = atlas.maps.find(map => map.id === atlas.activeMapId) ?? atlas.maps[0] ?? null
  const selectedMarker = activeMap?.markers.find(marker => marker.id === selectedMarkerId) ?? null
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
    setContextMenu(null)
  }

  const deleteMarker = (markerId: string) => {
    if (!activeMap) return
    updateActiveMap({ markers: activeMap.markers.filter(marker => marker.id !== markerId) })
    setSelectedMarkerId(null)
    setContextMenu(null)
  }

  const deleteActiveMap = async () => {
    if (!activeMap) return
    await onDeleteMap(activeMap.id)
    setSelectedMarkerId(null)
    setContextMenu(null)
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
    if (target.closest('.atlas-marker') || target.closest('.atlas-context-menu')) return
    setContextMenu(null)
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
          <label className="atlas-field atlas-map-picker">
            <span>Map</span>
            <select
              value={activeMap?.id ?? ''}
              onChange={event => updateAtlas({ ...atlas, activeMapId: event.target.value || null })}
              disabled={atlas.maps.length === 0}
            >
              {atlas.maps.length === 0 && <option value="">No maps</option>}
              {atlas.maps.map(map => <option key={map.id} value={map.id}>{map.name}</option>)}
            </select>
          </label>
          <button className="atlas-tool-btn atlas-tool-btn-primary" onClick={startImport} title="Import map">
            <i className="ti ti-photo-plus" aria-hidden="true" />
            <span>Import Map</span>
          </button>
          <button className="atlas-tool-btn" onClick={startReplaceImage} disabled={!activeMap} title="Replace map image">
            <i className="ti ti-photo-edit" aria-hidden="true" />
            <span>Replace</span>
          </button>
          <button className="atlas-tool-btn" onClick={deleteActiveMap} disabled={!activeMap} title="Delete active map">
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
          {activeMap && (
            <>
              <label className="atlas-field atlas-name-field">
                <span>Name</span>
                <input value={activeMap.name} onChange={event => updateActiveMap({ name: event.target.value })} />
              </label>
              <label className="atlas-field atlas-field-short">
                <span>Sampling</span>
                <select
                  value={activeMap.imageSampling}
                  onChange={event => updateActiveMap({ imageSampling: event.target.value as AtlasImageSampling })}
                >
                  {SAMPLING_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </>
          )}
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

        {activeMap && imageSrc && (
          <div className="atlas-map-layer" style={{ transform: mapTransform, width: activeMap.imageWidth, height: activeMap.imageHeight }}>
            <img className={activeMap.imageSampling === 'point' ? 'atlas-map-image atlas-map-image-point' : 'atlas-map-image'} src={imageSrc} alt={activeMap.name} draggable={false} />
            {activeMap.markers
              .filter(marker => activeMap.viewport.zoom >= VISIBILITY_MIN_ZOOM[marker.visibility])
              .map(marker => {
                const kind = MARKER_KINDS.find(item => item.value === marker.kind) ?? MARKER_KINDS[0]
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
                      setContextMenu(null)
                    }}
                    onContextMenu={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      setSelectedMarkerId(marker.id)
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

        {activeMap && (
          <div className="atlas-scale-readout">
            {(activeMap.viewport.zoom * 100).toFixed(0)}%
          </div>
        )}

        {contextMenu && (
          <div
            className="atlas-context-menu"
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
              <button className="atlas-context-danger" onClick={() => deleteMarker(contextMenu.markerId)}>
                <i className="ti ti-trash" aria-hidden="true" />
                <span>Delete marker</span>
              </button>
            )}
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
    </div>
  )
}
