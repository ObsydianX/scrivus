import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { LoreCategory, LoreEntry, LoreFieldType, LoreTemplateElement } from '../types'

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
  const templateDragIndexRef = useRef<number | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [hardDeleteTarget, setHardDeleteTarget] = useState<{ fieldId: string; label: string } | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setLocal(category)
  }, [category])

  if (!local) return null

  const activeElements = local.template.filter(f => !f.removed)
  const removedElements = local.template.filter(f => f.removed)

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
    const rel = await onPickImage(local.id, fieldId, local.fields[fieldId])
    if (!rel) return
    setLocal(prev => prev ? { ...prev, fields: { ...prev.fields, [fieldId]: rel } } : prev)
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

        {activeFields.map(field => {
          if (field.type === 'divider') {
            return <div key={field.id} className="lore-entry-divider" />
          }
          if (field.type === 'image') {
            const val = local.fields[field.id] ?? ''
            return (
              <div key={field.id} className="lore-entry-field-wrap">
                {field.label && <label className="lore-entry-label">{field.label}</label>}
                <div className="lore-entry-image-wrap">
                  {val && (
                    <img
                      src={projectPath ? convertFileSrc(`${projectPath}/${val}`.replace(/\\/g, '/')) : ''}
                      className="lore-entry-image-preview"
                      alt={field.label ?? 'image'}
                    />
                  )}
                  <button className="welcome-btn" onClick={() => handleImagePick(field.id)}>
                    {val ? 'Change image' : 'Select image'}
                  </button>
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
                  value={local.fields[field.id] ?? ''}
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
                value={local.fields[field.id] ?? ''}
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
