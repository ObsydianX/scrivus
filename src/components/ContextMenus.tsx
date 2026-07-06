import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { LoreBook, Manuscript, TreeNode } from '../types'

type EditorContextMenuState = {
  x: number
  y: number
  showFormatting: boolean
  hasSelection: boolean
  selectedText: string
}

function getFolderRole(node: TreeNode) {
  return node.type === 'folder' ? node.role ?? 'chapter' : null
}

function FloatingContextMenu({
  x,
  y,
  className = '',
  children,
  onClick,
}: {
  x: number
  y: number
  className?: string
  children: ReactNode
  onClick?: (event: MouseEvent<HTMLDivElement>) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [style, setStyle] = useState<CSSProperties>({ top: y, left: x })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    const margin = 8
    const nextTop = rect.bottom > window.innerHeight - margin
      ? Math.max(margin, y - rect.height)
      : y
    const nextLeft = rect.right > window.innerWidth - margin
      ? Math.max(margin, x - rect.width)
      : x
    setStyle(current =>
      current.top === nextTop && current.left === nextLeft
        ? current
        : { top: nextTop, left: nextLeft }
    )
  }, [x, y])

  return (
    <div
      ref={ref}
      className={`ctx-menu${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function TabContextMenu({
  menu,
  canDelete,
  canCompare,
  canOpenSplit,
  splitOpen,
  onRename,
  onDuplicate,
  onCompare,
  onDelete,
  onOpenSplit,
  onCloseSplit,
}: {
  menu: { x: number; y: number; index: number } | null
  canDelete: boolean
  canCompare: boolean
  canOpenSplit: boolean
  splitOpen: boolean
  onRename: (index: number) => void
  onDuplicate: (index: number) => void
  onCompare: (index: number) => void
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
      <button className="ctx-menu-item" onClick={() => onDuplicate(menu.index)}>
        <i className="ti ti-copy" /> Duplicate Tab
      </button>
      {canCompare && (
        <button className="ctx-menu-item" onClick={() => onCompare(menu.index)}>
          <i className="ti ti-file-diff" /> Compare Drafts
        </button>
      )}
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
  manuscripts,
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
  manuscripts: Manuscript[]
  onRename: (nodeId: number) => void
  onDuplicate: (nodeId: number) => void
  onBulkRename: (nodeId: number) => void
  onAddScene: (node: TreeNode) => void
  onAddFolder: (node: TreeNode, depth: number) => void
  onSetFolderRole: (nodeId: number, role: 'act' | 'chapter') => void
  onMoveToTrash: (node: TreeNode) => void
}) {
  if (!menu) return null

  const isNotesRoot = menu.node.id === 2
  const isManuscriptRoot = manuscripts.some(manuscript => manuscript.folderId === menu.node.id)
  const canRename = !isNotesRoot
  const canDestructivelyAct = !isNotesRoot && !isManuscriptRoot
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
      {canRename && (
        <button className="ctx-menu-item" onClick={() => onRename(menu.node.id)}>
          <i className="ti ti-pencil" /> Rename
        </button>
      )}

      {canDestructivelyAct && (
        <button className="ctx-menu-item" onClick={() => onDuplicate(menu.node.id)}>
          <i className="ti ti-copy" /> {actionCount > 1 ? `Duplicate ${actionCount} items` : 'Duplicate'}
        </button>
      )}

      {canDestructivelyAct && actionCount > 1 && (
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

      {canDestructivelyAct && folderRole && (
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

      {canDestructivelyAct && (
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
    <FloatingContextMenu
      x={menu.x}
      y={menu.y}
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
    </FloatingContextMenu>
  )
}

export function EditorContextMenu({
  menu,
  loreBook,
  onBold,
  onItalic,
  onUnderline,
  onBulletList,
  onOrderedList,
  onBlockQuote,
  onLinkLoreKeyword,
  onCreateLoreEntry,
  onCut,
  onCopy,
  onPastePlainText,
  onSelectAll,
}: {
  menu: EditorContextMenuState | null
  loreBook: LoreBook
  onBold: () => void
  onItalic: () => void
  onUnderline: () => void
  onBulletList: () => void
  onOrderedList: () => void
  onBlockQuote: () => void
  onLinkLoreKeyword: (categoryId: string, entryId: string, keyword: string) => void
  onCreateLoreEntry: (categoryId: string, name: string) => void
  onCut: () => void
  onCopy: () => void
  onPastePlainText: () => void
  onSelectAll: () => void
}) {
  const [activeLoreMenu, setActiveLoreMenu] = useState<'link' | 'create' | null>(null)
  const [activeLoreCategory, setActiveLoreCategory] = useState<string | null>(null)

  if (!menu) return null

  const categoriesWithEntries = loreBook.categories
    .map(category => ({
      ...category,
      entries: [...category.entries].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .filter(category => category.entries.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
  const sortedCategories = [...loreBook.categories].sort((a, b) => a.name.localeCompare(b.name))
  const canLinkLoreKeyword = Boolean(menu.selectedText && categoriesWithEntries.length > 0)
  const canCreateLoreEntry = Boolean(menu.selectedText && sortedCategories.length > 0)
  const clearLoreSubmenus = () => {
    setActiveLoreMenu(null)
    setActiveLoreCategory(null)
  }

  return (
    <FloatingContextMenu
      x={menu.x}
      y={menu.y}
      className="editor-ctx-menu"
      onClick={e => e.stopPropagation()}
    >
      {menu.showFormatting && (
        <>
          <div className="editor-ctx-formatbar" aria-label="Formatting" onMouseEnter={clearLoreSubmenus}>
            <button type="button" title="Bold" onClick={onBold}>
              <i className="ti ti-bold" aria-hidden="true" />
            </button>
            <button type="button" title="Italic" onClick={onItalic}>
              <i className="ti ti-italic" aria-hidden="true" />
            </button>
            <button type="button" title="Underline" onClick={onUnderline}>
              <i className="ti ti-underline" aria-hidden="true" />
            </button>
            <button type="button" title="Bulleted list" onClick={onBulletList}>
              <i className="ti ti-list" aria-hidden="true" />
            </button>
            <button type="button" title="Numbered list" onClick={onOrderedList}>
              <i className="ti ti-list-numbers" aria-hidden="true" />
            </button>
            <button type="button" title="Block quote" onClick={onBlockQuote}>
              <i className="ti ti-blockquote" aria-hidden="true" />
            </button>
          </div>
          <div className="ctx-menu-sep" />
        </>
      )}
      {menu.hasSelection && (
        <>
          <div
            className="ctx-submenu-wrap"
            onMouseEnter={() => {
              if (!canLinkLoreKeyword) return clearLoreSubmenus()
              setActiveLoreMenu('link')
              setActiveLoreCategory(null)
            }}
          >
            <button className="ctx-menu-item" disabled={!canLinkLoreKeyword}>
              <i className="ti ti-link-plus" aria-hidden="true" /> Link to Lore Book Entry
              <i className="ti ti-chevron-right ctx-menu-chevron" aria-hidden="true" />
            </button>
            {canLinkLoreKeyword && activeLoreMenu === 'link' && (
              <div className="ctx-submenu ctx-submenu-level-1 open">
                {categoriesWithEntries.map(category => (
                  <div
                    key={category.id}
                    className="ctx-submenu-wrap"
                    onMouseEnter={() => setActiveLoreCategory(`link:${category.id}`)}
                  >
                    <button className="ctx-menu-item">
                      <i className="ti ti-folder" aria-hidden="true" /> {category.name}
                      <i className="ti ti-chevron-right ctx-menu-chevron" aria-hidden="true" />
                    </button>
                    {activeLoreCategory === `link:${category.id}` && (
                      <div className="ctx-submenu ctx-submenu-level-2 open">
                        {category.entries.map(entry => (
                          <button
                            key={entry.id}
                            className="ctx-menu-item"
                            onClick={() => onLinkLoreKeyword(category.id, entry.id, menu.selectedText)}
                          >
                            <i className="ti ti-book" aria-hidden="true" />
                            {entry.name || 'Unnamed entry'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div
            className="ctx-submenu-wrap"
            onMouseEnter={() => {
              if (!canCreateLoreEntry) return clearLoreSubmenus()
              setActiveLoreMenu('create')
              setActiveLoreCategory(null)
            }}
          >
            <button className="ctx-menu-item" disabled={!canCreateLoreEntry}>
              <i className="ti ti-book-upload" aria-hidden="true" /> Create Lore Book Entry
              <i className="ti ti-chevron-right ctx-menu-chevron" aria-hidden="true" />
            </button>
            {canCreateLoreEntry && activeLoreMenu === 'create' && (
              <div className="ctx-submenu ctx-submenu-level-1 open">
                {sortedCategories.map(category => (
                  <div
                    key={category.id}
                    className="ctx-submenu-wrap"
                    onMouseEnter={() => setActiveLoreCategory(`create:${category.id}`)}
                  >
                    <button className="ctx-menu-item">
                      <i className="ti ti-folder" aria-hidden="true" /> {category.name}
                      <i className="ti ti-chevron-right ctx-menu-chevron" aria-hidden="true" />
                    </button>
                    {activeLoreCategory === `create:${category.id}` && (
                      <div className="ctx-submenu ctx-submenu-level-2 open">
                        <button
                          className="ctx-menu-item"
                          onClick={() => onCreateLoreEntry(category.id, menu.selectedText)}
                        >
                          <i className="ti ti-plus" aria-hidden="true" />
                          New Entry
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ctx-menu-sep" />
        </>
      )}
      <button className="ctx-menu-item" disabled={!menu.hasSelection} onMouseEnter={clearLoreSubmenus} onClick={() => { if (menu.hasSelection) onCut() }}>
        <i className="ti ti-cut" aria-hidden="true" /> Cut
      </button>
      <button className="ctx-menu-item" disabled={!menu.hasSelection} onMouseEnter={clearLoreSubmenus} onClick={() => { if (menu.hasSelection) onCopy() }}>
        <i className="ti ti-copy" aria-hidden="true" /> Copy
      </button>
      <button className="ctx-menu-item" onMouseEnter={clearLoreSubmenus} onClick={onPastePlainText}>
        <i className="ti ti-clipboard" aria-hidden="true" /> Paste
      </button>
      <div className="ctx-menu-sep" />
      <button className="ctx-menu-item" onMouseEnter={clearLoreSubmenus} onClick={onSelectAll}>
        <i className="ti ti-select-all" aria-hidden="true" /> Select All
      </button>
    </FloatingContextMenu>
  )
}
