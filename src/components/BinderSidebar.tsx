import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { DropTarget, SceneStatus, TreeNode } from '../types'
import { normalizeSceneMetadata } from '../constants'

type MutableRef<T> = {
  current: T
}

type TrashItem = {
  sidecarId: string
  label: string
  node: TreeNode
  originalFolderId: number
}

type ConfirmBinDeleteTarget = {
  id: number
  label: string
}

type ConfirmDeleteTarget = {
  sidecarId: string
  node: TreeNode
}

const STATUS_LABELS: Record<SceneStatus, string> = {
  draft: 'Draft',
  revised: 'Revised',
  needsWork: 'Needs work',
  complete: 'Complete',
}

function getFolderRole(node: TreeNode) {
  return node.type === 'folder' ? node.role ?? 'chapter' : null
}

type BinderSidebarProps = {
  binderOpen: boolean
  panelLockActive: boolean
  workspace: 'editor' | 'revision' | 'outline' | 'lorebook' | 'mindmap' | 'atlas'
  projectOpen: boolean
  showFnR: boolean
  showSearch: boolean
  tree: TreeNode[]
  activeId: number | null
  bookmarkedSceneId: number | null
  selectedIds: Set<number>
  renamingId: number | null
  dragId: number | null
  dropTarget: DropTarget
  trashOpen: boolean
  trashItems: TrashItem[]
  trashExpanded: Set<string>
  dragIdRef: MutableRef<number | null>
  dropTargetRef: MutableRef<DropTarget>
  onBinderOpenChange: (open: boolean) => void
  onToggleFindReplace: () => void
  onToggleSearch: () => void
  onExpandAllFolders: () => void
  onCollapseAllFolders: () => void
  onDragIdChange: (id: number | null) => void
  onDropTargetChange: (target: DropTarget) => void
  onSelectNode: (id: number, mode: 'toggle' | 'range') => void
  onClearSelection: (anchorId?: number) => void
  onRenamingIdChange: (id: number | null) => void
  onContextMenuChange: (menu: { x: number; y: number; node: TreeNode; depth: number } | null) => void
  onTrashOpenChange: Dispatch<SetStateAction<boolean>>
  onTrashExpandedChange: Dispatch<SetStateAction<Set<string>>>
  onConfirmBinDeleteChange: (target: ConfirmBinDeleteTarget | null) => void
  onConfirmDeleteChange: (target: ConfirmDeleteTarget | null) => void
  onConfirmEmptyTrashChange: (open: boolean) => void
  onLoadTrash: () => void
  onSelectDoc: (id: number) => void
  onSelectRevisionDoc: (id: number) => void
  onToggleFolder: (id: number) => void
  onRenameNode: (id: number, label: string) => void
  onAddDoc: (folderId?: number) => void
  onAddFolder: (folderId?: number) => void
  onDrop: (targetId: number) => void
  onPreviewTrashScene: (node: Extract<TreeNode, { type: 'doc' }>) => void
  onRestoreFromTrash: (sidecarId: string, node: TreeNode, originalFolderId: number, parentSidecarId?: string) => void
}

type InlineRenameInputProps = {
  id: number
  label: string
  onRenameNode: (id: number, label: string) => void
  onRenamingIdChange: (id: number | null) => void
}

function InlineRenameInput({ id, label, onRenameNode, onRenamingIdChange }: InlineRenameInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [])

  return (
    <input
      className="inline-rename"
      defaultValue={label}
      ref={inputRef}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => {
        if (e.key === 'Enter') onRenameNode(id, (e.target as HTMLInputElement).value || label)
        if (e.key === 'Escape') onRenamingIdChange(null)
      }}
      onBlur={e => onRenameNode(id, e.target.value || label)}
    />
  )
}

