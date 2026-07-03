import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { Editor } from '@tiptap/react'
import type { SceneTab, SprintTimerState } from '../types'

type MutableRef<T> = {
  current: T
}

export function DocumentTitleBar({
  title,
  bookmarked = false,
}: {
  title: string
  bookmarked?: boolean
}) {
  return (
    <div className="document-title-bar">
      <span>{title}</span>
      {bookmarked && (
        <span className="document-title-bookmark" title="Last opened scene" aria-label="Last opened scene">
          <i className="ti ti-bookmark" aria-hidden="true" />
        </span>
      )}
    </div>
  )
}

export function SceneTabBar({
  tabs,
  activeIndex,
  canSelectPreviousScene,
  canSelectNextScene,
  renamingIndex,
  dragIndex,
  dropIndex,
  dragIndexRef,
  onSelectPreviousScene,
  onSelectNextScene,
  onDragIndexChange,
  onDropIndexChange,
  onRenamingIndexChange,
  onContextMenuChange,
  onSwitchTab,
  onAddTab,
  onRenameTab,
  onTabDrop,
  focusMode,
  onFocusModeChange,
  typewriterScrolling,
  onTypewriterScrollingChange,
}: {
  tabs: SceneTab[]
  activeIndex: number
  canSelectPreviousScene: boolean
  canSelectNextScene: boolean
  renamingIndex: number | null
  dragIndex: number | null
  dropIndex: number | null
  dragIndexRef: MutableRef<number | null>
  onSelectPreviousScene: () => void
  onSelectNextScene: () => void
  onDragIndexChange: (index: number | null) => void
  onDropIndexChange: (index: number | null) => void
  onRenamingIndexChange: (index: number | null) => void
  onContextMenuChange: (menu: { x: number; y: number; index: number } | null) => void
  onSwitchTab: (index: number) => void
  onAddTab: () => void
  onRenameTab: (index: number, name: string) => void
  onTabDrop: (targetIndex: number) => void
  focusMode: boolean
  onFocusModeChange: (focusMode: boolean) => void
  typewriterScrolling: boolean
  onTypewriterScrollingChange: (enabled: boolean) => void
}) {
  return (
    <div
      id="scene-tab-bar"
      onContextMenu={e => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onContextMenuChange({ x: e.clientX, y: e.clientY, index: activeIndex })
      }}
    >
      <div className="scene-nav-controls">
        <button
          type="button"
          className="scene-nav-btn"
          disabled={!canSelectPreviousScene}
          onClick={onSelectPreviousScene}
          title="Previous scene"
          aria-label="Previous scene"
        >
          <i className="ti ti-chevron-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="scene-nav-btn"
          disabled={!canSelectNextScene}
          onClick={onSelectNextScene}
          title="Next scene"
          aria-label="Next scene"
        >
          <i className="ti ti-chevron-right" aria-hidden="true" />
        </button>
      </div>
      {tabs.map((tab, index) => {
        const isActive = index === activeIndex
        const isDragging = dragIndex === index
        const isDropTarget = dropIndex === index
        return (
          <div key={index} style={{ display: 'flex', alignItems: 'stretch' }}>
            {isDropTarget && dragIndex !== index && (
              <div className="tab-drop-line" />
            )}
            <div
              className={`scene-tab${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}`}
              draggable={renamingIndex !== index}
              onDragStart={renamingIndex !== index ? e => {
                e.stopPropagation()
                dragIndexRef.current = index
                onDragIndexChange(index)
                e.dataTransfer.effectAllowed = 'move'
              } : undefined}
              onDragEnd={() => {
                onDragIndexChange(null)
                onDropIndexChange(null)
                dragIndexRef.current = null
              }}
              onDragOver={e => {
                e.preventDefault()
                e.stopPropagation()
                onDropIndexChange(index)
              }}
              onDrop={e => {
                e.preventDefault()
                e.stopPropagation()
                onTabDrop(index)
              }}
              onClick={() => {
                if (renamingIndex === index) return
                onSwitchTab(index)
              }}
              onDoubleClick={() => onRenamingIndexChange(index)}
              onContextMenu={e => {
                e.preventDefault()
                e.stopPropagation()
                onContextMenuChange({ x: e.clientX, y: e.clientY, index })
              }}
            >
              {renamingIndex === index
                ? <input
                  className="tab-rename-input"
                  defaultValue={tab.name}
                  autoFocus
                  ref={el => { if (el) { el.focus(); el.select() } }}
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => {
                    if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                    if (e.key === 'Enter') onRenameTab(index, (e.target as HTMLInputElement).value)
                    if (e.key === 'Escape') onRenamingIndexChange(null)
                  }}
                  onBlur={e => onRenameTab(index, e.target.value)}
                />
                : <span className="tab-label">{tab.name}</span>
              }
            </div>
          </div>
        )
      })}
      <button
        className="tab-add-btn"
        title="Add tab"
        onClick={onAddTab}
      >
        <i className="ti ti-plus" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`scene-focus-btn scene-typewriter-btn${typewriterScrolling ? ' active' : ''}`}
        title={typewriterScrolling ? 'Disable typewriter scrolling' : 'Typewriter scrolling — keep the caret line centered while typing'}
        aria-label={typewriterScrolling ? 'Disable typewriter scrolling' : 'Enable typewriter scrolling'}
        aria-pressed={typewriterScrolling}
        onClick={() => onTypewriterScrollingChange(!typewriterScrolling)}
      >
        <i className="ti ti-keyboard" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`scene-focus-btn${focusMode ? ' active' : ''}`}
        title={focusMode ? 'Exit focus mode' : 'Focus mode'}
        aria-label={focusMode ? 'Exit focus mode' : 'Focus mode'}
        aria-pressed={focusMode}
        onClick={() => onFocusModeChange(!focusMode)}
      >
        <i className={`ti ${focusMode ? 'ti-arrows-minimize' : 'ti-arrows-maximize'}`} aria-hidden="true" />
      </button>
    </div>
  )
}

