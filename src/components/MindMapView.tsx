import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MindMap,
  MindMapEdge,
  MindMapNode,
  MindMapNodeColor,
  MindMapNodeKind,
  MindMapRoutePoint,
  MindMapSceneOption,
  MindMapViewport,
} from '../types'

const GRID_SIZE = 64
const NODE_WIDTH = GRID_SIZE * 3
const MIN_NODE_HEIGHT = GRID_SIZE * 2
const NODE_TITLE_Y = 18
const NODE_TITLE_HEIGHT = 20
const NODE_TEXT_Y = 40
const NODE_META_HEIGHT = 22
const NODE_BOTTOM_PADDING = 10
const MIN_ZOOM = 0.35
const MAX_ZOOM = 3

const NODE_KINDS: { value: MindMapNodeKind; label: string; icon: string }[] = [
  { value: 'idea', label: 'Idea', icon: 'ti-bulb' },
  { value: 'scene', label: 'Scene', icon: 'ti-device-tv' },
  { value: 'character', label: 'Character', icon: 'ti-user' },
  { value: 'location', label: 'Location', icon: 'ti-map-2' },
  { value: 'note', label: 'Note', icon: 'ti-notes' },
]

const NODE_COLORS: { value: MindMapNodeColor; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'blue', label: 'Blue' },
  { value: 'green', label: 'Green' },
  { value: 'rose', label: 'Rose' },
  { value: 'gold', label: 'Gold' },
  { value: 'violet', label: 'Violet' },
  { value: 'cyan', label: 'Cyan' },
  { value: 'orange', label: 'Orange' },
  { value: 'red', label: 'Red' },
  { value: 'slate', label: 'Slate' },
]

type MindMapViewProps = {
  map: MindMap
  scenes: MindMapSceneOption[]
  onChange: (map: MindMap) => void
  onOpenScene: (id: number) => void
  onCreateSceneFromNode: (node: MindMapNode) => Promise<number | null>
}

type DragState =
  | { type: 'node'; id: string; offsetX: number; offsetY: number }
  | { type: 'route'; edgeId: string; pointId: string }
  | { type: 'pan'; startX: number; startY: number; viewport: MindMapViewport }
  | null

type SelectedRoutePoint = {
  edgeId: string
  pointId: string
} | null

type ContextMenuState =
  | { type: 'canvas'; x: number; y: number; worldX: number; worldY: number }
  | { type: 'node'; x: number; y: number; nodeId: string }
  | { type: 'edge'; x: number; y: number; edgeId: string }
  | { type: 'route'; x: number; y: number; edgeId: string; pointId: string }
  | null

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE
}

function snapUpToGrid(value: number) {
  return Math.ceil(value / GRID_SIZE) * GRID_SIZE
}

function getSceneLabel(scene: MindMapSceneOption) {
  return scene.chapter ? `${scene.chapter} / ${scene.title}` : scene.title
}

function getDefaultColorLabel(color: MindMapNodeColor) {
  return NODE_COLORS.find(item => item.value === color)?.label ?? color
}

function countWrappedLines(text: string, charactersPerLine: number) {
  const normalized = text.replace(/\r\n?/g, '\n')
  if (!normalized.trim()) return 1
  return normalized.split('\n').reduce((count, line) => {
    return count + Math.max(1, Math.ceil(line.length / charactersPerLine))
  }, 0)
}

function getNodeLayout(node: MindMapNode) {
  const textLines = countWrappedLines(node.text, 28)
  const contentTextHeight = Math.max(22, textLines * 15)
  const contentHeight = NODE_TEXT_Y + contentTextHeight + 7 + NODE_META_HEIGHT + NODE_BOTTOM_PADDING
  const height = snapUpToGrid(Math.max(MIN_NODE_HEIGHT, contentHeight))
  const metaY = height - NODE_META_HEIGHT - NODE_BOTTOM_PADDING
  const textHeight = Math.max(22, metaY - NODE_TEXT_Y - 7)
  return {
    height,
    textHeight,
    metaY,
    actionY: metaY - 2,
  }
}

