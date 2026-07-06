import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
import {
  createLoreImageValue,
  getLoreFieldText,
  getLoreImageCroppedPath,
  getLoreImageCropRect,
  getLoreImageDisplayPath,
  getLoreImageFullWidth,
  getLoreImageIgnoreEntryCrop,
  getLoreImagePath,
} from '../loreImages'
import type { LoreCategory, LoreEntry, LoreFieldType, LoreSubcategoryColor, LoreTemplateElement } from '../types'

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

const resizeLoreEntryTextarea = (textarea: HTMLTextAreaElement | null) => {
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${textarea.scrollHeight}px`
}

type CropEditorState = {
  fieldId: string
  path: string
  label: string
  fullWidth: boolean
  ignoreEntryCrop: boolean
}

type CropRect = {
  x: number
  y: number
  size: number
}

type CropDragState = {
  mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'
  pointerId: number
  startX: number
  startY: number
  rect: CropRect
}

const MIN_CROP_SIZE = 48

const getImageMimeType = (path: string) => {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

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
          <button className="modal-btn" onClick={onCancel}>Cancel</button>
          <button className="modal-btn modal-btn-primary" onClick={() => onSave(local)}>Save</button>
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
  onSaveCroppedImage,
  onDeleteImage,
}: {
  category: LoreCategory | null
  entry: LoreEntry | null
  projectPath: string | null
  onCancel: () => void
  onSave: (categoryId: string, entry: LoreEntry) => void
  onPickImage: (entryId: string, fieldId: string, previousImagePaths?: string[]) => Promise<string | null>
  onSaveCroppedImage: (entryId: string, fieldId: string, bytes: Uint8Array) => Promise<string | null>
  onDeleteImage: (imagePath: string) => Promise<void>
}) {
  const [local, setLocal] = useState<LoreEntry | null>(entry)
  const [keywordText, setKeywordText] = useState('')
  const [cropEditor, setCropEditor] = useState<CropEditorState | null>(null)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [cropSaving, setCropSaving] = useState(false)
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 })
  const [cropSourceUrl, setCropSourceUrl] = useState<string | null>(null)
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const cropImageRef = useRef<HTMLImageElement | null>(null)
  const cropDragRef = useRef<CropDragState | null>(null)

  useEffect(() => {
    setLocal(entry)
    setKeywordText(entry?.keywords?.join(', ') ?? '')
  }, [entry])

  useEffect(() => {
    if (!category || !local) return
    category.template
      .filter(field => !field.removed && field.type === 'textarea')
      .forEach(field => resizeLoreEntryTextarea(textareaRefs.current[field.id] ?? null))
  }, [category, local])

  useEffect(() => {
    setCropSourceUrl(null)
    if (!projectPath || !cropEditor) {
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    readFile(`${projectPath}/${cropEditor.path}`.replace(/\//g, '\\'))
      .then(bytes => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: getImageMimeType(cropEditor.path) }))
        setCropSourceUrl(objectUrl)
      })
      .catch(() => setCropSourceUrl(null))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cropEditor, projectPath])

  if (!category || !local) return null

  const activeFields = category.template.filter(f => !f.removed)

  const handleImagePick = async (fieldId: string) => {
    const current = local.fields[fieldId]
    const previousPaths = [getLoreImagePath(current), getLoreImageCroppedPath(current)].filter(Boolean)
    const rel = await onPickImage(local.id, fieldId, previousPaths)
    if (!rel) return
    setLocal(prev => prev ? {
      ...prev,
      fields: { ...prev.fields, [fieldId]: createLoreImageValue(rel) },
    } : prev)
    setCropEditor({
      fieldId,
      path: rel,
      label: activeFields.find(field => field.id === fieldId)?.label ?? 'Image',
      fullWidth: false,
      ignoreEntryCrop: false,
    })
  }

  const openCropEditor = (fieldId: string, path: string, label: string) => {
    const current = local.fields[fieldId]
    setCropRect(null)
    setCropImageSize({ width: 0, height: 0 })
    setCropEditor({
      fieldId,
      path,
      label,
      fullWidth: getLoreImageFullWidth(current),
      ignoreEntryCrop: getLoreImageIgnoreEntryCrop(current),
    })
  }

  const clampCropRect = (rect: CropRect, bounds = cropImageSize): CropRect => {
    const maxSize = Math.min(bounds.width, bounds.height)
    const size = Math.min(Math.max(rect.size, Math.min(MIN_CROP_SIZE, maxSize)), maxSize)
    const x = Math.min(Math.max(rect.x, 0), Math.max(0, bounds.width - size))
    const y = Math.min(Math.max(rect.y, 0), Math.max(0, bounds.height - size))
    return { x, y, size }
  }

  const initializeCropRect = () => {
    const image = cropImageRef.current
    if (!image || !cropEditor) return
    const box = image.getBoundingClientRect()
    const bounds = { width: box.width, height: box.height }
    const current = local.fields[cropEditor.fieldId]
    const savedRect = getLoreImageCropRect(current)
    setCropImageSize(bounds)
    if (savedRect) {
      const scaleX = bounds.width / image.naturalWidth
      const scaleY = bounds.height / image.naturalHeight
      setCropRect(clampCropRect({
        x: savedRect.x * scaleX,
        y: savedRect.y * scaleY,
        size: savedRect.size * Math.min(scaleX, scaleY),
      }, bounds))
      return
    }
    const size = Math.min(bounds.width, bounds.height)
    setCropRect({ x: (bounds.width - size) / 2, y: (bounds.height - size) / 2, size })
  }

  const updateCropDrag = (clientX: number, clientY: number) => {
    const drag = cropDragRef.current
    if (!drag) return
    const dx = clientX - drag.startX
    const dy = clientY - drag.startY
    const start = drag.rect
    if (drag.mode === 'move') {
      setCropRect(clampCropRect({ ...start, x: start.x + dx, y: start.y + dy }))
      return
    }

    const minSize = Math.min(MIN_CROP_SIZE, cropImageSize.width, cropImageSize.height)
    const maxSizeFromCorner =
      drag.mode === 'nw' ? Math.min(start.x + start.size, start.y + start.size) :
      drag.mode === 'ne' ? Math.min(cropImageSize.width - start.x, start.y + start.size) :
      drag.mode === 'sw' ? Math.min(start.x + start.size, cropImageSize.height - start.y) :
      Math.min(cropImageSize.width - start.x, cropImageSize.height - start.y)
    const delta =
      drag.mode === 'nw' ? Math.max(-dx, -dy) :
      drag.mode === 'ne' ? Math.max(dx, -dy) :
      drag.mode === 'sw' ? Math.max(-dx, dy) :
      Math.max(dx, dy)
    const size = Math.min(Math.max(start.size + delta, minSize), maxSizeFromCorner)
    const x = drag.mode === 'nw' || drag.mode === 'sw' ? start.x + start.size - size : start.x
    const y = drag.mode === 'nw' || drag.mode === 'ne' ? start.y + start.size - size : start.y
    setCropRect(clampCropRect({ x, y, size }))
  }

  const endCropDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    cropDragRef.current = null
  }

  const saveCrop = async () => {
    const image = cropImageRef.current
    if (!cropEditor || !cropRect || !image || !local) return
    setCropSaving(true)
    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) return
      const scaleX = image.naturalWidth / cropImageSize.width
      const scaleY = image.naturalHeight / cropImageSize.height
      const sourceX = cropRect.x * scaleX
      const sourceY = cropRect.y * scaleY
      const sourceSize = cropRect.size * Math.min(scaleX, scaleY)
      const outputSize = Math.max(1, Math.round(sourceSize))
      canvas.width = outputSize
      canvas.height = outputSize
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        outputSize,
        outputSize,
      )
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (!blob) return
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const croppedPath = await onSaveCroppedImage(local.id, cropEditor.fieldId, bytes)
      if (!croppedPath) return
      const previousCroppedPath = getLoreImageCroppedPath(local.fields[cropEditor.fieldId])
      setLocal(prev => {
        if (!prev) return prev
        const current = prev.fields[cropEditor.fieldId]
        const path = getLoreImagePath(current) || cropEditor.path
        return {
          ...prev,
          fields: {
            ...prev.fields,
            [cropEditor.fieldId]: createLoreImageValue(
              path,
              undefined,
              cropEditor.fullWidth,
              cropEditor.ignoreEntryCrop,
              croppedPath,
              { x: sourceX, y: sourceY, size: sourceSize },
            ),
          },
        }
      })
      if (previousCroppedPath && previousCroppedPath !== croppedPath) {
        await onDeleteImage(previousCroppedPath)
      }
      setCropEditor(null)
    } finally {
      setCropSaving(false)
    }
  }

  return (
    <>
    <div className="modal-overlay" style={{ zIndex: 150 }}>
      <div className="modal-box lore-entry-modal">
        <p className="modal-title">{local.id ? 'Edit Entry' : 'New Entry'}</p>

        <div className="lore-entry-modal-body">
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
              const displayPath = getLoreImageDisplayPath(value)
              return (
                <div key={field.id} className="lore-entry-field-wrap">
                  {field.label && <label className="lore-entry-label">{field.label}</label>}
                  <div className="lore-entry-image-wrap">
                    {displayPath && (
                      <div className="lore-entry-image-crop-preview">
                        <img
                          src={projectPath ? convertFileSrc(`${projectPath}/${displayPath}`.replace(/\\/g, '/')) : ''}
                          className="lore-entry-image-preview"
                          alt={field.label ?? 'image'}
                        />
                      </div>
                    )}
                    <div className="lore-entry-image-actions">
                      <button type="button" className="welcome-btn" onClick={() => handleImagePick(field.id)}>
                        {path ? 'Change image' : 'Select image'}
                      </button>
                      {path && (
                        <button
                          type="button"
                          className="welcome-btn"
                          onClick={() => openCropEditor(field.id, path, field.label ?? 'Image')}
                        >
                          Edit
                        </button>
                      )}
                    </div>
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
                    ref={element => {
                      textareaRefs.current[field.id] = element
                      resizeLoreEntryTextarea(element)
                    }}
                    value={getLoreFieldText(local.fields[field.id])}
                    onChange={e => {
                      resizeLoreEntryTextarea(e.currentTarget)
                      setLocal(prev => prev ? {
                        ...prev,
                        fields: { ...prev.fields, [field.id]: e.target.value },
                      } : prev)
                    }}
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
        </div>

        <div className="modal-footer">
          <button className="modal-btn" onClick={onCancel}>Cancel</button>
          <button
            className="modal-btn modal-btn-primary"
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
    {cropEditor && projectPath && (
      <div className="modal-overlay" style={{ zIndex: 180 }}>
        <div className="modal-box lore-image-crop-modal">
          <p className="modal-title">Edit Image</p>
          <div className="lore-image-crop-stage">
            <div className="lore-image-crop-frame">
              {cropSourceUrl && (
                <img
                  ref={cropImageRef}
                  src={cropSourceUrl}
                  alt={cropEditor.label}
                  draggable={false}
                  onLoad={initializeCropRect}
                />
              )}
              {cropRect && (
                <div
                  className="lore-image-crop-selection"
                  style={{
                    left: `${cropRect.x}px`,
                    top: `${cropRect.y}px`,
                    width: `${cropRect.size}px`,
                    height: `${cropRect.size}px`,
                  }}
                  onPointerDown={event => {
                    event.preventDefault()
                    cropDragRef.current = {
                      mode: 'move',
                      pointerId: event.pointerId,
                      startX: event.clientX,
                      startY: event.clientY,
                      rect: cropRect,
                    }
                    event.currentTarget.setPointerCapture(event.pointerId)
                  }}
                  onPointerMove={event => updateCropDrag(event.clientX, event.clientY)}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                >
                  {(['nw', 'ne', 'sw', 'se'] as const).map(handle => (
                    <span
                      key={handle}
                      className={`lore-image-crop-handle ${handle}`}
                      onPointerDown={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        cropDragRef.current = {
                          mode: handle,
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          rect: cropRect,
                        }
                        event.currentTarget.setPointerCapture(event.pointerId)
                      }}
                      onPointerMove={event => updateCropDrag(event.clientX, event.clientY)}
                      onPointerUp={endCropDrag}
                      onPointerCancel={endCropDrag}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="lore-image-crop-info">
            Crop the square image used for Lore Book cards, pinned entries, and compact previews.
          </div>
          <div className="lore-image-crop-options">
            <label>
              <input
                type="checkbox"
                checked={cropEditor.fullWidth}
                onChange={event => {
                  const fullWidth = event.currentTarget.checked
                  setCropEditor(editor => editor ? { ...editor, fullWidth } : editor)
                }}
              />
              <span>Full width in entry</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={cropEditor.ignoreEntryCrop}
                onChange={event => {
                  const ignoreEntryCrop = event.currentTarget.checked
                  setCropEditor(editor => editor ? { ...editor, ignoreEntryCrop } : editor)
                }}
              />
              <span>Ignore crop in entry</span>
            </label>
          </div>
          <div className="modal-footer">
            <button className="welcome-btn" onClick={() => setCropEditor(null)} disabled={cropSaving}>Cancel</button>
            <button className="welcome-btn" onClick={saveCrop} disabled={cropSaving || !cropRect}>
              {cropSaving ? 'Saving...' : 'Done'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
