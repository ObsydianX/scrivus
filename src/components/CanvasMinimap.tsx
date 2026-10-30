import { useRef, useState, type PointerEvent } from 'react'
import type { MindMapEdge, MindMapViewport } from '../types'
import { MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM } from '../constants'

export type MiniNode = { id: string; x: number; y: number; width: number; height: number; color: string }
export type CanvasBounds = { x: number; y: number; width: number; height: number }

export function getCanvasBounds(nodes: MiniNode[]): CanvasBounds {
  if (!nodes.length) return { x: -100, y: -100, width: 200, height: 200 }
  const x = Math.min(...nodes.map(node => node.x))
  const y = Math.min(...nodes.map(node => node.y))
  return { x, y, width: Math.max(1, ...nodes.map(node => node.x + node.width - x)), height: Math.max(1, ...nodes.map(node => node.y + node.height - y)) }
}

export function fitCanvasBounds(bounds: CanvasBounds, width: number, height: number): MindMapViewport {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, zoom: Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Math.min(Math.max(1, width - 128) / bounds.width, Math.max(1, height - 128) / bounds.height))) }
}

export function CanvasMinimap({ nodes, edges, viewport, view, selectedId, onNavigate }: { nodes: MiniNode[]; edges: MindMapEdge[]; viewport: MindMapViewport; view: CanvasBounds; selectedId: string | null; onNavigate: (viewport: MindMapViewport) => void }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('scrivus-canvas-minimap-collapsed') === '1' } catch { return false }
  })
  const drag = useRef<{ inverse: DOMMatrix; offsetX: number; offsetY: number; bounds: CanvasBounds } | null>(null)
  const nodeBounds = getCanvasBounds(nodes)
  const x = Math.min(nodeBounds.x, view.x) - 48
  const y = Math.min(nodeBounds.y, view.y) - 48
  const bounds = drag.current?.bounds ?? { x, y, width: Math.max(nodeBounds.x + nodeBounds.width, view.x + view.width) - x + 48, height: Math.max(nodeBounds.y + nodeBounds.height, view.y + view.height) - y + 48 }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const navigate = (event: PointerEvent<SVGSVGElement>) => {
    const current = drag.current
    if (!current) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(current.inverse)
    onNavigate({ ...viewport, x: point.x + current.offsetX, y: point.y + current.offsetY })
  }
  return <section className="canvas-minimap" aria-label="Canvas minimap">
    <button className="canvas-minimap-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed(value => {
      const next = !value
      try { localStorage.setItem('scrivus-canvas-minimap-collapsed', next ? '1' : '0') } catch { /* Session preference still works. */ }
      return next
    })}><i className="ti ti-map" aria-hidden="true" /><span>Minimap</span><i className={`ti ti-chevron-${collapsed ? 'up' : 'down'}`} aria-hidden="true" /></button>
    {!collapsed && <svg viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} role="group" aria-label="Board overview. Click or drag to navigate; arrow keys pan." tabIndex={0}
      onPointerDown={event => {
        if (event.button !== 0) return
        const matrix = event.currentTarget.getScreenCTM()
        if (!matrix) return
        event.preventDefault()
        const inverse = matrix.inverse()
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(inverse)
        const inView = point.x >= view.x && point.x <= view.x + view.width && point.y >= view.y && point.y <= view.y + view.height
        drag.current = { inverse, bounds, offsetX: inView ? viewport.x - point.x : 0, offsetY: inView ? viewport.y - point.y : 0 }
        event.currentTarget.setPointerCapture(event.pointerId)
        navigate(event)
      }} onPointerMove={navigate} onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
      onKeyDown={event => {
        const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
        if (!direction) return
        event.preventDefault()
        onNavigate({ ...viewport, x: viewport.x + direction[0] * view.width * .1, y: viewport.y + direction[1] * view.height * .1 })
      }}>
      {edges.map(edge => {
        const from = byId.get(edge.fromNodeId), to = byId.get(edge.toNodeId)
        if (!from || !to) return null
        return <polyline key={edge.id} className="canvas-minimap-edge" points={[{ x: from.x + from.width / 2, y: from.y + from.height / 2 }, ...(edge.routePoints ?? []), { x: to.x + to.width / 2, y: to.y + to.height / 2 }].map(p => `${p.x},${p.y}`).join(' ')} vectorEffect="non-scaling-stroke" />
      })}
      {nodes.map(node => <rect key={node.id} x={node.x} y={node.y} width={node.width} height={node.height} rx="8" fill={node.color === 'default' ? 'var(--border-soft)' : `var(--mindmap-node-${node.color})`} className={node.id === selectedId ? 'selected' : ''} vectorEffect="non-scaling-stroke" />)}
      <rect className="canvas-minimap-viewport" x={view.x} y={view.y} width={view.width} height={view.height} vectorEffect="non-scaling-stroke" />
    </svg>}
  </section>
}