function isMindMapNode(target: { x: number; y: number } | MindMapNode): target is MindMapNode {
  return 'title' in target
}

function getNodeTitlePort(node: MindMapNode, target: { x: number; y: number } | MindMapNode) {
  const sourceCenterX = node.x + NODE_WIDTH / 2
  const sourceCenterY = node.y + NODE_TITLE_Y + NODE_TITLE_HEIGHT / 2
  const targetCenterX = isMindMapNode(target) ? target.x + NODE_WIDTH / 2 : target.x
  const targetCenterY = isMindMapNode(target) ? target.y + NODE_TITLE_Y + NODE_TITLE_HEIGHT / 2 : target.y
  const dx = targetCenterX - sourceCenterX
  const dy = targetCenterY - sourceCenterY
  const edgeX = node.x + (dx >= 0 ? NODE_WIDTH : 0)

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: edgeX,
      y: node.y,
    }
  }

  return {
    x: edgeX,
    y: node.y + (dy >= 0 ? getNodeLayout(node).height : 0),
  }
}

function getPolylineLabelPoint(points: { x: number; y: number }[]) {
  if (points.length <= 1) return points[0] ?? { x: 0, y: 0 }
  const lengths = points.slice(1).map((point, index) => {
    const previous = points[index]
    return Math.hypot(point.x - previous.x, point.y - previous.y)
  })
  const totalLength = lengths.reduce((total, length) => total + length, 0)
  if (totalLength === 0) return points[Math.floor(points.length / 2)]

  let traversed = 0
  const targetLength = totalLength / 2
  for (let index = 1; index < points.length; index += 1) {
    const segmentLength = lengths[index - 1]
    if (traversed + segmentLength >= targetLength) {
      const previous = points[index - 1]
      const point = points[index]
      const ratio = segmentLength === 0 ? 0 : (targetLength - traversed) / segmentLength
      return {
        x: previous.x + (point.x - previous.x) * ratio,
        y: previous.y + (point.y - previous.y) * ratio,
      }
    }
    traversed += segmentLength
  }
  return points[points.length - 1]
}

