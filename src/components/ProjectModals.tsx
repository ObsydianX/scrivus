import { useEffect, useState } from 'react'
import { DEFAULT_BACKUP_SETTINGS, DEFAULT_STYLES, normalizeProjectSettings, normalizeProjectStyles } from '../constants'
import type { BackupSettings, BodyStyle, EditorStyle, ProjectSettings, ProjectStyles, ThemeId } from '../types'

export function ProjectSettingsModal({
  settings,
  styles,
  dictionaryWords,
  activeTab,
  onTabChange,
  onCancel,
  onSave,
}: {
  settings: ProjectSettings
  styles: ProjectStyles
  dictionaryWords: string[]
  activeTab: 'book' | 'styles' | 'backups' | 'dictionary'
  onTabChange: (tab: 'book' | 'styles' | 'backups' | 'dictionary') => void
  onCancel: () => void
  onSave: (settings: ProjectSettings, styles: ProjectStyles, dictionaryWords: string[]) => void
}) {
  const [local, setLocal] = useState<ProjectSettings>(() => normalizeProjectSettings(settings))
  const [localStyles, setLocalStyles] = useState<ProjectStyles>(() => normalizeProjectStyles(styles))
  const [localDictionary, setLocalDictionary] = useState<string[]>(dictionaryWords)
  const [styleTab, setStyleTab] = useState<'chapter' | 'body' | 'editor'>('chapter')

  useEffect(() => {
    setLocal(normalizeProjectSettings(settings))
    setLocalStyles(normalizeProjectStyles(styles))
    setLocalDictionary(dictionaryWords)
  }, [settings, styles, dictionaryWords])

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
      <div className="modal-box project-settings-modal">
        <p className="modal-title">Project Settings</p>
        <div className="modal-tabs">
          {([
            ['book', 'Book Info'],
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
            <div className="modal-field">
              <label className="modal-label">Novel title</label>
              <input
                className="modal-input"
                value={local.title}
                onChange={e => setLocal(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Subtitle</label>
              <input
                className="modal-input"
                value={local.subtitle}
                onChange={e => setLocal(prev => ({ ...prev, subtitle: e.target.value }))}
              />
            </div>
            <div className="modal-field">
              <label className="modal-label">Author</label>
              <input
                className="modal-input"
                value={local.author}
                onChange={e => setLocal(prev => ({ ...prev, author: e.target.value }))}
              />
            </div>
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

        {activeTab === 'dictionary' && (
          <div className="dictionary-panel">
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
            <button
              className="welcome-btn style-reset-btn"
              onClick={() => setBackupSettings(DEFAULT_BACKUP_SETTINGS)}
            >
              Reset Backups
            </button>
          </div>
        )}

        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" onClick={() => onSave(normalizeProjectSettings(local), localStyles, localDictionary)}>Save</button>
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
  theme,
  incrementNewNodeNumbers,
  readingWpm,
  defaultSceneTargetWordCount,
  onCancel,
  onSave,
}: {
  theme: ThemeId
  incrementNewNodeNumbers: boolean
  readingWpm: number
  defaultSceneTargetWordCount: number
  onCancel: () => void
  onSave: (theme: ThemeId, incrementNewNodeNumbers: boolean, readingWpm: number, defaultSceneTargetWordCount: number) => void
}) {
  const [localTheme, setLocalTheme] = useState<ThemeId>(theme)
  const [localIncrementNewNodeNumbers, setLocalIncrementNewNodeNumbers] = useState(incrementNewNodeNumbers)
  const [localReadingWpm, setLocalReadingWpm] = useState(String(readingWpm))
  const [localDefaultSceneTargetWordCount, setLocalDefaultSceneTargetWordCount] = useState(String(defaultSceneTargetWordCount || ''))
  const [activeTab, setActiveTab] = useState<'general' | 'themes'>('general')

  useEffect(() => {
    setLocalTheme(theme)
    setLocalIncrementNewNodeNumbers(incrementNewNodeNumbers)
    setLocalReadingWpm(String(readingWpm))
    setLocalDefaultSceneTargetWordCount(String(defaultSceneTargetWordCount || ''))
  }, [theme, incrementNewNodeNumbers, readingWpm, defaultSceneTargetWordCount])

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

  return (
    <div className="modal-overlay">
      <div className="modal-box project-settings-modal">
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
              <label className="modal-checkbox-label">
                <input
                  type="checkbox"
                  checked={localIncrementNewNodeNumbers}
                  onChange={e => setLocalIncrementNewNodeNumbers(e.target.checked)}
                />
                Increment scene, chapter, and act numbers when adding new binder items
              </label>
            </>
          )}
          {activeTab === 'themes' && (
            <div className="modal-field">
              <label className="modal-label">Theme</label>
              <div className="theme-grid">
                {THEME_OPTIONS.map(theme => (
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
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" onClick={() => onSave(localTheme, localIncrementNewNodeNumbers, normalizeReadingWpmInput(), normalizeDefaultSceneTargetInput())}>Save</button>
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
}: {
  styles: ProjectStyles
  activeTab: 'chapter' | 'body'
  onTabChange: (tab: 'chapter' | 'body') => void
  onCancel: () => void
  onApply: (styles: ProjectStyles) => void
  onSaveAsDefault: (styles: ProjectStyles) => void
}) {
  const [local, setLocal] = useState<ProjectStyles>(styles)

  useEffect(() => {
    setLocal(styles)
  }, [styles])

  const fonts = ['Georgia', 'Times New Roman', 'Garamond', 'Palatino', 'Arial', 'Helvetica', 'Courier New']

  return (
    <div className="modal-overlay">
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
