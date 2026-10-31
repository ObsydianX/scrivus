import { useEffect, useRef, useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { DEFAULT_BACKUP_SETTINGS, DEFAULT_MANUSCRIPT_ID, DEFAULT_STYLES, normalizeProjectSettings, normalizeProjectStyles } from '../constants'
import type { BackupSettings, BodyStyle, EditorStyle, Manuscript, ProjectSettings, ProjectStyles, ThemeId } from '../types'
import { evaluateProjectExpression, isValidProjectVariableName } from '../projectExpressions'
import { type BinderWordCountDisplay } from '../binderWordCounts'
import { ProjectVariablesPanel } from './ProjectVariablesPanel'

// What to do with the project cover image when the settings are saved.
export type CoverImageAction =
  | { type: 'keep' }
  | { type: 'set'; sourcePath: string }
  | { type: 'remove' }
export type ManuscriptCoverImageActions = Record<string, CoverImageAction>

export function ProjectSettingsModal({
  settings,
  manuscripts,
  activeManuscriptId,
  styles,
  dictionaryWords,
  projectPath,
  activeTab,
  onTabChange,
  onPickCoverImage,
  onPickBackupFolder,
  onOpenBackupFolder,
  onCancel,
  onSave,
}: {
  settings: ProjectSettings
  manuscripts: Manuscript[]
  activeManuscriptId: string
  styles: ProjectStyles
  dictionaryWords: string[]
  projectPath: string | null
  activeTab: 'book' | 'variables' | 'styles' | 'backups' | 'dictionary'
  onTabChange: (tab: 'book' | 'variables' | 'styles' | 'backups' | 'dictionary') => void
  onPickCoverImage: () => Promise<string | null>
  onPickBackupFolder: () => Promise<string | null>
  onOpenBackupFolder: (settings: BackupSettings) => Promise<void>
  onCancel: () => void
  onSave: (settings: ProjectSettings, manuscripts: Manuscript[], styles: ProjectStyles, dictionaryWords: string[], coverActions: ManuscriptCoverImageActions) => void
}) {
  const [local, setLocal] = useState<ProjectSettings>(() => normalizeProjectSettings(settings))
  const [localManuscripts, setLocalManuscripts] = useState<Manuscript[]>(manuscripts)
  const [activeBookManuscriptId, setActiveBookManuscriptId] = useState(() =>
    manuscripts.some(manuscript => manuscript.id === activeManuscriptId)
      ? activeManuscriptId
      : manuscripts[0]?.id ?? DEFAULT_MANUSCRIPT_ID)
  const [localStyles, setLocalStyles] = useState<ProjectStyles>(() => normalizeProjectStyles(styles))
  const [localDictionary, setLocalDictionary] = useState<string[]>(dictionaryWords)
  const [dictionaryInput, setDictionaryInput] = useState('')
  const [styleTab, setStyleTab] = useState<'chapter' | 'body' | 'editor'>('chapter')
  const [coverActions, setCoverActions] = useState<ManuscriptCoverImageActions>({})
  const [variableName, setVariableName] = useState('')
  const [variableValue, setVariableValue] = useState('')
  const [variableCategoryId, setVariableCategoryId] = useState('')
  const [newVariableCategoryName, setNewVariableCategoryName] = useState('')
  const [collapsedVariableCategories, setCollapsedVariableCategories] = useState<Set<string>>(new Set())
  const [draggedVariableCategoryId, setDraggedVariableCategoryId] = useState<string | null>(null)
  const [variableCategoryDropId, setVariableCategoryDropId] = useState<string | null>(null)
  const draggedVariableCategoryIdRef = useRef<string | null>(null)
  const [draggedVariable, setDraggedVariable] = useState<{ name: string; categoryId: string } | null>(null)
  const [variableDropTarget, setVariableDropTarget] = useState<{ name: string; categoryId: string } | null>(null)
  const draggedVariableRef = useRef<{ name: string; categoryId: string } | null>(null)

  const activeManuscript = localManuscripts.find(manuscript => manuscript.id === activeBookManuscriptId) ?? localManuscripts[0] ?? null
  const activeCoverAction = activeManuscript ? coverActions[activeManuscript.id] ?? { type: 'keep' as const } : { type: 'keep' as const }
  const coverPreviewSrc = activeCoverAction.type === 'set'
    ? convertFileSrc(activeCoverAction.sourcePath)
    : activeCoverAction.type === 'remove'
      ? null
      : activeManuscript?.coverImage && projectPath
        ? convertFileSrc(`${projectPath}/${activeManuscript.coverImage}`.replace(/\\/g, '/'))
        : null

  const patchActiveManuscript = (patch: Partial<Manuscript>) => {
    if (!activeManuscript) return
    setLocalManuscripts(prev => prev.map(manuscript =>
      manuscript.id === activeManuscript.id ? { ...manuscript, ...patch } : manuscript
    ))
  }

  const setActiveCoverAction = (action: CoverImageAction) => {
    if (!activeManuscript) return
    setCoverActions(prev => ({ ...prev, [activeManuscript.id]: action }))
  }

  const fonts = ['Georgia', 'Times New Roman', 'Garamond', 'Palatino', 'Arial', 'Helvetica', 'Courier New']

  const setChapterStyle = (patch: Partial<ProjectStyles['chapter']>) => {
    setLocalStyles(prev => ({ ...prev, chapter: { ...prev.chapter, ...patch } }))
  }

  const setBodyStyle = (patch: Partial<BodyStyle>) => {
    setLocalStyles(prev => ({ ...prev, body: { ...prev.body, ...patch } }))
  }

  const setEditorStyle = (patch: Partial<EditorStyle>) => {
    setLocalStyles(prev => ({ ...prev, editor: { ...prev.editor, ...patch } }))
  }

  const setBackupSettings = (patch: Partial<BackupSettings>) => {
    setLocal(prev => ({ ...prev, backups: { ...prev.backups, ...patch } }))
  }

  const addDictionaryWord = () => {
    const word = dictionaryInput.trim()
    if (!word) return
    setLocalDictionary(prev => {
      if (prev.some(item => item.toLocaleLowerCase() === word.toLocaleLowerCase())) return prev
      return [...prev, word].sort((a, b) => a.localeCompare(b))
    })
    setDictionaryInput('')
  }
  const missingBackupFolder = !local.backups.useDefaultLocation && !local.backups.backupFolder.trim()

  const addVariable = () => {
    const name = variableName.trim()
    if (!variableValue.trim()) return
    const value = variableValue.trim()
    if (!isValidProjectVariableName(name)) return
    setLocal(prev => ({
      ...prev,
      variables: { ...prev.variables, [name]: value },
      variableCategories: prev.variableCategories.map(category => category.id === variableCategoryId
        ? { ...category, variableNames: [...category.variableNames.filter(variableName => variableName !== name), name] }
        : { ...category, variableNames: category.variableNames.filter(variableName => variableName !== name) }),
    }))
    setVariableName('')
    setVariableValue('')
  }

  const addVariableCategory = () => {
    const name = newVariableCategoryName.trim()
    if (!name) return
    const id = `variable-category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    setLocal(prev => ({
      ...prev,
      variableCategories: [...prev.variableCategories, { id, name, variableNames: [] }],
    }))
    setVariableCategoryId(id)
    setNewVariableCategoryName('')
  }

  const removeVariable = (name: string) => {
    setLocal(prev => {
      const variables = { ...prev.variables }
      delete variables[name]
      return {
        ...prev,
        variables,
        variableCategories: prev.variableCategories.map(category => ({
          ...category,
          variableNames: category.variableNames.filter(variableName => variableName !== name),
        })),
      }
    })
  }

  const moveVariableToCategory = (name: string, categoryId: string) => {
    setLocal(prev => ({
      ...prev,
      variableCategories: prev.variableCategories.map(category => ({
        ...category,
        variableNames: category.id === categoryId
          ? [...category.variableNames.filter(variableName => variableName !== name), name]
          : category.variableNames.filter(variableName => variableName !== name),
      })),
    }))
  }

  const reorderVariableCategory = (targetId?: string) => {
    const sourceId = draggedVariableCategoryIdRef.current
    if (!sourceId || sourceId === targetId) return
    setLocal(prev => {
      const categories = [...prev.variableCategories]
      const sourceIndex = categories.findIndex(category => category.id === sourceId)
      if (sourceIndex < 0 || (targetId && !categories.some(category => category.id === targetId))) return prev
      const [moved] = categories.splice(sourceIndex, 1)
      const targetIndex = targetId ? categories.findIndex(category => category.id === targetId) : categories.length
      categories.splice(targetIndex < 0 ? categories.length : targetIndex, 0, moved)
      return { ...prev, variableCategories: categories }
    })
  }

  const reorderVariable = (targetCategoryId: string, targetName?: string) => {
    const source = draggedVariableRef.current
    if (!source) return
    if (targetName === source.name && targetCategoryId === source.categoryId) return
    setLocal(prev => {
      const categorizedNames = new Set(prev.variableCategories.flatMap(category => category.variableNames))
      const uncategorizedNames = Object.keys(prev.variables).filter(name => !categorizedNames.has(name) && name !== source.name)
      const categories = prev.variableCategories.map(category => ({
        ...category,
        variableNames: category.variableNames.filter(name => name !== source.name),
      }))

      if (targetCategoryId) {
        const targetCategory = categories.find(category => category.id === targetCategoryId)
        if (!targetCategory) return prev
        const targetIndex = targetName ? targetCategory.variableNames.indexOf(targetName) : -1
        targetCategory.variableNames.splice(targetIndex < 0 ? targetCategory.variableNames.length : targetIndex, 0, source.name)
        return { ...prev, variableCategories: categories }
      }

      const targetIndex = targetName ? uncategorizedNames.indexOf(targetName) : -1
      uncategorizedNames.splice(targetIndex < 0 ? uncategorizedNames.length : targetIndex, 0, source.name)
      const orderedNames = [...uncategorizedNames, ...Object.keys(prev.variables).filter(name => !uncategorizedNames.includes(name))]
      const variables = Object.fromEntries(orderedNames.map(name => [name, prev.variables[name]]))
      return { ...prev, variables, variableCategories: categories }
    })
  }

  const NumberField = ({
    value,
    min,
    max,
    step = 1,
    onChange,
  }: {
    value: number
    min: number
    max: number
    step?: number
    onChange: (value: number) => void
  }) => {
    const clamp = (next: number) => Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : min
    return (
      <div className="number-stepper">
        <input
          className="modal-input modal-input-sm"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(clamp(Number(e.target.value)))}
        />
        <div className="number-stepper-buttons">
          <button type="button" onClick={() => onChange(clamp(value + step))}>
            <i className="ti ti-chevron-up" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => onChange(clamp(value - step))}>
            <i className="ti ti-chevron-down" aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className={`modal-box project-settings-modal${activeTab === 'variables' ? ' variables-layout' : ''}`}>
        <p className="modal-title">Project Settings</p>
        <div className="modal-tabs">
          {([
            ['book', 'Book Info'],
            ['variables', 'Variables'],
            ['styles', 'Styles'],
            ['backups', 'Backups'],
            ['dictionary', 'Dictionary'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              className={`modal-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'book' && (
          <div className="modal-fields">
            <div className="manuscript-book-tabs" role="tablist" aria-label="Manuscripts">
              {localManuscripts.map(manuscript => (
                <button
                  key={manuscript.id}
                  type="button"
                  className={`manuscript-book-tab${activeBookManuscriptId === manuscript.id ? ' active' : ''}`}
                  onClick={() => setActiveBookManuscriptId(manuscript.id)}
                >
                  {manuscript.name || manuscript.title || 'Untitled Manuscript'}
                </button>
              ))}
            </div>
            {activeManuscript && (
              <>
                <div className="modal-field">
                  <label className="modal-label">Manuscript name</label>
                  <input
                    className="modal-input"
                    value={activeManuscript.name}
                    onChange={e => patchActiveManuscript({ name: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Novel title</label>
                  <input
                    className="modal-input"
                    value={activeManuscript.title}
                    onChange={e => patchActiveManuscript({ title: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Subtitle</label>
                  <input
                    className="modal-input"
                    value={activeManuscript.subtitle}
                    onChange={e => patchActiveManuscript({ subtitle: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Author</label>
                  <input
                    className="modal-input"
                    value={activeManuscript.author}
                    onChange={e => patchActiveManuscript({ author: e.target.value })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Cover image</label>
                  <div className="cover-image-field">
                    <div className="cover-image-preview">
                      {coverPreviewSrc
                        ? <img src={coverPreviewSrc} alt="Book cover preview" draggable={false} />
                        : <i className="ti ti-photo" aria-hidden="true" />}
                    </div>
                    <div className="cover-image-actions">
                      <button
                        type="button"
                        className="welcome-btn"
                        onClick={async () => {
                          const sourcePath = await onPickCoverImage()
                          if (sourcePath) setActiveCoverAction({ type: 'set', sourcePath })
                        }}
                      >
                        Choose Image...
                      </button>
                      {coverPreviewSrc && (
                        <button
                          type="button"
                          className="welcome-btn"
                          onClick={() => setActiveCoverAction(activeManuscript.coverImage ? { type: 'remove' } : { type: 'keep' })}
                        >
                          Remove
                        </button>
                      )}
                      <span className="cover-image-hint">Used as the cover for EPUB exports.</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'styles' && (
          <div className="project-styles-panel">
            <div className="style-tabs">
              {([
                ['chapter', 'Chapter Title'],
                ['body', 'Prose'],
                ['editor', 'Editor'],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  className={`style-tab${styleTab === tab ? ' active' : ''}`}
                  onClick={() => setStyleTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>

            {styleTab === 'chapter' && (
              <div className="modal-fields style-editor-grid">
                <div className="modal-field">
                  <label className="modal-label">Font</label>
                  <select className="modal-select" value={localStyles.chapter.font}
                    onChange={e => setChapterStyle({ font: e.target.value })}>
                    {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Size (pt)</label>
                  <NumberField
                    value={localStyles.chapter.size}
                    min={8}
                    max={72}
                    onChange={size => setChapterStyle({ size })}
                  />
                </div>
                <div className="modal-checkboxes">
                  <label className="modal-checkbox-label">
                    <input type="checkbox" checked={localStyles.chapter.bold}
                      onChange={e => setChapterStyle({ bold: e.target.checked })} />
                    Bold
                  </label>
                  <label className="modal-checkbox-label">
                    <input type="checkbox" checked={localStyles.chapter.italic}
                      onChange={e => setChapterStyle({ italic: e.target.checked })} />
                    Italic
                  </label>
                </div>
                <div className="style-preview" style={{
                  fontFamily: localStyles.chapter.font,
                  fontSize: localStyles.chapter.size * 0.72,
                  fontWeight: localStyles.chapter.bold ? 700 : 400,
                  fontStyle: localStyles.chapter.italic ? 'italic' : 'normal',
                }}>
                  Chapter One
                </div>
                <button className="welcome-btn style-reset-btn" onClick={() => setChapterStyle(DEFAULT_STYLES.chapter)}>
                  Reset Chapter Title
                </button>
              </div>
            )}

            {styleTab === 'body' && (
              <div className="modal-fields style-editor-grid">
                <div className="modal-field">
                  <label className="modal-label">Font</label>
                  <select className="modal-select" value={localStyles.body.font}
                    onChange={e => setBodyStyle({ font: e.target.value })}>
                    {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Size (pt)</label>
                  <NumberField
                    value={localStyles.body.size}
                    min={8}
                    max={72}
                    onChange={size => setBodyStyle({ size })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Alignment</label>
                  <select className="modal-select" value={localStyles.body.justification}
                    onChange={e => setBodyStyle({ justification: e.target.value as BodyStyle['justification'] })}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                    <option value="both">Justified</option>
                  </select>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Line spacing</label>
                  <NumberField
                    value={localStyles.body.lineSpacing}
                    min={1}
                    max={72}
                    step={0.5}
                    onChange={lineSpacing => setBodyStyle({ lineSpacing })}
                  />
                </div>
                <label className="modal-checkbox-label">
                  <input type="checkbox" checked={localStyles.body.firstLineIndent}
                    onChange={e => setBodyStyle({ firstLineIndent: e.target.checked })} />
                  First line indent
                </label>
                <div className="style-preview" style={{
                  fontFamily: localStyles.body.font,
                  fontSize: localStyles.body.size * 0.75,
                  textAlign: localStyles.body.justification === 'both' ? 'justify' : localStyles.body.justification,
                  lineHeight: localStyles.body.lineSpacing,
                }}>
                  <span style={{ display: 'inline-block', textIndent: localStyles.body.firstLineIndent ? '2em' : '0' }}>
                    The road out of Calver runs north until it doesn't. Maren had driven it a hundred times in childhood, always watching the tree line blur.
                  </span>
                </div>
                <button className="welcome-btn style-reset-btn" onClick={() => setBodyStyle(DEFAULT_STYLES.body)}>
                  Reset Prose
                </button>
              </div>
            )}

            {styleTab === 'editor' && (
              <div className="modal-fields style-editor-grid">
                <div className="modal-field">
                  <label className="modal-label">Editor font</label>
                  <select className="modal-select" value={localStyles.editor.font}
                    onChange={e => setEditorStyle({ font: e.target.value })}>
                    {fonts.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="modal-field">
                  <label className="modal-label">Editor size (pt)</label>
                  <NumberField
                    value={localStyles.editor.size}
                    min={8}
                    max={36}
                    onChange={size => setEditorStyle({ size })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Line height</label>
                  <NumberField
                    value={localStyles.editor.lineHeight}
                    min={1}
                    max={3}
                    step={0.05}
                    onChange={lineHeight => setEditorStyle({ lineHeight })}
                  />
                </div>
                <div className="modal-field">
                  <label className="modal-label">Writing width (px)</label>
                  <NumberField
                    value={localStyles.editor.contentWidth}
                    min={480}
                    max={1200}
                    step={20}
                    onChange={contentWidth => setEditorStyle({ contentWidth })}
                  />
                </div>
                <div className="style-preview editor-style-preview" style={{
                  fontFamily: localStyles.editor.font,
                  fontSize: localStyles.editor.size * 0.75,
                  lineHeight: localStyles.editor.lineHeight,
                  maxWidth: Math.min(localStyles.editor.contentWidth, 520),
                }}>
                  Begin writing. The editor can stay comfortable without changing the manuscript style you compile later.
                </div>
                <button className="welcome-btn style-reset-btn" onClick={() => setEditorStyle(DEFAULT_STYLES.editor)}>
                  Reset Editor
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'variables' && (
          <ProjectVariablesPanel settings={local} onChange={updater => setLocal(updater)} />
        )}

        {false && (
          <div className="modal-fields project-variables-panel">
            <p className="project-variables-help">
              Use variables in prose and Lorebook text with expressions such as <code>{'{{ year - character_age }}'}</code>.
              Variable values can also reference other variables, such as <code>Year - HA_Age</code>. Expressions support +, -, *, /, and parentheses.
            </p>
            <div className="project-variable-category-add-row">
              <input
                className="modal-input"
                value={newVariableCategoryName}
                onChange={e => setNewVariableCategoryName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariableCategory() } }}
                placeholder="New category name"
                aria-label="New variable category name"
              />
              <button type="button" className="welcome-btn" disabled={!newVariableCategoryName.trim()} onClick={addVariableCategory}>
                Add Category
              </button>
            </div>
            <div className="project-variable-add-row">
              <input
                className="modal-input"
                value={variableName}
                onChange={e => setVariableName(e.target.value)}
                placeholder="Variable name"
                aria-label="Variable name"
              />
              <input
                className="modal-input"
                value={variableValue}
                onChange={e => setVariableValue(e.target.value)}
                placeholder="Number or expression"
                aria-label="Variable value or expression"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addVariable() } }}
              />
              <select
                className="modal-select"
                value={variableCategoryId}
                onChange={e => setVariableCategoryId(e.target.value)}
                aria-label="Variable category"
              >
                <option value="">Uncategorized</option>
                {local.variableCategories.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="welcome-btn"
                disabled={!isValidProjectVariableName(variableName.trim()) || !variableValue.trim()}
                onClick={addVariable}
              >
                Add
              </button>
            </div>
            {Object.entries(local.variables).length === 0 && local.variableCategories.length === 0 ? (
              <div className="dictionary-empty">No project variables defined.</div>
            ) : (
              <div className="project-variable-categories">
                {[...local.variableCategories, {
                  id: '',
                  name: 'Uncategorized',
                  variableNames: Object.keys(local.variables).filter(name =>
                    !local.variableCategories.some(category => category.variableNames.includes(name))),
                }].filter(category => category.id || category.variableNames.length > 0).map(category => {
                  const collapsed = collapsedVariableCategories.has(category.id || '__uncategorized')
                  const collapseId = category.id || '__uncategorized'
                  return (
                    <div key={collapseId}>
                    {category.id && variableCategoryDropId === category.id && draggedVariableCategoryId !== category.id && (
                      <div className="drop-line project-variable-category-drop-line" />
                    )}
                    <section
                      className={`project-variable-category${draggedVariableCategoryId === category.id ? ' dragging' : ''}`}
                      onDragOver={event => {
                        if (!category.id || !draggedVariableCategoryIdRef.current) return
                        event.preventDefault()
                        setVariableCategoryDropId(category.id)
                      }}
                      onDrop={event => {
                        if (!category.id || !draggedVariableCategoryIdRef.current) return
                        event.preventDefault()
                        reorderVariableCategory(category.id)
                        setVariableCategoryDropId(null)
                      }}
                    >
                      <div className="project-variable-category-header">
                        {category.id ? (
                          <span
                            className="project-variable-drag-handle"
                            draggable
                            title="Drag to reorder category"
                            onDragStart={event => {
                              event.stopPropagation()
                              draggedVariableCategoryIdRef.current = category.id
                              setDraggedVariableCategoryId(category.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => {
                              draggedVariableCategoryIdRef.current = null
                              setDraggedVariableCategoryId(null)
                              setVariableCategoryDropId(null)
                            }}
                          >
                            <i className="ti ti-grip-vertical" aria-hidden="true" />
                          </span>
                        ) : <span className="project-variable-drag-spacer" />}
                        <button
                          type="button"
                          className="project-variable-category-toggle"
                          aria-expanded={!collapsed}
                          onClick={() => setCollapsedVariableCategories(prev => {
                            const next = new Set(prev)
                            if (next.has(collapseId)) next.delete(collapseId)
                            else next.add(collapseId)
                            return next
                          })}
                        >
                          <i className={`ti ti-chevron-${collapsed ? 'right' : 'down'}`} aria-hidden="true" />
                        </button>
                        {category.id ? (
                          <input
                            className="project-variable-category-name"
                            value={category.name}
                            aria-label="Variable category name"
                            onChange={e => setLocal(prev => ({
                              ...prev,
                              variableCategories: prev.variableCategories.map(item => item.id === category.id
                                ? { ...item, name: e.target.value }
                                : item),
                            }))}
                          />
                        ) : <span className="project-variable-category-name-static">{category.name}</span>}
                        <span className="project-variable-category-count">{category.variableNames.length}</span>
                        {category.id && (
                          <button
                            type="button"
                            className="project-variable-category-remove"
                            title={`Remove ${category.name} category`}
                            aria-label={`Remove ${category.name} category`}
                            onClick={() => {
                              if (variableCategoryId === category.id) setVariableCategoryId('')
                              setLocal(prev => ({
                                ...prev,
                                variableCategories: prev.variableCategories.filter(item => item.id !== category.id),
                              }))
                            }}
                          >
                            <i className="ti ti-x" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {!collapsed && (
                        <div className="project-variable-list">
                          {category.variableNames.length === 0 ? (
                            <div className="project-variable-category-empty">No variables in this category.</div>
                          ) : category.variableNames.map(name => (
                            <div
                              className={`project-variable-row${draggedVariable?.name === name ? ' dragging' : ''}${variableDropTarget?.name === name && variableDropTarget.categoryId === category.id ? ' drop-target' : ''}`}
                              key={name}
                              onDragOver={event => {
                                if (!draggedVariableRef.current) return
                                event.preventDefault()
                                event.stopPropagation()
                                setVariableDropTarget({ name, categoryId: category.id })
                              }}
                              onDrop={event => {
                                if (!draggedVariableRef.current) return
                                event.preventDefault()
                                event.stopPropagation()
                                reorderVariable(category.id, name)
                                setVariableDropTarget(null)
                              }}
                            >
                              <span
                                className="project-variable-drag-handle"
                                draggable
                                title="Drag to reorder or move variable"
                                onDragStart={event => {
                                  event.stopPropagation()
                                  const source = { name, categoryId: category.id }
                                  draggedVariableRef.current = source
                                  setDraggedVariable(source)
                                  event.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragEnd={() => {
                                  draggedVariableRef.current = null
                                  setDraggedVariable(null)
                                  setVariableDropTarget(null)
                                }}
                              >
                                <i className="ti ti-grip-vertical" aria-hidden="true" />
                              </span>
                              <code>{name}</code>
                              <input
                                className={`modal-input${evaluateProjectExpression(name, local.variables) === null ? ' project-expression-input-invalid' : ''}`}
                                value={local.variables[name]}
                                aria-label={`${name} value or expression`}
                                onChange={e => {
                                  const nextValue = e.target.value
                                  setLocal(prev => ({
                                    ...prev,
                                    variables: { ...prev.variables, [name]: nextValue },
                                  }))
                                }}
                              />
                              <select
                                className="modal-select project-variable-category-select"
                                value={category.id}
                                aria-label={`${name} category`}
                                onChange={e => moveVariableToCategory(name, e.target.value)}
                              >
                                <option value="">Uncategorized</option>
                                {local.variableCategories.map(option => (
                                  <option key={option.id} value={option.id}>{option.name}</option>
                                ))}
                              </select>
                              <button type="button" title={`Remove ${name}`} aria-label={`Remove ${name}`} onClick={() => removeVariable(name)}>
                                <i className="ti ti-x" aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                          <div
                            className="project-variable-drop-end"
                            onDragOver={event => {
                              if (!draggedVariableRef.current) return
                              event.preventDefault()
                              event.stopPropagation()
                            }}
                            onDrop={event => {
                              if (!draggedVariableRef.current) return
                              event.preventDefault()
                              event.stopPropagation()
                              reorderVariable(category.id)
                              setVariableDropTarget(null)
                            }}
                          />
                        </div>
                      )}
                    </section>
                    </div>
                  )
                })}
                <div
                  className="project-variable-category-drop-end"
                  onDragOver={event => {
                    if (!draggedVariableCategoryIdRef.current) return
                    event.preventDefault()
                  }}
                  onDrop={event => {
                    if (!draggedVariableCategoryIdRef.current) return
                    event.preventDefault()
                    reorderVariableCategory()
                    setVariableCategoryDropId(null)
                  }}
                />
              </div>
            )}
            {variableName.trim() && !isValidProjectVariableName(variableName.trim()) && (
              <div className="project-variable-error">Names must begin with a letter or underscore and contain only letters, numbers, and underscores.</div>
            )}
          </div>
        )}

        {activeTab === 'dictionary' && (
          <div className="dictionary-panel">
            <div className="dictionary-add-row">
              <input
                className="modal-input"
                value={dictionaryInput}
                onChange={e => setDictionaryInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addDictionaryWord()
                  }
                }}
                placeholder="Add word..."
              />
              <button
                type="button"
                className="welcome-btn"
                disabled={!dictionaryInput.trim()}
                onClick={addDictionaryWord}
              >
                Add
              </button>
            </div>
            <div className="dictionary-list-wrap">
              {localDictionary.length === 0 ? (
                <div className="dictionary-empty">
                  Project dictionary is empty.
                </div>
              ) : (
                <div className="dictionary-list">
                  {localDictionary.map(word => (
                    <div className="dictionary-word-row" key={word}>
                      <span>{word}</span>
                      <button
                        type="button"
                        title="Remove word"
                        onClick={() => setLocalDictionary(prev => prev.filter(item => item !== word))}
                      >
                        <i className="ti ti-x" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'backups' && (
          <div className="modal-fields backup-settings-panel">
            <label className="modal-checkbox-label">
              <input
                type="checkbox"
                checked={local.backups.enabled}
                onChange={e => setBackupSettings({ enabled: e.target.checked })}
              />
              Enable automatic backups
            </label>
            <div className="modal-field">
              <label className="modal-label">Backup interval (minutes)</label>
              <NumberField
                value={local.backups.intervalMinutes}
                min={1}
                max={120}
                onChange={intervalMinutes => setBackupSettings({ intervalMinutes })}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Backups to keep</label>
              <NumberField
                value={local.backups.retentionCount}
                min={1}
                max={100}
                onChange={retentionCount => setBackupSettings({ retentionCount })}
              />
            </div>
            <label className="modal-checkbox-label">
              <input
                type="checkbox"
                checked={local.backups.useDefaultLocation}
                onChange={e => setBackupSettings({ useDefaultLocation: e.target.checked })}
              />
              Use default backup location
            </label>
            <div className="modal-field">
              <label className="modal-label">Backup Folder</label>
              <div className="modal-inline-row">
                <div className={`modal-input modal-path-display${!local.backups.backupFolder ? ' modal-path-empty' : ''}`}>
                  {local.backups.backupFolder || 'No folder selected'}
                </div>
                <button
                  type="button"
                  className="welcome-btn btn-nowrap"
                  disabled={local.backups.useDefaultLocation}
                  onClick={async () => {
                    const folder = await onPickBackupFolder()
                    if (folder) setBackupSettings({ backupFolder: folder })
                  }}
                >
                  Browse...
                </button>
              </div>
              {missingBackupFolder && <p className="modal-danger-text">Choose a backup folder before turning off the default location.</p>}
            </div>
            <button
              type="button"
              className="welcome-btn backup-action-btn"
              disabled={missingBackupFolder}
              onClick={() => { void onOpenBackupFolder(local.backups) }}
            >
              Open Backups Folder
            </button>
            <button
              className="welcome-btn style-reset-btn backup-action-btn"
              onClick={() => setBackupSettings(DEFAULT_BACKUP_SETTINGS)}
            >
              Reset Backups
            </button>
          </div>
        )}

        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" disabled={missingBackupFolder} onClick={() => onSave(normalizeProjectSettings(local), localManuscripts, localStyles, localDictionary, coverActions)}>Save</button>
        </div>
      </div>
    </div>
  )
}

export const THEME_OPTIONS: { id: ThemeId; name: string; swatches: string[] }[] = [
  { id: 'dark', name: 'Dark', swatches: ['#1e1e1e', '#252526', '#d4d4d4'] },
  { id: 'light', name: 'Light', swatches: ['#f6f7f8', '#ffffff', '#46515f'] },
  { id: 'contrastLight', name: 'High Contrast Light', swatches: ['#ffffff', '#000000', '#005fcc'] },
  { id: 'contrastDark', name: 'High Contrast Dark', swatches: ['#000000', '#ffffff', '#ffd400'] },
  { id: 'lavenderLight', name: 'Lavender Light', swatches: ['#f8f3ff', '#eee5fa', '#8a6fc9'] },
  { id: 'lavenderDark', name: 'Lavender Dark', swatches: ['#191523', '#30273f', '#b89cff'] },
  { id: 'mintLight', name: 'Mint Light', swatches: ['#effbf5', '#dff2e9', '#4f9d82'] },
  { id: 'mintDark', name: 'Mint Dark', swatches: ['#101f1a', '#213a32', '#74d3b3'] },
  { id: 'roseLight', name: 'Rose Light', swatches: ['#fff4f6', '#f8e3e8', '#c56f8a'] },
  { id: 'roseDark', name: 'Rose Dark', swatches: ['#23151a', '#422832', '#ff9ab8'] },
  { id: 'skyLight', name: 'Sky Light', swatches: ['#f1f8ff', '#deedf8', '#5f96d6'] },
  { id: 'skyDark', name: 'Sky Dark', swatches: ['#101b29', '#22354d', '#80bfff'] },
  { id: 'softPaperLight', name: 'Soft Paper', swatches: ['#fbf7ef', '#eee4d3', '#8f7a5b'] },
  { id: 'softSageLight', name: 'Soft Sage', swatches: ['#f4f8ef', '#dfe9d5', '#6f8f63'] },
  { id: 'softPeachLight', name: 'Soft Peach', swatches: ['#fff5ef', '#f4ddd1', '#b9795f'] },
  { id: 'softLilacLight', name: 'Soft Lilac', swatches: ['#f8f5fb', '#e7deee', '#8d759f'] },
  { id: 'neonCyber', name: 'Neon Cyber', swatches: ['#05080f', '#00e5ff', '#ff3d9a'] },
  { id: 'neonViolet', name: 'Neon Violet', swatches: ['#0b0614', '#d45cff', '#ff5c8a'] },
  { id: 'neonEmber', name: 'Neon Ember', swatches: ['#110806', '#ff7a1a', '#ff4ec7'] },
  { id: 'neonLagoon', name: 'Neon Lagoon', swatches: ['#03100f', '#39ffcc', '#00b894'] },
]

export function PreferencesModal({
  binderWordCountDisplay,
  theme,
  incrementNewNodeNumbers,
  readingWpm,
  defaultSceneTargetWordCount,
  gradientOverlayEnabled,
  gradientOverlayAnimated,
  gradientOverlayIntensity,
  reviseGlowEnabled,
  reviseGlowIntensity,
  onPreviewReviseGlowIntensity,
  onPreviewIntensity,
  onCancel,
  onSave,
}: {
  theme: ThemeId
  incrementNewNodeNumbers: boolean
  binderWordCountDisplay: BinderWordCountDisplay
  readingWpm: number
  defaultSceneTargetWordCount: number
  gradientOverlayEnabled: boolean
  gradientOverlayAnimated: boolean
  gradientOverlayIntensity: number
  reviseGlowEnabled: boolean
  reviseGlowIntensity: number
  onPreviewReviseGlowIntensity: (intensity: number | null) => void
  onPreviewIntensity: (intensity: number | null) => void
  onCancel: () => void
  onSave: (
    theme: ThemeId,
    incrementNewNodeNumbers: boolean,
    readingWpm: number,
    defaultSceneTargetWordCount: number,
    gradientOverlayEnabled: boolean,
    gradientOverlayAnimated: boolean,
    gradientOverlayIntensity: number,
    binderWordCountDisplay: BinderWordCountDisplay,
    reviseGlowEnabled: boolean,
    reviseGlowIntensity: number,
  ) => void
}) {
  const [localBinderWordCountDisplay, setLocalBinderWordCountDisplay] = useState(binderWordCountDisplay)
  const [localTheme, setLocalTheme] = useState<ThemeId>(theme)
  const [localIncrementNewNodeNumbers, setLocalIncrementNewNodeNumbers] = useState(incrementNewNodeNumbers)
  const [localReadingWpm, setLocalReadingWpm] = useState(String(readingWpm))
  const [localDefaultSceneTargetWordCount, setLocalDefaultSceneTargetWordCount] = useState(String(defaultSceneTargetWordCount || ''))
  const [localGradientOverlayEnabled, setLocalGradientOverlayEnabled] = useState(gradientOverlayEnabled)
  const [localGradientOverlayAnimated, setLocalGradientOverlayAnimated] = useState(gradientOverlayAnimated)
  const [localGradientOverlayIntensity, setLocalGradientOverlayIntensity] = useState(gradientOverlayIntensity)
  const [localReviseGlowEnabled, setLocalReviseGlowEnabled] = useState(reviseGlowEnabled)
  const [localReviseGlowIntensity, setLocalReviseGlowIntensity] = useState(reviseGlowIntensity)
  const [activeTab, setActiveTab] = useState<'general' | 'themes'>('general')

  useEffect(() => {
    setLocalReviseGlowEnabled(reviseGlowEnabled)
    setLocalReviseGlowIntensity(reviseGlowIntensity)
    setLocalBinderWordCountDisplay(binderWordCountDisplay)
    setLocalTheme(theme)
    setLocalIncrementNewNodeNumbers(incrementNewNodeNumbers)
    setLocalReadingWpm(String(readingWpm))
    setLocalDefaultSceneTargetWordCount(String(defaultSceneTargetWordCount || ''))
    setLocalGradientOverlayEnabled(gradientOverlayEnabled)
    setLocalGradientOverlayAnimated(gradientOverlayAnimated)
    setLocalGradientOverlayIntensity(gradientOverlayIntensity)
  }, [reviseGlowEnabled, reviseGlowIntensity, binderWordCountDisplay, theme, incrementNewNodeNumbers, readingWpm, defaultSceneTargetWordCount, gradientOverlayEnabled, gradientOverlayAnimated, gradientOverlayIntensity])

  useEffect(() => {
    onPreviewIntensity(localGradientOverlayEnabled ? localGradientOverlayIntensity : 0)
    return () => onPreviewIntensity(null)
  }, [localGradientOverlayEnabled, localGradientOverlayIntensity, onPreviewIntensity])

  useEffect(() => {
    onPreviewReviseGlowIntensity(localReviseGlowEnabled ? localReviseGlowIntensity : 0)
    return () => onPreviewReviseGlowIntensity(null)
  }, [localReviseGlowEnabled, localReviseGlowIntensity, onPreviewReviseGlowIntensity])

  const MIN_READING_WPM = 50
  const MAX_READING_WPM = 1000
  const clampReadingWpm = (value: number) =>
    Number.isFinite(value) ? Math.min(MAX_READING_WPM, Math.max(MIN_READING_WPM, Math.round(value))) : readingWpm
  const normalizeReadingWpmInput = () => {
    const normalized = clampReadingWpm(Number(localReadingWpm))
    setLocalReadingWpm(String(normalized))
    return normalized
  }
  const normalizeDefaultSceneTargetInput = () => {
    const value = Number(localDefaultSceneTargetWordCount)
    const normalized = Number.isFinite(value) ? Math.min(999999, Math.max(0, Math.round(value))) : 0
    setLocalDefaultSceneTargetWordCount(normalized > 0 ? String(normalized) : '')
    return normalized
  }
  const lightThemes = THEME_OPTIONS.filter(theme =>
    theme.name === 'Light' || theme.name.includes('Light') || theme.name.startsWith('Soft ')
  )
  const darkThemes = THEME_OPTIONS.filter(theme => !lightThemes.includes(theme))
  const renderThemeOption = (theme: typeof THEME_OPTIONS[number]) => (
    <button
      key={theme.id}
      className={`theme-option${localTheme === theme.id ? ' active' : ''}`}
      onClick={() => setLocalTheme(theme.id)}
    >
      <span className="theme-swatches">
        {theme.swatches.map(color => (
          <span key={color} style={{ background: color }} />
        ))}
      </span>
      <span>{theme.name}</span>
    </button>
  )

  return (
    <div className="modal-overlay">
      <div className="modal-box project-settings-modal preferences-modal">
        <p className="modal-title">Preferences</p>
        <div className="modal-tabs">
          {([
            ['general', 'General'],
            ['themes', 'Themes'],
          ] as const).map(([tab, label]) => (
            <button
              key={tab}
              className={`modal-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="modal-fields">
          {activeTab === 'general' && (
            <>
              <div className="modal-field">
                <label className="modal-label">Reading speed (WPM)</label>
                <input
                  className="modal-input modal-input-sm"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={localReadingWpm}
                  onChange={e => setLocalReadingWpm(e.target.value.replace(/\D/g, ''))}
                  onBlur={normalizeReadingWpmInput}
                />
              </div>
              <div className="modal-field">
                <label className="modal-label">Default scene word target</label>
                <input
                  className="modal-input modal-input-sm"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={localDefaultSceneTargetWordCount}
                  onChange={e => setLocalDefaultSceneTargetWordCount(e.target.value.replace(/\D/g, ''))}
                  onBlur={normalizeDefaultSceneTargetInput}
                  placeholder="0"
                />
              </div>
              <div className="modal-field">
                <label className="modal-label" htmlFor="binder-word-count-display">Binder word counts</label>
                <select id="binder-word-count-display" className="modal-input" value={localBinderWordCountDisplay} onChange={e => setLocalBinderWordCountDisplay(e.target.value as BinderWordCountDisplay)}>
                  <option value="off">Off</option>
                  <option value="acts">Acts only</option>
                  <option value="chapters">Acts and chapters</option>
                  <option value="selectedScene">Acts, chapters, and selected scene</option>
                  <option value="all">All types</option>
                </select>
              </div>
              <div className="modal-field preferences-numbering-field" role="group" aria-labelledby="preferences-numbering-label">
                <span id="preferences-numbering-label" className="modal-label">Automatic Numbering</span>
              <label className="modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={localIncrementNewNodeNumbers}
                  onChange={e => setLocalIncrementNewNodeNumbers(e.target.checked)}
                />
                Increment scene, chapter, and act numbers when adding new binder items
              </label>
              </div>
                <section className="modal-field">
                  <span className="modal-label">Read-only Edge Glow</span>
                  <label className="modal-checkbox-label">
                    <input type="checkbox" checked={localReviseGlowEnabled} onChange={e => setLocalReviseGlowEnabled(e.target.checked)} />
                    Highlight read-only text in Revise and split view
                  </label>
                  <label className="gradient-intensity-control">
                    <span>Intensity <output>{localReviseGlowIntensity}%</output></span>
                    <input aria-label="Read-only glow intensity" type="range" min={0} max={100} step={1} value={localReviseGlowIntensity} disabled={!localReviseGlowEnabled} onChange={e => setLocalReviseGlowIntensity(Number(e.target.value))} />
                  </label>
                </section>
            </>
          )}
          {activeTab === 'themes' && (
            <div className="modal-field">
              <div className="preferences-theme-sections">
                <section className="preferences-theme-section">
                  <h3>Light Themes</h3>
                  <div className="theme-grid preferences-theme-grid">
                    {lightThemes.map(renderThemeOption)}
                  </div>
                </section>
                <section className="preferences-theme-section">
                  <h3>Dark Themes</h3>
                  <div className="theme-grid preferences-theme-grid">
                    {darkThemes.map(renderThemeOption)}
                  </div>
                </section>

                <section className="preferences-theme-section">
                  <h3>Gradient Overlay</h3>
                  <label className="modal-checkbox-label">
                    <input
                      type="checkbox"
                      checked={localGradientOverlayEnabled}
                      onChange={e => setLocalGradientOverlayEnabled(e.target.checked)}
                    />
                    Tint the app with a subtle gradient (always off in high-contrast themes)
                  </label>
                  <label className="gradient-intensity-control">
                    <span>Intensity <output>{localGradientOverlayIntensity}%</output></span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={localGradientOverlayIntensity}
                      disabled={!localGradientOverlayEnabled}
                      onChange={e => setLocalGradientOverlayIntensity(Number(e.target.value))}
                    />
                  </label>
                  <label className="modal-checkbox-label">
                    <input
                      type="checkbox"
                      checked={localGradientOverlayAnimated}
                      disabled={!localGradientOverlayEnabled}
                      onChange={e => setLocalGradientOverlayAnimated(e.target.checked)}
                    />
                    Slowly drift the gradient across the window
                  </label>
                </section>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" onClick={() => onSave(localTheme, localIncrementNewNodeNumbers, normalizeReadingWpmInput(), normalizeDefaultSceneTargetInput(), localGradientOverlayEnabled, localGradientOverlayAnimated, localGradientOverlayIntensity, localBinderWordCountDisplay, localReviseGlowEnabled, localReviseGlowIntensity)}>Save</button>
        </div>
      </div>
    </div>
  )
}

export function StylesModal({
  styles,
  activeTab,
  onTabChange,
  onCancel,
  onApply,
  onSaveAsDefault,
  overlayZIndex,
}: {
  styles: ProjectStyles
  activeTab: 'chapter' | 'body'
  onTabChange: (tab: 'chapter' | 'body') => void
  onCancel: () => void
  onApply: (styles: ProjectStyles) => void
  onSaveAsDefault: (styles: ProjectStyles) => void
  overlayZIndex?: number
}) {
  const [local, setLocal] = useState<ProjectStyles>(styles)

  useEffect(() => {
    setLocal(styles)
  }, [styles])

  const fonts = ['Georgia', 'Times New Roman', 'Garamond', 'Palatino', 'Arial', 'Helvetica', 'Courier New']

  return (
    <div className="modal-overlay" style={overlayZIndex !== undefined ? { zIndex: overlayZIndex } : undefined}>
      <div className="modal-box">
        <p className="modal-title">Styles</p>
        <div className="modal-tabs">
          {(['chapter', 'body'] as const).map(tab => (
            <button
              key={tab}
              className={`modal-tab${activeTab === tab ? ' active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'chapter' && (
          <div className="modal-fields">
            <div className="modal-field">
              <label className="modal-label">Font</label>
              <select className="modal-select" value={local.chapter.font}
                onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, font: e.target.value } }))}>
                {fonts.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Size (pt)</label>
              <input className="modal-input modal-input-sm" type="number" min={8} max={72}
                value={local.chapter.size}
                onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, size: Number(e.target.value) } }))} />
            </div>
            <div className="modal-checkboxes">
              <label className="modal-checkbox-label">
                <input type="checkbox" checked={local.chapter.bold}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, bold: e.target.checked } }))} />
                Bold
              </label>
              <label className="modal-checkbox-label">
                <input type="checkbox" checked={local.chapter.italic}
                  onChange={e => setLocal(p => ({ ...p, chapter: { ...p.chapter, italic: e.target.checked } }))} />
                Italic
              </label>
            </div>
            <div className="modal-preview" style={{
              fontFamily: local.chapter.font,
              fontSize: local.chapter.size * 0.75,
              fontWeight: local.chapter.bold ? 700 : 400,
              fontStyle: local.chapter.italic ? 'italic' : 'normal',
            }}>
              Chapter One
            </div>
          </div>
        )}

        {activeTab === 'body' && (
          <div className="modal-fields">
            <div className="modal-field">
              <label className="modal-label">Font</label>
              <select className="modal-select" value={local.body.font}
                onChange={e => setLocal(p => ({ ...p, body: { ...p.body, font: e.target.value } }))}>
                {fonts.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="modal-field">
              <label className="modal-label">Size (pt)</label>
              <input className="modal-input modal-input-sm" type="number" min={8} max={72}
                value={local.body.size}
                onChange={e => setLocal(p => ({ ...p, body: { ...p.body, size: Number(e.target.value) } }))} />
            </div>
            <div className="modal-field">
              <label className="modal-label">Justification</label>
              <select className="modal-select" value={local.body.justification}
                onChange={e => setLocal(p => ({ ...p, body: { ...p.body, justification: e.target.value as BodyStyle['justification'] } }))}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
                <option value="both">Justified</option>
              </select>
            </div>
            <label className="modal-checkbox-label">
              <input type="checkbox" checked={local.body.firstLineIndent}
                onChange={e => setLocal(p => ({ ...p, body: { ...p.body, firstLineIndent: e.target.checked } }))} />
              First line indent
            </label>
            <div className="modal-field">
              <label className="modal-label">Line spacing</label>
              <input className="modal-input modal-input-sm" type="number" min={0} max={72} step={0.5}
                value={local.body.lineSpacing}
                onChange={e => setLocal(p => ({ ...p, body: { ...p.body, lineSpacing: Number(e.target.value) } }))} />
            </div>
            <div className="modal-preview" style={{
              fontFamily: local.body.font,
              fontSize: local.body.size * 0.75,
              textAlign: local.body.justification === 'both' ? 'justify' : local.body.justification,
            }}>
              <span style={{ display: 'inline-block', textIndent: local.body.firstLineIndent ? '2em' : '0' }}>
                The road out of Calver runs north until it doesn't. Maren had driven it a hundred times in childhood, always in the passenger seat, watching the tree line blur.
              </span>
            </div>
          </div>
        )}

        <div className="modal-footer-split">
          <button className="welcome-btn" onClick={() => onSaveAsDefault(local)}>Save as default</button>
          <div className="modal-footer-actions">
            <button className="welcome-btn" onClick={onCancel}>Cancel</button>
            <button className="welcome-btn" onClick={() => onApply(local)}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function NewProjectModal({
  name,
  parent,
  onNameChange,
  onCancel,
  onBrowse,
  onCreate,
}: {
  name: string
  parent: string
  onNameChange: (name: string) => void
  onCancel: () => void
  onBrowse: () => void
  onCreate: () => void
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-box-sm">
        <p className="modal-title">New Project</p>
        <div className="modal-field">
          <label className="modal-label">Project name</label>
          <input
            className="modal-input"
            type="text"
            autoFocus
            value={name}
            onChange={e => onNameChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onCreate() }}
            placeholder="My Novel"
          />
          <p className="modal-danger-text">Scrivus will create a .scrivus project package in the selected location.</p>
        </div>
        <div className="modal-field">
          <label className="modal-label">Location</label>
          <div className="modal-inline-row">
            <div className={`modal-input modal-path-display${!parent ? ' modal-path-empty' : ''}`}>
              {parent || 'No folder selected'}
            </div>
            <button className="welcome-btn btn-nowrap" onClick={onBrowse}>Browse...</button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button
            className={`welcome-btn modal-btn-create${name.trim() && parent ? '' : ' is-disabled-visual'}`}
            onClick={onCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
