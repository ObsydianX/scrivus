import { useState, type CSSProperties } from 'react'
import type { OutlineRow, SceneStatus } from '../types'

const STATUS_LABELS: Record<SceneStatus | 'inProgress', string> = {
  draft: 'Draft',
  revised: 'Revised',
  needsWork: 'Needs work',
  complete: 'Complete',
  inProgress: 'In Progress',
}

function getFolderLabel(row: OutlineRow) {
  return row.role === 'act' ? 'Act' : 'Chapter'
}

const PACING_COLLAPSED_KEY = 'scrivus-outline-pacing-collapsed'
const PACING_LEGEND: SceneStatus[] = ['draft', 'revised', 'needsWork', 'complete']

function formatReadingTime(words: number, wpm: number) {
  const minutes = words / Math.max(1, wpm)
  return minutes < 1 ? '<1 min read' : `~${Math.round(minutes)} min read`
}

// One bar per scene in manuscript order, grouped by chapter. Bar height is
// relative to the longest scene, color follows the scene status.
function PacingStrip({
  sceneRows,
  readingWpm,
  onOpenScene,
}: {
  sceneRows: OutlineRow[]
  readingWpm: number
  onOpenScene: (id: number) => void
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(PACING_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(PACING_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // preference just won't persist
      }
      return next
    })
  }

  const groups: { chapter: string; scenes: OutlineRow[] }[] = []
  for (const row of sceneRows) {
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.chapter === row.chapter) lastGroup.scenes.push(row)
    else groups.push({ chapter: row.chapter, scenes: [row] })
  }

  const maxWords = Math.max(1, ...sceneRows.map(row => row.wordCount))
  const totalWords = sceneRows.reduce((sum, row) => sum + row.wordCount, 0)
  const averageWords = Math.round(totalWords / sceneRows.length)
  const averagePercent = Math.min(100, (averageWords / maxWords) * 100)

  return (
    <div className="pacing-strip">
      <div className="pacing-strip-header">
        <span className="pacing-strip-title">Pacing</span>
        {!collapsed && (
          <span className="pacing-strip-average-label">
            avg {averageWords.toLocaleString()} words / scene
          </span>
        )}
        {!collapsed && (
          <span className="pacing-strip-legend">
            {PACING_LEGEND.map(status => (
              <span key={status} className={`pacing-legend-item pacing-status-${status}`}>
                {STATUS_LABELS[status]}
              </span>
            ))}
          </span>
        )}
        <button
          className="outline-tool-btn"
          onClick={toggleCollapsed}
          title={collapsed ? 'Show pacing strip' : 'Hide pacing strip'}
          aria-label={collapsed ? 'Show pacing strip' : 'Hide pacing strip'}
        >
          <i className={`ti ti-chevron-${collapsed ? 'up' : 'down'}`} aria-hidden="true" />
        </button>
      </div>
      {!collapsed && (
        <div className="pacing-strip-scroll">
          <div className="pacing-strip-track">
            <div
              className="pacing-average-line"
              style={{ '--pacing-average': averagePercent } as CSSProperties}
              title={`Average scene length: ${averageWords.toLocaleString()} words`}
            />
            {groups.map((group, groupIndex) => (
              <div
                key={`${group.chapter}-${groupIndex}`}
                className="pacing-group"
                style={{ flexGrow: group.scenes.length }}
              >
                <div className="pacing-group-bars">
                  {group.scenes.map(scene => (
                    <button
                      key={scene.id}
                      type="button"
                      className={`pacing-bar pacing-status-${scene.status}`}
                      style={{ height: `${Math.max(6, (scene.wordCount / maxWords) * 100)}%` }}
                      title={`${scene.title} — ${group.chapter}\n${scene.wordCount.toLocaleString()} words · ${formatReadingTime(scene.wordCount, readingWpm)} · ${STATUS_LABELS[scene.status]}`}
                      onClick={() => onOpenScene(scene.id)}
                    />
                  ))}
                </div>
                <div className="pacing-group-label" title={group.chapter}>{group.chapter}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function OutlineView({
  rows,
  manuscriptWordCount,
  readingWpm,
  collapsedFolderIds,
  onCollapsedFolderIdsChange,
  onOpenScene,
  onSceneStatusChange,
}: {
  rows: OutlineRow[]
  manuscriptWordCount: number
  readingWpm: number
  collapsedFolderIds: Set<number>
  onCollapsedFolderIdsChange: (ids: Set<number>) => void
  onOpenScene: (id: number) => void
  onSceneStatusChange: (id: number, status: SceneStatus) => void
}) {
  const sceneRows = rows.filter(row => row.type === 'scene')
  const folderRows = rows.filter(row => row.type === 'chapter')
  const folderIds = folderRows.map(row => row.id)
  const actCount = folderRows.filter(row => row.role === 'act').length
  const chapterCount = folderRows.filter(row => row.role !== 'act').length
  const collapsedFolderCount = folderIds.filter(id => collapsedFolderIds.has(id)).length
  const sceneCount = sceneRows.length
  const visibleRows: OutlineRow[] = []
  let hiddenDepth: number | null = null
  rows.forEach(row => {
    if (hiddenDepth !== null) {
      if (row.depth > hiddenDepth) return
      hiddenDepth = null
    }
    visibleRows.push(row)
    if (row.type === 'chapter' && collapsedFolderIds.has(row.id)) {
      hiddenDepth = row.depth
    }
  })

  const toggleChapter = (id: number) => {
    const next = new Set(collapsedFolderIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onCollapsedFolderIdsChange(next)
  }

  const expandAllFolders = () => onCollapsedFolderIdsChange(new Set())
  const collapseAllFolders = () => onCollapsedFolderIdsChange(new Set(folderIds))

  return (
    <div id="outline-view">
      <div id="outline-header">
        <div className="outline-title-group">
          <div className="outline-folder-actions" aria-label="Folder display controls">
            <button
              className="outline-tool-btn"
              onClick={expandAllFolders}
              disabled={folderIds.length === 0 || collapsedFolderCount === 0}
              title="Expand all folders"
              aria-label="Expand all folders"
            >
              <i className="ti ti-chevrons-down" aria-hidden="true" />
            </button>
            <button
              className="outline-tool-btn"
              onClick={collapseAllFolders}
              disabled={folderIds.length === 0 || collapsedFolderCount === folderIds.length}
              title="Collapse all folders"
              aria-label="Collapse all folders"
            >
              <i className="ti ti-chevrons-up" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="outline-summary" aria-label="Outline stats">
          <span title="Act folders">{actCount.toLocaleString()} {actCount === 1 ? 'act' : 'acts'}</span>
          <span title="Chapter folders">{chapterCount.toLocaleString()} {chapterCount === 1 ? 'chapter' : 'chapters'}</span>
          <span title="Scenes">{sceneCount.toLocaleString()} {sceneCount === 1 ? 'scene' : 'scenes'}</span>
          <span title="Manuscript words">{manuscriptWordCount.toLocaleString()} words</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="outline-empty">
          <i className="ti ti-list-details" aria-hidden="true" />
          <p>No manuscript scenes yet</p>
        </div>
      ) : (
        <div className="outline-table-wrap">
          <table className="outline-table">
            <thead>
              <tr>
                <th>Scene</th>
                <th>Chapter</th>
                <th>Status</th>
                <th>Words</th>
                <th>POV</th>
                <th>Location</th>
                <th>Timeline</th>
                <th>Tags</th>
                <th>Synopsis</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(row => (
                <tr
                  key={`${row.type}-${row.id}`}
                  className={`outline-row-${row.type}`}
                  onDoubleClick={row.type === 'scene' ? () => onOpenScene(row.id) : undefined}
                >
                  <td>
                    <div className="outline-title-cell" style={{ paddingLeft: row.depth * 18 }}>
                      {row.type === 'chapter'
                        ? <>
                          <button
                            className="outline-collapse-btn"
                            onClick={() => toggleChapter(row.id)}
                            title={collapsedFolderIds.has(row.id) ? 'Expand folder' : 'Collapse folder'}
                          >
                            <i className={`ti ti-chevron-${collapsedFolderIds.has(row.id) ? 'right' : 'down'}`} aria-hidden="true" />
                          </button>
                          <i className={`ti ti-${row.role === 'act' ? 'books' : collapsedFolderIds.has(row.id) ? 'folder' : 'folder-open'}`} aria-hidden="true" />
                          <span>{row.title}</span>
                          <span className={`outline-folder-role outline-folder-role-${row.role ?? 'chapter'}`}>{getFolderLabel(row)}</span>
                        </>
                        : <button className="outline-scene-link" onClick={() => onOpenScene(row.id)}>
                          <i className="ti ti-file-text" aria-hidden="true" />
                          <span>{row.title}</span>
                        </button>
                      }
                    </div>
                  </td>
                  <td>{row.type === 'chapter' ? getFolderLabel(row) : row.chapter}</td>
                  <td>
                    {row.type === 'scene'
                      ? <label className={`outline-status-select-wrap outline-status-${row.status}`}>
                        <select
                          className="outline-status-select"
                          value={row.status}
                          onChange={e => onSceneStatusChange(row.id, e.target.value as SceneStatus)}
                          onClick={e => e.stopPropagation()}
                          onDoubleClick={e => e.stopPropagation()}
                        >
                          <option value="draft">Draft</option>
                          <option value="revised">Revised</option>
                          <option value="needsWork">Needs work</option>
                          <option value="complete">Complete</option>
                        </select>
                      </label>
                      : <span className={`outline-status outline-status-${row.status}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    }
                  </td>
                  <td className="outline-number">{row.wordCount.toLocaleString()}</td>
                  <td>{row.metadata?.pov || '—'}</td>
                  <td>{row.metadata?.location || '—'}</td>
                  <td>{row.metadata?.timeline || '—'}</td>
                  <td>{row.metadata?.tags.length ? row.metadata.tags.join(', ') : '—'}</td>
                  <td className="outline-synopsis">{row.metadata?.synopsis || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sceneRows.length > 0 && (
        <PacingStrip sceneRows={sceneRows} readingWpm={readingWpm} onOpenScene={onOpenScene} />
      )}
    </div>
  )
}
