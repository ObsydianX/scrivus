import { useState, type RefObject } from 'react'
import { EditorContent, type Editor } from '@tiptap/react'
import type {
  Atlas,
  AtlasImportCandidate,
  LoreBook,
  LoreCategory,
  LoreEntry,
  MindMap,
  MindMapNode,
  MindMapSceneOption,
  OutlineRow,
  RevisionComment,
  SceneTab,
  SceneStatus,
} from '../types'
import {
  EditorToolbar,
  SceneTabBar,
  StatusBar,
} from './EditorChrome'
import { AtlasView } from './AtlasView'
import { LoreBookView } from './LoreBookView'
import { MindMapView } from './MindMapView'
import { OutlineView } from './OutlineView'
import { getActiveComments, renderRevisionAnnotatedHtml, RevisionView } from './RevisionView'
import { countHtmlWords } from '../wordCount'

export type Workspace = 'editor' | 'revision' | 'outline' | 'lorebook' | 'mindmap' | 'atlas'

type RevisionPendingComment = {
  quote: string
  wrappedHtml: string
  startOffset: number
  endOffset: number
}

type EditorWorkspaceState = {
  showEditor: boolean
  editor: Editor | null
  isNarrow: boolean
  isTrashPreview: boolean
  titleValue: string
  titleBookmarked: boolean
  loreLinksEnabled: boolean
  onLoreLinksEnabledChange: (enabled: boolean) => void
}

type TabWorkspaceState = {
  sceneTabs: SceneTab[]
  activeTabIndex: number
  splitTabIndex: number | null
  activeSceneId: number | null
  revisionComments: RevisionComment[]
  renamingTabIndex: number | null
  tabDragIndex: number | null
  tabDropIndex: number | null
  tabDragIndexRef: { current: number | null }
  onTabDragIndexChange: (index: number | null) => void
  onTabDropIndexChange: (index: number | null) => void
  onRenamingTabIndexChange: (index: number | null) => void
  onTabContextMenuChange: (menu: { x: number; y: number; index: number } | null) => void
  onSwitchTab: (index: number) => void
  onSelectSplitTab: (index: number) => void
  onCloseSplitTab: () => void
  onAddTab: () => void
  onRenameTab: (index: number, name: string) => void
  onTabDrop: (targetIndex: number) => void
}

type StatusWorkspaceState = {
  wordCount: number
  chapterWordCount: number
  manuscriptWordCount: number
  readingWpm: number
  zoom: number
  zoomOpen: boolean
  zoomPresets: number[]
  onZoomOpenChange: (open: boolean | ((open: boolean) => boolean)) => void
  onZoomChange: (zoom: number) => void
}

type LoreWorkspaceState = {
  loreBook: LoreBook
  loreView: 'home' | 'category'
  activeLoreCategoryId: string | null
  expandedEntryId: string | null
  projectPath: string | null
  onLoreViewChange: (view: 'home' | 'category') => void
  onActiveLoreCategoryChange: (categoryId: string | null) => void
  onExpandedEntryChange: (entryId: string | null) => void
  onNewCategory: () => void
  onEditCategory: (category: LoreCategory) => void
  onDeleteCategoryRequest: (category: LoreCategory) => void
  onNewEntry: () => void
  onEditEntry: (entry: LoreEntry) => void
  onDeleteEntryRequest: (entry: LoreEntry) => void
}

type OutlineWorkspaceState = {
  rows: OutlineRow[]
  manuscriptWordCount: number
  collapsedFolderIds: Set<number>
  onCollapsedFolderIdsChange: (ids: Set<number>) => void
  onOpenScene: (id: number) => void
  onSceneStatusChange: (id: number, status: SceneStatus) => void
}

type MindMapWorkspaceState = {
  map: MindMap
  scenes: MindMapSceneOption[]
  onChange: (map: MindMap) => void
  onOpenScene: (id: number) => void
  onCreateSceneFromNode: (node: MindMapNode) => Promise<number | null>
}

type AtlasWorkspaceState = {
  atlas: Atlas
  projectPath: string | null
  onChange: (atlas: Atlas) => void
  onChooseImage: () => Promise<AtlasImportCandidate | null>
  onImportMap: (candidate: AtlasImportCandidate) => Promise<void>
  onDeleteMap: (mapId: string) => Promise<void>
  onReplaceMapImage: (mapId: string, candidate: AtlasImportCandidate) => Promise<void>
}

