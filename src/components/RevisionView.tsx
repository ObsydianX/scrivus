import type { RefObject } from 'react'
import { escapeAttr } from '../text'
import type { RevisionComment } from '../types'

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
  pendingComment: RevisionPendingComment | null
  draftText: string
  scrollRef: RefObject<HTMLDivElement | null>
  onActiveCommentChange: (id: string | null) => void
  onDraftTextChange: (text: string) => void
  onDismissPendingComment: () => void
  onCancelPendingComment: (strippedContent: string) => void
  onAddComment: (quote: string, text: string) => void
  onResolveComment: (id: string) => void
  onUnresolveComment: (id: string) => void
  onDeleteCommentRequest: (id: string) => void
}

export function RevisionView({
  activeId,
  comments,
  activeCommentId,
  content,
  title,
  pendingComment,
  draftText,
  scrollRef,
  onActiveCommentChange,
  onDraftTextChange,
  onDismissPendingComment,
  onCancelPendingComment,
  onAddComment,
  onResolveComment,
  onUnresolveComment,
  onDeleteCommentRequest,
}: RevisionViewProps) {
  const activeComments = comments
    .filter(c => c.sceneId === activeId)
    .sort((a, b) => {
      if (a.resolved !== b.resolved) return a.resolved ? 1 : -1
      return a.createdAt - b.createdAt
    })

  const renderAnnotatedHtml = (html: string): string => {
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
      <div id="revision-scroll" ref={scrollRef}>
        <div id="revision-wrap">
          <div id="revision-title">{title}</div>
          <div
            id="revision-body"
            dangerouslySetInnerHTML={{ __html: renderAnnotatedHtml(content) }}
            onClick={e => {
              const target = e.target as HTMLElement
              const mark = target.closest('[data-comment-id]') as HTMLElement | null
              if (mark) {
                const cid = mark.dataset.commentId ?? null
                onActiveCommentChange(cid)
              }
            }}
          />
        </div>
      </div>

      <div id="revision-comments-pane">
        <div id="revision-comments-header">
          <span>Comments</span>
          {activeComments.filter(c => !c.resolved).length > 0 && (
            <span className="revision-comments-count">
              {activeComments.filter(c => !c.resolved).length}
            </span>
          )}
        </div>

        <div id="revision-comments-list">
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
              onClick={() => onActiveCommentChange(c.id === activeCommentId ? null : c.id)}
            >
              <div className="revision-comment-meta">
                <span className="revision-comment-date">
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric',
                  })}
                </span>
              </div>
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
        </div>
      </div>
    </div>
  )
}
