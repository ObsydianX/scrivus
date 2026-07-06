import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { escapeAttr } from '../text'
import type { RevisionComment, SceneTab } from '../types'
import { DocumentTitleBar } from './EditorChrome'

type RevisionPendingComment = {
  quote: string
  wrappedHtml: string
  startOffset: number
  endOffset: number
}

type RevisionViewProps = {
  activeId: number | null
  comments: RevisionComment[]
  activeCommentId: string | null
  content: string
  title: string
  tabs: SceneTab[]
  activeTabIndex: number
  zoom: number
  canSelectPreviousScene: boolean
  canSelectNextScene: boolean
  footer?: ReactNode
  scrollRef: RefObject<HTMLDivElement | null>
  onActiveCommentChange: (id: string | null) => void
  onSelectPreviousScene: () => void
  onSelectNextScene: () => void
  onSwitchTab: (index: number) => void
}

type RevisionCommentsPaneProps = {
  activeId: number | null
  comments: RevisionComment[]
  activeCommentId: string | null
  activeTabIndex: number
  tabs: SceneTab[]
  pendingComment: RevisionPendingComment | null
  content: string
  draftText: string
  onActiveCommentChange: (id: string | null) => void
  onDraftTextChange: (text: string) => void
  onDismissPendingComment: () => void
  onCancelPendingComment: (strippedContent: string) => void
  onAddComment: (quote: string, text: string) => void
  onResolveComment: (id: string) => void
  onUnresolveComment: (id: string) => void
  onDeleteCommentRequest: (id: string) => void
}

export function getActiveComments(
  comments: RevisionComment[],
  activeId: number | null,
  activeTabIndex: number,
  tabs: SceneTab[],
) {
  const legacyCommentTabIndex = Math.max(tabs.length - 1, 0)
  return comments
    .filter(c => c.sceneId === activeId && (c.tabIndex ?? legacyCommentTabIndex) === activeTabIndex)
    .sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
      return a.createdAt - b.createdAt
    })
}

function getRevisionTabCommentCounts(
  comments: RevisionComment[],
  activeId: number | null,
  tabs: SceneTab[],
) {
  const counts = new Map<number, number>()
  const legacyCommentTabIndex = Math.max(tabs.length - 1, 0)
  comments.forEach(comment => {
    if (comment.sceneId !== activeId || comment.resolved) return
    const tabIndex = comment.tabIndex ?? legacyCommentTabIndex
    if (tabIndex < 0 || tabIndex >= tabs.length) return
    counts.set(tabIndex, (counts.get(tabIndex) ?? 0) + 1)
  })
  return counts
}

export function renderRevisionAnnotatedHtml(
  html: string,
  activeComments: RevisionComment[],
  activeCommentId: string | null = null,
): string {
  let result = html

  activeComments.forEach(c => {
    const isResolved = c.resolved
    const isActive = activeCommentId === c.id

    const cls = [
      'revision-highlight',
      isActive ? 'revision-highlight--active' : '',
      isResolved ? 'revision-highlight--resolved' : '',
    ].filter(Boolean).join(' ')

    const safeId = escapeAttr(c.id)
    const startTag = `<x-comment-start data-id="${safeId}"></x-comment-start>`
    const endTag = `<x-comment-end data-id="${safeId}"></x-comment-end>`

    const startIndex = result.indexOf(startTag)
    const endIndex = result.indexOf(endTag)

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return

    const beforeStart = result.slice(0, startIndex)
    const afterStart = result.slice(startIndex + startTag.length)
    const middle = afterStart.slice(0, afterStart.indexOf(endTag))
    const afterEnd = afterStart.slice(afterStart.indexOf(endTag) + endTag.length)

    const wrap = (wrappedContent: string) =>
      `<mark class="${cls}" data-comment-id="${safeId}">${wrappedContent}</mark>`

    const segments = middle.split(/(?=<p[^>]*>)|(?<=<\/p>)/)

    const wrappedMiddle = segments.map(segment => {
      if (!segment) return segment

      if (segment.match(/^<p[^>]*>/)) {
        return segment
          .replace(
            /^(<p[^>]*>)([\s\S]*)(<\/p>)$/,
            (_match, open, segmentContent, close) => `${open}${wrap(segmentContent)}${close}`
          )
          .replace(
            /^(<p[^>]*>)([\s\S]*)$/,
            (_match, open, segmentContent) => `${open}${wrap(segmentContent)}`
          )
      }

      return segment.replace(
        /^([\s\S]*?)(<\/p>)$/,
        (_match, segmentContent, close) => `${wrap(segmentContent)}${close}`
      )
    }).join('')

    const finalMiddle = wrappedMiddle === middle
      ? wrap(middle)
      : wrappedMiddle

    result = beforeStart + finalMiddle + afterEnd
  })

  return result
}

