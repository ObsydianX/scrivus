import { convertFileSrc } from '@tauri-apps/api/core'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  getLoreFieldText,
  getLoreImageDisplayPath,
  getLoreImageFullWidth,
  getLoreImageIgnoreEntryCrop,
  getLoreImagePath,
} from '../loreImages'
import type { LoreBook, LoreCategory, LoreEntry } from '../types'
import type { LoreBacklink } from '../loreBacklinks'

const BACKLINK_PAGE_SIZE = 24

type LoreBookViewProps = {
  loreBook: LoreBook
  loreView: 'home' | 'category' | 'entry'
  activeCategoryId: string | null
  expandedEntryId: string | null
  projectPath: string | null
  backlinks: Record<string, LoreBacklink[]>
  onLoreViewChange: (view: 'home' | 'category' | 'entry') => void
  onActiveCategoryChange: (categoryId: string | null) => void
  onExpandedEntryChange: (entryId: string | null) => void
  onNewCategory: () => void
  onEditCategory: (category: LoreCategory) => void
  onDeleteCategoryRequest: (category: LoreCategory) => void
  onNewEntry: () => void
  onEditEntry: (entry: LoreEntry) => void
  onDeleteEntryRequest: (entry: LoreEntry) => void
  onToggleEntryPinned: (categoryId: string, entryId: string, pinned: boolean) => void
  onOpenScene: (id: number) => void
  onOpenPresence: () => void
}

