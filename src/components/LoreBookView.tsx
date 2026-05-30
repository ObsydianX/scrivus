import { convertFileSrc } from '@tauri-apps/api/core'
import type { LoreBook, LoreCategory, LoreEntry } from '../types'

type LoreBookViewProps = {
  loreBook: LoreBook
  loreView: 'home' | 'category'
  activeCategoryId: string | null
  expandedEntryId: string | null
  projectPath: string | null
  onLoreViewChange: (view: 'home' | 'category') => void
  onActiveCategoryChange: (categoryId: string | null) => void
  onExpandedEntryChange: (entryId: string | null) => void
  onNewCategory: () => void
  onEditCategory: (category: LoreCategory) => void
  onDeleteCategoryRequest: (category: LoreCategory) => void
  onNewEntry: () => void
  onEditEntry: (entry: LoreEntry) => void
  onDeleteEntryRequest: (entry: LoreEntry) => void
}

export function LoreBookView({
  loreBook,
  loreView,
  activeCategoryId,
  expandedEntryId,
  projectPath,
  onLoreViewChange,
  onActiveCategoryChange,
  onExpandedEntryChange,
  onNewCategory,
  onEditCategory,
  onDeleteCategoryRequest,
  onNewEntry,
  onEditEntry,
  onDeleteEntryRequest,
}: LoreBookViewProps) {
  const sortedCategories = [...loreBook.categories].sort((a, b) => a.name.localeCompare(b.name))

  if (loreView === 'category') {
    const cat = loreBook.categories.find(c => c.id === activeCategoryId)
    if (!cat) return null
    const sortedEntries = [...cat.entries].sort((a, b) => a.name.localeCompare(b.name))
    const activeFields = cat.template.filter(f => !f.removed)

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
          {sortedEntries.map(entry => {
            const isExpanded = expandedEntryId === entry.id
            return (
              <div
                key={entry.id}
                className={`lorebook-entry-card${isExpanded ? ' expanded' : ' collapsed'}`}
              >
                <div
                  className="lorebook-entry-card-header"
                  onClick={() => onExpandedEntryChange(isExpanded ? null : entry.id)}
                >
                  <i className={`ti ti-chevron-${isExpanded ? 'down' : 'right'} lorebook-entry-chevron`} aria-hidden="true" />
                  <span className="lorebook-entry-name">{entry.name}</span>
                  <span className="lorebook-entry-actions" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onEditEntry(entry)}>
                      <i className="ti ti-pencil" aria-hidden="true" />
                    </button>
                    <button onClick={() => onDeleteEntryRequest(entry)}>
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </span>
                </div>
                {isExpanded && (
                  <div className="lorebook-entry-body">
                    {entry.keywords && entry.keywords.length > 0 && (
                      <div className="lorebook-entry-field">
                        <span className="lorebook-field-label">Keywords</span>
                        <span className="lorebook-field-value">{entry.keywords.join(', ')}</span>
                      </div>
                    )}
                    {activeFields.map(field => {
                      if (field.type === 'divider') {
                        return <div key={field.id} className="lorebook-entry-divider" />
                      }
                      const value = entry.fields[field.id] ?? ''
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
                  </div>
                )}
              </div>
            )
          })}
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
  )
}
