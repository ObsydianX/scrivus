import type { OutlineRow, SceneStatus } from '../types'

const STATUS_LABELS: Record<SceneStatus | 'inProgress', string> = {
  draft: 'Draft',
  revised: 'Revised',
  needsWork: 'Needs work',
  complete: 'Complete',
  inProgress: 'In Progress',
}

export function OutlineView({
  rows,
  manuscriptWordCount,
  onOpenScene,
  onSceneStatusChange,
}: {
  rows: OutlineRow[]
  manuscriptWordCount: number
  onOpenScene: (id: number) => void
  onSceneStatusChange: (id: number, status: SceneStatus) => void
}) {
  const sceneRows = rows.filter(row => row.type === 'scene')
  const chapterCount = rows.filter(row => row.type === 'chapter').length
  const sceneCount = sceneRows.length
  const povCount = new Set(sceneRows.map(row => row.metadata?.pov.trim()).filter(Boolean)).size
  const locationCount = new Set(sceneRows.map(row => row.metadata?.location.trim()).filter(Boolean)).size

  return (
    <div id="outline-view">
      <div id="outline-header">
        <div>
          <h2>Outline</h2>
          <p>{sceneCount.toLocaleString()} {sceneCount === 1 ? 'scene' : 'scenes'} · {manuscriptWordCount.toLocaleString()} words</p>
        </div>
        <div className="outline-summary">
          <span title="Chapter rows">{chapterCount.toLocaleString()} chapters</span>
          <span title="Unique POV entries">{povCount.toLocaleString()} POV</span>
          <span title="Unique location entries">{locationCount.toLocaleString()} locations</span>
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
              {rows.map(row => (
                <tr
                  key={`${row.type}-${row.id}`}
                  className={`outline-row-${row.type}`}
                  onDoubleClick={row.type === 'scene' ? () => onOpenScene(row.id) : undefined}
                >
                  <td>
                    <div className="outline-title-cell" style={{ paddingLeft: row.depth * 18 }}>
                      {row.type === 'chapter'
                        ? <>
                          <i className="ti ti-folder" aria-hidden="true" />
                          <span>{row.title}</span>
                        </>
                        : <button className="outline-scene-link" onClick={() => onOpenScene(row.id)}>
                          <i className="ti ti-file-text" aria-hidden="true" />
                          <span>{row.title}</span>
                        </button>
                      }
                    </div>
                  </td>
                  <td>{row.type === 'chapter' ? '—' : row.chapter}</td>
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
    </div>
  )
}
