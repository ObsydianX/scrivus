import { convertFileSrc } from '@tauri-apps/api/core'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import {
  getLoreFieldText,
  getLoreEntryIconPath,
  shouldHideLoreImageInEntry,
  getLoreImageDisplayPath,
  getLoreImageFullWidth,
  getLoreImageIgnoreEntryCrop,
  getLoreImagePath,
  getLoreListItems,
} from '../loreImages'
import type { LoreBook, LoreCategory, LoreEntry, LoreHierarchyDisplay, LoreHierarchyElementType, LoreHierarchyNameFormat, LoreSubcategory } from '../types'
import type { LoreBacklink } from '../loreBacklinks'
import { renderProjectExpressions, type ProjectVariables } from '../projectExpressions'
import { orderLoreSubcategories } from '../loreSubcategories'
import { formatLoreEntryName } from '../loreEntryNames'
import { getDerivedLoreValue } from '../loreDerived'
import { orderLoreEntriesByParent } from '../loreEntryParents'
import { getLoreCategoryIconClass } from '../loreCategoryIcons'
import { LoreEntryIcon } from './LoreEntryIcon'

function LorePinIcon({ pinned = true }: { pinned?: boolean }) {
  return <svg className="lore-pin-icon" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91L12 3Z" />
  </svg>
}

const BACKLINK_PAGE_SIZE = 24

type LoreBookViewProps = {
  loreBook: LoreBook
  loreView: 'home' | 'category' | 'entry'
  activeCategoryId: string | null
  expandedEntryId: string | null
  projectPath: string | null
  backlinks: Record<string, LoreBacklink[]>
  variables: ProjectVariables
  onLoreViewChange: (view: 'home' | 'category' | 'entry') => void
  onActiveCategoryChange: (categoryId: string | null) => void
  onExpandedEntryChange: (entryId: string | null) => void
  onNewCategory: () => void
  onEditCategory: (category: LoreCategory) => void
  onUpdateCategory: (category: LoreCategory) => void
  onDeleteCategoryRequest: (category: LoreCategory) => void
  onNewEntry: () => void
  onEditEntry: (entry: LoreEntry) => void
  onExportEntry: (category: LoreCategory, entry: LoreEntry) => void
  onDeleteEntryRequest: (entry: LoreEntry) => void
  onToggleEntryPinned: (categoryId: string, entryId: string, pinned: boolean) => void
  onOpenScene: (id: number) => void
  onOpenPresence: () => void
}

