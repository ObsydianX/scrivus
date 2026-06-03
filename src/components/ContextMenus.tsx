import type { TreeNode } from '../types'

function getFolderRole(node: TreeNode) {
  return node.type === 'folder' ? node.role ?? 'chapter' : null
}

export function TabContextMenu({
  menu,
  canDelete,
  canOpenSplit,
  splitOpen,
  onRename,
  onDelete,
  onOpenSplit,
  onCloseSplit,
}: {
  menu: { x: number; y: number; index: number } | null
  canDelete: boolean
  canOpenSplit: boolean
  splitOpen: boolean
  onRename: (index: number) => void
  onDelete: (index: number) => void
  onOpenSplit: (index: number) => void
  onCloseSplit: () => void
}) {
  if (!menu) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: menu.y,
        left: menu.x,
        background: '#2d2d2d',
        border: '1px solid #111',
        borderRadius: 4,
        padding: '4px 0',
        minWidth: 140,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
      onClick={e => e.stopPropagation()}
    >
      <button className="ctx-menu-item" onClick={() => onRename(menu.index)}>
        <i className="ti ti-pencil" /> Rename
      </button>
      {canOpenSplit && (
        <button className="ctx-menu-item" onClick={() => onOpenSplit(menu.index)}>
          <i className="ti ti-layout-bottombar" /> Open in Split View
        </button>
      )}
      {splitOpen && (
        <button className="ctx-menu-item" onClick={onCloseSplit}>
          <i className="ti ti-layout-bottombar-collapse" /> Close Split View
        </button>
      )}
      <div style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
      <button
        className="ctx-menu-item"
        style={{ color: canDelete ? '#cc8888' : '#4a4a4a' }}
        disabled={!canDelete}
        onClick={() => { if (canDelete) onDelete(menu.index) }}
      >
        <i className="ti ti-trash" /> Delete
      </button>
    </div>
  )
}

export function BinderContextMenu({
  menu,
  workspace,
  selectedCount,
  onRename,
  onDuplicate,
  onBulkRename,
  onAddScene,
  onAddFolder,
  onSetFolderRole,
  onMoveToTrash,
}: {
  menu: { x: number; y: number; node: TreeNode; depth: number } | null
  workspace: 'editor' | 'revision' | 'outline' | 'lorebook' | 'mindmap' | 'atlas'
  selectedCount: number
  onRename: (nodeId: number) => void
  onDuplicate: (nodeId: number) => void
  onBulkRename: (nodeId: number) => void
  onAddScene: (node: TreeNode) => void
  onAddFolder: (node: TreeNode, depth: number) => void
  onSetFolderRole: (nodeId: number, role: 'act' | 'chapter') => void
  onMoveToTrash: (node: TreeNode) => void
}) {
  if (!menu) return null

  const isProtected = menu.node.id === 1 || menu.node.id === 2
  const canAddFolder = menu.node.type === 'folder' || menu.depth >= 0
  const actionCount = Math.max(1, selectedCount)
  const folderRole = getFolderRole(menu.node)

  return (
    <div
      style={{
        position: 'fixed',
        top: menu.y,
        left: menu.x,
        background: '#2d2d2d',
        border: '1px solid #111',
        borderRadius: 4,
        padding: '4px 0',
        minWidth: 160,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {!isProtected && (
        <button className="ctx-menu-item" onClick={() => onRename(menu.node.id)}>
          <i className="ti ti-pencil" /> Rename
        </button>
      )}

      {!isProtected && (
        <button className="ctx-menu-item" onClick={() => onDuplicate(menu.node.id)}>
          <i className="ti ti-copy" /> {actionCount > 1 ? `Duplicate ${actionCount} items` : 'Duplicate'}
        </button>
      )}

      {!isProtected && actionCount > 1 && (
        <button className="ctx-menu-item" onClick={() => onBulkRename(menu.node.id)}>
          <i className="ti ti-list-numbers" /> Bulk Rename...
        </button>
      )}

      {workspace === 'editor' && (
        <>
          <button className="ctx-menu-item" onClick={() => onAddScene(menu.node)}>
            <i className="ti ti-file-plus" /> Add Scene
          </button>

          {canAddFolder && (
            <button className="ctx-menu-item" onClick={() => onAddFolder(menu.node, menu.depth)}>
              <i className="ti ti-folder-plus" /> Add Folder
            </button>
          )}
        </>
      )}

      {!isProtected && folderRole && (
        <>
          <div style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
          <button
            className="ctx-menu-item"
            disabled={folderRole === 'chapter'}
            onClick={() => onSetFolderRole(menu.node.id, 'chapter')}
          >
            <i className="ti ti-book-2" /> Set as Chapter
          </button>
          <button
            className="ctx-menu-item"
            disabled={folderRole === 'act'}
            onClick={() => onSetFolderRole(menu.node.id, 'act')}
          >
            <i className="ti ti-books" /> Set as Act
          </button>
        </>
      )}

      {!isProtected && (
        <>
          <div style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
          <button className="ctx-menu-item" style={{ color: '#cc8888' }} onClick={() => onMoveToTrash(menu.node)}>
            <i className="ti ti-trash" /> {actionCount > 1 ? `Move ${actionCount} items to Trash` : 'Move to Trash'}
          </button>
        </>
      )}
    </div>
  )
}

export function SpellcheckContextMenu({
  menu,
  onReplace,
  onAddToDictionary,
}: {
  menu: { x: number; y: number; word: string; suggestions: string[] } | null
  onReplace: (replacement: string) => void
  onAddToDictionary: (word: string) => void
}) {
  if (!menu) return null

  return (
    <div
      className="ctx-menu"
      style={{ top: menu.y, left: menu.x }}
      onClick={e => e.stopPropagation()}
    >
      {menu.suggestions.length > 0 ? (
        menu.suggestions.map(suggestion => (
          <button key={suggestion} className="ctx-menu-item" onClick={() => onReplace(suggestion)}>
            <i className="ti ti-check" aria-hidden="true" /> {suggestion}
          </button>
        ))
      ) : (
        <div className="ctx-menu-empty">No suggestions</div>
      )}
      <div className="ctx-menu-sep" />
      <button className="ctx-menu-item" onClick={() => onAddToDictionary(menu.word)}>
        <i className="ti ti-book" aria-hidden="true" /> Add to Project Dictionary
      </button>
    </div>
  )
}
