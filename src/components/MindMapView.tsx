import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  MindMap,
  MindMapEdge,
  MindMapNode,
  MindMapNodeColor,
  MindMapNodeKind,
  MindMapSceneOption,
  MindMapViewport,
} from '../types'

const NODE_WIDTH = 190
const NODE_HEIGHT = 88
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
  | { type: 'pan'; startX: number; startY: number; viewport: MindMapViewport }
  | null

type ContextMenuState =
  | { type: 'canvas'; x: number; y: number; worldX: number; worldY: number }
  | { type: 'node'; x: number; y: number; nodeId: string }
  | { type: 'edge'; x: number; y: number; edgeId: string }
  | null

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function getSceneLabel(scene: MindMapSceneOption) {
  return scene.chapter ? `${scene.chapter} / ${scene.title}` : scene.title
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
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 })
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)

  const selectedNode = map.nodes.find(node => node.id === selectedNodeId) ?? null
  const selectedEdge = map.edges.find(edge => edge.id === selectedEdgeId) ?? null
  const sceneById = useMemo(() => new Map(scenes.map(scene => [scene.id, scene])), [scenes])
  const nodeById = useMemo(() => new Map(map.nodes.map(node => [node.id, node])), [map.nodes])
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
  const updateViewport = (nextViewport: MindMapViewport) => {
    updateMap({ ...map, viewport: { ...nextViewport, zoom: clampZoom(nextViewport.zoom) } })
  }

  const createNode = (x: number, y: number, text = 'New idea'): MindMapNode => ({
    id: createId('node'),
    x,
    y,
    text,
    kind: 'idea',
    color: 'default',
  })

  const addNode = () => {
    const id = createId('node')
    const node = {
      ...createNode(viewport.x - NODE_WIDTH / 2, viewport.y - NODE_HEIGHT / 2),
      id,
    }
    updateMap({ ...map, nodes: [...map.nodes, node] })
    setSelectedNodeId(id)
    setSelectedEdgeId(null)
  }

  const addConnectedChildNode = (parentId: string) => {
    const parent = nodeById.get(parentId)
    if (!parent) return
    const child = createNode(parent.x + NODE_WIDTH + 90, parent.y + 18, 'New idea')
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
    setContextMenu(null)
  }

  const deleteSelection = () => {
    if (selectedNodeId) {
      updateMap({
        ...map,
        nodes: map.nodes.filter(node => node.id !== selectedNodeId),
        edges: map.edges.filter(edge => edge.fromNodeId !== selectedNodeId && edge.toNodeId !== selectedNodeId),
      })
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
      setConnectionStartId(null)
      setContextMenu(null)
      return
    }
    if (selectedEdgeId) {
      updateMap({ ...map, edges: map.edges.filter(edge => edge.id !== selectedEdgeId) })
      setSelectedEdgeId(null)
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
    setContextMenu(null)
  }

  const removeNodeConnections = (nodeId: string) => {
    updateMap({ ...map, edges: map.edges.filter(edge => edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) })
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
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.type === 'node') {
      const point = getSvgPoint(event)
      updateNode(drag.id, {
        x: Math.round(point.x - drag.offsetX),
        y: Math.round(point.y - drag.offsetY),
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
      worldX: point.x - NODE_WIDTH / 2,
      worldY: point.y - NODE_HEIGHT / 2,
    })
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
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
          <button className="mindmap-tool-btn" onClick={deleteSelection} disabled={!selectedNodeId && !selectedEdgeId} title="Delete selected">
            <i className="ti ti-trash" aria-hidden="true" />
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
                  {NODE_COLORS.map(color => <option key={color.value} value={color.value}>{color.label}</option>)}
                </select>
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
          <defs>
            <marker id="mindmap-arrow" className="mindmap-arrow-marker" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" />
            </marker>
          </defs>
          <g className="mindmap-grid">
            <pattern id="mindmap-grid-pattern" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M 64 0 L 0 0 0 64" />
            </pattern>
            <rect x={viewX} y={viewY} width={viewWidth} height={viewHeight} />
          </g>
          <g className="mindmap-edges">
            {map.edges.map(edge => {
              const from = nodeById.get(edge.fromNodeId)
              const to = nodeById.get(edge.toNodeId)
              if (!from || !to) return null
              const x1 = from.x + NODE_WIDTH / 2
              const y1 = from.y + NODE_HEIGHT / 2
              const x2 = to.x + NODE_WIDTH / 2
              const y2 = to.y + NODE_HEIGHT / 2
              const midX = (x1 + x2) / 2
              const midY = (y1 + y2) / 2
              return (
                <g key={edge.id} className={selectedEdgeId === edge.id ? 'mindmap-edge selected' : 'mindmap-edge'} onPointerDown={event => {
                  event.stopPropagation()
                  setContextMenu(null)
                  setSelectedEdgeId(edge.id)
                  setSelectedNodeId(null)
                }} onContextMenu={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  setSelectedEdgeId(edge.id)
                  setSelectedNodeId(null)
                  setContextMenu({ type: 'edge', x: event.clientX, y: event.clientY, edgeId: edge.id })
                }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#mindmap-arrow)" />
                  {edge.label && (
                    <text x={midX} y={midY}>{edge.label}</text>
                  )}
                </g>
              )
            })}
          </g>
          <g className="mindmap-nodes">
            {map.nodes.map(node => {
              const kind = NODE_KINDS.find(item => item.value === node.kind) ?? NODE_KINDS[0]
              const linkedScene = node.linkedSceneId ? sceneById.get(node.linkedSceneId) : null
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
                    height={NODE_HEIGHT}
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
                  <foreignObject x="12" y="18" width="166" height="40">
                    <textarea
                      className="mindmap-node-text"
                      value={node.text}
                      aria-label="Mind map node text"
                      onPointerDown={event => event.stopPropagation()}
                      onChange={event => updateNode(node.id, { text: event.target.value })}
                    />
                  </foreignObject>
                  <foreignObject className="mindmap-node-meta-foreign" x="12" y="62" width="116" height="22">
                    <div className="mindmap-node-meta">
                      <i className={`ti ${kind.icon}`} aria-hidden="true" />
                      <span>{kind.label}{linkedScene ? ` / ${linkedScene.title}` : ''}</span>
                    </div>
                  </foreignObject>
                  <foreignObject className="mindmap-node-action-foreign" x="132" y="60" width="56" height="26">
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
          </div>
        )}
      </div>
    </div>
  )
}
