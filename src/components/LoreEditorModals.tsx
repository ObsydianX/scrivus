import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { createLoreImageValue, getLoreFieldText, getLoreImageCrop, getLoreImageFullWidth, getLoreImageIgnoreEntryCrop, getLoreImagePath } from '../loreImages'
import type { LoreCategory, LoreEntry, LoreFieldType, LoreImageCrop, LoreSubcategoryColor, LoreTemplateElement } from '../types'

const LORE_SUBCATEGORY_COLORS: { value: LoreSubcategoryColor; label: string }[] = [
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

export function LoreTemplateEditorModal({
  category,
  generateId,
  onCancel,
  onSave,
}: {
  category: LoreCategory | null
  generateId: () => string
  onCancel: () => void
  onSave: (category: LoreCategory) => void
}) {
  const [local, setLocal] = useState<LoreCategory | null>(category)
  const [templateDragIndex, setTemplateDragIndex] = useState<number | null>(null)
  const [templateDropIndex, setTemplateDropIndex] = useState<number | null>(null)
  const [subcategoryDragIndex, setSubcategoryDragIndex] = useState<number | null>(null)
  const [subcategoryDropIndex, setSubcategoryDropIndex] = useState<number | null>(null)
  const templateDragIndexRef = useRef<number | null>(null)
  const subcategoryDragIndexRef = useRef<number | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ fieldId: string; label: string } | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setLocal(category)
  }, [category])

  if (!local) return null

  const activeElements = local.template.filter(f => !f.removed)
  const removedElements = local.template.filter(f => f.removed)
  const subcategories = local.subcategories ?? []

  const addElement = (type: LoreFieldType) => {
    const newEl: LoreTemplateElement = {
      id: generateId(),
      type,
      label: type === 'divider' ? undefined : '',
      removed: false,
    }
    setLocal(prev => prev ? { ...prev, template: [...prev.template, newEl] } : prev)
  }

  const updateLabel = (id: string, label: string) => {
    setLocal(prev => prev ? {
      ...prev,
      template: prev.template.map(f => f.id === id ? { ...f, label } : f),
    } : prev)
  }

  const softRemove = (id: string) => {
    setLocal(prev => prev ? {
      ...prev,
      template: prev.template.map(f => f.id === id ? { ...f, removed: true } : f),
    } : prev)
  }

  const restore = (id: string) => {
    setLocal(prev => prev ? {
      ...prev,
      template: prev.template.map(f => f.id === id ? { ...f, removed: false } : f),
    } : prev)
  }

  const displayFieldLabel = (field: LoreTemplateElement) => {
    const label = field.label?.trim()
    if (label) return label
    return field.type === 'field' ? 'Unnamed field' :
      field.type === 'textarea' ? 'Unnamed description' :
        field.type === 'image' ? 'Unnamed image' :
          'Divider'
  }

  const hardDeleteField = (fieldId: string) => {
    setLocal(prev => {
      if (!prev) return prev
      return {
        ...prev,
        template: prev.template.filter(field => field.id !== fieldId),
        entries: prev.entries.map(entry => {
          const fields = { ...entry.fields }
          delete fields[fieldId]
          return { ...entry, fields }
        }),
      }
    })
    setHardDeleteTarget(null)
  }

  const handleDrop = (targetIndex: number) => {
    const dragIndex = templateDragIndexRef.current
    if (dragIndex === null || dragIndex === targetIndex) {
      setTemplateDragIndex(null)
      setTemplateDropIndex(null)
      templateDragIndexRef.current = null
      return
    }
    const reordered = [...activeElements]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    setLocal(prev => prev ? {
      ...prev,
      template: [...reordered, ...removedElements],
    } : prev)
    setTemplateDragIndex(null)
    setTemplateDropIndex(null)
    templateDragIndexRef.current = null
  }

  const addSubcategory = () => {
    const subcategory = { id: generateId(), name: 'New Subcategory' }
    setLocal(prev => prev ? { ...prev, subcategories: [...(prev.subcategories ?? []), subcategory] } : prev)
  }

  const updateSubcategory = (id: string, name: string) => {
    setLocal(prev => prev ? {
      ...prev,
      subcategories: (prev.subcategories ?? []).map(subcategory =>
        subcategory.id === id ? { ...subcategory, name } : subcategory
      ),
    } : prev)
  }

  const updateSubcategoryColor = (id: string, color: LoreSubcategoryColor) => {
    setLocal(prev => prev ? {
      ...prev,
      subcategories: (prev.subcategories ?? []).map(subcategory =>
        subcategory.id === id ? { ...subcategory, color } : subcategory
      ),
    } : prev)
  }

  const removeSubcategory = (id: string) => {
    setLocal(prev => prev ? {
      ...prev,
      subcategories: (prev.subcategories ?? []).filter(subcategory => subcategory.id !== id),
      entries: prev.entries.map(entry => entry.subcategoryId === id ? { ...entry, subcategoryId: undefined } : entry),
    } : prev)
  }

  const handleSubcategoryDrop = (targetIndex: number) => {
    const dragIndex = subcategoryDragIndexRef.current
    if (dragIndex === null || dragIndex === targetIndex) {
      setSubcategoryDragIndex(null)
      setSubcategoryDropIndex(null)
      subcategoryDragIndexRef.current = null
      return
    }
    const reordered = [...subcategories]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(targetIndex, 0, moved)
    setLocal(prev => prev ? { ...prev, subcategories: reordered } : prev)
    setSubcategoryDragIndex(null)
    setSubcategoryDropIndex(null)
    subcategoryDragIndexRef.current = null
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 150 }}>
      <div className="modal-box lore-template-modal">
        <div className="lore-template-header">
          <input
            className="lore-template-title-input"
            value={local.name}
            onChange={e => setLocal(prev => prev ? { ...prev, name: e.target.value } : prev)}
            onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
            placeholder="Category name"
          />
        </div>

        <div className="lore-template-entry-name">
          <span className="lore-template-locked-label">Entry Name</span>
          <span className="lore-template-locked-hint">(set when creating an entry)</span>
        </div>

        <div className="lore-template-subcategories">
          <div className="lore-template-section-heading">
            <span>Subcategories</span>
            <button type="button" onClick={addSubcategory}>
              <i className="ti ti-plus" aria-hidden="true" /> Add
            </button>
          </div>
          {subcategories.length > 0 ? (
            <div className="lore-template-subcategory-list">
              {subcategories.map((subcategory, index) => {
                const isDragging = subcategoryDragIndex === index
                const isDropTarget = subcategoryDropIndex === index
                return (
                  <div key={subcategory.id}>
                    {isDropTarget && subcategoryDragIndex !== index && (
                      <div className="drop-line" />
                    )}
                    <div
                      className={`lore-template-subcategory${isDragging ? ' dragging' : ''}`}
                      draggable
                      onDragStart={e => {
                        e.stopPropagation()
                        subcategoryDragIndexRef.current = index
                        setSubcategoryDragIndex(index)
                        e.dataTransfer.effectAllowed = 'move'
                      }}
                      onDragEnd={() => {
                        setSubcategoryDragIndex(null)
                        setSubcategoryDropIndex(null)
                        subcategoryDragIndexRef.current = null
                      }}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setSubcategoryDropIndex(index) }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); handleSubcategoryDrop(index) }}
                    >
                      <span className="lore-template-drag-handle">
                        <i className="ti ti-grip-vertical" aria-hidden="true" />
                      </span>
                      <div className="lore-template-subcategory-fields">
                        <input
                          className="lore-template-label-input"
                          value={subcategory.name}
                          onChange={e => updateSubcategory(subcategory.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                          placeholder="Subcategory name..."
                        />
                        <label className="lore-template-subcategory-color">
                          <span>Color</span>
                          <span className={`lore-subcategory-color-swatch lore-subcategory-color-${subcategory.color ?? 'default'}`} />
                          <select
                            className="modal-input"
                            value={subcategory.color ?? 'default'}
                            onChange={e => updateSubcategoryColor(subcategory.id, e.target.value as LoreSubcategoryColor)}
                            onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                          >
                            {LORE_SUBCATEGORY_COLORS.map(color => (
                              <option key={color.value} value={color.value}>{color.label}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <button
                        className="lore-template-remove-btn"
                        title="Remove"
                        onClick={() => removeSubcategory(subcategory.id)}
                      >
                        <i className="ti ti-trash" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="lore-template-subcategory-empty">Entries can remain uncategorized.</div>
          )}
        </div>

        <div className="lore-template-elements">
          {activeElements.map((el, index) => {
            const isDragging = templateDragIndex === index
            const isDropTarget = templateDropIndex === index
            return (
              <div key={el.id}>
                {isDropTarget && templateDragIndex !== index && (
                  <div className="drop-line" />
                )}
                <div
                  className={`lore-template-element${isDragging ? ' dragging' : ''}`}
                  draggable
                  onDragStart={e => {
                    e.stopPropagation()
                    templateDragIndexRef.current = index
                    setTemplateDragIndex(index)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    setTemplateDragIndex(null)
                    setTemplateDropIndex(null)
                    templateDragIndexRef.current = null
                  }}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); setTemplateDropIndex(index) }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleDrop(index) }}
                >
                  <span className="lore-template-drag-handle">
                    <i className="ti ti-grip-vertical" aria-hidden="true" />
                  </span>
                  {el.type === 'divider'
                    ? <div className="lore-template-divider-preview" />
                    : <input
                      className="lore-template-label-input"
                      value={el.label ?? ''}
                      onChange={e => updateLabel(el.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                      placeholder={
                        el.type === 'field' ? 'Field label...' :
                          el.type === 'textarea' ? 'Description label...' :
                            'Image label...'
                      }
                    />
                  }
                  <span className="lore-template-type-badge">{el.type}</span>
                  <button
                    className="lore-template-remove-btn"
                    title="Remove"
                    onClick={() => softRemove(el.id)}
                  >
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="lore-template-add-wrap">
          <button
            ref={addBtnRef}
            className="lore-template-add-btn"
            onClick={() => setAddMenuOpen(v => !v)}
          >
            <i className="ti ti-plus" aria-hidden="true" /> Add element
          </button>
          {addMenuOpen && (() => {
            const rect = addBtnRef.current?.getBoundingClientRect()
            return (
              <div
                className="lore-template-add-menu"
                style={{
                  position: 'fixed',
                  top: rect ? rect.bottom + 4 : 0,
                  left: rect ? rect.left : 0,
                }}
              >
                {(['field', 'textarea', 'image', 'divider'] as LoreFieldType[]).map(type => (
                  <button key={type} onClick={() => { addElement(type); setAddMenuOpen(false) }}>
                    {type === 'field' ? 'Field Box' :
                      type === 'textarea' ? 'Description Box' :
                        type === 'image' ? 'Image' : 'Divider'}
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        {removedElements.length > 0 && (
          <div className="lore-template-removed-section">
            <p className="lore-template-removed-heading">Removed elements</p>
            {removedElements.map(el => (
              <div key={el.id} className="lore-template-element removed">
                <span className="lore-template-type-badge">{el.type}</span>
                {el.label && <span className="lore-template-removed-label">{el.label}</span>}
                <button
                  className="lore-template-restore-btn"
                  title="Restore"
                  onClick={() => restore(el.id)}
                >
                  <i className="ti ti-restore" aria-hidden="true" />
                </button>
                <button
                  className="lore-template-hard-delete-btn"
                  title="Permanently delete"
                  onClick={() => setHardDeleteTarget({ fieldId: el.id, label: displayFieldLabel(el) })}
                >
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" onClick={() => onSave(local)}>Save</button>
        </div>
      </div>
      {hardDeleteTarget && (
        <div className="modal-overlay" style={{ zIndex: 200 }}>
          <div className="modal-box modal-danger" style={{ width: 400 }}>
            <p className="modal-title">Permanently delete field?</p>
            <p className="modal-danger-text">
              <strong style={{ color: '#cc8888' }}>{hardDeleteTarget.label}</strong> will be removed from the template and its data deleted from every entry in this category. This cannot be undone after you save the category.
            </p>
            <div className="modal-footer">
              <button className="welcome-btn" onClick={() => setHardDeleteTarget(null)}>Cancel</button>
              <button className="welcome-btn modal-btn-danger" onClick={() => hardDeleteField(hardDeleteTarget.fieldId)}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function LoreEntryEditorModal({
  category,
  entry,
  projectPath,
  onCancel,
  onSave,
  onPickImage,
}: {
  category: LoreCategory | null
  entry: LoreEntry | null
  projectPath: string | null
  onCancel: () => void
  onSave: (categoryId: string, entry: LoreEntry) => void
  onPickImage: (entryId: string, fieldId: string, previousImagePath?: string) => Promise<string | null>
}) {
  const [local, setLocal] = useState<LoreEntry | null>(entry)
  const [keywordText, setKeywordText] = useState('')

  useEffect(() => {
    setLocal(entry)
    setKeywordText(entry?.keywords?.join(', ') ?? '')
  }, [entry])

  if (!category || !local) return null

  const activeFields = category.template.filter(f => !f.removed)

  const handleImagePick = async (fieldId: string) => {
    const current = local.fields[fieldId]
    const rel = await onPickImage(local.id, fieldId, getLoreImagePath(current))
    if (!rel) return
    setLocal(prev => prev ? {
      ...prev,
      fields: { ...prev.fields, [fieldId]: createLoreImageValue(rel, getLoreImageCrop(current), getLoreImageFullWidth(current), getLoreImageIgnoreEntryCrop(current)) },
    } : prev)
  }

  const updateImageCrop = (fieldId: string, patch: Partial<LoreImageCrop>) => {
    setLocal(prev => {
      if (!prev) return prev
      const current = prev.fields[fieldId]
      const path = getLoreImagePath(current)
      if (!path) return prev
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: createLoreImageValue(path, { ...getLoreImageCrop(current), ...patch }, getLoreImageFullWidth(current), getLoreImageIgnoreEntryCrop(current)),
        },
      }
    })
  }

  const updateImageFullWidth = (fieldId: string, fullWidth: boolean) => {
    setLocal(prev => {
      if (!prev) return prev
      const current = prev.fields[fieldId]
      const path = getLoreImagePath(current)
      if (!path) return prev
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: createLoreImageValue(path, getLoreImageCrop(current), fullWidth, getLoreImageIgnoreEntryCrop(current)),
        },
      }
    })
  }

  const updateImageIgnoreEntryCrop = (fieldId: string, ignoreEntryCrop: boolean) => {
    setLocal(prev => {
      if (!prev) return prev
      const current = prev.fields[fieldId]
      const path = getLoreImagePath(current)
      if (!path) return prev
      return {
        ...prev,
        fields: {
          ...prev.fields,
          [fieldId]: createLoreImageValue(path, getLoreImageCrop(current), getLoreImageFullWidth(current), ignoreEntryCrop),
        },
      }
    })
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 150 }}>
      <div className="modal-box lore-entry-modal">
        <p className="modal-title">{local.id ? 'Edit Entry' : 'New Entry'}</p>

        <div className="lore-entry-field-wrap">
          <label className="lore-entry-label">Entry Name</label>
          <input
            className="modal-input"
            value={local.name}
            onChange={e => setLocal(prev => prev ? { ...prev, name: e.target.value } : prev)}
            onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
            placeholder="Enter name..."
            autoFocus
          />
        </div>

        <div className="lore-entry-field-wrap">
          <label className="lore-entry-label">Keywords</label>
          <input
            className="modal-input"
            value={keywordText}
            onChange={e => setKeywordText(e.target.value)}
            onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
            placeholder="Comma-separated aliases..."
          />
        </div>

        {(category.subcategories ?? []).length > 0 && (
          <div className="lore-entry-field-wrap">
            <label className="lore-entry-label">Subcategory</label>
            <select
              className="modal-input"
              value={local.subcategoryId ?? ''}
              onChange={e => setLocal(prev => prev ? { ...prev, subcategoryId: e.target.value || undefined } : prev)}
              onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
            >
              <option value="">Uncategorized</option>
              {(category.subcategories ?? []).map(subcategory => (
                <option key={subcategory.id} value={subcategory.id}>{subcategory.name || 'Unnamed subcategory'}</option>
              ))}
            </select>
          </div>
        )}

        {activeFields.map(field => {
          if (field.type === 'divider') {
            return <div key={field.id} className="lore-entry-divider" />
          }
          if (field.type === 'image') {
            const value = local.fields[field.id]
            const path = getLoreImagePath(value)
            const crop = getLoreImageCrop(value)
            const fullWidth = getLoreImageFullWidth(value)
            const ignoreEntryCrop = getLoreImageIgnoreEntryCrop(value)
            return (
              <div key={field.id} className="lore-entry-field-wrap">
                {field.label && <label className="lore-entry-label">{field.label}</label>}
                <div className="lore-entry-image-wrap">
                  {path && (
                    <div className="lore-entry-image-crop-preview">
                      <img
                        src={projectPath ? convertFileSrc(`${projectPath}/${path}`.replace(/\\/g, '/')) : ''}
                        className="lore-entry-image-preview"
                        alt={field.label ?? 'image'}
                        style={{
                          '--lore-image-zoom': crop.zoom,
                          '--lore-image-pan-x': `${crop.x}px`,
                          '--lore-image-pan-y': `${crop.y}px`,
                        } as CSSProperties}
                      />
                    </div>
                  )}
                  <button type="button" className="welcome-btn" onClick={() => handleImagePick(field.id)}>
                    {path ? 'Change image' : 'Select image'}
                  </button>
                  {path && (
                    <div className="lore-entry-image-crop-controls">
                      <label>
                        <span>Zoom</span>
                        <input
                          type="range"
                          min="1"
                          max="4"
                          step="0.05"
                          value={crop.zoom}
                          onChange={event => updateImageCrop(field.id, { zoom: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>Pan X</span>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={crop.x}
                          onChange={event => updateImageCrop(field.id, { x: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>Pan Y</span>
                        <input
                          type="range"
                          min="-180"
                          max="180"
                          step="1"
                          value={crop.y}
                          onChange={event => updateImageCrop(field.id, { y: Number(event.target.value) })}
                        />
                      </label>
                      <label className="lore-entry-image-full-width-toggle">
                        <span>Full width</span>
                        <input
                          type="checkbox"
                          checked={fullWidth}
                          onChange={event => updateImageFullWidth(field.id, event.target.checked)}
                        />
                      </label>
                      <label className="lore-entry-image-full-width-toggle">
                        <span>Ignore crop in entry</span>
                        <input
                          type="checkbox"
                          checked={ignoreEntryCrop}
                          onChange={event => updateImageIgnoreEntryCrop(field.id, event.target.checked)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )
          }
          if (field.type === 'textarea') {
            return (
              <div key={field.id} className="lore-entry-field-wrap">
                {field.label && <label className="lore-entry-label">{field.label}</label>}
                <textarea
                  className="modal-input lore-entry-textarea"
                  value={getLoreFieldText(local.fields[field.id])}
                  onChange={e => setLocal(prev => prev ? {
                    ...prev,
                    fields: { ...prev.fields, [field.id]: e.target.value },
                  } : prev)}
                  onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                  placeholder={`${field.label ?? 'Description'}...`}
                />
              </div>
            )
          }
          return (
            <div key={field.id} className="lore-entry-field-wrap">
              {field.label && <label className="lore-entry-label">{field.label}</label>}
              <input
                className="modal-input"
                value={getLoreFieldText(local.fields[field.id])}
                onChange={e => setLocal(prev => prev ? {
                  ...prev,
                  fields: { ...prev.fields, [field.id]: e.target.value },
                } : prev)}
                onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
                placeholder={`${field.label ?? 'Field'}...`}
              />
            </div>
          )
        })}

        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button
            className="welcome-btn"
            onClick={() => onSave(category.id, {
              ...local,
              keywords: keywordText.split(',').map(keyword => keyword.trim()).filter(Boolean),
            })}
            style={{ opacity: local.name.trim() ? 1 : 0.4 }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
