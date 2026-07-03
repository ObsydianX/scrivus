import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { COMPILE_STYLE_PRESETS, LOREM_PREVIEW } from '../constants'
import type { CompileChapterEntry, CompileFormat, ProjectStyles } from '../types'

type CompileStylePreset = typeof COMPILE_STYLE_PRESETS[number]

function folderLabel(chapter: CompileChapterEntry) {
  return chapter.role === 'act' ? 'Act' : 'Chapter'
}

function isRowInFolderRange(chapters: CompileChapterEntry[], parentIndex: number, index: number) {
  if (index === parentIndex) return true
  if (index < parentIndex) return false
  const parentDepth = chapters[parentIndex]?.depth ?? 0
  for (let i = parentIndex + 1; i <= index; i++) {
    const depth = chapters[i]?.depth ?? 0
    if (depth <= parentDepth) return false
  }
  return true
}

type CompileModalProps = {
  loading: boolean
  chapters: CompileChapterEntry[]
  format: CompileFormat
  frontMatter: boolean
  includeActHeadings: boolean
  includeSceneTitles: boolean
  collapsed: Record<string, boolean>
  style: CompileStylePreset
  projectStyles: ProjectStyles
  onClose: () => void
  onFormatChange: (format: CompileFormat) => void
  onStyleChange: (style: CompileStylePreset) => void
  onFrontMatterChange: (value: boolean) => void
  onIncludeActHeadingsChange: (value: boolean) => void
  onIncludeSceneTitlesChange: (value: boolean) => void
  onSelectionChange: (fileId: string, value: string) => void
  onIncludeChange: (updates: Record<string, boolean>) => void
  onCollapsedChange: (updates: Record<string, boolean>) => void
  onOpenStyles: () => void
  onExport: (chapters: CompileChapterEntry[]) => void
}