function distanceToSegment(point: { x: number; y: number }, start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

export function MindMapView({
  map,
  scenes,
  onChange,
  onOpenScene,
  onCreateSceneFromNode,
}: MindMapViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const dragRef = useRef<DragState>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(map.nodes[0]?.id ?? null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [selectedRoutePoint, setSelectedRoutePoint] = useState<SelectedRoutePoint>(null)
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 })
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const selectedNode = map.nodes.find(node => node.id === selectedNodeId) ?? null
  const selectedEdge = map.edges.find(edge => edge.id === selectedEdgeId) ?? null
  const sceneById = useMemo(() => new Map(scenes.map(scene => [scene.id, scene])), [scenes])
  const nodeById = useMemo(() => new Map(map.nodes.map(node => [node.id, node])), [map.nodes])
  const usedColors = useMemo(() => {
    const colors = new Set<MindMapNodeColor>(map.nodes.map(node => node.color))
    if (colors.size === 0) colors.add('default')
    return NODE_COLORS.filter(color => colors.has(color.value))
  }, [map.nodes])
  const viewport = map.viewport
  const viewWidth = canvasSize.width / viewport.zoom
  const viewHeight = canvasSize.height / viewport.zoom
  const viewX = viewport.x - viewWidth / 2
  const viewY = viewport.y - viewHeight / 2
  const viewBox = `${viewX} ${viewY} ${viewWidth} ${viewHeight}`

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const updateSize = () => {
      setCanvasSize({
        width: Math.max(1, svg.clientWidth),
        height: Math.max(1, svg.clientHeight),
      })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const updateMap = (next: MindMap) => onChange(next)
  const updateNode = (id: string, patch: Partial<MindMapNode>) => {
    updateMap({
      ...map,
      nodes: map.nodes.map(node => node.id === id ? { ...node, ...patch } : node),
    })
  }
  const updateEdge = (id: string, patch: Partial<MindMapEdge>) => {
    updateMap({
      ...map,
      edges: map.edges.map(edge => edge.id === id ? { ...edge, ...patch } : edge),
    })
  }
  const updateViewport = (nextViewport: MindMapViewport) => {
    updateMap({ ...map, viewport: { ...nextViewport, zoom: clampZoom(nextViewport.zoom) } })
  }
  const getColorLabel = (color: MindMapNodeColor) => map.colorLabels?.[color]?.trim() || getDefaultColorLabel(color)
  const updateColorLabel = (color: MindMapNodeColor, label: string) => {
    updateMap({
      ...map,
      colorLabels: {
        ...(map.colorLabels ?? {}),
        [color]: label,
      },
    })
  }

  useEffect(() => {
    const snappedNodes = map.nodes.map(node => ({
      ...node,
      x: snapToGrid(node.x),
      y: snapToGrid(node.y),
    }))
    const changed = snappedNodes.some((node, index) => node.x !== map.nodes[index].x || node.y !== map.nodes[index].y)
    if (changed) updateMap({ ...map, nodes: snappedNodes })
  }, [map.nodes])

  const createNode = (x: number, y: number, title = 'New idea'): MindMapNode => ({
    id: createId('node'),
    x: snapToGrid(x),
    y: snapToGrid(y),
    title,
    text: '',
    kind: 'idea',
    color: 'default',
  })

  const addNode = () => {
    const id = createId('node')
    const node = {
      ...createNode(viewport.x - NODE_WIDTH / 2, viewport.y - MIN_NODE_HEIGHT / 2),
      id,
    }
    updateMap({ ...map, nodes: [...map.nodes, node] })
    setSelectedNodeId(id)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
  }

  const addConnectedChildNode = (parentId: string) => {
    const parent = nodeById.get(parentId)
    if (!parent) return
    const parentLayout = getNodeLayout(parent)
    const child = createNode(
      parent.x + NODE_WIDTH + GRID_SIZE,
      parent.y + Math.max(0, parentLayout.height / 2 - MIN_NODE_HEIGHT / 2),
    )
    const edge: MindMapEdge = {
      id: createId('edge'),
      fromNodeId: parentId,
      toNodeId: child.id,
    }
    updateMap({
      ...map,
      nodes: [...map.nodes, child],
      edges: [...map.edges, edge],
    })
    setSelectedNodeId(child.id)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
    setContextMenu(null)
  }

  const duplicateSelectedNode = () => {
    if (!selectedNode) return
    const duplicate: MindMapNode = {
      ...selectedNode,
      id: createId('node'),
      x: snapToGrid(selectedNode.x + GRID_SIZE),
      y: snapToGrid(selectedNode.y + GRID_SIZE),
      title: selectedNode.title ? `${selectedNode.title} copy` : selectedNode.title,
    }
    updateMap({ ...map, nodes: [...map.nodes, duplicate] })
    setSelectedNodeId(duplicate.id)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
    setConnectionStartId(null)
    setContextMenu(null)
  }

  const deleteSelection = () => {
    if (selectedRoutePoint) {
      removeRoutePoint(selectedRoutePoint.edgeId, selectedRoutePoint.pointId)
      return
    }
    if (contextMenu?.type === 'route') {
      removeRoutePoint(contextMenu.edgeId, contextMenu.pointId)
      return
    }
    if (contextMenu?.type === 'edge') {
      removeEdge(contextMenu.edgeId)
      return
    }
    if (contextMenu?.type === 'node') {
      updateMap({
        ...map,
        nodes: map.nodes.filter(node => node.id !== contextMenu.nodeId),
        edges: map.edges.filter(edge => edge.fromNodeId !== contextMenu.nodeId && edge.toNodeId !== contextMenu.nodeId),
      })
      if (selectedNodeId === contextMenu.nodeId) setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedRoutePoint(null)
      setContextMenu(null)
      return
    }
    if (selectedNodeId) {
      updateMap({
        ...map,
        nodes: map.nodes.filter(node => node.id !== selectedNodeId),
        edges: map.edges.filter(edge => edge.fromNodeId !== selectedNodeId && edge.toNodeId !== selectedNodeId),
      })
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setSelectedRoutePoint(null)
      setConnectionStartId(null)
      setContextMenu(null)
      return
    }
    if (selectedEdgeId) {
      updateMap({ ...map, edges: map.edges.filter(edge => edge.id !== selectedEdgeId) })
      setSelectedEdgeId(null)
      setSelectedRoutePoint(null)
      setContextMenu(null)
    }
  }

  const connectNode = (nodeId: string) => {
    if (!connectionStartId) {
      setConnectionStartId(nodeId)
      return
    }
    if (connectionStartId === nodeId) {
      setConnectionStartId(null)
      return
    }
    const exists = map.edges.some(edge => edge.fromNodeId === connectionStartId && edge.toNodeId === nodeId)
    if (!exists) {
      const edge: MindMapEdge = {
        id: createId('edge'),
        fromNodeId: connectionStartId,
        toNodeId: nodeId,
      }
      updateMap({ ...map, edges: [...map.edges, edge] })
    }
    setConnectionStartId(null)
  }

  const removeEdge = (edgeId: string) => {
    updateMap({ ...map, edges: map.edges.filter(edge => edge.id !== edgeId) })
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null)
    if (selectedRoutePoint?.edgeId === edgeId) setSelectedRoutePoint(null)
    setContextMenu(null)
  }

  const removeRoutePoint = (edgeId: string, pointId: string) => {
    const edge = map.edges.find(item => item.id === edgeId)
    if (!edge) {
      setSelectedRoutePoint(null)
      setContextMenu(null)
      return
    }
    const routePoints = (edge.routePoints ?? []).filter(point => point.id !== pointId)
    updateEdge(edgeId, { routePoints: routePoints.length > 0 ? routePoints : undefined })
    if (selectedRoutePoint?.edgeId === edgeId && selectedRoutePoint.pointId === pointId) setSelectedRoutePoint(null)
    setSelectedEdgeId(null)
    setContextMenu(null)
  }

  const removeNodeConnections = (nodeId: string) => {
    updateMap({ ...map, edges: map.edges.filter(edge => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) })
    setContextMenu(null)
  }

  const addRoutePoint = (edgeId: string, x: number, y: number) => {
    const edge = map.edges.find(item => item.id === edgeId)
    if (!edge) return
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!from || !to) return
    const point: MindMapRoutePoint = {
      id: createId('route'),
      x: snapToGrid(x),
      y: snapToGrid(y),
    }
    const routePoints = edge.routePoints ?? []
    const firstTarget = routePoints[0] ?? to
    const lastTarget = routePoints[routePoints.length - 1] ?? from
    const points = [
      getNodeTitlePort(from, firstTarget),
      ...routePoints,
      getNodeTitlePort(to, lastTarget),
    ]
    let insertIndex = routePoints.length
    let closestDistance = Number.POSITIVE_INFINITY
    for (let index = 0; index < points.length - 1; index += 1) {
      const distance = distanceToSegment(point, points[index], points[index + 1])
      if (distance < closestDistance) {
        closestDistance = distance
        insertIndex = index
      }
    }
    updateEdge(edgeId, {
      routePoints: [
        ...routePoints.slice(0, insertIndex),
        point,
        ...routePoints.slice(insertIndex),
      ],
    })
    setSelectedRoutePoint({ edgeId, pointId: point.id })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setContextMenu(null)
  }

  const getSvgPoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return { x: 0, y: 0 }
    const transformed = point.matrixTransform(matrix.inverse())
    return { x: transformed.x, y: transformed.y }
  }

  const startDrag = () => {
    window.getSelection()?.removeAllRanges()
    document.body.classList.add('mindmap-dragging')
  }

  const stopDrag = () => {
    dragRef.current = null
    document.body.classList.remove('mindmap-dragging')
  }

  const handleNodePointerDown = (event: React.PointerEvent<SVGRectElement>, node: MindMapNode) => {
    event.stopPropagation()
    const point = getSvgPoint(event)
    dragRef.current = {
      type: 'node',
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
    }
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
    startDrag()
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const handleRoutePointPointerDown = (event: React.PointerEvent<SVGCircleElement>, edgeId: string, pointId: string) => {
    event.stopPropagation()
    if (event.button !== 0) return
    dragRef.current = { type: 'route', edgeId, pointId }
    setSelectedRoutePoint({ edgeId, pointId })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setContextMenu(null)
    startDrag()
    svgRef.current?.setPointerCapture(event.pointerId)
  }

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    setContextMenu(null)
    startDrag()
    dragRef.current = {
      type: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      viewport: map.viewport,
    }
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'node') {
      const point = getSvgPoint(event)
      updateNode(drag.id, {
        x: snapToGrid(point.x - drag.offsetX),
        y: snapToGrid(point.y - drag.offsetY),
      })
      return
    }
    if (drag.type === 'route') {
      const point = getSvgPoint(event)
      const edge = map.edges.find(item => item.id === drag.edgeId)
      if (!edge) return
      updateEdge(drag.edgeId, {
        routePoints: (edge.routePoints ?? []).map(routePoint =>
          routePoint.id === drag.pointId
            ? { ...routePoint, x: snapToGrid(point.x), y: snapToGrid(point.y) }
            : routePoint
        ),
      })
      return
    }
    const dx = (drag.startX - event.clientX) / drag.viewport.zoom
    const dy = (drag.startY - event.clientY) / drag.viewport.zoom
    updateViewport({
      ...drag.viewport,
      x: drag.viewport.x + dx,
      y: drag.viewport.y + dy,
    })
  }

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    stopDrag()
  }

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const direction = event.deltaY > 0 ? -0.1 : 0.1
    updateViewport({ ...viewport, zoom: clampZoom(viewport.zoom + direction) })
  }

  const handleCanvasContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault()
    const point = getSvgPoint(event)
    setContextMenu({
      type: 'canvas',
      x: event.clientX,
      y: event.clientY,
      worldX: snapToGrid(point.x - NODE_WIDTH / 2),
      worldY: snapToGrid(point.y - MIN_NODE_HEIGHT / 2),
    })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setSelectedRoutePoint(null)
  }

  const addNodeFromContext = () => {
    if (!contextMenu || contextMenu.type !== 'canvas') return
    const node = createNode(contextMenu.worldX, contextMenu.worldY)
    updateMap({ ...map, nodes: [...map.nodes, node] })
    setSelectedNodeId(node.id)
    setSelectedEdgeId(null)
    setContextMenu(null)
  }

  const createScene = async () => {
    if (!selectedNode) return
    const sceneId = await onCreateSceneFromNode(selectedNode)
    if (sceneId !== null) updateNode(selectedNode.id, { linkedSceneId: sceneId, kind: 'scene' })
  }

  return (
    <div id="mindmap-view">
      <div id="mindmap-toolbar">
        <div className="mindmap-toolbar-group">
          <button className="mindmap-tool-btn mindmap-tool-btn-primary" onClick={addNode} title="Add node">
            <i className="ti ti-plus" aria-hidden="true" />
            <span>Node</span>
          </button>
          <button className="mindmap-tool-btn" onClick={deleteSelection} disabled={!selectedNodeId && !selectedEdgeId && !selectedRoutePoint} title="Delete selected">
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
          <button className="mindmap-tool-btn" onClick={duplicateSelectedNode} disabled={!selectedNode} title="Duplicate selected node">
            <i className="ti ti-copy" aria-hidden="true" />
          </button>
          <button className="mindmap-tool-btn" onClick={() => updateViewport({ x: 0, y: 0, zoom: 1 })} title="Reset view">
            <i className="ti ti-focus-centered" aria-hidden="true" />
          </button>
          <button className="mindmap-tool-btn" onClick={() => updateViewport({ ...viewport, zoom: viewport.zoom + 0.1 })} title="Zoom in">
            <i className="ti ti-zoom-in" aria-hidden="true" />
          </button>
          <button className="mindmap-tool-btn" onClick={() => updateViewport({ ...viewport, zoom: viewport.zoom - 0.1 })} title="Zoom out">
            <i className="ti ti-zoom-out" aria-hidden="true" />
          </button>
        </div>

        <div className="mindmap-toolbar-group mindmap-toolbar-group-wide">
          {selectedNode ? (
            <>
              <label className="mindmap-field mindmap-field-short">
                <span>Kind</span>
                <select value={selectedNode.kind} onChange={event => updateNode(selectedNode.id, { kind: event.target.value as MindMapNodeKind })}>
                  {NODE_KINDS.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                </select>
              </label>
              <label className="mindmap-field mindmap-field-short">
                <span>Color</span>
                <select value={selectedNode.color} onChange={event => updateNode(selectedNode.id, { color: event.target.value as MindMapNodeColor })}>
                  {NODE_COLORS.map(color => <option key={color.value} value={color.value}>{getColorLabel(color.value)}</option>)}
                </select>
              </label>
              <label className="mindmap-field mindmap-field-color-label">
                <span>Label</span>
                <input
                  value={map.colorLabels?.[selectedNode.color] ?? ''}
                  placeholder={getDefaultColorLabel(selectedNode.color)}
                  onChange={event => updateColorLabel(selectedNode.color, event.target.value)}
                />
              </label>
              <label className="mindmap-field mindmap-field-title">
                <span>Title</span>
                <input
                  value={selectedNode.title ?? ''}
                  placeholder="Node title"
                  onChange={event => updateNode(selectedNode.id, { title: event.target.value })}
                />
              </label>
              <label className="mindmap-field">
                <span>Scene</span>
                <select
                  value={selectedNode.linkedSceneId ?? ''}
                  onChange={event => updateNode(selectedNode.id, {
                    linkedSceneId: event.target.value ? Number(event.target.value) : undefined,
                    kind: event.target.value ? 'scene' : selectedNode.kind,
                  })}
                >
                  <option value="">Unlinked</option>
                  {scenes.map(scene => <option key={scene.id} value={scene.id}>{getSceneLabel(scene)}</option>)}
                </select>
              </label>
              <button className="mindmap-tool-btn" onClick={() => connectNode(selectedNode.id)} title="Connect selected node">
                <i className="ti ti-route" aria-hidden="true" />
                <span>{connectionStartId === selectedNode.id ? 'Pick target' : 'Connect'}</span>
              </button>
              {selectedNode.linkedSceneId ? (
                <button className="mindmap-tool-btn" onClick={() => onOpenScene(selectedNode.linkedSceneId!)} title="Open linked scene">
                  <i className="ti ti-external-link" aria-hidden="true" />
                  <span>Open</span>
                </button>
              ) : (
                <button className="mindmap-tool-btn" onClick={createScene} title="Create scene from node">
                  <i className="ti ti-file-plus" aria-hidden="true" />
                  <span>Create Scene</span>
                </button>
              )}
            </>
          ) : selectedEdge ? (
            <input
              className="mindmap-edge-label-input"
              value={selectedEdge.label ?? ''}
              placeholder="Connection label"
              onChange={event => updateMap({
                ...map,
                edges: map.edges.map(edge => edge.id === selectedEdge.id ? { ...edge, label: event.target.value } : edge),
              })}
            />
          ) : (
            <span className="mindmap-toolbar-hint">Drag the canvas to pan. Select a node to link it to a scene or connect it to another node.</span>
          )}
        </div>
      </div>

      <div id="mindmap-canvas-wrap">
        {map.nodes.length === 0 && (
          <div className="mindmap-empty">
            <i className="ti ti-git-fork" aria-hidden="true" />
            <p>No mind map nodes yet</p>
            <button className="mindmap-tool-btn mindmap-tool-btn-primary" onClick={addNode}>
              <i className="ti ti-plus" aria-hidden="true" />
              <span>Add first node</span>
            </button>
          </div>
        )}
        <div className="mindmap-color-legend" aria-label="Canvas color legend">
          {usedColors.map(color => (
            <div key={color.value} className="mindmap-color-legend-item">
              <span className={`mindmap-color-swatch mindmap-color-swatch-${color.value}`} aria-hidden="true" />
              <span>{getColorLabel(color.value)}</span>
            </div>
          ))}
        </div>
        <svg
          ref={svgRef}
          className="mindmap-canvas"
          viewBox={viewBox}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={handleCanvasContextMenu}
        >
          <g className="mindmap-grid">
            <pattern id="mindmap-grid-pattern" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
              <path d={`M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}`} />
            </pattern>
            <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} />
          </g>
          <g className="mindmap-edges">
            {map.edges.map(edge => {
              const from = nodeById.get(edge.fromNodeId)
              const to = nodeById.get(edge.toNodeId)
              if (!from || !to) return null
              const routePoints = edge.routePoints ?? []
              const firstTarget = routePoints[0] ?? to
              const lastTarget = routePoints[routePoints.length - 1] ?? from
              const fromPort = getNodeTitlePort(from, firstTarget)
              const toPort = getNodeTitlePort(to, lastTarget)
              const points = [fromPort, ...routePoints, toPort]
              const pointList = points.map(point => `${point.x},${point.y}`).join(' ')
              const labelPoint = getPolylineLabelPoint(points)
              return (
                <g key={edge.id} className={selectedEdgeId === edge.id ? 'mindmap-edge selected' : 'mindmap-edge'} onPointerDown={event => {
                  event.stopPropagation()
                  setContextMenu(null)
                  setSelectedEdgeId(edge.id)
                  setSelectedNodeId(null)
                  setSelectedRoutePoint(null)
                }} onDoubleClick={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  const point = getSvgPoint(event)
                  addRoutePoint(edge.id, point.x, point.y)
                }} onContextMenu={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSelectedEdgeId(edge.id)
                  setSelectedNodeId(null)
                  setSelectedRoutePoint(null)
                  setContextMenu({ type: 'edge', x: event.clientX, y: event.clientY, edgeId: edge.id })
                }}>
                  <polyline points={pointList} />
                  {edge.label && (
                    <text x={labelPoint.x} y={labelPoint.y}>{edge.label}</text>
                  )}
                  {routePoints.map(point => (
                    <circle
                      key={point.id}
                      className={`mindmap-route-point${selectedRoutePoint?.edgeId === edge.id && selectedRoutePoint.pointId === point.id ? ' selected' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r="6"
                      onPointerDown={event => handleRoutePointPointerDown(event, edge.id, point.id)}
                      onContextMenu={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        setSelectedRoutePoint({ edgeId: edge.id, pointId: point.id })
                        setSelectedNodeId(null)
                        setSelectedEdgeId(null)
                        setContextMenu({ type: 'route', x: event.clientX, y: event.clientY, edgeId: edge.id, pointId: point.id })
                      }}
                    />
                  ))}
                </g>
              )
            })}
          </g>
          <g className="mindmap-nodes">
            {map.nodes.map(node => {
              const kind = NODE_KINDS.find(item => item.value === node.kind) ?? NODE_KINDS[0]
              const linkedScene = node.linkedSceneId ? sceneById.get(node.linkedSceneId) : null
              const layout = getNodeLayout(node)
              const className = [
                'mindmap-node',
                `mindmap-node-${node.color}`,
                selectedNodeId === node.id ? 'selected' : '',
                connectionStartId === node.id ? 'connecting' : '',
              ].filter(Boolean).join(' ')

              return (
                <g
                  key={node.id}
                  className={className}
                  transform={`translate(${node.x} ${node.y})`}
                  onDoubleClick={() => node.linkedSceneId && onOpenScene(node.linkedSceneId)}
                  onContextMenu={event => {
                    event.preventDefault()
                    event.stopPropagation()
                    setSelectedNodeId(node.id)
                    setSelectedEdgeId(null)
                    setContextMenu({ type: 'node', x: event.clientX, y: event.clientY, nodeId: node.id })
                  }}
                >
                  <rect
                    className="mindmap-node-shape"
                    width={NODE_WIDTH}
                    height={layout.height}
                    rx="7"
                    onPointerDown={event => {
                      event.stopPropagation()
                      setSelectedNodeId(node.id)
                      setSelectedEdgeId(null)
                    }}
                  />
                  <rect
                    className="mindmap-node-handle"
                    width={NODE_WIDTH}
                    height="12"
                    rx="7"
                    onPointerDown={event => handleNodePointerDown(event, node)}
                  />
                  <foreignObject x="12" y={NODE_TITLE_Y} width="166" height={NODE_TITLE_HEIGHT}>
                    <input
                      className="mindmap-node-title"
                      value={node.title ?? ''}
                      placeholder="Node title"
                      aria-label="Mind map node title"
                      onPointerDown={event => event.stopPropagation()}
                      onChange={event => updateNode(node.id, { title: event.target.value })}
                    />
                  </foreignObject>
                  <foreignObject x="12" y={NODE_TEXT_Y} width="166" height={layout.textHeight}>
                    <textarea
                      className="mindmap-node-text"
                      value={node.text}
                      placeholder="Notes"
                      aria-label="Mind map node notes"
                      onPointerDown={event => event.stopPropagation()}
                      onChange={event => updateNode(node.id, { text: event.target.value })}
                    />
                  </foreignObject>
                  <foreignObject className="mindmap-node-meta-foreign" x="12" y={layout.metaY} width="116" height={NODE_META_HEIGHT}>
                    <div className="mindmap-node-meta">
                      <i className={`ti ${kind.icon}`} aria-hidden="true" />
                      <span>{kind.label}{linkedScene ? ` / ${linkedScene.title}` : ''}</span>
                    </div>
                  </foreignObject>
                  <foreignObject className="mindmap-node-action-foreign" x="132" y={layout.actionY} width="56" height="26">
                    <div className="mindmap-node-actions">
                      <button
                        className="mindmap-node-action"
                        title="Add connected node"
                        onPointerDown={event => {
                          event.stopPropagation()
                          addConnectedChildNode(node.id)
                        }}
                      >
                        <i className="ti ti-plus" aria-hidden="true" />
                      </button>
                      <button
                        className="mindmap-node-action"
                        title="Connect to another node"
                        onPointerDown={event => {
                          event.stopPropagation()
                          setSelectedNodeId(node.id)
                          setSelectedEdgeId(null)
                          connectNode(node.id)
                        }}
                      >
                        <i className="ti ti-route" aria-hidden="true" />
                      </button>
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </g>
        </svg>
        {contextMenu && (
          <div className="mindmap-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.type === 'canvas' && (
              <button onClick={addNodeFromContext}>
                <i className="ti ti-plus" aria-hidden="true" />
                <span>Add node here</span>
              </button>
            )}
            {contextMenu.type === 'node' && (
              <>
                <button onClick={() => addConnectedChildNode(contextMenu.nodeId)}>
                  <i className="ti ti-plus" aria-hidden="true" />
                  <span>Add connected node</span>
                </button>
                <button onClick={() => removeNodeConnections(contextMenu.nodeId)}>
                  <i className="ti ti-route-off" aria-hidden="true" />
                  <span>Remove connections</span>
                </button>
                <button onClick={duplicateSelectedNode}>
                  <i className="ti ti-copy" aria-hidden="true" />
                  <span>Duplicate node</span>
                </button>
                <button className="mindmap-context-danger" onClick={deleteSelection}>
                  <i className="ti ti-trash" aria-hidden="true" />
                  <span>Delete node</span>
                </button>
              </>
            )}
            {contextMenu.type === 'edge' && (
              <button className="mindmap-context-danger" onClick={() => removeEdge(contextMenu.edgeId)}>
                <i className="ti ti-route-off" aria-hidden="true" />
                <span>Remove connection</span>
              </button>
            )}
            {contextMenu.type === 'route' && (
              <button className="mindmap-context-danger" onClick={() => removeRoutePoint(contextMenu.edgeId, contextMenu.pointId)}>
                <i className="ti ti-route-off" aria-hidden="true" />
                <span>Remove reroute point</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
