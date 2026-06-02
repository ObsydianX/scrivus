import type { Dispatch, SetStateAction } from 'react'
import { LOREM_PREVIEW } from '../constants'
import type { CompileChapterEntry, ProjectStyles } from '../types'

function folderLabel(chapter: CompileChapterEntry) {
  return chapter.role === 'act' ? 'Act' : 'Chapter'
}

type CompileModalProps = {
  loading: boolean
  chapters: CompileChapterEntry[]
  format: 'docx'
  frontMatter: boolean
  includeActHeadings: boolean
  style: string
  projectStyles: ProjectStyles
  onClose: () => void
  onFrontMatterChange: (value: boolean) => void
  onIncludeActHeadingsChange: (value: boolean) => void
  onChaptersChange: Dispatch<SetStateAction<CompileChapterEntry[]>>
  onSelectionChange: (fileId: string, value: string) => void
  onExport: () => void
}

export function CompileModal({
  loading,
  chapters,
  format,
  frontMatter,
  includeActHeadings,
  style,
  projectStyles,
  onClose,
  onFrontMatterChange,
  onIncludeActHeadingsChange,
  onChaptersChange,
  onSelectionChange,
  onExport,
}: CompileModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--panel-bg)',
          border: '1px solid var(--border-main)',
          borderRadius: 6,
          width: 860,
          userSelect: 'none',
          maxWidth: '95vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-main)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: 13, letterSpacing: '0.04em' }}>
            COMPILE MANUSCRIPT
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                border: '1px solid var(--border-soft)',
                borderRadius: 4,
                padding: '4px 8px',
              }}
            >
              {style}
            </span>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 2,
              }}
            >
              <i className="ti ti-x" />
            </button>
          </div>
        </div>

        {loading
          ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13,
            }}>
              Reading scenes...
            </div>
          )
          : (
            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              <div style={{
                width: 160, flexShrink: 0,
                borderRight: '1px solid var(--border-main)',
                padding: '16px 12px',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', marginBottom: 8 }}>
                  FORMAT
                </div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="compile-format"
                    checked={format === 'docx'}
                    readOnly
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  docx
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-muted)', opacity: 0.45, fontSize: 12, cursor: 'not-allowed',
                }}>
                  <input
                    type="radio"
                    name="compile-format"
                    disabled
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  pdf
                </label>

                <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', marginTop: 20, marginBottom: 8 }}>
                  FRONT MATTER
                </div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={frontMatter}
                    onChange={e => onFrontMatterChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Cover page
                </label>

                <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', marginTop: 20, marginBottom: 8 }}>
                  STRUCTURE
                </div>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={includeActHeadings}
                    onChange={e => onIncludeActHeadingsChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Include act headings
                </label>
              </div>

              <div style={{
                flex: 1,
                borderRight: '1px solid var(--border-main)',
                padding: '16px',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', marginBottom: 12 }}>
                  PREVIEW
                </div>
                <div style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: 3,
                  padding: '32px 40px',
                  overflowY: 'auto',
                }}>
                  <div style={{
                    fontFamily: projectStyles.chapter.font,
                    fontSize: `${projectStyles.chapter.size}pt`,
                    fontWeight: projectStyles.chapter.bold ? 700 : 400,
                    fontStyle: projectStyles.chapter.italic ? 'italic' : 'normal',
                    color: '#111',
                    marginBottom: 16,
                  }}>
                    Chapter One
                  </div>
                  {LOREM_PREVIEW.split('\n\n').map((para, i) => (
                    <p key={i} style={{
                      fontFamily: projectStyles.body.font,
                      fontSize: `${projectStyles.body.size}pt`,
                      textAlign: projectStyles.body.justification === 'both' ? 'justify'
                        : projectStyles.body.justification as 'left' | 'center' | 'right',
                      textIndent: projectStyles.body.firstLineIndent ? '2em' : '0',
                      lineHeight: projectStyles.body.lineSpacing,
                      margin: '0 0 8px 0',
                      color: '#111',
                    }}>
                      {para.trim()}
                    </p>
                  ))}
                </div>
              </div>

              <div style={{
                width: 260, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}>
                <div style={{
                  color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em',
                  padding: '16px 12px 8px',
                  flexShrink: 0,
                }}>
                  SCENE SELECTION
                </div>
                <div className="compile-scene-list" style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
                  {chapters.map((chapter, ci) => (
                    <div key={chapter.folderId} style={{ marginBottom: 8 }}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                        padding: '3px 0',
                        paddingLeft: (chapter.depth ?? 0) * 12,
                      }}>
                        <input
                          type="checkbox"
                          className="compile-checkbox"
                          checked={chapter.included}
                          onChange={e => {
                            const checked = e.target.checked
                            onChaptersChange(prev => prev.map((ch, i) =>
                              i !== ci ? ch : {
                                ...ch,
                                included: checked,
                                scenes: ch.scenes.map(s => ({ ...s, included: checked })),
                              }
                            ))
                          }}
                        />
                        <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chapter.label}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {folderLabel(chapter)}
                        </span>
                      </label>

                      {chapter.scenes.map((scene, si) => (
                        <div key={scene.docId} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          paddingLeft: 20 + (chapter.depth ?? 0) * 12, paddingTop: 2, paddingBottom: 2,
                        }}>
                          <input
                            type="checkbox"
                            checked={scene.included}
                            style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                            onChange={e => {
                              const checked = e.target.checked
                              onChaptersChange(prev => prev.map((ch, ci2) => {
                                if (ci2 !== ci) return ch
                                const newScenes = ch.scenes.map((s, si2) =>
                                  si2 !== si ? s : { ...s, included: checked }
                                )
                                const anyIncluded = newScenes.some(s => s.included)
                                return { ...ch, included: anyIncluded, scenes: newScenes }
                              }))
                            }}
                          />
                          <span style={{
                            color: scene.included ? 'var(--text-soft)' : 'var(--text-muted)',
                            opacity: scene.included ? 1 : 0.5,
                            fontSize: 11, flex: 1,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {scene.label}
                          </span>
                          <select
                            value={scene.selectedTab}
                            disabled={!scene.included}
                            onChange={e => {
                              const val = e.target.value
                              onChaptersChange(prev => prev.map((ch, ci2) =>
                                ci2 !== ci ? ch : {
                                  ...ch,
                                  scenes: ch.scenes.map((s, si2) =>
                                    si2 !== si ? s : { ...s, selectedTab: val }
                                  ),
                                }
                              ))
                              onSelectionChange(scene.fileId, val)
                            }}
                            style={{
                              background: 'var(--input-bg)',
                              border: '1px solid var(--border-soft)',
                              borderRadius: 3,
                              color: scene.included ? 'var(--text-main)' : 'var(--text-muted)',
                              opacity: scene.included ? 1 : 0.55,
                              fontSize: 10,
                              padding: '2px 4px',
                              width: 110,
                              minWidth: 110,
                              maxWidth: 110,
                              flexShrink: 0,
                              overflow: 'hidden',
                              cursor: scene.included ? 'pointer' : 'not-allowed',
                            }}
                          >
                            <option value="__last__">Use Last Tab</option>
                            {scene.tabs.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        }

        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-main)',
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          flexShrink: 0,
        }}>
          <button className="modal-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={onExport}
            disabled={loading || chapters.every(ch => !ch.included)}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  )
}