export function LoreBookView({
  loreBook,
  loreView,
  activeCategoryId,
  expandedEntryId,
  projectPath,
  backlinks,
  onLoreViewChange,
  onActiveCategoryChange,
  onExpandedEntryChange,
  onNewCategory,
  onEditCategory,
  onDeleteCategoryRequest,
  onNewEntry,
  onEditEntry,
  onDeleteEntryRequest,
  onToggleEntryPinned,
  onOpenScene,
  onOpenPresence,
}: LoreBookViewProps) {
  const [visibleBacklinkCounts, setVisibleBacklinkCounts] = useState<Record<string, number>>({})
  const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 })
  const viewerDragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)
  const sortedCategories = [...loreBook.categories].sort((a, b) => a.name.localeCompare(b.name))
  const pinnedEntries = sortedCategories
    .flatMap(category => category.entries
      .filter(entry => entry.pinned)
      .map(entry => ({ category, entry })))
    .sort((a, b) =>
      a.category.name.localeCompare(b.category.name) ||
      a.entry.name.localeCompare(b.entry.name)
    )

  useEffect(() => {
    setVisibleBacklinkCounts({})
  }, [activeCategoryId])

  useEffect(() => {
    if (!expandedEntryId) return
    setVisibleBacklinkCounts(counts => {
      if (counts[expandedEntryId] === undefined) return counts
      const next = { ...counts }
      delete next[expandedEntryId]
      return next
    })
  }, [expandedEntryId])

  const openEntry = (entryId: string) => {
    setVisibleBacklinkCounts(counts => {
      if (counts[entryId] === undefined) return counts
      const next = { ...counts }
      delete next[entryId]
      return next
    })
    onExpandedEntryChange(entryId)
    onLoreViewChange('entry')
  }

  const getProjectImageSrc = (relativePath: string) =>
    projectPath ? convertFileSrc(`${projectPath}/${relativePath}`.replace(/\\/g, '/')) : ''

  const openImageViewer = (src: string, alt: string) => {
    setImageViewer({ src, alt })
    setViewerZoom(1)
    setViewerPan({ x: 0, y: 0 })
  }

  const imageViewerModal = imageViewer && (
    <div className="modal-overlay lore-image-viewer-overlay" style={{ zIndex: 180 }} onClick={() => setImageViewer(null)}>
      <div className="lore-image-viewer" onClick={event => event.stopPropagation()}>
        <div className="lore-image-viewer-toolbar">
          <button type="button" className="lorebook-edit-btn" onClick={() => setViewerZoom(zoom => Math.max(0.25, zoom - 0.25))}>
            <i className="ti ti-minus" aria-hidden="true" />
          </button>
          <input
            type="range"
            min="0.25"
            max="4"
            step="0.05"
            value={viewerZoom}
            onChange={event => setViewerZoom(Number(event.target.value))}
          />
          <button type="button" className="lorebook-edit-btn" onClick={() => setViewerZoom(zoom => Math.min(4, zoom + 0.25))}>
            <i className="ti ti-plus" aria-hidden="true" />
          </button>
          <button type="button" className="lorebook-edit-btn" onClick={() => { setViewerZoom(1); setViewerPan({ x: 0, y: 0 }) }}>
            <i className="ti ti-restore" aria-hidden="true" />
          </button>
          <button type="button" className="lorebook-delete-btn" onClick={() => setImageViewer(null)}>
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>
        <div
          className="lore-image-viewer-stage"
          onPointerDown={event => {
            event.preventDefault()
            viewerDragRef.current = {
              startX: event.clientX,
              startY: event.clientY,
              panX: viewerPan.x,
              panY: viewerPan.y,
            }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={event => {
            const drag = viewerDragRef.current
            if (!drag) return
            setViewerPan({
              x: drag.panX + event.clientX - drag.startX,
              y: drag.panY + event.clientY - drag.startY,
            })
          }}
          onPointerUp={() => { viewerDragRef.current = null }}
          onPointerCancel={() => { viewerDragRef.current = null }}
          onWheel={event => {
            event.preventDefault()
            setViewerZoom(zoom => Math.min(4, Math.max(0.25, zoom + (event.deltaY < 0 ? 0.1 : -0.1))))
          }}
        >
          <img
            src={imageViewer.src}
            alt={imageViewer.alt}
            draggable={false}
            onDragStart={event => event.preventDefault()}
            style={{
              '--lore-viewer-zoom': viewerZoom,
              '--lore-viewer-pan-x': `${viewerPan.x}px`,
              '--lore-viewer-pan-y': `${viewerPan.y}px`,
            } as CSSProperties}
          />
        </div>
      </div>
    </div>
  )

  if (loreView === 'category' || loreView === 'entry') {
    const cat = loreBook.categories.find(c => c.id === activeCategoryId)
    if (!cat) return null
    const sortedEntries = [...cat.entries].sort((a, b) => a.name.localeCompare(b.name))
    const subcategories = cat.subcategories ?? []
    const subcategoryIds = new Set(subcategories.map(subcategory => subcategory.id))
    const entryGroups = [
      ...subcategories.map(subcategory => ({
        id: subcategory.id,
        name: subcategory.name || 'Unnamed subcategory',
        color: subcategory.color ?? 'default',
        entries: sortedEntries.filter(entry => entry.subcategoryId === subcategory.id),
      })),
      {
        id: '__uncategorized__',
        name: 'Uncategorized',
        color: 'default',
        entries: sortedEntries.filter(entry => !entry.subcategoryId || !subcategoryIds.has(entry.subcategoryId)),
      },
    ].filter(group => group.entries.length > 0)
    const activeFields = cat.template.filter(f => !f.removed)
    const activeEntry = expandedEntryId ? cat.entries.find(entry => entry.id === expandedEntryId) ?? null : null
    const categoryEntryOrder = entryGroups.flatMap(group => group.entries)
    const navigateLoreHome = () => {
      onExpandedEntryChange(null)
      onActiveCategoryChange(null)
      onLoreViewChange('home')
    }
    const navigateLoreCategory = () => {
      onActiveCategoryChange(cat.id)
      onExpandedEntryChange(null)
      onLoreViewChange('category')
    }
    const renderCategoryBreadcrumb = (includeCategory: boolean) => (
      <div id="lorebook-category-title" className="lorebook-breadcrumb" aria-label="Lore Book location">
        <button type="button" className="lorebook-breadcrumb-btn" onClick={navigateLoreHome}>
          Home
        </button>
        {includeCategory && (
          <>
            <span className="lorebook-breadcrumb-separator" aria-hidden="true">/</span>
            <button type="button" className="lorebook-breadcrumb-btn" onClick={navigateLoreCategory}>
              {cat.name || 'Unnamed category'}
            </button>
          </>
        )}
      </div>
    )

    if (loreView === 'entry') {
      if (!activeEntry) {
        return (
          <div id="lorebook-view">
            <div id="lorebook-category-header">
              <button className="lorebook-back-btn" onClick={() => onLoreViewChange('category')}>
                <i className="ti ti-arrow-left" aria-hidden="true" />
              </button>
              {renderCategoryBreadcrumb(true)}
            </div>
            <div className="lorebook-entry-view-empty">Entry not found.</div>
          </div>
        )
      }

      const entryBacklinks = backlinks[activeEntry.id] ?? []
      const visibleBacklinkCount = Math.min(
        entryBacklinks.length,
        visibleBacklinkCounts[activeEntry.id] ?? BACKLINK_PAGE_SIZE
      )
      const visibleBacklinks = entryBacklinks.slice(0, visibleBacklinkCount)
      const hiddenBacklinkCount = entryBacklinks.length - visibleBacklinkCount
      const activeEntryIndex = categoryEntryOrder.findIndex(entry => entry.id === activeEntry.id)
      const previousEntry = activeEntryIndex >= 0 && categoryEntryOrder.length > 1
        ? categoryEntryOrder[(activeEntryIndex - 1 + categoryEntryOrder.length) % categoryEntryOrder.length]
        : null
      const nextEntry = activeEntryIndex >= 0 && categoryEntryOrder.length > 1
        ? categoryEntryOrder[(activeEntryIndex + 1) % categoryEntryOrder.length]
        : null

      return (
        <>
        <div id="lorebook-view">
          <div id="lorebook-category-header">
            <button className="lorebook-back-btn" onClick={() => onLoreViewChange('category')}>
              <i className="ti ti-arrow-left" aria-hidden="true" />
            </button>
            {renderCategoryBreadcrumb(true)}
            <div className="lorebook-entry-nav" aria-label="Entry navigation">
              <button
                type="button"
                className="lorebook-entry-nav-btn"
                disabled={!previousEntry}
                onClick={() => previousEntry && openEntry(previousEntry.id)}
                title={previousEntry ? `Previous entry: ${previousEntry.name || 'Unnamed entry'}` : 'Previous entry'}
                aria-label={previousEntry ? `Previous entry: ${previousEntry.name || 'Unnamed entry'}` : 'Previous entry'}
              >
                <i className="ti ti-chevron-left" aria-hidden="true" />
                <span>{previousEntry?.name || 'Previous'}</span>
              </button>
              <button
                type="button"
                className="lorebook-entry-nav-btn"
                disabled={!nextEntry}
                onClick={() => nextEntry && openEntry(nextEntry.id)}
                title={nextEntry ? `Next entry: ${nextEntry.name || 'Unnamed entry'}` : 'Next entry'}
                aria-label={nextEntry ? `Next entry: ${nextEntry.name || 'Unnamed entry'}` : 'Next entry'}
              >
                <span>{nextEntry?.name || 'Next'}</span>
                <i className="ti ti-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <button
              className={`lorebook-edit-btn${activeEntry.pinned ? ' active' : ''}`}
              title={activeEntry.pinned ? 'Unpin entry' : 'Pin entry'}
              aria-label={activeEntry.pinned ? 'Unpin entry' : 'Pin entry'}
              aria-pressed={activeEntry.pinned === true}
              onClick={() => onToggleEntryPinned(cat.id, activeEntry.id, !activeEntry.pinned)}
            >
              <i className={`ti ${activeEntry.pinned ? 'ti-star-filled' : 'ti-star'}`} aria-hidden="true" />
            </button>
            <button className="lorebook-edit-btn" onClick={() => onEditEntry(activeEntry)}>
              <i className="ti ti-pencil" aria-hidden="true" />
            </button>
            <button className="lorebook-delete-btn" onClick={() => onDeleteEntryRequest(activeEntry)}>
              <i className="ti ti-trash" aria-hidden="true" />
            </button>
          </div>
          <div id="lorebook-entry-view-scroll">
            <div id="lorebook-entry-view">
              <div className="lorebook-entry-view-title">{activeEntry.name || 'Unnamed entry'}</div>
              {activeEntry.subcategoryId && subcategoryIds.has(activeEntry.subcategoryId) && (
                <div className="lorebook-entry-field">
                  <span className="lorebook-field-label">Subcategory</span>
                  <span className="lorebook-field-value">
                    {subcategories.find(subcategory => subcategory.id === activeEntry.subcategoryId)?.name ?? 'Uncategorized'}
                  </span>
                </div>
              )}
              {activeEntry.keywords && activeEntry.keywords.length > 0 && (
                <div className="lorebook-entry-field">
                  <span className="lorebook-field-label">Keywords</span>
                  <span className="lorebook-field-value">{activeEntry.keywords.join(', ')}</span>
                </div>
              )}
              {activeFields.map(field => {
                if (field.type === 'divider') {
                  return <div key={field.id} className="lorebook-entry-divider" />
                }
                const value = activeEntry.fields[field.id] ?? ''
                if (!value) return null
                if (field.type === 'image') {
                  const path = getLoreImagePath(value)
                  if (!path) return null
                  const fullWidth = getLoreImageFullWidth(value)
                  const showOriginal = getLoreImageIgnoreEntryCrop(value)
                  const displayPath = showOriginal ? path : getLoreImageDisplayPath(value)
                  const src = getProjectImageSrc(displayPath)
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <button
                        type="button"
                        className={`lorebook-entry-image-button${fullWidth ? ' full-width' : ''}`}
                        onClick={() => openImageViewer(src, field.label ?? activeEntry.name ?? 'image')}
                      >
                        <img
                          src={src}
                          className="lorebook-entry-image"
                          alt={field.label ?? 'image'}
                        />
                      </button>
                    </div>
                  )
                }
                const textValue = getLoreFieldText(value)
                if (!textValue) return null
                return (
                  <div key={field.id} className="lorebook-entry-field">
                    <span className="lorebook-field-label">{field.label}</span>
                    <span className="lorebook-field-value">{textValue}</span>
                  </div>
                )
              })}
              <div className="lorebook-backlinks">
                <div className="lorebook-backlinks-heading">
                  <i className="ti ti-link" aria-hidden="true" />
                  <span>Scene mentions</span>
                  <span className="lorebook-backlinks-count">{entryBacklinks.length}</span>
                </div>
                {entryBacklinks.length > 0 ? (
                  <div className="lorebook-backlinks-list">
                    {visibleBacklinks.map(link => (
                      <button
                        key={`${activeEntry.id}:${link.sceneId}`}
                        type="button"
                        className="lorebook-backlink"
                        onClick={() => onOpenScene(link.sceneId)}
                      >
                        <span className="lorebook-backlink-title">
                          {link.sceneTitle}
                          {link.matchCount > 1 && (
                            <span className="lorebook-backlink-repeat">x{link.matchCount}</span>
                          )}
                        </span>
                        <span className="lorebook-backlink-tab">{link.tabName}</span>
                        <span className="lorebook-backlink-excerpt">{link.excerpt}</span>
                      </button>
                    ))}
                    {hiddenBacklinkCount > 0 && (
                      <button
                        type="button"
                        className="lorebook-backlinks-show-more"
                        onClick={() => setVisibleBacklinkCounts(counts => ({
                          ...counts,
                          [activeEntry.id]: visibleBacklinkCount + BACKLINK_PAGE_SIZE,
                        }))}
                      >
                        Show {Math.min(BACKLINK_PAGE_SIZE, hiddenBacklinkCount)} more
                        <span>{hiddenBacklinkCount.toLocaleString()} remaining</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lorebook-backlinks-empty">No scene mentions found.</div>
                )}
              </div>
            </div>
          </div>
        </div>
        {imageViewerModal}
        </>
      )
    }

    return (
      <div id="lorebook-view">
        <div id="lorebook-category-header">
          <button className="lorebook-back-btn" onClick={() => onLoreViewChange('home')}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          {renderCategoryBreadcrumb(false)}
          <button className="lorebook-edit-btn" onClick={() => onEditCategory(cat)}>
            <i className="ti ti-edit" aria-hidden="true" />
          </button>
          <button className="lorebook-delete-btn" onClick={() => onDeleteCategoryRequest(cat)}>
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        </div>
        <div id="lorebook-entries">
          {entryGroups.map(group => (
            <div key={group.id} className={`lorebook-entry-group lorebook-entry-group-${group.color}`}>
              <div className="lorebook-entry-group-heading">{group.name}</div>
              {group.entries.map(entry => {
                const previewImage = activeFields
                  .filter(field => field.type === 'image')
                  .map(field => entry.fields[field.id])
                  .find(value => Boolean(getLoreImagePath(value)))
                const previewPath = getLoreImageDisplayPath(previewImage)
                return (
                  <div
                    key={entry.id}
                    className="lorebook-entry-card lorebook-entry-list-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => openEntry(entry.id)}
                    onKeyDown={event => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      openEntry(entry.id)
                    }}
                  >
                    <div className="lorebook-entry-card-header">
                      <span className={`lorebook-entry-thumbnail${previewPath ? ' has-image' : ''}`} aria-hidden="true">
                        {previewPath && (
                          <img
                            src={getProjectImageSrc(previewPath)}
                            alt=""
                            draggable={false}
                          />
                        )}
                      </span>
                      <span className="lorebook-entry-name">{entry.name}</span>
                      <span
                        className={`lorebook-entry-actions${entry.pinned ? ' has-pinned' : ''}`}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className={entry.pinned ? 'active' : ''}
                          title={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                          aria-label={entry.pinned ? 'Unpin entry' : 'Pin entry'}
                          aria-pressed={entry.pinned === true}
                          onClick={() => onToggleEntryPinned(cat.id, entry.id, !entry.pinned)}
                        >
                          <i className={`ti ${entry.pinned ? 'ti-star-filled' : 'ti-star'}`} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onEditEntry(entry)}>
                          <i className="ti ti-pencil" aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => onDeleteEntryRequest(entry)}>
                          <i className="ti ti-trash" aria-hidden="true" />
                        </button>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          <button className="lorebook-add-entry-btn" onClick={onNewEntry}>
            <i className="ti ti-plus" aria-hidden="true" /> Add entry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div id="lorebook-view">
      <div id="lorebook-home">
        <div id="lorebook-home-inner">
          <div className="lorebook-home-tools">
            <button
              type="button"
              className="lorebook-presence-btn"
              onClick={onOpenPresence}
              title="See which chapters mention each entry"
            >
              <i className="ti ti-chart-dots" aria-hidden="true" />
              <span>Presence Chart</span>
            </button>
          </div>
          {pinnedEntries.length > 0 && (
            <div className="lorebook-pinned-section">
              <div className="lorebook-pinned-heading">
                <i className="ti ti-star-filled" aria-hidden="true" />
                <span>Pinned</span>
              </div>
              <div className="lorebook-pinned-strip">
                {pinnedEntries.map(({ category, entry }) => {
                  const keywords = entry.keywords?.slice(0, 3) ?? []
                  const pinnedImage = category.template
                    .filter(field => !field.removed && field.type === 'image')
                    .map(field => entry.fields[field.id])
                    .find(value => Boolean(getLoreImagePath(value)))
                  const pinnedImageDisplayPath = getLoreImageDisplayPath(pinnedImage)
                  return (
                    <div
                      key={`${category.id}:${entry.id}`}
                      className="lorebook-pinned-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onActiveCategoryChange(category.id)
                        openEntry(entry.id)
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        onActiveCategoryChange(category.id)
                        openEntry(entry.id)
                      }}
                      title={`${entry.name || 'Unnamed entry'} - ${category.name}`}
                    >
                      <span className={`lorebook-pinned-image${pinnedImageDisplayPath ? ' has-image' : ''}`} aria-hidden="true">
                        {pinnedImageDisplayPath && (
                          <img
                            src={getProjectImageSrc(pinnedImageDisplayPath)}
                            alt=""
                            draggable={false}
                          />
                        )}
                      </span>
                      <span className="lorebook-pinned-name">{entry.name || 'Unnamed entry'}</span>
                      <span className="lorebook-pinned-category">{category.name}</span>
                      {keywords.length > 0 && (
                        <span className="lorebook-pinned-keywords">{keywords.join(', ')}</span>
                      )}
                      <button
                        type="button"
                        className="lorebook-pinned-unpin"
                        title="Unpin entry"
                        aria-label={`Unpin ${entry.name || 'entry'}`}
                        onClick={event => {
                          event.stopPropagation()
                          onToggleEntryPinned(category.id, entry.id, false)
                        }}
                      >
                        <i className="ti ti-star-filled" aria-hidden="true" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div id="lorebook-categories">
            {sortedCategories.map(cat => (
              <div
                key={cat.id}
                className="lorebook-category-btn"
                onClick={() => { onActiveCategoryChange(cat.id); onLoreViewChange('category') }}
              >
                <span>{cat.name.toUpperCase()}</span>
                <button
                  className="lorebook-category-edit-icon"
                  title="Edit template"
                  onClick={e => { e.stopPropagation(); onEditCategory(cat) }}
                >
                  <i className="ti ti-edit" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button className="lorebook-add-category-btn" onClick={onNewCategory}>
              <i className="ti ti-plus" aria-hidden="true" />
              <span>Create new category...</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