export function RevisionView({
  activeId,
  comments,
  activeCommentId,
  content,
  title,
  tabs,
  activeTabIndex,
  zoom,
  canSelectPreviousScene,
  canSelectNextScene,
  footer,
  scrollRef,
  onActiveCommentChange,
  onSelectPreviousScene,
  onSelectNextScene,
  onSwitchTab,
}: RevisionViewProps) {
  const activeComments = getActiveComments(comments, activeId, activeTabIndex, tabs)
  const tabCommentCounts = getRevisionTabCommentCounts(comments, activeId, tabs)
  const activeTabName = tabs[activeTabIndex]?.name?.trim()
  const titleBarText = activeTabName && tabs.length > 1 ? `${title} - ${activeTabName}` : title
  const zoomScale = zoom / 100
  const activeCommentKey = activeComments.map(comment => comment.id).join('|')

  useEffect(() => {
    if (!activeCommentId) return
    const scroll = scrollRef.current
    if (!scroll) return

    const frame = requestAnimationFrame(() => {
      const marks = Array.from(scroll.querySelectorAll<HTMLElement>('[data-comment-id]'))
      const mark = marks.find(element => element.dataset.commentId === activeCommentId)
      if (!mark) return

      const scrollRect = scroll.getBoundingClientRect()
      const markRect = mark.getBoundingClientRect()
      const markCenter = markRect.top + markRect.height / 2
      const scrollCenter = scrollRect.top + scrollRect.height / 2
      scroll.scrollTo({
        top: scroll.scrollTop + markCenter - scrollCenter,
        behavior: 'smooth',
      })
    })

    return () => cancelAnimationFrame(frame)
  }, [activeCommentId, activeCommentKey, activeTabIndex, content, scrollRef])

  if (!activeId) {
    return (
      <div id="revision-empty">
        <i className="ti ti-message-circle" aria-hidden="true" />
        <p>Select a scene from the binder to review</p>
      </div>
    )
  }

  return (
    <div id="revision-layout">
      <div id="revision-main">
        {tabs.length > 0 && (
          <div id="revision-tab-bar">
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
              const commentCount = tabCommentCounts.get(index) ?? 0
              const commentLabel = commentCount === 1 ? '1 unresolved comment' : `${commentCount} unresolved comments`
              return (
                <button
                  key={`${tab.name}-${index}`}
                  className={`revision-tab${index === activeTabIndex ? ' active' : ''}${commentCount > 0 ? ' has-comments' : ''}`}
                  onClick={() => onSwitchTab(index)}
                  title={commentCount > 0 ? `${tab.name} - ${commentLabel}` : tab.name}
                >
                  <span className="revision-tab-label">{tab.name}</span>
                  {commentCount > 0 && (
                    <span className="revision-tab-comment-badge" aria-label={commentLabel}>
                      {commentCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        <DocumentTitleBar title={titleBarText} />
        <div id="revision-scroll" ref={scrollRef}>
          <div id="revision-wrap">
            <div
              id="revision-body"
              style={{ fontSize: `calc(var(--editor-body-size, 12pt) * ${zoomScale})` }}
              dangerouslySetInnerHTML={{ __html: renderRevisionAnnotatedHtml(content, activeComments, activeCommentId) }}
              onClick={e => {
                const target = e.target as HTMLElement
                const mark = target.closest('[data-comment-id]') as HTMLElement | null
                if (mark) {
                  const cid = mark.dataset.commentId ?? null
                  if (cid && cid === activeCommentId) {
                    onActiveCommentChange(null)
                    requestAnimationFrame(() => onActiveCommentChange(cid))
                  } else {
                    onActiveCommentChange(cid)
                  }
                }
              }}
            />
          </div>
        </div>
        {footer}
      </div>

    </div>
  )
}

export function RevisionCommentsPane({
  activeId,
  comments,
  activeCommentId,
  activeTabIndex,
  tabs,
  pendingComment,
  content,
  draftText,
  onActiveCommentChange,
  onDraftTextChange,
  onDismissPendingComment,
  onCancelPendingComment,
  onAddComment,
  onResolveComment,
  onUnresolveComment,
  onDeleteCommentRequest,
}: RevisionCommentsPaneProps) {
  const [commentsOpen, setCommentsOpen] = useState(true)
  const activeComments = getActiveComments(comments, activeId, activeTabIndex, tabs)

  return (
    <div id="revision-comments-pane" className={commentsOpen ? '' : 'collapsed'}>
      <div id="revision-comments-header">
        <div style={{ display: 'flex', flexDirection: commentsOpen ? 'row' : 'column', gap: 2, alignItems: 'center' }}>
          {!commentsOpen && (
            <button title="Expand comments" onClick={() => setCommentsOpen(true)}>
              <i className="ti ti-chevrons-left" aria-hidden="true" />
            </button>
          )}
          {commentsOpen && (
            <>
              <button title="Collapse comments" onClick={() => setCommentsOpen(false)}>
                <i className="ti ti-chevrons-right" aria-hidden="true" />
              </button>
              <div className="sidebar-sep" />
            </>
          )}
        </div>
        {commentsOpen && <span>Comments</span>}
        {commentsOpen && activeComments.filter(c => !c.resolved).length > 0 && (
          <span className="revision-comments-count">
            {activeComments.filter(c => !c.resolved).length}
          </span>
        )}
      </div>

      {commentsOpen && <div id="revision-comments-list">
        {pendingComment && (
          <div className="revision-comment revision-comment--pending">
            <div className="revision-comment-quote">
              <i className="ti ti-quote" aria-hidden="true" />
              {pendingComment.quote.length > 120
                ? pendingComment.quote.slice(0, 120) + '...'
                : pendingComment.quote}
            </div>
            <textarea
              className="revision-comment-input"
              placeholder="Add a comment..."
              value={draftText}
              autoFocus
              onChange={e => onDraftTextChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'z' || e.key === 'y') e.stopPropagation()
                if (e.key === 'Escape') onDismissPendingComment()
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  if (draftText.trim()) onAddComment(pendingComment.quote, draftText.trim())
                }
              }}
            />
            <div className="revision-comment-actions">
              <button
                className="revision-btn revision-btn--ghost"
                onClick={() => {
                  const stripped = content
                    .replace(/<x-comment-start data-id="pending"><\/x-comment-start>/g, '')
                    .replace(/<x-comment-end data-id="pending"><\/x-comment-end>/g, '')
                  onCancelPendingComment(stripped)
                }}
              >
                Cancel
              </button>
              <button
                className="revision-btn"
                disabled={!draftText.trim()}
                onClick={() => {
                  if (draftText.trim()) onAddComment(pendingComment.quote, draftText.trim())
                }}
              >
                Comment
              </button>
            </div>
          </div>
        )}

        {activeComments.length === 0 && !pendingComment && (
          <div className="revision-comments-empty">
            <i className="ti ti-message-circle-off" aria-hidden="true" />
            <p>No comments yet</p>
            <p className="revision-comments-empty-hint">Select text to add one</p>
          </div>
        )}

        {activeComments.map(c => (
          <div
            key={c.id}
            className={`revision-comment${activeCommentId === c.id ? ' revision-comment--active' : ''}${c.resolved ? ' revision-comment--resolved' : ''}`}
            onClick={() => {
              if (c.id === activeCommentId) {
                onActiveCommentChange(null)
                requestAnimationFrame(() => onActiveCommentChange(c.id))
              } else {
                onActiveCommentChange(c.id)
              }
            }}
          >
            <div className="revision-comment-meta">
              <span className="revision-comment-date">
                {new Date(c.createdAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric',
                })}
              </span>
              {c.reviewReviewerName && <span className="revision-comment-reviewer">{c.reviewReviewerName}</span>}
              {c.unanchored && <span className="revision-comment-unanchored">Unanchored</span>}
            </div>
            {(c.reviewChapterTitle || c.reviewSceneTitle) && (
              <div className="revision-comment-context">
                {[c.reviewChapterTitle, c.reviewSceneTitle].filter(Boolean).join(' / ')}
              </div>
            )}
            <div className="revision-comment-quote">
              <i className="ti ti-quote" aria-hidden="true" />
              {c.quote.length > 100 ? c.quote.slice(0, 100) + '...' : c.quote}
            </div>
            <div className="revision-comment-text">
              {c.text}
            </div>
            <div className="revision-comment-actions">
              {!c.resolved ? (
                <button
                  className="revision-btn revision-btn--ghost revision-btn--sm"
                  onClick={e => { e.stopPropagation(); onResolveComment(c.id) }}
                >
                  <i className="ti ti-check" /> Resolve
                </button>
              ) : (
                <button
                  className="revision-btn revision-btn--ghost revision-btn--sm"
                  onClick={e => { e.stopPropagation(); onUnresolveComment(c.id) }}
                >
                  <i className="ti ti-arrow-back-up" /> Unresolve
                </button>
              )}
              <button
                className="revision-btn revision-btn--ghost revision-btn--sm revision-btn--danger"
                onClick={e => { e.stopPropagation(); onDeleteCommentRequest(c.id) }}
              >
                <i className="ti ti-trash" />
              </button>
            </div>
          </div>
        ))}
      </div>}
    </div>
  )
}
