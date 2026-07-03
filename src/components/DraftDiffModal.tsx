import { Fragment, useEffect, useMemo } from 'react'
import { diffDraftParagraphs } from '../draftDiff'
import { htmlToPlainLines } from '../text'
import type { SceneTab } from '../types'

export function DraftDiffModal({
  tabs,
  sceneTitle,
  leftIndex,
  rightIndex,
  onLeftIndexChange,
  onRightIndexChange,
  onClose,
}: {
  tabs: SceneTab[]
  sceneTitle: string
  leftIndex: number
  rightIndex: number
  onLeftIndexChange: (index: number) => void
  onRightIndexChange: (index: number) => void
  onClose: () => void
}) {
  const safeLeft = Math.min(Math.max(0, leftIndex), tabs.length - 1)
  const safeRight = Math.min(Math.max(0, rightIndex), tabs.length - 1)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  const diff = useMemo(() => {
    const leftParagraphs = htmlToPlainLines(tabs[safeLeft]?.content ?? '')
    const rightParagraphs = htmlToPlainLines(tabs[safeRight]?.content ?? '')
    return diffDraftParagraphs(leftParagraphs, rightParagraphs)
  }, [tabs, safeLeft, safeRight])

  const renderTabOptions = () => tabs.map((tab, index) => (
    <option key={index} value={index}>
      {tab.name}{index === tabs.length - 1 ? ' (latest)' : ''}
    </option>
  ))

  return (
    <div className="modal-overlay">
      <div className="modal-box draft-diff-modal">
        <p className="modal-title">Compare Drafts — {sceneTitle}</p>

        <div className="draft-diff-controls">
          <select
            className="modal-input draft-diff-select"
            value={safeLeft}
            onChange={e => onLeftIndexChange(Number(e.target.value))}
            title="Older draft (removals are measured against this)"
          >
            {renderTabOptions()}
          </select>
          <i className="ti ti-arrow-right draft-diff-arrow" aria-hidden="true" />
          <select
            className="modal-input draft-diff-select"
            value={safeRight}
            onChange={e => onRightIndexChange(Number(e.target.value))}
            title="Newer draft (additions are measured against this)"
          >
            {renderTabOptions()}
          </select>
          <button
            type="button"
            className="draft-diff-swap"
            title="Swap drafts"
            aria-label="Swap drafts"
            onClick={() => {
              onLeftIndexChange(safeRight)
              onRightIndexChange(safeLeft)
            }}
          >
            <i className="ti ti-arrows-exchange" aria-hidden="true" />
          </button>
          <span className="draft-diff-stats">
            <span className="draft-diff-stat-added">+{diff.addedWords.toLocaleString()} {diff.addedWords === 1 ? 'word' : 'words'}</span>
            <span className="draft-diff-stat-removed">−{diff.removedWords.toLocaleString()} {diff.removedWords === 1 ? 'word' : 'words'}</span>
          </span>
        </div>

        <div className="draft-diff-body">
          {safeLeft === safeRight ? (
            <div className="draft-diff-empty">Select two different drafts to compare.</div>
          ) : diff.identical ? (
            <div className="draft-diff-empty">These drafts have identical text.</div>
          ) : (
            diff.blocks.map((block, index) => {
              if (block.kind === 'same') {
                return <p key={index} className="draft-diff-para">{block.text}</p>
              }
              if (block.kind === 'added') {
                return (
                  <p key={index} className="draft-diff-para">
                    <span className="draft-diff-added">{block.text}</span>
                  </p>
                )
              }
              if (block.kind === 'removed') {
                return (
                  <p key={index} className="draft-diff-para">
                    <span className="draft-diff-removed">{block.text}</span>
                  </p>
                )
              }
              return (
                <p key={index} className="draft-diff-para">
                  {block.segments.map((segment, segmentIndex) => (
                    <Fragment key={segmentIndex}>
                      {segmentIndex > 0 ? ' ' : ''}
                      <span
                        className={
                          segment.type === 'added' ? 'draft-diff-added'
                            : segment.type === 'removed' ? 'draft-diff-removed'
                              : undefined
                        }
                      >
                        {segment.text}
                      </span>
                    </Fragment>
                  ))}
                </p>
              )
            })
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