export function BinderSidebar({
  binderOpen,
  panelLockActive,
  workspace,
  projectOpen,
  showFnR,
  showSearch,
  tree,
  activeId,
  bookmarkedSceneId,
  selectedIds,
  renamingId,
  dragId,
  dropTarget,
  trashOpen,
  trashItems,
  trashExpanded,
  dragIdRef,
  dropTargetRef,
  onBinderOpenChange,
  onToggleFindReplace,
  onToggleSearch,
  onExpandAllFolders,
  onCollapseAllFolders,
  onDragIdChange,
  onDropTargetChange,
  onSelectNode,
  onClearSelection,
  onRenamingIdChange,
  onContextMenuChange,
  onTrashOpenChange,
  onTrashExpandedChange,
  onConfirmBinDeleteChange,
  onConfirmDeleteChange,
  onConfirmEmptyTrashChange,
  onLoadTrash,
  onSelectDoc,
  onSelectRevisionDoc,
  onToggleFolder,
  onRenameNode,
  onAddDoc,
  onAddFolder,
  onDrop,
  onPreviewTrashScene,
  onRestoreFromTrash,
}: BinderSidebarProps) {
  const rowPointerDownRef = useRef<{ id: number; x: number; y: number } | null>(null)

  const renderTrashItem = (sidecarId: string, node: TreeNode, originalFolderId: number, depth: number): React.ReactNode => {
    const isExpanded = trashExpanded.has(`${sidecarId}-${node.id}`)
    const toggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation()
      onTrashExpandedChange(prev => {
        const next = new Set(prev)
        const key = `${sidecarId}-${node.id}`
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
    }

    return (
      <div key={`${sidecarId}-${node.id}`}>
        <div
          className="tree-item trash-root"
          onClick={() => {
            if (node.type === 'doc') onPreviewTrashScene(node)
            else toggleExpand({ stopPropagation: () => { } } as React.MouseEvent)
          }}
        >
          <span style={{ width: depth * 14 + 4, flexShrink: 0, display: 'inline-block' }} />
          {node.type === 'folder'
            ? <span className="toggle" onClick={toggleExpand}>
              <i className={`ti ti-chevron-${isExpanded ? 'down' : 'right'}`} aria-hidden="true" />
            </span>
            : <span style={{ width: 16, flexShrink: 0 }} />
          }
          <span className="item-icon">
            <i className={`ti ti-${node.type === 'folder' ? 'folder' : 'file-text'}`} aria-hidden="true" />
          </span>
          <span className="item-label">{node.label}</span>
          <span className="item-actions" onClick={e => e.stopPropagation()}>
            <button
              title="Restore"
              onClick={e => {
                e.stopPropagation()
                const isChildNode = node.id !== trashItems.find(i => i.sidecarId === sidecarId)?.node.id
                onRestoreFromTrash(sidecarId, node, originalFolderId, isChildNode ? sidecarId : undefined)
              }}
            >
              <i className="ti ti-restore" aria-hidden="true" />
            </button>
            <button
              title="Delete permanently"
              onClick={e => { e.stopPropagation(); onConfirmDeleteChange({ sidecarId, node }) }}
            >
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </span>
        </div>
        {node.type === 'folder' && isExpanded && node.children.map(child =>
          renderTrashItem(sidecarId, child, originalFolderId, depth + 1)
        )}
      </div>
    )
  }

  const renderNodes = (nodes: TreeNode[], depth: number, inDraggedSubtree = false): React.ReactNode => {
    return nodes.map(n => {
      const isProtected = n.id === 1 || n.id === 2
      const isDragging = dragId === n.id
      const isSelected = selectedIds.has(n.id)
      const isDragSource = inDraggedSubtree || isDragging || (dragId !== null && isSelected)
      const isDropFolder = dropTarget?.type === 'inside' && dropTarget.id === n.id
      const isDropBefore = dropTarget?.type === 'before' && dropTarget.id === n.id
      const isDropAfter = dropTarget?.type === 'after' && dropTarget.id === n.id
      const folderRole = getFolderRole(n)
      const activateNode = (shiftKey: boolean, ctrlKey: boolean, metaKey: boolean) => {
        if (!isProtected && shiftKey) {
          onSelectNode(n.id, 'range')
          return
        }
        if (!isProtected && (ctrlKey || metaKey)) {
          onSelectNode(n.id, 'toggle')
          return
        }
        onClearSelection(isProtected ? undefined : n.id)
        if (n.type === 'doc') {
          if (workspace === 'revision') onSelectRevisionDoc(n.id)
          else onSelectDoc(n.id)
        } else {
          onToggleFolder(n.id)
        }
      }

      return (
        <div key={n.id} style={{ opacity: isDragSource ? 0.4 : 1 }}>
          {isDropBefore && !isProtected && <div className="drop-line" />}
          <div
            className={`tree-item${activeId === n.id ? ' active' : ''}${isSelected ? ' selected' : ''}${isDropFolder ? ' drag-over-folder' : ''}`}
            draggable={!isProtected && renamingId !== n.id}
            onDragStart={(!isProtected && renamingId !== n.id) ? e => {
              e.stopPropagation()
              rowPointerDownRef.current = null
              dragIdRef.current = n.id
              if (!selectedIds.has(n.id)) onClearSelection(n.id)
              onDragIdChange(n.id)
              e.dataTransfer.effectAllowed = 'move'
              document.getElementById('tree')?.classList.add('dragging')
            } : undefined}
            onDragEnd={(!isProtected && renamingId !== n.id) ? () => {
              document.getElementById('tree')?.classList.remove('dragging')
              onDragIdChange(null)
              onDropTargetChange(null)
              dragIdRef.current = null
              dropTargetRef.current = null
            } : undefined}
            onDragOver={e => {
              e.stopPropagation()
              // Rows inside the dragged selection are not valid drop targets;
              // skipping preventDefault keeps the browser from allowing a drop here.
              if (isDragSource) {
                dropTargetRef.current = null
                onDropTargetChange(null)
                return
              }
              e.preventDefault()
              if (dragIdRef.current === n.id) return
              if (isProtected && n.type === 'folder') {
                dropTargetRef.current = { type: 'inside', id: n.id }
                onDropTargetChange({ type: 'inside', id: n.id })
                return
              }
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              const y = e.clientY - rect.top
              const h = rect.height
              let next: DropTarget
              if (n.type === 'folder') {
                if (y < h * 0.25) next = { type: 'before', id: n.id }
                else if (y > h * 0.75) next = { type: 'after', id: n.id }
                else next = { type: 'inside', id: n.id }
              } else {
                if (y < h * 0.5) next = { type: 'before', id: n.id }
                else next = { type: 'after', id: n.id }
              }
              dropTargetRef.current = next
              onDropTargetChange(next)
            }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(n.id) }}
            onPointerDown={e => {
              if (e.button !== 0) return
              if ((e.target as HTMLElement).closest('.item-actions, .inline-rename, button, input')) return
              rowPointerDownRef.current = { id: n.id, x: e.clientX, y: e.clientY }
            }}
            onPointerUp={e => {
              const start = rowPointerDownRef.current
              rowPointerDownRef.current = null
              if (!start || start.id !== n.id || e.button !== 0) return
              if ((e.target as HTMLElement).closest('.item-actions, .inline-rename, button, input')) return
              const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
              if (moved > 5 || dragIdRef.current !== null) return
              activateNode(e.shiftKey, e.ctrlKey, e.metaKey)
            }}
            onDoubleClick={() => {
              if (n.id === 1 || n.id === 2) return
              onRenamingIdChange(n.id)
            }}
            onContextMenu={e => {
              e.preventDefault()
              e.stopPropagation()
              if (!isProtected && !selectedIds.has(n.id)) onClearSelection(n.id)
              onContextMenuChange({ x: e.clientX, y: e.clientY, node: n, depth })
            }}
          >
            <span style={{ width: depth * 14 + 4, flexShrink: 0, display: 'inline-block' }} />
            {n.type === 'folder'
              ? <span className="toggle"><i className={`ti ti-chevron-${n.open ? 'down' : 'right'}`} aria-hidden="true" /></span>
              : <span style={{ width: 16, flexShrink: 0 }} />
            }
            <span className="item-icon">
              <i className={`ti ti-${n.id === 1 ? 'book-2' :
                n.id === 2 ? 'notebook' :
                  n.type === 'folder' ? (folderRole === 'act' ? 'books' : 'folder') :
                    'file-text'
                }`} aria-hidden="true" />
            </span>
            {n.type === 'doc' && (
              <span
                className={`binder-status-dot binder-status-${normalizeSceneMetadata(n.metadata).status}`}
                title={`Status: ${STATUS_LABELS[normalizeSceneMetadata(n.metadata).status]}`}
              />
            )}
            {renamingId === n.id
              ? <InlineRenameInput
                id={n.id}
                label={n.label}
                onRenameNode={onRenameNode}
                onRenamingIdChange={onRenamingIdChange}
              />
              : <span className="item-label">
                <span className="item-label-text">{n.label}</span>
                {n.type === 'doc' && n.id === bookmarkedSceneId && (
                  <span className="binder-bookmark" title="Last opened scene" aria-label="Last opened scene">
                    <i className="ti ti-bookmark" aria-hidden="true" />
                  </span>
                )}
              </span>
            }
            {n.type === 'folder' && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                {workspace === 'editor' && (
                  <>
                    <button title="New scene" onClick={e => { e.stopPropagation(); onAddDoc(n.id) }}>
                      <i className="ti ti-file-plus" aria-hidden="true" />
                    </button>
                    <button title="New folder" onClick={e => { e.stopPropagation(); onAddFolder(n.id) }}>
                      <i className="ti ti-folder-plus" aria-hidden="true" />
                    </button>
                  </>
                )}
                {!isProtected && (
                  <>
                    <button title="Rename" onClick={e => { e.stopPropagation(); onRenamingIdChange(n.id) }}>
                      <i className="ti ti-pencil" aria-hidden="true" />
                    </button>
                    <button title="Delete" onClick={e => {
                      e.stopPropagation()
                      onConfirmBinDeleteChange({ id: n.id, label: n.label })
                    }}>
                      <i className="ti ti-trash" aria-hidden="true" />
                    </button>
                  </>
                )}
              </span>
            )}
            {n.type === 'doc' && !isProtected && (
              <span className="item-actions" onClick={e => e.stopPropagation()}>
                <button title="Rename" onClick={e => { e.stopPropagation(); onRenamingIdChange(n.id) }}>
                  <i className="ti ti-pencil" aria-hidden="true" />
                </button>
                <button title="Delete" onClick={e => {
                  e.stopPropagation()
                  onConfirmBinDeleteChange({ id: n.id, label: n.label })
                }}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>
          {n.type === 'folder' && n.open && renderNodes(n.children, depth + 1, isDragSource)}
          {isDropAfter && !isProtected && <div className="drop-line" />}
        </div>
      )
    })
  }

  return (
    <div id="sidebar" className={`${binderOpen ? '' : 'collapsed'} ${workspace !== 'editor' && workspace !== 'revision' ? 'hidden' : ''}`}>
      <div id="sidebar-header">
        {binderOpen && <span>Binder</span>}
        <div style={{ display: 'flex', flexDirection: binderOpen ? 'row' : 'column', gap: 2, alignItems: 'center' }}>
          {!binderOpen && (
            <button
              title={panelLockActive ? 'Binder unavailable below 960px' : 'Expand binder'}
              onClick={() => onBinderOpenChange(true)}
              disabled={panelLockActive}
            >
              <i className="ti ti-chevrons-right" aria-hidden="true" />
            </button>
          )}
          <button
            title="Find and replace"
            className={showFnR ? 'active' : ''}
            onClick={onToggleFindReplace}
            disabled={!projectOpen}
          >
            <i className="ti ti-replace" aria-hidden="true" />
          </button>
          <button
            title="Search project"
            className={showSearch ? 'active' : ''}
            onClick={onToggleSearch}
            disabled={!projectOpen}
          >
            <i className="ti ti-search" aria-hidden="true" />
          </button>
          {binderOpen && (
            <>
              <button
                title="Expand all folders"
                onClick={onExpandAllFolders}
                disabled={!projectOpen}
              >
                <i className="ti ti-chevrons-down" aria-hidden="true" />
              </button>
              <button
                title="Collapse all folders"
                onClick={onCollapseAllFolders}
                disabled={!projectOpen}
              >
                <i className="ti ti-chevrons-up" aria-hidden="true" />
              </button>
            </>
          )}
          {binderOpen && (
            <>
              <div className="sidebar-sep" />
              <button
                title="Collapse binder"
                onClick={() => onBinderOpenChange(false)}
              >
                <i className="ti ti-chevrons-left" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>

      {binderOpen && <div id="tree">
        {renderNodes(tree, 0)}
        <div
          style={{ flex: 1, minHeight: 40 }}
          onDragOver={e => {
            e.preventDefault()
            const lastNode = tree[tree.length - 1]
            if (lastNode) {
              dropTargetRef.current = { type: 'after', id: lastNode.id }
              onDropTargetChange({ type: 'after', id: lastNode.id })
            }
          }}
          onDrop={e => { e.preventDefault(); onDrop(-1) }}
        />
        <div
          className="tree-item"
          onClick={e => {
            if ((e.target as HTMLElement).closest('.item-actions')) return
            onTrashOpenChange(v => !v)
            if (!trashOpen) onLoadTrash()
          }}
          style={{ marginTop: 4, paddingTop: 6 }}
        >
          <span style={{ width: 4, flexShrink: 0, display: 'inline-block' }} />
          <span className="toggle">
            <i className={`ti ti-chevron-${trashOpen ? 'down' : 'right'}`} aria-hidden="true" />
          </span>
          <span className="item-icon">
            <i className="ti ti-trash" aria-hidden="true" />
          </span>
          <span className="item-label">Trash</span>
          {trashItems.length > 0 && (
            <span className="item-actions" onClick={e => e.stopPropagation()}>
              <button
                title="Empty Trash"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onConfirmEmptyTrashChange(true) }}
              >
                <i className="ti ti-trash-x" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
        {trashOpen && (
          <div>
            {trashItems.length === 0
              ? <div className="trash-empty">Empty</div>
              : trashItems.map(item => renderTrashItem(item.sidecarId, item.node, item.originalFolderId, 1))
            }
          </div>
        )}
      </div>}
    </div>
  )
}