export function LoreBookView(props: LoreBookViewProps) {
  const [hierarchyCategoryId, setHierarchyCategoryId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [subcategoryFilter, setSubcategoryFilter] = useState<{ categoryId: string; id: string } | null>(null)
  const categories = [...props.loreBook.categories].sort((a, b) => a.name.localeCompare(b.name))
  const category = categories.find(item => item.id === props.activeCategoryId) ?? categories[0]
  const hierarchyCategory = categories.find(item => item.id === hierarchyCategoryId)
  const canShowHierarchy = Boolean(category?.subcategories?.some(sub => sub.parentId && category.subcategories?.some(parent => parent.id === sub.parentId)))
  const subcategoryId = subcategoryFilter?.categoryId === category?.id ? subcategoryFilter?.id : null
  const search = query.trim().toLocaleLowerCase()

  // Keep creation and template actions scoped to the category shown on first opening.
  useEffect(() => {
    if (category && props.activeCategoryId !== category.id) props.onActiveCategoryChange(category.id)
  }, [category?.id, props.activeCategoryId, props.onActiveCategoryChange])

  const selectEntry = (cat: LoreCategory, entry: LoreEntry) => {
    props.onActiveCategoryChange(cat.id)
    props.onExpandedEntryChange(entry.id)
    props.onLoreViewChange('entry')
  }
  const selectCategory = (cat: LoreCategory, subcategory: string | null = null) => {
    setQuery('')
    setSubcategoryFilter(subcategory ? { categoryId: cat.id, id: subcategory } : null)
    props.onActiveCategoryChange(cat.id)
    const entry = [...cat.entries].sort((a, b) => a.name.localeCompare(b.name))
      .find(item => !subcategory || item.subcategoryId === subcategory)
    props.onExpandedEntryChange(entry?.id ?? null)
    props.onLoreViewChange(entry ? 'entry' : 'category')
  }
  const pinned = categories.flatMap(cat => cat.entries.filter(entry => entry.pinned).map(entry => ({ cat, entry })))
  const groups = (search ? categories : category ? [category] : []).flatMap(cat => {
    const subcategories = orderLoreSubcategories(cat.subcategories ?? [])
    return [...subcategories.map(sub => ({ id: sub.id, name: sub.name, depth: sub.depth, color: sub.color ?? 'default' })),
      { id: '', name: 'Uncategorized', depth: 0, color: 'default' }].map(sub => ({
      ...sub,
      cat,
      entries: [...cat.entries].filter(entry => {
        const groupId = subcategories.some(item => item.id === entry.subcategoryId) ? entry.subcategoryId : ''
        return groupId === sub.id && (search
          ? `${formatLoreEntryName(entry)} ${entry.keywords?.join(' ') ?? ''}`.toLocaleLowerCase().includes(search)
          : !subcategoryId || entry.subcategoryId === subcategoryId)
      }).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter(group => group.entries.length)
  })
  const selectedEntry = category?.entries.find(entry => entry.id === props.expandedEntryId)
    ?? category?.entries[0]

  return (
    <div className="lore-workspace">
      <nav className="lore-category-rail" aria-label="Lore Book categories">
        <label className="lore-search"><i className="ti ti-search" aria-hidden="true" />
          <input aria-label="Search all lore by name or keyword" placeholder="Search all lore…" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        {pinned.length > 0 && <section><h2>Pinned</h2>{pinned.map(({ cat, entry }) => (
          <button key={`${cat.id}:${entry.id}`} className="lore-nav-row" onClick={() => selectEntry(cat, entry)}>
            <LoreEntryIcon category={cat} entry={entry} projectPath={props.projectPath} /><span>{formatLoreEntryName(entry)}</span>
          </button>
        ))}</section>}
        <section><h2>Categories</h2>{categories.map(cat => (
          <div key={cat.id}>
            <button className={`lore-nav-row${cat.id === category?.id && !subcategoryId ? ' active' : ''}`} aria-current={cat.id === category?.id && !subcategoryId ? 'true' : undefined} onClick={() => selectCategory(cat)}>
              <i className={`ti ${getLoreCategoryIconClass(cat.icon) || 'ti-folder'}`} aria-hidden="true" /><span>{cat.name || 'Unnamed category'}</span><small>{cat.entries.length}</small>
            </button>
            {cat.id === category?.id && orderLoreSubcategories(cat.subcategories ?? []).map(sub => (
              <button key={sub.id} className={`lore-nav-row lore-subcategory lore-subcategory-color-${sub.color ?? 'default'}${subcategoryId === sub.id ? ' active' : ''}`} style={{ paddingLeft: 28 + sub.depth * 12 }} aria-current={subcategoryId === sub.id ? 'true' : undefined} onClick={() => selectCategory(cat, sub.id)}>
                <span className="lore-subcategory-dot" aria-hidden="true" />
                <span>{sub.name || 'Unnamed subcategory'}</span><small>{cat.entries.filter(entry => entry.subcategoryId === sub.id).length}</small>
              </button>
            ))}
          </div>
        ))}
          <button className="lore-nav-row lore-add" onClick={props.onNewCategory}><i className="ti ti-plus" aria-hidden="true" />New category</button>
        </section>
        <section><h2>Views</h2><button className="lore-nav-row" onClick={props.onOpenPresence}><i className="ti ti-chart-bar" aria-hidden="true" />Presence chart</button></section>
      </nav>
      <section className="lore-entry-browser" aria-label="Lore entries">
        <header><h2>{search ? 'Search results' : category?.name || 'Entries'}</h2>{category && <>
          <button title="Edit category" aria-label="Edit category" onClick={() => props.onEditCategory(category)}><i className="ti ti-edit" aria-hidden="true" /></button>
          <button title={canShowHierarchy ? 'Show hierarchy' : 'Hierarchy requires nested subcategories'} aria-label="Show hierarchy" disabled={!canShowHierarchy} onClick={() => setHierarchyCategoryId(category.id)}><i className="ti ti-hierarchy" aria-hidden="true" /></button>
          <button className="lore-add-entry" title="Add entry" aria-label="Add entry" onClick={props.onNewEntry}><i className="ti ti-plus" aria-hidden="true" /></button>
        </>}</header>
        <div className="lore-entry-browser-scroll">
          {groups.map(group => <section key={`${group.cat.id}:${group.id}`} className={`lorebook-entry-group-${group.color}`}>
            <h3><span className="lore-subcategory-dot" aria-hidden="true" />{search ? `${group.cat.name} / ` : ''}{group.name}</h3>
            {group.entries.map(entry => <button key={entry.id} className={`lore-entry-row${entry.id === selectedEntry?.id && group.cat.id === category?.id ? ' active' : ''}`} aria-current={entry.id === selectedEntry?.id && group.cat.id === category?.id ? 'true' : undefined} onClick={() => selectEntry(group.cat, entry)}>
              <LoreEntryIcon category={group.cat} entry={entry} projectPath={props.projectPath} />
              <span><strong>{formatLoreEntryName(entry)}</strong><small>{entry.keywords?.join(' · ') || group.name}</small></span>
              {entry.pinned && <span role="img" aria-label="Pinned"><LorePinIcon /></span>}
            </button>)}
          </section>)}
          {!groups.length && <p className="lore-browser-empty">{search ? 'No entries match this search.' : 'No entries here yet. Add an entry to get started.'}</p>}
        </div>
        {category && <footer className="lore-category-footer">
          <button type="button" className="lore-delete-category" onClick={() => props.onDeleteCategoryRequest(category)}>
            <i className="ti ti-trash" aria-hidden="true" />Delete category
          </button>
        </footer>}
      </section>
      <div className="lore-detail-pane">
        {category && selectedEntry ? <LoreBookContent {...props} activeCategoryId={category.id} expandedEntryId={selectedEntry.id} loreView="entry" /> : <div className="lore-detail-empty"><h2>{category ? category.name : 'Lore Book'}</h2><p>{category ? 'Add an entry to begin building this category.' : 'Create a category to begin your Lore Book.'}</p><button className="lorebook-add-entry-btn" onClick={category ? props.onNewEntry : props.onNewCategory}>{category ? 'Add entry' : 'New category'}</button></div>}
      </div>
      {hierarchyCategory && <LoreHierarchyModal category={hierarchyCategory} projectPath={props.projectPath} onOpenEntry={entryId => {
        const entry = hierarchyCategory.entries.find(entry => entry.id === entryId)
        if (entry) selectEntry(hierarchyCategory, entry)
        setHierarchyCategoryId(null)
      }} onSaveCategory={props.onUpdateCategory} onClose={() => setHierarchyCategoryId(null)} />}
    </div>
  )
}

function LoreBookContent({
  loreBook,
  loreView,
  activeCategoryId,
  expandedEntryId,
  projectPath,
  backlinks,
  variables,
  onLoreViewChange,
  onActiveCategoryChange,
  onExpandedEntryChange,
  onNewCategory,
  onEditCategory,
  onUpdateCategory,
  onDeleteCategoryRequest,
  onNewEntry,
  onEditEntry,
  onExportEntry,
  onDeleteEntryRequest,
  onToggleEntryPinned,
  onOpenScene,
  onOpenPresence,
}: LoreBookViewProps) {
  const [visibleBacklinkCounts, setVisibleBacklinkCounts] = useState<Record<string, number>>({})
  const [imageViewer, setImageViewer] = useState<{ src: string; alt: string } | null>(null)
  const [viewerZoom, setViewerZoom] = useState(1)
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 })
  const [hierarchyCategory, setHierarchyCategory] = useState<LoreCategory | null>(null)
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
    const hasEntryParents = cat.template.some(field => !field.removed && field.type === 'child-of')
    const entryDepths = new Map<string, number>()
    const orderEntryGroup = (entries: LoreEntry[]) => (hasEntryParents
      ? orderLoreEntriesByParent(entries)
      : entries.map(entry => ({ entry, depth: 0 }))).map(item => {
      entryDepths.set(item.entry.id, item.depth)
      return item.entry
    })
    const entryGroups = [
      ...orderLoreSubcategories(subcategories).map(subcategory => ({
        id: subcategory.id,
        name: subcategory.name || 'Unnamed subcategory',
        color: subcategory.color ?? 'default',
        depth: subcategory.depth,
        entries: orderEntryGroup(sortedEntries.filter(entry => entry.subcategoryId === subcategory.id)),
      })),
      {
        id: '__uncategorized__',
        name: 'Uncategorized',
        color: 'default',
        depth: 0,
        entries: orderEntryGroup(sortedEntries.filter(entry => !entry.subcategoryId || !subcategoryIds.has(entry.subcategoryId))),
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
              {getLoreCategoryIconClass(cat.icon) && <i className={`ti ${getLoreCategoryIconClass(cat.icon)} lorebook-category-icon`} aria-hidden="true" />}
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
      const mentionCount = entryBacklinks.reduce((total, link) => total + link.matchCount, 0)
      const visibleBacklinkCount = Math.min(
        entryBacklinks.length,
        visibleBacklinkCounts[activeEntry.id] ?? BACKLINK_PAGE_SIZE
      )
      const visibleBacklinks = entryBacklinks.slice(0, visibleBacklinkCount)
      const hiddenBacklinkCount = entryBacklinks.length - visibleBacklinkCount
      const iconImagePath = getLoreEntryIconPath(cat, activeEntry)
        ? getLoreImagePath(activeEntry.fields[activeEntry.entryIconFieldId!]) : ''
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
          <div id="lorebook-entry-view-scroll">
            <div id="lorebook-entry-view">
              <header className="lore-entry-hero">
                {iconImagePath && projectPath ? <button
                  type="button" className="lore-entry-icon-button"
                  title="View full image" aria-label={`View full image for ${formatLoreEntryName(activeEntry)}`}
                  onClick={() => openImageViewer(getProjectImageSrc(iconImagePath), formatLoreEntryName(activeEntry))}
                ><LoreEntryIcon category={cat} entry={activeEntry} projectPath={projectPath} large /></button>
                  : <LoreEntryIcon category={cat} entry={activeEntry} projectPath={projectPath} large />}
                <div className="lore-entry-heading">
                  <div className="lore-entry-location">{cat.name}{activeEntry.subcategoryId && subcategoryIds.has(activeEntry.subcategoryId) ? ` / ${subcategories.find(subcategory => subcategory.id === activeEntry.subcategoryId)?.name}` : ''}</div>
                  <h1 className="lorebook-entry-view-title">{formatLoreEntryName(activeEntry)}</h1>
                  <div className="lore-entry-chips">
                    {!!activeEntry.keywords?.length && <span title="Keywords">{activeEntry.keywords.join(' · ')}</span>}
                  </div>
                </div>
                <div className="lore-entry-actions" role="group" aria-label="Entry actions">
                  <button type="button" className={activeEntry.pinned ? 'active' : ''} title={activeEntry.pinned ? 'Unpin entry' : 'Pin entry'} aria-label={activeEntry.pinned ? 'Unpin entry' : 'Pin entry'} aria-pressed={activeEntry.pinned === true} onClick={() => onToggleEntryPinned(cat.id, activeEntry.id, !activeEntry.pinned)}><LorePinIcon pinned={activeEntry.pinned === true} /></button>
                  <button type="button" onClick={() => onEditEntry(activeEntry)}>Edit</button>
                  <button type="button" disabled={!previousEntry} title={previousEntry ? `Previous entry: ${formatLoreEntryName(previousEntry)}` : 'Previous entry'} aria-label="Previous entry" onClick={() => previousEntry && openEntry(previousEntry.id)}><i className="ti ti-chevron-left" aria-hidden="true" /></button>
                  <button type="button" disabled={!nextEntry} title={nextEntry ? `Next entry: ${formatLoreEntryName(nextEntry)}` : 'Next entry'} aria-label="Next entry" onClick={() => nextEntry && openEntry(nextEntry.id)}><i className="ti ti-chevron-right" aria-hidden="true" /></button>
                  <button type="button" title="Export entry" aria-label="Export entry" onClick={() => onExportEntry(cat, activeEntry)}><i className="ti ti-file-export" aria-hidden="true" /></button>
                  <button type="button" className="lore-entry-delete" title="Delete entry" aria-label="Delete entry" onClick={() => onDeleteEntryRequest(activeEntry)}><i className="ti ti-trash" aria-hidden="true" /></button>
                </div>
              </header>
              <div className="lore-entry-columns">
              <div className="lore-entry-fields">
              {activeFields.map(field => {
                if (field.type === 'divider') {
                  return <div key={field.id} className="lorebook-entry-divider" />
                }
                if (field.type === 'header') {
                  return field.label ? <div key={field.id} className="lorebook-entry-header">{field.label}</div> : null
                }
                if (field.type === 'derived') {
                  const derivedValue = getDerivedLoreValue(cat.template, field, activeEntry)
                  if (!derivedValue.trim()) return null
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <span className="lorebook-field-value">{renderProjectExpressions(derivedValue, variables)}</span>
                    </div>
                  )
                }
                const value = activeEntry.fields[field.id] ?? ''
                if (!value) return null
                if (field.type === 'image') {
                  if (shouldHideLoreImageInEntry(activeEntry, field.id)) return null
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
                        onClick={() => openImageViewer(getProjectImageSrc(path), field.label ?? activeEntry.name ?? 'image')}
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
                if (field.type === 'list') {
                  const items = getLoreListItems(value).filter(item => item.trim())
                  if (items.length === 0) return null
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <ul className="lorebook-field-list">
                        {items.map((item, index) => <li key={index}>{renderProjectExpressions(item, variables)}</li>)}
                      </ul>
                    </div>
                  )
                }
                if (field.type === 'selection') {
                  const selectedId = getLoreFieldText(value)
                  const selected = (field.options ?? []).find(option => option.id === selectedId)
                  if (!selected?.label.trim()) return null
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <span className="lorebook-field-value">{selected.label}</span>
                    </div>
                  )
                }
                if (field.type === 'multi-selection') {
                  const selectedIds = getLoreListItems(value)
                  const labels = (field.options ?? [])
                    .filter(option => selectedIds.includes(option.id) && option.label.trim())
                    .map(option => option.label)
                  if (labels.length === 0) return null
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <span className="lorebook-field-value">{labels.join(', ')}</span>
                    </div>
                  )
                }
                const textValue = getLoreFieldText(value)
                if (!textValue) return null
                return (
                  <div key={field.id} className="lorebook-entry-field">
                    <span className="lorebook-field-label">{field.label}</span>
                    <span className={`lorebook-field-value${field.type === 'textarea' ? ' description-box' : ''}${field.type === 'textarea' && field.heightMode === 'content' ? ' auto-height' : ''}`}>
                      {renderProjectExpressions(textValue, variables)}
                    </span>
                  </div>
                )
              })}
              </div>
              <aside className="lore-entry-mentions" aria-label="Scene mentions">
              <div className="lore-mentions-stat">
                <strong>{mentionCount.toLocaleString()}</strong>
                <span>{`${mentionCount === 1 ? 'mention' : 'mentions'} · in ${entryBacklinks.length.toLocaleString()} ${entryBacklinks.length === 1 ? 'scene' : 'scenes'}`}</span>
              </div>
              <div className="lorebook-backlinks">
                <div className="lorebook-backlinks-heading">
                  <i className="ti ti-link" aria-hidden="true" />
                  <span>Scene mentions</span>
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
              </aside>
              </div>
            </div>
          </div>
        </div>
        {imageViewerModal}
        </>
      )
    }

    const hasHierarchy = subcategories.some(subcategory =>
      Boolean(subcategory.parentId && subcategoryIds.has(subcategory.parentId))
    )

    return (
      <>
      <div id="lorebook-view">
        <div id="lorebook-category-header">
          <button className="lorebook-back-btn" onClick={() => onLoreViewChange('home')}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          {renderCategoryBreadcrumb(false)}
          <button className="lorebook-edit-btn" title="Edit category" aria-label="Edit category" onClick={() => onEditCategory(cat)}>
            <i className="ti ti-edit" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="lorebook-hierarchy-btn"
            disabled={!hasHierarchy}
            onClick={() => setHierarchyCategory(cat)}
            title={hasHierarchy ? 'Hierarchy' : 'Hierarchy requires a Child of relationship'}
            aria-label="Hierarchy"
          >
            <i className="ti ti-ai-agent" aria-hidden="true" />
          </button>
          <button className="lorebook-delete-btn" title="Delete category" aria-label="Delete category" onClick={() => onDeleteCategoryRequest(cat)}>
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        </div>
        <div id="lorebook-entries">
          <div className="lorebook-entries-inner">
            {entryGroups.map(group => (
            <div
              key={group.id}
              className={`lorebook-entry-group lorebook-entry-group-${group.color}`}
              style={{ '--lore-subcategory-depth': group.depth } as CSSProperties}
            >
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
                    className={`lorebook-entry-card lorebook-entry-list-item${(entryDepths.get(entry.id) ?? 0) > 0 ? ' child-entry' : ''}`}
                    style={{ '--lore-entry-depth': entryDepths.get(entry.id) ?? 0 } as CSSProperties}
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
                      <span className="lorebook-entry-name">{formatLoreEntryName(entry)}</span>
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
                          <LorePinIcon pinned={entry.pinned === true} />
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
          </div>
        </div>
        <div className="lorebook-entry-footer">
          <button className="lorebook-add-entry-btn" onClick={onNewEntry}>
            <i className="ti ti-plus" aria-hidden="true" /> Add entry
          </button>
        </div>
      </div>
      {hierarchyCategory && (
        <LoreHierarchyModal
          category={hierarchyCategory}
          projectPath={projectPath}
          onOpenEntry={entryId => {
            setHierarchyCategory(null)
            openEntry(entryId)
          }}
          onSaveCategory={category => {
            setHierarchyCategory(category)
            onUpdateCategory(category)
          }}
          onClose={() => setHierarchyCategory(null)}
        />
      )}
      </>
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
                <LorePinIcon />
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
                      title={`${formatLoreEntryName(entry)} - ${category.name}`}
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
                      <span className="lorebook-pinned-name">{formatLoreEntryName(entry)}</span>
                      <span className="lorebook-pinned-category">{category.name}</span>
                      {keywords.length > 0 && (
                        <span className="lorebook-pinned-keywords">{keywords.join(', ')}</span>
                      )}
                      <button
                        type="button"
                        className="lorebook-pinned-unpin"
                        title="Unpin entry"
                        aria-label={`Unpin ${formatLoreEntryName(entry)}`}
                        onClick={event => {
                          event.stopPropagation()
                          onToggleEntryPinned(category.id, entry.id, false)
                        }}
                      >
                        <LorePinIcon />
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
                {getLoreCategoryIconClass(cat.icon) && <i className={`ti ${getLoreCategoryIconClass(cat.icon)} lorebook-category-icon`} aria-hidden="true" />}
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

type LoreHierarchyNode = {
  subcategory: LoreSubcategory
  entries: LoreEntry[]
  children: LoreHierarchyNode[]
}

const HIERARCHY_ELEMENT_LABELS: Record<LoreHierarchyElementType, string> = {
  subcategory: 'Subcategory',
  image: 'Entry Picture',
  name: 'Entry Name',
}

const normalizeHierarchyDisplay = (display?: LoreHierarchyDisplay): LoreHierarchyDisplay => {
  const existing = new Map(display?.elements.map(element => [element.type, element.visible]) ?? [])
  const order = display?.elements.map(element => element.type) ?? []
  const types: LoreHierarchyElementType[] = [...order, ...(['subcategory', 'image', 'name'] as const).filter(type => !order.includes(type))]
  return {
    elements: types.map(type => ({ type, visible: existing.get(type) ?? true })),
    nameFormat: display?.nameFormat ?? 'name',
    imageFieldId: display?.imageFieldId,
    title: display?.title,
  }
}

function LoreHierarchyModal({
  category,
  projectPath,
  onOpenEntry,
  onSaveCategory,
  onClose,
}: {
  category: LoreCategory
  projectPath: string | null
  onOpenEntry: (entryId: string) => void
  onSaveCategory: (category: LoreCategory) => void
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const [customizing, setCustomizing] = useState(false)
  const [display, setDisplay] = useState(() => normalizeHierarchyDisplay(category.hierarchyDisplay))
  const [savedDisplay, setSavedDisplay] = useState(() => normalizeHierarchyDisplay(category.hierarchyDisplay))
  const viewportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const didAutoFitRef = useRef(false)
  const panRef = useRef<{ pointerId: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null)
  const suppressCardClickRef = useRef(false)
  const activeImageFields = category.template.filter(field => !field.removed && field.type === 'image')
  const nodes = useMemo(() => {
    const ordered = orderLoreSubcategories(category.subcategories ?? [])
    const nodeById = new Map<string, LoreHierarchyNode>()
    ordered.forEach(subcategory => nodeById.set(subcategory.id, {
      subcategory,
      entries: category.entries
        .filter(entry => entry.subcategoryId === subcategory.id)
        .sort((a, b) => a.name.localeCompare(b.name)),
      children: [],
    }))
    const roots: LoreHierarchyNode[] = []
    ordered.forEach(subcategory => {
      const node = nodeById.get(subcategory.id)!
      const parent = subcategory.parentId ? nodeById.get(subcategory.parentId) : undefined
      if (parent) parent.children.push(node)
      else roots.push(node)
    })
    return roots
  }, [category])

  useLayoutEffect(() => {
    if (didAutoFitRef.current) return
    const viewport = viewportRef.current
    const stage = stageRef.current
    if (!viewport || !stage) return
    didAutoFitRef.current = true
    const naturalWidth = stage.scrollWidth
    if (naturalWidth <= viewport.clientWidth) return
    const fitZoom = Math.floor((viewport.clientWidth / naturalWidth) * 20) / 20
    setZoom(Math.max(0.25, Math.min(1, fitZoom)))
  }, [])

  const imageForEntry = (entry: LoreEntry) => {
    const selectedField = activeImageFields.find(field => field.id === display.imageFieldId)
    const value = selectedField
      ? entry.fields[selectedField.id]
      : activeImageFields.map(field => entry.fields[field.id]).find(value => Boolean(getLoreImagePath(value)))
    const path = getLoreImageDisplayPath(value)
    return path && projectPath ? convertFileSrc(`${projectPath}/${path}`.replace(/\\/g, '/')) : ''
  }

  const hierarchyName = (entry: LoreEntry) => {
    const name = entry.name.trim() || 'Unnamed entry'
    const prefix = entry.prefix?.trim()
    const suffix = entry.suffix?.trim()
    if (display.nameFormat === 'prefix-name') return `${prefix ? `${prefix} ` : ''}${name}`
    if (display.nameFormat === 'name-suffix') return `${name}${suffix ? `, ${suffix}` : ''}`
    if (display.nameFormat === 'full') return formatLoreEntryName(entry)
    return name
  }

  const renderPersonElements = (entry: LoreEntry | null, subcategory: LoreSubcategory) => display.elements
    .filter(element => element.visible)
    .map(element => {
      if (element.type === 'subcategory') return (
        <div key="subcategory" className="lore-hierarchy-subcategory">{subcategory.name || 'Unnamed subcategory'}</div>
      )
      if (element.type === 'image') {
        const imageSrc = entry ? imageForEntry(entry) : ''
        return (
          <div key="image" className="lore-hierarchy-portrait">
            {imageSrc ? <img src={imageSrc} alt="" draggable={false} /> : <i className={`ti ${entry ? 'ti-user' : 'ti-user-question'}`} aria-hidden="true" />}
          </div>
        )
      }
      return <div key="name" className="lore-hierarchy-name">{entry ? hierarchyName(entry) : 'No assigned entry'}</div>
    })

  const renderNode = (node: LoreHierarchyNode) => (
    <li key={node.subcategory.id}>
      <div className={`lore-hierarchy-node lorebook-entry-group-${node.subcategory.color ?? 'default'}`}>
        <div className="lore-hierarchy-people">
          {node.entries.length > 0 ? node.entries.map(entry => (
            <button
              type="button"
              className="lore-hierarchy-person"
              key={entry.id}
              title={`Open ${entry.name || 'entry'}`}
              onClick={event => {
                event.stopPropagation()
                if (suppressCardClickRef.current) {
                  suppressCardClickRef.current = false
                  return
                }
                onOpenEntry(entry.id)
              }}
            >
              {renderPersonElements(entry, node.subcategory)}
            </button>
          )) : <div className="lore-hierarchy-person">{renderPersonElements(null, node.subcategory)}</div>}
        </div>
      </div>
      {node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
    </li>
  )

  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current
    if (!viewport || event.button !== 0) return
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop, moved: false }
  }

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId !== event.pointerId) return
    suppressCardClickRef.current = panRef.current.moved
    if (panRef.current.moved) window.setTimeout(() => { suppressCardClickRef.current = false }, 0)
    panRef.current = null
    viewportRef.current?.classList.remove('panning')
  }

  return (
    <div className="modal-overlay lore-hierarchy-overlay" style={{ zIndex: 175 }} onClick={onClose}>
      <div className="lore-hierarchy-modal" onClick={event => event.stopPropagation()}>
        <div className="lore-hierarchy-toolbar">
          <strong>{category.name} Hierarchy</strong>
          <div className="lore-hierarchy-zoom">
            <button type="button" onClick={() => setZoom(value => Math.max(0.25, value - 0.1))}><i className="ti ti-minus" /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom(value => Math.min(2, value + 0.1))}><i className="ti ti-plus" /></button>
            <button type="button" onClick={() => setZoom(1)} title="Reset zoom"><i className="ti ti-restore" /></button>
          </div>
          <div className="lore-hierarchy-toolbar-end">
            <button type="button" onClick={() => setCustomizing(true)} title="Customize hierarchy" aria-label="Customize hierarchy"><i className="ti ti-adjustments" /></button>
            <button type="button" className="lore-hierarchy-close" onClick={onClose} title="Close"><i className="ti ti-x" /></button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className="lore-hierarchy-viewport"
          onPointerDown={beginPan}
          onPointerMove={event => {
            const pan = panRef.current
            const viewport = viewportRef.current
            if (!pan || !viewport || pan.pointerId !== event.pointerId) return
            if (!pan.moved && (Math.abs(event.clientX - pan.x) > 4 || Math.abs(event.clientY - pan.y) > 4)) {
              pan.moved = true
              viewport.setPointerCapture(event.pointerId)
              viewport.classList.add('panning')
            }
            if (!pan.moved) return
            viewport.scrollLeft = pan.left - (event.clientX - pan.x)
            viewport.scrollTop = pan.top - (event.clientY - pan.y)
          }}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={event => {
            if (!event.ctrlKey) return
            event.preventDefault()
            setZoom(value => Math.min(2, Math.max(0.25, value + (event.deltaY < 0 ? 0.1 : -0.1))))
          }}
        >
          <div ref={stageRef} className="lore-hierarchy-stage" style={{ zoom }}>
            {display.title?.trim() && <div className="lore-hierarchy-title">{display.title.trim()}</div>}
            <ul className="lore-hierarchy-tree">{nodes.map(renderNode)}</ul>
          </div>
        </div>
        {customizing && (
          <div className="lore-hierarchy-customizer">
            <div className="lore-hierarchy-customizer-header">
              <div><strong>Customize Hierarchy</strong><small>Choose and arrange the information shown on every card.</small></div>
              <button type="button" onClick={() => { setDisplay(savedDisplay); setCustomizing(false) }}><i className="ti ti-x" /></button>
            </div>
            <div className="lore-hierarchy-customizer-body">
              <label className="lore-entry-label" htmlFor="lore-hierarchy-title">Hierarchy title</label>
              <input
                id="lore-hierarchy-title"
                className="modal-input"
                value={display.title ?? ''}
                onChange={event => setDisplay(current => ({ ...current, title: event.target.value }))}
                placeholder="Optional title"
              />
              <label className="lore-entry-label">Card elements</label>
              <div className="lore-hierarchy-element-list">
                {display.elements.map((element, index) => (
                  <div className="lore-hierarchy-element-row" key={element.type}>
                    <label><input type="checkbox" checked={element.visible} onChange={event => setDisplay(current => ({ ...current, elements: current.elements.map(item => item.type === element.type ? { ...item, visible: event.target.checked } : item) }))} />{HIERARCHY_ELEMENT_LABELS[element.type]}</label>
                    <span>
                      <button type="button" disabled={index === 0} title="Move up" onClick={() => setDisplay(current => { const elements = [...current.elements]; [elements[index - 1], elements[index]] = [elements[index], elements[index - 1]]; return { ...current, elements } })}><i className="ti ti-chevron-up" /></button>
                      <button type="button" disabled={index === display.elements.length - 1} title="Move down" onClick={() => setDisplay(current => { const elements = [...current.elements]; [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]]; return { ...current, elements } })}><i className="ti ti-chevron-down" /></button>
                    </span>
                  </div>
                ))}
              </div>
              <label className="lore-entry-label" htmlFor="lore-hierarchy-name-format">Entry name format</label>
              <select id="lore-hierarchy-name-format" className="modal-input" value={display.nameFormat} onChange={event => setDisplay(current => ({ ...current, nameFormat: event.target.value as LoreHierarchyNameFormat }))}>
                <option value="name">Entry Name</option>
                <option value="prefix-name">Prefix + Entry Name</option>
                <option value="name-suffix">Entry Name + Suffix</option>
                <option value="full">Prefix + Entry Name + Suffix</option>
              </select>
              {activeImageFields.length > 1 && (
                <>
                  <label className="lore-entry-label" htmlFor="lore-hierarchy-image-field">Entry picture field</label>
                  <select id="lore-hierarchy-image-field" className="modal-input" value={display.imageFieldId ?? ''} onChange={event => setDisplay(current => ({ ...current, imageFieldId: event.target.value || undefined }))}>
                    <option value="">First available image</option>
                    {activeImageFields.map(field => <option key={field.id} value={field.id}>{field.label || 'Unnamed image'}</option>)}
                  </select>
                </>
              )}
            </div>
            <div className="lore-hierarchy-customizer-footer">
              <button type="button" className="modal-btn" onClick={() => { setDisplay(savedDisplay); setCustomizing(false) }}>Cancel</button>
              <button type="button" className="modal-btn modal-btn-primary" onClick={() => {
                const normalized = { ...display, title: display.title?.trim() || undefined }
                setDisplay(normalized)
                setSavedDisplay(normalized)
                onSaveCategory({ ...category, hierarchyDisplay: normalized })
                setCustomizing(false)
              }}>Save</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
