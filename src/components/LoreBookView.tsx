import { convertFileSrc } from '@tauri-apps/api/core'
import { useEffect, useState } from 'react'
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
}: LoreBookViewProps) {
  const [visibleBacklinkCounts, setVisibleBacklinkCounts] = useState<Record<string, number>>({})
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
        entries: sortedEntries.filter(entry => entry.subcategoryId === subcategory.id),
      })),
      {
        id: '__uncategorized__',
        name: 'Uncategorized',
        entries: sortedEntries.filter(entry => !entry.subcategoryId || !subcategoryIds.has(entry.subcategoryId)),
      },
    ].filter(group => group.entries.length > 0)
    const activeFields = cat.template.filter(f => !f.removed)
    const activeEntry = expandedEntryId ? cat.entries.find(entry => entry.id === expandedEntryId) ?? null : null

    if (loreView === 'entry') {
      if (!activeEntry) {
        return (
          <div id="lorebook-view">
            <div id="lorebook-category-header">
              <button className="lorebook-back-btn" onClick={() => onLoreViewChange('category')}>
                <i className="ti ti-arrow-left" aria-hidden="true" />
              </button>
              <span id="lorebook-category-title">{cat.name}</span>
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

      return (
        <div id="lorebook-view">
          <div id="lorebook-category-header">
            <button className="lorebook-back-btn" onClick={() => onLoreViewChange('category')}>
              <i className="ti ti-arrow-left" aria-hidden="true" />
            </button>
            <span id="lorebook-category-title">{cat.name}</span>
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
                  return (
                    <div key={field.id} className="lorebook-entry-field">
                      {field.label && <span className="lorebook-field-label">{field.label}</span>}
                      <img
                        src={projectPath ? convertFileSrc(`${projectPath}/${value}`.replace(/\\/g, '/')) : ''}
                        className="lorebook-entry-image"
                        alt={field.label ?? 'image'}
                      />
                    </div>
                  )
                }
                return (
                  <div key={field.id} className="lorebook-entry-field">
                    <span className="lorebook-field-label">{field.label}</span>
                    <span className="lorebook-field-value">{value}</span>
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
      )
    }

    return (
      <div id="lorebook-view">
        <div id="lorebook-category-header">
          <button className="lorebook-back-btn" onClick={() => onLoreViewChange('home')}>
            <i className="ti ti-arrow-left" aria-hidden="true" />
          </button>
          <span id="lorebook-category-title">{cat.name}</span>
          <button className="lorebook-edit-btn" onClick={() => onEditCategory(cat)}>
            <i className="ti ti-edit" aria-hidden="true" />
          </button>
          <button className="lorebook-delete-btn" onClick={() => onDeleteCategoryRequest(cat)}>
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        </div>
        <div id="lorebook-entries">
          {entryGroups.map(group => (
            <div key={group.id} className="lorebook-entry-group">
              <div className="lorebook-entry-group-heading">{group.name}</div>
              {group.entries.map(entry => (
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
                  <i className="ti ti-chevron-right lorebook-entry-chevron" aria-hidden="true" />
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
              ))}
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
          {pinnedEntries.length > 0 && (
            <div className="lorebook-pinned-section">
              <div className="lorebook-pinned-heading">
                <i className="ti ti-star-filled" aria-hidden="true" />
                <span>Pinned</span>
              </div>
              <div className="lorebook-pinned-strip">
                {pinnedEntries.map(({ category, entry }) => {
                  const keywords = entry.keywords?.slice(0, 3) ?? []
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