export function EditorToolbar({
  editor,
  loreLinksEnabled,
  onLoreLinksEnabledChange,
}: {
  editor: Editor | null
  loreLinksEnabled: boolean
  onLoreLinksEnabledChange: (enabled: boolean) => void
}) {
  const [, setToolbarVersion] = useState(0)

  useEffect(() => {
    if (!editor) return
    const refresh = () => setToolbarVersion(version => version + 1)
    editor.on('transaction', refresh)
    editor.on('selectionUpdate', refresh)
    editor.on('focus', refresh)
    editor.on('blur', refresh)
    return () => {
      editor.off('transaction', refresh)
      editor.off('selectionUpdate', refresh)
      editor.off('focus', refresh)
      editor.off('blur', refresh)
    }
  }, [editor])

  const runToolbarCommand = (event: MouseEvent<HTMLButtonElement>, command: () => void) => {
    event.preventDefault()
    command()
    setToolbarVersion(version => version + 1)
  }

  const insertSceneBreak = () => {
    editor?.chain().focus().setHorizontalRule().run()
  }

  const insertPageBreak = () => {
    editor?.chain().focus().insertContent('<div data-page-break="true"></div><p></p>').run()
  }

  return (
    <div id="editor-toolbar">
      <div className="editor-toolbar-group">
        <button
          type="button"
          className={editor?.isActive('bold') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleBold().run())}
          title="Bold"
        >
          <i className="ti ti-bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor?.isActive('italic') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleItalic().run())}
          title="Italic"
        >
          <i className="ti ti-italic" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor?.isActive('underline') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleMark('underline').run())}
          title="Underline"
        >
          <i className="ti ti-underline" aria-hidden="true" />
        </button>
        <div className="toolbar-sep" />
        <button
          type="button"
          className={editor?.isActive('bulletList') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleBulletList().run())}
          title="Bulleted list"
        >
          <i className="ti ti-list" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor?.isActive('orderedList') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleOrderedList().run())}
          title="Numbered list"
        >
          <i className="ti ti-list-numbers" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor?.isActive('blockquote') ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleBlockquote().run())}
          title="Block quote"
        >
          <i className="ti ti-blockquote" aria-hidden="true" />
        </button>
        <div className="toolbar-sep" />
        <button
          type="button"
          className={editor?.isActive('heading', { level: 1 }) ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleHeading({ level: 1 }).run())}
          title="Heading 1"
        >
          <i className="ti ti-h-1" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={editor?.isActive('heading', { level: 2 }) ? 'active' : ''}
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().toggleHeading({ level: 2 }).run())}
          title="Heading 2"
        >
          <i className="ti ti-h-2" aria-hidden="true" />
        </button>
        <button
          type="button"
          onMouseDown={event => runToolbarCommand(event, insertPageBreak)}
          title="Page break"
        >
          <i className="ti ti-page-break" aria-hidden="true" />
        </button>
        <div className="toolbar-sep" />
        <button
          type="button"
          onMouseDown={event => runToolbarCommand(event, insertSceneBreak)}
          title="Scene break"
        >
          <i className="ti ti-separator-horizontal" aria-hidden="true" />
        </button>
        <button
          type="button"
          onMouseDown={event => runToolbarCommand(event, () => editor?.chain().focus().unsetAllMarks().clearNodes().run())}
          title="Clear formatting"
        >
          <i className="ti ti-eraser" aria-hidden="true" />
        </button>
      </div>
      <label className="toolbar-check">
        <input
          type="checkbox"
          checked={loreLinksEnabled}
          onChange={e => onLoreLinksEnabledChange(e.target.checked)}
        />
        Lore links
      </label>
    </div>
  )
}

