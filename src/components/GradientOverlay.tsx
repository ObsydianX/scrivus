import { useEffect, useRef } from 'react'

// Elements the gradient must not cover: anything explicitly marked with
// data-gradient-exclude, plus every image (lore book, atlas maps, covers).
const EXCLUDE_SELECTOR = '[data-gradient-exclude], img'

// Elements that float above an excluded region (e.g. the Atlas panels over
// the map) and should get the gradient back where they overlap its hole.
const INCLUDE_SELECTOR = '[data-gradient-include]'

type Rect = { left: number; top: number; right: number; bottom: number }

// Bounding rect of a node clipped by its overflow-hiding ancestors and the
// viewport, so holes track images as they scroll inside panels.
function visibleRect(node: Element): Rect | null {
  const rect = node.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  let left = rect.left
  let top = rect.top
  let right = rect.right
  let bottom = rect.bottom
  let parent = node.parentElement
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      const parentRect = parent.getBoundingClientRect()
      left = Math.max(left, parentRect.left)
      top = Math.max(top, parentRect.top)
      right = Math.min(right, parentRect.right)
      bottom = Math.min(bottom, parentRect.bottom)
    }
    parent = parent.parentElement
  }
  left = Math.max(left, 0)
  top = Math.max(top, 0)
  right = Math.min(right, window.innerWidth)
  bottom = Math.min(bottom, window.innerHeight)
  if (right - left < 1 || bottom - top < 1) return null
  return { left, top, right, bottom }
}

// True when the node is actually the top-most content somewhere in its rect.
// When a modal backdrop covers an excluded region, hit-testing no longer
// reaches it, so its hole is skipped and the gradient covers the modal
// uniformly. Elements above the backdrop (e.g. a cover image inside the
// modal) still hit and keep their holes. Sampling five spread-out points
// keeps small popovers over one corner from hiding a whole region.
function isTopmost(node: Element, rect: Rect): boolean {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const points: Array<[number, number]> = [
    [rect.left + width * 0.5, rect.top + height * 0.5],
    [rect.left + width * 0.25, rect.top + height * 0.25],
    [rect.left + width * 0.75, rect.top + height * 0.25],
    [rect.left + width * 0.25, rect.top + height * 0.75],
    [rect.left + width * 0.75, rect.top + height * 0.75],
  ]
  return points.some(([x, y]) => {
    const hit = document.elementFromPoint(x, y)
    if (!hit) return false
    // Hit-testing skips pointer-events:none elements (e.g. the atlas map
    // image), so a hit on an ancestor also counts: it means nothing foreign
    // is covering the node at that point.
    return node.contains(hit) || hit.contains(node)
  })
}

// Full-screen, non-interactive gradient tint over the whole app. Excluded
// regions are punched out of the overlay with a clip-path that is re-measured
// whenever layout, scrolling, or the DOM changes.
export function GradientOverlay({ animated = false }: { animated?: boolean }) {
  const overlayRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    let rafId = 0
    let lastPath = ''
    const sizeObserved = new Set<Element>()

    const resizeObserver = new ResizeObserver(() => schedule())

    const update = () => {
      rafId = 0
      // Nested exclusions (e.g. an image inside the editor) are dropped so
      // overlapping holes cannot cancel each other out under the nonzero
      // fill rule.
      const excluded = Array.from(document.querySelectorAll(EXCLUDE_SELECTOR))
        .filter(node => !node.parentElement?.closest(EXCLUDE_SELECTOR))
      const included = Array.from(document.querySelectorAll(INCLUDE_SELECTOR))

      const tracked = new Set([...excluded, ...included])
      for (const node of sizeObserved) {
        if (!tracked.has(node)) {
          resizeObserver.unobserve(node)
          sizeObserved.delete(node)
        }
      }
      for (const node of tracked) {
        if (!sizeObserved.has(node)) {
          resizeObserver.observe(node)
          sizeObserved.add(node)
        }
      }

      // Outer rect winds clockwise, holes wind counter-clockwise, so the
      // default nonzero fill rule leaves the holes unpainted.
      let path = `M0 0H${window.innerWidth}V${window.innerHeight}H0Z`
      for (const node of excluded) {
        const rect = visibleRect(node)
        if (!rect) continue
        if (!isTopmost(node, rect)) continue
        const l = Math.round(rect.left)
        const t = Math.round(rect.top)
        const r = Math.round(rect.right)
        const b = Math.round(rect.bottom)
        path += `M${l} ${t}V${b}H${r}V${t}Z`
      }
      // Include rects wind clockwise like the outer rect: where they overlap
      // a hole the winding sum becomes nonzero again (gradient restored);
      // everywhere else the extra winding changes nothing.
      for (const node of included) {
        const rect = visibleRect(node)
        if (!rect) continue
        const l = Math.round(rect.left)
        const t = Math.round(rect.top)
        const r = Math.round(rect.right)
        const b = Math.round(rect.bottom)
        path += `M${l} ${t}H${r}V${b}H${l}Z`
      }
      if (path !== lastPath) {
        lastPath = path
        overlay.style.clipPath = `path("${path}")`
      }
    }

    const schedule = () => {
      if (!rafId) rafId = requestAnimationFrame(update)
    }

    // Mutations fully inside an excluded region (e.g. typing in the editor)
    // cannot move the region itself, so they never need a re-measure.
    const insideExcluded = (target: Node): boolean => {
      const element = target instanceof Element ? target : target.parentElement
      if (!element) return false
      const host = element.closest(EXCLUDE_SELECTOR)
      return host !== null && host !== element
    }

    const mutationObserver = new MutationObserver(records => {
      if (records.every(record => insideExcluded(record.target))) return
      schedule()
    })

    update()
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    document.addEventListener('transitionend', schedule, true)
    document.addEventListener('animationend', schedule, true)
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'src', 'data-gradient-exclude', 'data-gradient-include'],
    })

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', schedule)
      document.removeEventListener('scroll', schedule, true)
      document.removeEventListener('transitionend', schedule, true)
      document.removeEventListener('animationend', schedule, true)
      mutationObserver.disconnect()
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div id="gradient-overlay" className={animated ? 'animated' : undefined} ref={overlayRef} aria-hidden="true">
      <div className="gradient-overlay-layer" />
      <div className="gradient-overlay-grain" />
    </div>
  )
}