type RevisionWorkspaceState = {
  revisionActiveId: number | null
  revisionComments: RevisionComment[]
  revisionActiveCommentId: string | null
  revisionContent: string
  revisionTitle: string
  revisionTabs: SceneTab[]
  revisionActiveTabIndex: number
  revisionPendingComment: RevisionPendingComment | null
  draftText: string
  revisionScrollRef: RefObject<HTMLDivElement | null>
  confirmDeleteRevisionComment: string | null
  onRevisionActiveCommentChange: (id: string | null) => void
  onSwitchRevisionTab: (index: number) => void
  onDraftTextChange: (text: string) => void
  onDismissPendingComment: () => void
  onCancelPendingComment: (strippedContent: string) => void
  onAddRevisionComment: (quote: string, text: string) => void
  onResolveRevisionComment: (id: string) => void
  onUnresolveRevisionComment: (id: string) => void
  onDeleteRevisionCommentRequest: (id: string) => void
  onClearDeleteRevisionComment: () => void
  onConfirmDeleteRevisionComment: () => void
}

type WorkspaceShellProps = {
  workspace: Workspace
  onWorkspaceChange: (workspace: Workspace) => void
  editorState: EditorWorkspaceState
  tabState: TabWorkspaceState
  statusState: StatusWorkspaceState
  outlineState: OutlineWorkspaceState
  mindMapState: MindMapWorkspaceState
  atlasState: AtlasWorkspaceState
  loreState: LoreWorkspaceState
  revisionState: RevisionWorkspaceState
}

function EditorSplitView({
  tabs,
  activeSceneId,
  splitTabIndex,
  comments,
  onSelectTab,
  onClose,
}: {
  tabs: SceneTab[]
  activeSceneId: number | null
  splitTabIndex: number
  comments: RevisionComment[]
  onSelectTab: (index: number) => void
  onClose: () => void
}) {
  const [hoverComment, setHoverComment] = useState<{ comment: RevisionComment; x: number; y: number } | null>(null)
  const splitTab = tabs[splitTabIndex]
  if (!splitTab) return null

  const activeComments = getActiveComments(comments, activeSceneId, splitTabIndex, tabs)
  const hoverCommentText = hoverComment?.comment.text.trim()

  return (
    <div id="editor-split-view">
      <div id="editor-split-tab-bar">
        <div className="editor-split-tabs">
          {tabs.map((tab, index) => (
            <button
              key={`${tab.name}-${index}`}
              className={`editor-split-tab${index === splitTabIndex ? ' active' : ''}`}
              onClick={() => onSelectTab(index)}
              title={tab.name}
            >
              <span>{tab.name}</span>
            </button>
          ))}
        </div>
        <button className="editor-split-close" onClick={onClose} title="Close Split View" aria-label="Close Split View">
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
      <div id="editor-split-scroll">
        <div id="editor-split-wrap">
          <div id="editor-split-title">{splitTab.name}</div>
          <div
            id="editor-split-body"
            dangerouslySetInnerHTML={{ __html: renderRevisionAnnotatedHtml(splitTab.content, activeComments) }}
            onMouseMove={e => {
              const target = e.target as HTMLElement
              const mark = target.closest('[data-comment-id]') as HTMLElement | null
              const id = mark?.dataset.commentId
              const comment = id ? activeComments.find(c => c.id === id) : null
              setHoverComment(comment ? { comment, x: e.clientX, y: e.clientY } : null)
            }}
            onMouseLeave={() => setHoverComment(null)}
          />
        </div>
      </div>
      {hoverComment && hoverCommentText && (
        <div
          className="editor-split-comment-popover"
          style={{
            left: Math.min(hoverComment.x + 14, window.innerWidth - 290),
            top: Math.min(hoverComment.y + 14, window.innerHeight - 120),
          }}
        >
          <div className="editor-split-comment-text">{hoverCommentText}</div>
        </div>
      )}
    </div>
  )
}