const SPRINT_DURATIONS = [5, 10, 15, 20, 30, 45, 60]

function formatSprintCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function SprintControl({
  sprint,
  sprintWords,
  onSprintStart,
  onSprintStop,
}: {
  sprint: SprintTimerState | null
  sprintWords: number
  onSprintStart: (minutes: number) => void
  onSprintStop: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const controlRef = useRef<HTMLDivElement | null>(null)
  const running = sprint !== null && !sprint.finished
  const [, setTick] = useState(0)

  // Re-render every half second while a sprint is counting down.
  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => setTick(tick => tick + 1), 500)
    return () => window.clearInterval(interval)
  }, [running])

  useEffect(() => {
    if (!menuOpen) return
    const handler = (event: globalThis.MouseEvent) => {
      if (controlRef.current && !controlRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [menuOpen])

  return (
    <div className="sprint-control" ref={controlRef}>
      {sprint === null ? (
        <>
          <button
            type="button"
            className="sprint-btn"
            onClick={() => setMenuOpen(open => !open)}
            title="Start a writing sprint"
          >
            <i className="ti ti-alarm" aria-hidden="true" /> Sprint
          </button>
          {menuOpen && (
            <div className="sprint-dropdown">
              {SPRINT_DURATIONS.map(minutes => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    onSprintStart(minutes)
                  }}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          )}
        </>
      ) : sprint.finished ? (
        <span className="sprint-chip sprint-done" title={`${sprint.durationMinutes}-minute sprint finished`}>
          <i className="ti ti-confetti" aria-hidden="true" />
          Sprint done · +{sprint.finalWords.toLocaleString()} {sprint.finalWords === 1 ? 'word' : 'words'}
          <button type="button" className="sprint-dismiss" onClick={onSprintStop} title="Dismiss">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <span className="sprint-chip sprint-running" title={`${sprint.durationMinutes}-minute sprint · words written so far`}>
          <i className="ti ti-alarm" aria-hidden="true" />
          {formatSprintCountdown(sprint.endsAt - Date.now())} · +{sprintWords.toLocaleString()}
          <button type="button" className="sprint-dismiss" onClick={onSprintStop} title="Stop sprint">
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  )
}

export function StatusBar({
  wordCount,
  targetWordCount,
  onGoalClick,
  chapterWordCount,
  manuscriptWordCount,
  readingWpm,
  sprint,
  sprintWords,
  onSprintStart,
  onSprintStop,
  zoom,
  zoomOpen,
  zoomPresets,
  onZoomOpenChange,
  onZoomChange,
}: {
  wordCount: number
  targetWordCount?: number
  onGoalClick?: () => void
  chapterWordCount: number
  manuscriptWordCount: number
  readingWpm: number
  sprint?: SprintTimerState | null
  sprintWords?: number
  onSprintStart?: (minutes: number) => void
  onSprintStop?: () => void
  zoom: number
  zoomOpen: boolean
  zoomPresets: number[]
  onZoomOpenChange: (open: boolean | ((open: boolean) => boolean)) => void
  onZoomChange: (zoom: number) => void
}) {
  const safeReadingWpm = Math.max(1, readingWpm)
  const safeTargetWordCount = targetWordCount && targetWordCount > 0 ? targetWordCount : 0
  const targetProgress = safeTargetWordCount > 0
    ? Math.min(100, Math.round((wordCount / safeTargetWordCount) * 100))
    : 0
  const chapterReadTime = (() => {
    if (chapterWordCount <= 0) return '--- chapter'
    const minutes = Math.ceil(chapterWordCount / safeReadingWpm)
    if (minutes < 60) return `~${minutes} min chapter`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `~${hours}h ${mins}m chapter` : `~${hours}h chapter`
  })()

  const manuscriptReadTime = (() => {
    const minutes = Math.ceil(manuscriptWordCount / safeReadingWpm)
    if (minutes < 60) return `~${minutes} min manuscript`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `~${hours}h ${mins}m manuscript` : `~${hours}h manuscript`
  })()

  return (
    <div id="statusbar" className={onGoalClick ? 'has-goal' : undefined}>
      <span title="Words in current scene">
        Scene: {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
      </span>
      <span className="statusbar-sep">·</span>
      <span title="Words in current chapter">
        Chapter: {chapterWordCount > 0 ? `${chapterWordCount.toLocaleString()} ${chapterWordCount === 1 ? 'word' : 'words'}` : '---'}
      </span>
      <span className="statusbar-sep">·</span>
      <span title={`Estimated reading time for current chapter at ${safeReadingWpm} wpm`}>
        {chapterReadTime}
      </span>
      <span className="statusbar-sep">·</span>
      <span title="Total words in Manuscript">
        Manuscript: {manuscriptWordCount.toLocaleString()} {manuscriptWordCount === 1 ? 'word' : 'words'}
      </span>
      <span className="statusbar-sep">·</span>
      <span title={`Estimated reading time for full manuscript at ${safeReadingWpm} wpm`}>
        {manuscriptReadTime}
      </span>
      {onSprintStart && onSprintStop && (
        <SprintControl
          sprint={sprint ?? null}
          sprintWords={sprintWords ?? 0}
          onSprintStart={onSprintStart}
          onSprintStop={onSprintStop}
        />
      )}
      {onGoalClick && (
        <button
          type="button"
          className="statusbar-goal"
          onClick={onGoalClick}
          title={safeTargetWordCount > 0 ? `Scene target: ${safeTargetWordCount.toLocaleString()} words` : 'Set writing goals'}
        >
          <span className="statusbar-goal-label">
            Goal: {safeTargetWordCount > 0
              ? `${wordCount.toLocaleString()} / ${safeTargetWordCount.toLocaleString()}`
              : 'Set'}
          </span>
          <span className="statusbar-goal-track" aria-hidden="true">
            <span style={{ width: `${targetProgress}%` }} />
          </span>
        </button>
      )}
      <div className="zoom-control">
        <button className="zoom-btn" onClick={() => onZoomOpenChange(o => !o)}>
          {zoom}% <i className="ti ti-chevron-up" />
        </button>
        {zoomOpen && (
          <div className="zoom-dropdown">
            {zoomPresets.map(p => (
              <button
                key={p}
                className={zoom === p ? 'active' : ''}
                onClick={() => { onZoomChange(p); onZoomOpenChange(false) }}
              >
                {p === zoom ? <i className="ti ti-circle-filled zoom-active-dot" /> : <span className="zoom-inactive-dot" />}
                {p}%
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
