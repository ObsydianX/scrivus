import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChecklistItem, Project, SceneMetadata } from '../types'

type MutableRef<T> = {
  current: T
}

function InspectorDrawer({
  id,
  label,
  drawerOpen,
  onToggle,
  children,
}: {
  id: string
  label: string
  drawerOpen: Record<string, boolean>
  onToggle: (id: string) => void
  children: ReactNode
}) {
  return (
    <div className="inspector-drawer">
      <div
        className="inspector-drawer-header"
        onClick={() => onToggle(id)}
      >
        <i className={`ti ti-chevron-${drawerOpen[id] ? 'down' : 'right'}`} aria-hidden="true" />
        <span>{label}</span>
      </div>
      {drawerOpen[id] && (
        <div className="inspector-drawer-body">
          {children}
        </div>
      )}
    </div>
  )
}

export function InspectorPanel({
  open,
  panelLockActive,
  workspace,
  project,
  activeSceneId,
  activeSceneMetadata,
  quickNote,
  checklist,
  renamingChecklistId,
  checklistDragId,
  checklistDropIndex,
  checklistDragIdRef,
  onOpenChange,
  onSceneMetadataChange,
  onQuickNoteChange,
  onToggleChecklistItem,
  onRenameChecklistItem,
  onDeleteChecklistItem,
  onChecklistDrop,
  onRenamingChecklistIdChange,
  onChecklistDragIdChange,
  onChecklistDropIndexChange,
  onAddChecklistItem,
}: {
  open: boolean
  panelLockActive: boolean
  workspace: 'editor' | 'revision' | 'outline' | 'lorebook' | 'mindmap' | 'atlas'
  project: Project | null
  activeSceneId: number | null
  activeSceneMetadata: SceneMetadata | null
  quickNote: string
  checklist: ChecklistItem[]
  renamingChecklistId: number | null
  checklistDragId: number | null
  checklistDropIndex: number | null
  checklistDragIdRef: MutableRef<number | null>
  onOpenChange: (open: boolean) => void
  onSceneMetadataChange: (metadata: SceneMetadata) => void
  onQuickNoteChange: (value: string) => void
  onToggleChecklistItem: (id: number) => void
  onRenameChecklistItem: (id: number, label: string) => void
  onDeleteChecklistItem: (id: number) => void
  onChecklistDrop: (targetIndex: number) => void
  onRenamingChecklistIdChange: (id: number | null) => void
  onChecklistDragIdChange: (id: number | null) => void
  onChecklistDropIndexChange: (index: number | null) => void
  onAddChecklistItem: () => void
}) {
  const drawerOpen = {
    quickNote: false,
    sceneMetadata: false,
    checklist: false,
  }

  return (
    <div id="inspector" className={`${open ? '' : 'collapsed'} ${workspace !== 'editor' ? 'hidden' : ''}`}>
      <div id="inspector-header">
        <div style={{ display: 'flex', flexDirection: open ? 'row' : 'column', gap: 2, alignItems: 'center' }}>
          {!open && (
            <button
              title={panelLockActive ? 'Quick Tools unavailable below 960px' : 'Expand inspector'}
              onClick={() => onOpenChange(true)}
              disabled={panelLockActive}
            >
              <i className="ti ti-chevrons-left" aria-hidden="true" />
            </button>
          )}
          {open && (
            <>
              <button title="Collapse inspector" onClick={() => onOpenChange(false)}>
                <i className="ti ti-chevrons-right" aria-hidden="true" />
              </button>
              <div className="sidebar-sep" />
            </>
          )}
        </div>
        {open && <span>Quick Tools</span>}
      </div>
      {open && (
        <InspectorBody
          project={project}
          activeSceneId={activeSceneId}
          activeSceneMetadata={activeSceneMetadata}
          quickNote={quickNote}
          checklist={checklist}
          renamingChecklistId={renamingChecklistId}
          checklistDragId={checklistDragId}
          checklistDropIndex={checklistDropIndex}
          checklistDragIdRef={checklistDragIdRef}
          drawerOpen={drawerOpen}
          onSceneMetadataChange={onSceneMetadataChange}
          onQuickNoteChange={onQuickNoteChange}
          onToggleChecklistItem={onToggleChecklistItem}
          onRenameChecklistItem={onRenameChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
          onChecklistDrop={onChecklistDrop}
          onRenamingChecklistIdChange={onRenamingChecklistIdChange}
          onChecklistDragIdChange={onChecklistDragIdChange}
          onChecklistDropIndexChange={onChecklistDropIndexChange}
          onAddChecklistItem={onAddChecklistItem}
        />
      )}
    </div>
  )
}

function InspectorBody({
  project,
  activeSceneId,
  activeSceneMetadata,
  quickNote,
  checklist,
  renamingChecklistId,
  checklistDragId,
  checklistDropIndex,
  checklistDragIdRef,
  drawerOpen: initialDrawerOpen,
  onQuickNoteChange,
  onSceneMetadataChange,
  onToggleChecklistItem,
  onRenameChecklistItem,
  onDeleteChecklistItem,
  onChecklistDrop,
  onRenamingChecklistIdChange,
  onChecklistDragIdChange,
  onChecklistDropIndexChange,
  onAddChecklistItem,
}: {
  project: Project | null
  activeSceneId: number | null
  activeSceneMetadata: SceneMetadata | null
  quickNote: string
  checklist: ChecklistItem[]
  renamingChecklistId: number | null
  checklistDragId: number | null
  checklistDropIndex: number | null
  checklistDragIdRef: MutableRef<number | null>
  drawerOpen: Record<string, boolean>
  onQuickNoteChange: (value: string) => void
  onSceneMetadataChange: (metadata: SceneMetadata) => void
  onToggleChecklistItem: (id: number) => void
  onRenameChecklistItem: (id: number, label: string) => void
  onDeleteChecklistItem: (id: number) => void
  onChecklistDrop: (targetIndex: number) => void
  onRenamingChecklistIdChange: (id: number | null) => void
  onChecklistDragIdChange: (id: number | null) => void
  onChecklistDropIndexChange: (index: number | null) => void
  onAddChecklistItem: () => void
}) {
  const [drawerOpen, setDrawerOpen] = useState(initialDrawerOpen)
  const [metadataDraft, setMetadataDraft] = useState<SceneMetadata | null>(activeSceneMetadata)
  const metadataSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toggleDrawer = (id: string) => setDrawerOpen(prev => ({ ...prev, [id]: !prev[id] }))

  const unchecked = checklist
    .filter(i => !i.checked)
    .sort((a, b) => a.order - b.order)
  const checked = checklist.filter(i => i.checked)
  const [tagInput, setTagInput] = useState(activeSceneMetadata?.tags.join(', ') ?? '')

  useEffect(() => {
    if (metadataSaveTimerRef.current) {
      clearTimeout(metadataSaveTimerRef.current)
      metadataSaveTimerRef.current = null
    }
    setMetadataDraft(activeSceneMetadata)
    setTagInput(activeSceneMetadata?.tags.join(', ') ?? '')
  }, [activeSceneId])

  useEffect(() => () => {
    if (metadataSaveTimerRef.current) clearTimeout(metadataSaveTimerRef.current)
  }, [])

  const scheduleMetadataChange = (metadata: SceneMetadata) => {
    setMetadataDraft(metadata)
    if (metadataSaveTimerRef.current) clearTimeout(metadataSaveTimerRef.current)
    metadataSaveTimerRef.current = setTimeout(() => {
      onSceneMetadataChange(metadata)
      metadataSaveTimerRef.current = null
    }, 700)
  }

  const flushMetadataChange = (metadata: SceneMetadata | null = metadataDraft) => {
    if (!metadata) return
    if (metadataSaveTimerRef.current) {
      clearTimeout(metadataSaveTimerRef.current)
      metadataSaveTimerRef.current = null
    }
    onSceneMetadataChange(metadata)
  }

  const commitTags = () => {
    if (!metadataDraft) return
    const next = {
      ...metadataDraft,
      tags: tagInput.split(',').map(tag => tag.trim()).filter(Boolean),
    }
    setMetadataDraft(next)
    flushMetadataChange(next)
  }

  const renderItem = (item: ChecklistItem, index: number) => {
    const isDragging = checklistDragId === item.id
    const isDropTarget = checklistDropIndex === index

    return (
      <div key={item.id}>
        {isDropTarget && <div className="checklist-drop-line" />}
        <div
          className="checklist-item"
          style={{ opacity: isDragging ? 0.4 : 1 }}
          onDragOver={!item.checked ? e => {
            e.preventDefault()
            e.stopPropagation()
            onChecklistDropIndexChange(index)
          } : undefined}
          onDrop={!item.checked ? e => {
            e.preventDefault()
            e.stopPropagation()
            onChecklistDrop(index)
          } : undefined}
        >
          {!item.checked
            ? <span
              className="card-drag-handle"
              draggable={renamingChecklistId !== item.id}
              onDragStart={renamingChecklistId !== item.id ? e => {
                e.stopPropagation()
                checklistDragIdRef.current = item.id
                e.dataTransfer.effectAllowed = 'move'
                requestAnimationFrame(() => onChecklistDragIdChange(item.id))
              } : undefined}
              onDragEnd={() => {
                onChecklistDragIdChange(null)
                onChecklistDropIndexChange(null)
                checklistDragIdRef.current = null
              }}
              onClick={e => e.stopPropagation()}
            >
              <i className="ti ti-grip-vertical" aria-hidden="true" />
            </span>
            : <span style={{ width: 20, flexShrink: 0 }} />
          }
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => onToggleChecklistItem(item.id)}
            className="checklist-checkbox"
          />
          {renamingChecklistId === item.id
            ? <input
              className="checklist-rename"
              defaultValue={item.label}
              autoFocus
              ref={el => { if (el) { el.focus(); el.select() } }}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                if (e.key === 'Enter') onRenameChecklistItem(item.id, (e.target as HTMLInputElement).value)
                if (e.key === 'Escape') onRenamingChecklistIdChange(null)
              }}
              onBlur={e => onRenameChecklistItem(item.id, e.target.value)}
            />
            : <>
              <span
                className={`checklist-label${item.checked ? ' checked' : ''}`}
                onDoubleClick={() => { if (!item.checked) onRenamingChecklistIdChange(item.id) }}
              >
                {item.label}
              </span>
              {!item.checked && (
                <button
                  className="checklist-delete"
                  title="Rename"
                  onClick={e => { e.stopPropagation(); onRenamingChecklistIdChange(item.id) }}
                >
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
              )}
            </>
          }
          {item.checked && (
            <button
              className="checklist-delete"
              title="Delete"
              onClick={() => onDeleteChecklistItem(item.id)}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div id="inspector-body">
      {metadataDraft && (
        <InspectorDrawer id="sceneMetadata" label="Scene Metadata" drawerOpen={drawerOpen} onToggle={toggleDrawer}>
          <div className="metadata-form">
            <label className="metadata-field">
              <span>Status</span>
              <select
                value={metadataDraft.status}
                onChange={e => {
                  const next = {
                    ...metadataDraft,
                    status: e.target.value as SceneMetadata['status'],
                  }
                  scheduleMetadataChange(next)
                }}
                onBlur={() => flushMetadataChange()}
              >
                <option value="draft">Draft</option>
                <option value="revised">Revised</option>
                <option value="needsWork">Needs work</option>
                <option value="complete">Complete</option>
              </select>
            </label>
            <label className="metadata-field">
              <span>POV</span>
              <input
                value={metadataDraft.pov}
                onChange={e => scheduleMetadataChange({ ...metadataDraft, pov: e.target.value })}
                onBlur={() => flushMetadataChange()}
                placeholder="Character or narrator"
              />
            </label>
            <label className="metadata-field">
              <span>Location</span>
              <input
                value={metadataDraft.location}
                onChange={e => scheduleMetadataChange({ ...metadataDraft, location: e.target.value })}
                onBlur={() => flushMetadataChange()}
                placeholder="Where this happens"
              />
            </label>
            <label className="metadata-field">
              <span>Timeline</span>
              <input
                value={metadataDraft.timeline}
                onChange={e => scheduleMetadataChange({ ...metadataDraft, timeline: e.target.value })}
                onBlur={() => flushMetadataChange()}
                placeholder="Day 3, Winter, 1998..."
              />
            </label>
            <label className="metadata-field">
              <span>Tags</span>
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onBlur={commitTags}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitTags()
                  }
                }}
                placeholder="clue, romance, fight"
              />
            </label>
            <label className="metadata-field">
              <span>Synopsis</span>
              <textarea
                value={metadataDraft.synopsis}
                onChange={e => scheduleMetadataChange({ ...metadataDraft, synopsis: e.target.value })}
                onBlur={() => flushMetadataChange()}
                placeholder="What changes in this scene?"
              />
            </label>
          </div>
        </InspectorDrawer>
      )}
      <InspectorDrawer id="quickNote" label="Quick Note" drawerOpen={drawerOpen} onToggle={toggleDrawer}>
        <textarea
          key={project?.path ?? 'none'}
          defaultValue={quickNote}
          onKeyDown={e => { if (e.key === 'z' || e.key === 'y') e.stopPropagation() }}
          onChange={e => onQuickNoteChange(e.target.value)}
          placeholder="Project scratch pad..."
          className="inspector-textarea inspector-textarea-tall"
        />
      </InspectorDrawer>
      <InspectorDrawer id="checklist" label="Checklist" drawerOpen={drawerOpen} onToggle={toggleDrawer}>
        <div className="checklist-wrap">
          {unchecked.map((item, index) => renderItem(item, index))}
          {checked.map(item => renderItem(item, unchecked.length))}
          <button className="checklist-add" onClick={onAddChecklistItem}>
            <i className="ti ti-plus" aria-hidden="true" /> Add item
          </button>
        </div>
      </InspectorDrawer>
    </div>
  )
}