export function WorkspaceShell({
  workspace,
  onWorkspaceChange,
  editorState,
  tabState,
  statusState,
  outlineState,
  mindMapState,
  atlasState,
  loreState,
  revisionState,
}: WorkspaceShellProps) {
  const {
  showEditor,
  editor,
  isNarrow,
  isTrashPreview,
  titleValue,
  titleBookmarked,
  loreLinksEnabled,
  onLoreLinksEnabledChange,
  } = editorState
  const {
  sceneTabs,
  activeTabIndex,
  splitTabIndex,
  activeSceneId: editorActiveSceneId,
  revisionComments: editorRevisionComments,
  renamingTabIndex,
  tabDragIndex,
  tabDropIndex,
  tabDragIndexRef,
  onTabDragIndexChange,
  onTabDropIndexChange,
  onRenamingTabIndexChange,
  onTabContextMenuChange,
  onSwitchTab,
  onSelectSplitTab,
  onCloseSplitTab,
  onAddTab,
  onRenameTab,
  onTabDrop,
  } = tabState
  const {
  wordCount,
  chapterWordCount,
  manuscriptWordCount,
  readingWpm,
  zoom,
  zoomOpen,
  zoomPresets,
  onZoomOpenChange,
  onZoomChange,
  } = statusState
  const {
  rows,
  manuscriptWordCount: outlineManuscriptWordCount,
  collapsedFolderIds: outlineCollapsedFolderIds,
  onCollapsedFolderIdsChange: onOutlineCollapsedFolderIdsChange,
  onOpenScene,
  onSceneStatusChange,
  } = outlineState
  const {
  map: mindMap,
  scenes: mindMapScenes,
  onChange: onMindMapChange,
  onOpenScene: onMindMapOpenScene,
  onCreateSceneFromNode,
  } = mindMapState
  const {
  atlas,
  projectPath: atlasProjectPath,
  onChange: onAtlasChange,
  onChooseImage: onChooseAtlasImage,
  onImportMap,
  onDeleteMap,
  onReplaceMapImage,
  } = atlasState
  const {
  loreBook,
  loreView,
  activeLoreCategoryId,
  expandedEntryId,
  projectPath,
  onLoreViewChange,
  onActiveLoreCategoryChange,
  onExpandedEntryChange,
  onNewCategory,
  onEditCategory,
  onDeleteCategoryRequest,
  onNewEntry,
  onEditEntry,
  onDeleteEntryRequest,
  } = loreState
  const {
  revisionActiveId,
  revisionComments,
  revisionActiveCommentId,
  revisionContent,
  revisionTitle,
  revisionTabs,
  revisionActiveTabIndex,
  revisionScrollRef,
  confirmDeleteRevisionComment,
  onRevisionActiveCommentChange,
  onSwitchRevisionTab,
  onClearDeleteRevisionComment,
  onConfirmDeleteRevisionComment,
  } = revisionState

  return (
    <div id="editor-area">
      <div id="workspace-bar">
        <button
          className={workspace === 'editor' ? 'active' : ''}
          onClick={() => onWorkspaceChange('editor')}
          title="Editor"
        >
          <i className="ti ti-edit" aria-hidden="true" />
          <span>Editor</span>
        </button>
        <button
          className={workspace === 'revision' ? 'active' : ''}
          onClick={() => onWorkspaceChange('revision')}
          title="Revision"
        >
          <i className="ti ti-message-circle" aria-hidden="true" />
          <span>Revision</span>
        </button>
        <button
          className={workspace === 'outline' ? 'active' : ''}
          onClick={() => onWorkspaceChange('outline')}
          title="Outline"
        >
          <i className="ti ti-list-details" aria-hidden="true" />
          <span>Outline</span>
        </button>
        <button
          className={workspace === 'lorebook' ? 'active' : ''}
          onClick={() => onWorkspaceChange('lorebook')}
          title="Lore Book"
        >
          <i className="ti ti-book-2" aria-hidden="true" />
          <span>Lore Book</span>
        </button>
        <button
          className={workspace === 'mindmap' ? 'active' : ''}
          onClick={() => onWorkspaceChange('mindmap')}
          title="Canvas"
        >
          <i className="ti ti-git-fork" aria-hidden="true" />
          <span>Canvas</span>
        </button>
        <button
          className={workspace === 'atlas' ? 'active' : ''}
          onClick={() => onWorkspaceChange('atlas')}
          title="Atlas"
        >
          <i className="ti ti-map-2" aria-hidden="true" />
          <span>Atlas</span>
        </button>
      </div>

      {workspace === 'editor' && showEditor && (
        <SceneTabBar
          tabs={sceneTabs}
          activeIndex={activeTabIndex}
          renamingIndex={renamingTabIndex}
          dragIndex={tabDragIndex}
          dropIndex={tabDropIndex}
          dragIndexRef={tabDragIndexRef}
          onDragIndexChange={onTabDragIndexChange}
          onDropIndexChange={onTabDropIndexChange}
          onRenamingIndexChange={onRenamingTabIndexChange}
          onContextMenuChange={onTabContextMenuChange}
          onSwitchTab={onSwitchTab}
          onAddTab={onAddTab}
          onRenameTab={onRenameTab}
          onTabDrop={onTabDrop}
        />
      )}
      {workspace === 'editor' && (
        <EditorToolbar
          editor={editor}
          loreLinksEnabled={loreLinksEnabled}
          onLoreLinksEnabledChange={onLoreLinksEnabledChange}
        />
      )}
      {workspace === 'lorebook' && (
        <LoreBookView
          loreBook={loreBook}
          loreView={loreView}
          activeCategoryId={activeLoreCategoryId}
          expandedEntryId={expandedEntryId}
          projectPath={projectPath}
          onLoreViewChange={onLoreViewChange}
          onActiveCategoryChange={onActiveLoreCategoryChange}
          onExpandedEntryChange={onExpandedEntryChange}
          onNewCategory={onNewCategory}
          onEditCategory={onEditCategory}
          onDeleteCategoryRequest={onDeleteCategoryRequest}
          onNewEntry={onNewEntry}
          onEditEntry={onEditEntry}
          onDeleteEntryRequest={onDeleteEntryRequest}
        />
      )}
      {workspace === 'outline' && (
        <OutlineView
          rows={rows}
          manuscriptWordCount={outlineManuscriptWordCount}
          collapsedFolderIds={outlineCollapsedFolderIds}
          onCollapsedFolderIdsChange={onOutlineCollapsedFolderIdsChange}
          onOpenScene={onOpenScene}
          onSceneStatusChange={onSceneStatusChange}
        />
      )}
      {workspace === 'revision' && (
        <>
          <RevisionView
            activeId={revisionActiveId}
            comments={revisionComments}
            activeCommentId={revisionActiveCommentId}
            content={revisionContent}
            title={revisionTitle}
            tabs={revisionTabs}
            activeTabIndex={revisionActiveTabIndex}
            footer={!isNarrow && revisionActiveId !== null ? (
              <StatusBar
                wordCount={countHtmlWords(revisionContent)}
                chapterWordCount={chapterWordCount}
                manuscriptWordCount={manuscriptWordCount}
                readingWpm={readingWpm}
                zoom={zoom}
                zoomOpen={zoomOpen}
                zoomPresets={zoomPresets}
                onZoomOpenChange={onZoomOpenChange}
                onZoomChange={onZoomChange}
              />
            ) : undefined}
            scrollRef={revisionScrollRef}
            onActiveCommentChange={onRevisionActiveCommentChange}
            onSwitchTab={onSwitchRevisionTab}
          />
        </>
      )}

      {confirmDeleteRevisionComment && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Delete Comment</div>
            <div className="modal-body">This comment will be permanently deleted and cannot be recovered.</div>
            <div className="modal-footer">
              <button className="welcome-btn" onClick={onClearDeleteRevisionComment}>Cancel</button>
              <button className="welcome-btn" style={{ color: '#cc8888' }} onClick={onConfirmDeleteRevisionComment}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {workspace === 'mindmap' && (
        <MindMapView
          map={mindMap}
          scenes={mindMapScenes}
          onChange={onMindMapChange}
          onOpenScene={onMindMapOpenScene}
          onCreateSceneFromNode={onCreateSceneFromNode}
        />
      )}
      {workspace === 'atlas' && (
        <AtlasView
          atlas={atlas}
          projectPath={atlasProjectPath}
          onChange={onAtlasChange}
          onChooseImage={onChooseAtlasImage}
          onImportMap={onImportMap}
          onDeleteMap={onDeleteMap}
          onReplaceMapImage={onReplaceMapImage}
        />
      )}

      {workspace === 'editor' && (showEditor
        ? <>
          <div id="editor-split-stack" className={splitTabIndex !== null ? 'has-split' : ''}>
            <div id="editor-scroll">
              <div id="editor-wrap">
                {isTrashPreview && (
                  <div className="trash-preview-banner">
                    <i className="ti ti-trash" aria-hidden="true" />
                    This scene is in the trash - read only. Restore it to edit.
                  </div>
                )}
                <div id="editor-title">
                  <span>{titleValue}</span>
                  {titleBookmarked && (
                    <span className="editor-title-bookmark" title="Last opened scene" aria-label="Last opened scene">
                      <i className="ti ti-bookmark" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="tiptap-wrap">
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
            {splitTabIndex !== null && (
              <EditorSplitView
                tabs={sceneTabs}
                activeSceneId={editorActiveSceneId}
                splitTabIndex={splitTabIndex}
                comments={editorRevisionComments}
                onSelectTab={onSelectSplitTab}
                onClose={onCloseSplitTab}
              />
            )}
          </div>
          {!isNarrow && (
            <StatusBar
              wordCount={wordCount}
              chapterWordCount={chapterWordCount}
              manuscriptWordCount={manuscriptWordCount}
              readingWpm={readingWpm}
              zoom={zoom}
              zoomOpen={zoomOpen}
              zoomPresets={zoomPresets}
              onZoomOpenChange={onZoomOpenChange}
              onZoomChange={onZoomChange}
            />
          )}
        </>
        : <div id="empty-state">
          <i className="ti ti-file-text" aria-hidden="true" />
          <p>Select a scene to start writing</p>
          <p className="empty-state-hint">or add one using the + buttons</p>
        </div>
      )}
    </div>
  )
}