export function CompileModal({
  loading,
  chapters,
  format,
  frontMatter,
  includeActHeadings,
  includeSceneTitles,
  collapsed,
  style,
  projectStyles,
  onClose,
  onFormatChange,
  onStyleChange,
  onFrontMatterChange,
  onIncludeActHeadingsChange,
  onIncludeSceneTitlesChange,
  onSelectionChange,
  onIncludeChange,
  onCollapsedChange,
  onOpenStyles,
  onExport,
}: CompileModalProps) {
  const [draftChapters, setDraftChapters] = useState(chapters)
  const [draftCollapsed, setDraftCollapsed] = useState(collapsed)
  const sceneListRef = useRef<HTMLDivElement | null>(null)
  const pendingSceneListScrollRef = useRef<number | null>(null)

  useEffect(() => {
    setDraftChapters(chapters)
  }, [chapters])

  useEffect(() => {
    setDraftCollapsed(collapsed)
  }, [collapsed])

  const preserveSceneListScroll = () => {
    const list = sceneListRef.current
    if (!list) return
    const scrollTop = list.scrollTop
    pendingSceneListScrollRef.current = scrollTop
    requestAnimationFrame(() => {
      if (sceneListRef.current) sceneListRef.current.scrollTop = scrollTop
    })
  }

  useLayoutEffect(() => {
    const scrollTop = pendingSceneListScrollRef.current
    if (scrollTop === null || !sceneListRef.current) return
    sceneListRef.current.scrollTop = scrollTop
    requestAnimationFrame(() => {
      if (sceneListRef.current) sceneListRef.current.scrollTop = scrollTop
      if (pendingSceneListScrollRef.current === scrollTop) pendingSceneListScrollRef.current = null
    })
  }, [draftChapters])

  const collapsedKey = (folderId: number) => `folder:${folderId}`
  const isChapterCollapsed = (chapter: CompileChapterEntry) => draftCollapsed[collapsedKey(chapter.folderId)] === true
  const chapterHasChildren = (chapter: CompileChapterEntry, index: number) => (
    chapter.scenes.length > 0
    || draftChapters.some((_, candidateIndex) => isRowInFolderRange(draftChapters, index, candidateIndex) && candidateIndex !== index)
  )
  const isChapterHidden = (index: number) => {
    let childDepth = draftChapters[index]?.depth ?? 0
    for (let i = index - 1; i >= 0; i--) {
      const candidateDepth = draftChapters[i]?.depth ?? 0
      if (candidateDepth >= childDepth) continue
      if (isChapterCollapsed(draftChapters[i])) return true
      childDepth = candidateDepth
      if (childDepth === 0) break
    }
    return false
  }
  const toggleChapterCollapsed = (chapter: CompileChapterEntry) => {
    const key = collapsedKey(chapter.folderId)
    const nextValue = !draftCollapsed[key]
    setDraftCollapsed(prev => ({ ...prev, [key]: nextValue }))
    onCollapsedChange({ [key]: nextValue })
  }
  const setAllCollapsed = (collapsed: boolean) => {
    const updates: Record<string, boolean> = {}
    draftChapters.forEach((chapter, index) => {
      if (chapterHasChildren(chapter, index)) updates[collapsedKey(chapter.folderId)] = collapsed
    })
    setDraftCollapsed(prev => ({ ...prev, ...updates }))
    onCollapsedChange(updates)
  }
  const setAllIncluded = (included: boolean) => {
    const updates: Record<string, boolean> = {}
    draftChapters.forEach(chapter => {
      updates[`folder:${chapter.folderId}`] = included
      chapter.scenes.forEach(scene => {
        updates[`scene:${scene.fileId}`] = included
      })
    })
    preserveSceneListScroll()
    setDraftChapters(prev => prev.map(chapter => ({
      ...chapter,
      included,
      scenes: chapter.scenes.map(scene => ({ ...scene, included })),
    })))
    onIncludeChange(updates)
  }

  // Derived preview styling for the current format + style preset.
  const isProofPreview = format === 'docx' && style === 'Proof Copy'
  const isShunnPreview = format === 'docx' && style === 'Manuscript (Shunn)'
  const isEpubPreview = format === 'epub'
  const preview = {
    headingFont: isProofPreview ? 'Courier New, Courier, monospace'
      : isShunnPreview ? '"Times New Roman", Times, serif'
        : isEpubPreview ? 'Georgia, serif' : projectStyles.chapter.font,
    headingSize: isProofPreview || isShunnPreview ? '12pt' : isEpubPreview ? '18pt' : `${projectStyles.chapter.size}pt`,
    headingWeight: isProofPreview || isEpubPreview ? 700 : isShunnPreview ? 400 : projectStyles.chapter.bold ? 700 : 400,
    headingStyle: (isProofPreview || isShunnPreview || isEpubPreview ? 'normal' : projectStyles.chapter.italic ? 'italic' : 'normal') as 'normal' | 'italic',
    headingAlign: (isProofPreview || isShunnPreview || isEpubPreview ? 'center' : 'left') as 'center' | 'left',
    chapterText: isProofPreview ? '## CHAPTER ONE ##' : 'Chapter One',
    sceneText: isProofPreview ? '# SCENE ONE #' : 'Scene One',
    bodyFont: isProofPreview ? 'Courier New, Courier, monospace'
      : isShunnPreview ? '"Times New Roman", Times, serif'
        : isEpubPreview ? 'Georgia, serif' : projectStyles.body.font,
    bodySize: isProofPreview || isShunnPreview || isEpubPreview ? '12pt' : `${projectStyles.body.size}pt`,
    bodyAlign: (isProofPreview ? 'justify'
      : isShunnPreview || isEpubPreview ? 'left'
        : projectStyles.body.justification === 'both' ? 'justify'
          : projectStyles.body.justification) as 'left' | 'center' | 'right' | 'justify',
    bodyIndent: isProofPreview || isShunnPreview ? '2em'
      : isEpubPreview ? '1.25em'
        : projectStyles.body.firstLineIndent ? '2em' : '0',
    lineHeight: isProofPreview || isShunnPreview ? 2 : isEpubPreview ? 1.5 : projectStyles.body.lineSpacing,
  }

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
          height: '85vh',
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
            {!loading && (
              <select
                value={style}
                disabled={format === 'epub'}
                title={format === 'epub' ? 'Style presets apply to DOCX exports; e-readers control EPUB styling' : undefined}
                onChange={event => onStyleChange(event.target.value as CompileStylePreset)}
                style={{
                  background: 'var(--input-bg)',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  border: '1px solid var(--border-soft)',
                  borderRadius: 4,
                  padding: '4px 26px 4px 8px',
                  outline: 'none',
                  opacity: format === 'epub' ? 0.45 : 1,
                  cursor: format === 'epub' ? 'not-allowed' : 'pointer',
                }}
              >
                {COMPILE_STYLE_PRESETS.map(preset => (
                  <option key={preset} value={preset}>{preset}</option>
                ))}
              </select>
            )}
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
              justifyContent: 'center', color: 'var(--text-soft)', fontSize: 16,
              letterSpacing: '0.02em',
            }}>
              Reading scenes<span className="compile-loading-ellipsis" aria-hidden="true">...</span>
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
                    onChange={() => onFormatChange('docx')}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  docx
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                }}>
                  <input
                    type="radio"
                    name="compile-format"
                    checked={format === 'epub'}
                    onChange={() => onFormatChange('epub')}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  epub
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
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                  marginTop: 8,
                }}>
                  <input
                    type="checkbox"
                    checked={includeSceneTitles}
                    onChange={e => onIncludeSceneTitlesChange(e.target.checked)}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  Include scene titles
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
                    fontFamily: preview.headingFont,
                    fontSize: preview.headingSize,
                    fontWeight: preview.headingWeight,
                    fontStyle: preview.headingStyle,
                    color: '#111',
                    marginBottom: 16,
                    textAlign: preview.headingAlign,
                  }}>
                    {preview.chapterText}
                  </div>
                  {includeSceneTitles && (
                    <div style={{
                      fontFamily: preview.headingFont,
                      fontSize: preview.headingSize,
                      fontWeight: preview.headingWeight,
                      fontStyle: preview.headingStyle,
                      color: '#111',
                      marginBottom: 16,
                      textAlign: 'center',
                    }}>
                      {preview.sceneText}
                    </div>
                  )}
                  {LOREM_PREVIEW.split('\n\n').map((para, i) => (
                    <p key={i} style={{
                      fontFamily: preview.bodyFont,
                      fontSize: preview.bodySize,
                      textAlign: preview.bodyAlign,
                      textIndent: preview.bodyIndent,
                      lineHeight: preview.lineHeight,
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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}>
                  <span>SCENE SELECTION</span>
                  <span style={{ display: 'flex', gap: 4, letterSpacing: 0 }}>
                    <button
                      type="button"
                      title="Expand all"
                      onClick={() => setAllCollapsed(false)}
                      style={{
                        background: 'var(--button-bg)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 3,
                        color: 'var(--text-soft)',
                        cursor: 'pointer',
                        fontSize: 11,
                        lineHeight: 1,
                        padding: '3px 5px',
                      }}
                    >
                      <i className="ti ti-chevrons-down" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Collapse all"
                      onClick={() => setAllCollapsed(true)}
                      style={{
                        background: 'var(--button-bg)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 3,
                        color: 'var(--text-soft)',
                        cursor: 'pointer',
                        fontSize: 11,
                        lineHeight: 1,
                        padding: '3px 5px',
                      }}
                    >
                      <i className="ti ti-chevrons-up" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Select all"
                      onClick={() => setAllIncluded(true)}
                      style={{
                        background: 'var(--button-bg)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 3,
                        color: 'var(--text-soft)',
                        cursor: 'pointer',
                        fontSize: 10,
                        padding: '2px 6px',
                      }}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      title="Select none"
                      onClick={() => setAllIncluded(false)}
                      style={{
                        background: 'var(--button-bg)',
                        border: '1px solid var(--border-soft)',
                        borderRadius: 3,
                        color: 'var(--text-soft)',
                        cursor: 'pointer',
                        fontSize: 10,
                        padding: '2px 6px',
                      }}
                    >
                      None
                    </button>
                  </span>
                </div>
                <div ref={sceneListRef} className="compile-scene-list" style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
                  {draftChapters.map((chapter, ci) => {
                    if (isChapterHidden(ci)) return null
                    const canCollapse = chapterHasChildren(chapter, ci)
                    const chapterCollapsed = isChapterCollapsed(chapter)
                    return (
                    <div key={chapter.folderId} style={{ marginBottom: 8 }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        color: 'var(--text-soft)', fontSize: 12, cursor: 'pointer',
                        padding: '3px 0',
                        paddingLeft: (chapter.depth ?? 0) * 12,
                      }}>
                        {canCollapse
                          ? (
                            <button
                              type="button"
                              title={chapterCollapsed ? 'Expand' : 'Collapse'}
                              onClick={() => toggleChapterCollapsed(chapter)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: 10,
                                lineHeight: 1,
                                padding: 0,
                                width: 16,
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <i className={`ti ti-chevron-${chapterCollapsed ? 'right' : 'down'}`} aria-hidden="true" />
                            </button>
                          )
                          : <span style={{ width: 16, flexShrink: 0 }} />
                        }
                        <input
                          type="checkbox"
                          className="compile-checkbox"
                          checked={chapter.included}
                          onChange={e => {
                            const checked = e.target.checked
                            const updates: Record<string, boolean> = {}
                            draftChapters.forEach((ch, i) => {
                              if (!isRowInFolderRange(draftChapters, ci, i)) return
                              updates[`folder:${ch.folderId}`] = checked
                              for (const scene of ch.scenes) updates[`scene:${scene.fileId}`] = checked
                            })
                            preserveSceneListScroll()
                            setDraftChapters(prev => (
                              prev.map((ch, i) => {
                                if (!isRowInFolderRange(prev, ci, i)) return ch
                                return {
                                  ...ch,
                                  included: checked,
                                  scenes: ch.scenes.map(s => ({ ...s, included: checked })),
                                }
                              })
                            ))
                            onIncludeChange(updates)
                          }}
                        />
                        <span style={{ fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {chapter.label}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          {folderLabel(chapter)}
                        </span>
                      </div>

                      {!chapterCollapsed && chapter.scenes.map((scene, si) => (
                        <div key={scene.docId} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          paddingLeft: 36 + (chapter.depth ?? 0) * 12, paddingTop: 2, paddingBottom: 2,
                        }}>
                          <input
                            type="checkbox"
                            checked={scene.included}
                            style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                            onChange={e => {
                              const checked = e.target.checked
                              preserveSceneListScroll()
                              setDraftChapters(prev => prev.map((ch, ci2) => {
                                if (ci2 !== ci) return ch
                                const newScenes = ch.scenes.map((s, si2) =>
                                  si2 !== si ? s : { ...s, included: checked }
                                )
                                const anyIncluded = newScenes.some(s => s.included)
                                return { ...ch, included: anyIncluded, scenes: newScenes }
                              }))
                              onIncludeChange({
                                [`folder:${chapter.folderId}`]: checked || chapter.scenes.some((s, si2) => si2 !== si && s.included),
                                [`scene:${scene.fileId}`]: checked,
                              })
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
                              preserveSceneListScroll()
                              setDraftChapters(prev => prev.map((ch, ci2) =>
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
                    )
                  })}
                </div>
              </div>
            </div>
          )
        }

        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-main)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <button className="modal-btn" onClick={onOpenStyles}>
            <i className="ti ti-palette" aria-hidden="true" /> Styles
          </button>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="modal-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="modal-btn modal-btn-primary"
              onClick={() => onExport(draftChapters)}
              disabled={loading || draftChapters.every(ch => !ch.included)}
            >
              Export
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
