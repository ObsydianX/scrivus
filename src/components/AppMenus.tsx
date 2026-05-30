import type { RefObject } from 'react'

export function AppMenus({
  projectOpen,
  fileMenuOpen,
  editMenuOpen,
  helpMenuOpen,
  fileMenuRef,
  editMenuRef,
  helpMenuRef,
  canUndo,
  canRedo,
  onFileMenuToggle,
  onEditMenuToggle,
  onHelpMenuToggle,
  onNewProject,
  onOpenProject,
  onCloseProject,
  onBackupNow,
  onRestoreBackup,
  onRestoreBackupPicker,
  onCompile,
  onExit,
  onUndo,
  onRedo,
  onSelectAll,
  onProjectSettings,
  onPreferences,
  onSearch,
  onFindReplace,
  onAbout,
  onCheckForUpdates,
}: {
  projectOpen: boolean
  fileMenuOpen: boolean
  editMenuOpen: boolean
  helpMenuOpen: boolean
  fileMenuRef: RefObject<HTMLDivElement | null>
  editMenuRef: RefObject<HTMLDivElement | null>
  helpMenuRef: RefObject<HTMLDivElement | null>
  canUndo: boolean
  canRedo: boolean
  onFileMenuToggle: () => void
  onEditMenuToggle: () => void
  onHelpMenuToggle: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onCloseProject: () => void
  onBackupNow: () => void
  onRestoreBackup: () => void
  onRestoreBackupPicker: () => void
  onCompile: () => void
  onExit: () => void
  onUndo: () => void
  onRedo: () => void
  onSelectAll: () => void
  onProjectSettings: () => void
  onPreferences: () => void
  onSearch: () => void
  onFindReplace: () => void
  onAbout: () => void
  onCheckForUpdates: () => void
}) {
  return (
    <>
      <div className={`menu-item${fileMenuOpen ? ' open' : ''}`} ref={fileMenuRef}>
        <button onClick={onFileMenuToggle}>File</button>
        {fileMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onNewProject}>New Project</button>
            <button onClick={onOpenProject}>Open Project...</button>
            <div className="sep" />
            <button onClick={onCloseProject} disabled={!projectOpen}>Close Project</button>
            <div className="sep" />
            <button onClick={onBackupNow} disabled={!projectOpen}>Back Up Now</button>
            <button onClick={onRestoreBackupPicker} disabled={!projectOpen}>Restore Backup...</button>
            <button onClick={onRestoreBackup} disabled={!projectOpen}>Restore Latest Backup...</button>
            <div className="sep" />
            <button onClick={onCompile} disabled={!projectOpen}>Compile</button>
            <div className="sep" />
            <button onClick={onExit}>Exit</button>
          </div>
        )}
      </div>

      <div className={`menu-item${editMenuOpen ? ' open' : ''}`} ref={editMenuRef}>
        <button onClick={onEditMenuToggle}>Edit</button>
        {editMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onUndo} disabled={!projectOpen || !canUndo}>
              Undo
            </button>
            <button onClick={onRedo} disabled={!projectOpen || !canRedo}>
              Redo
            </button>
            <button onClick={onSelectAll} disabled={!projectOpen}>
              Select All
            </button>
            <div className="sep" />
            <button onClick={onProjectSettings} disabled={!projectOpen}>
              Project Settings...
            </button>
            <button onClick={onPreferences}>
              Preferences...
            </button>
            <div className="sep" />
            <button onClick={onSearch} disabled={!projectOpen}>
              Search Project...
            </button>
            <button onClick={onFindReplace} disabled={!projectOpen}>
              Find & Replace...
            </button>
          </div>
        )}
      </div>

      <div className={`menu-item${helpMenuOpen ? ' open' : ''}`} ref={helpMenuRef}>
        <button onClick={onHelpMenuToggle}>Help</button>
        {helpMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onCheckForUpdates}>Check for Updates...</button>
            <div className="sep" />
            <button onClick={onAbout}>About Scrivus</button>
          </div>
        )}
      </div>
    </>
  )
}
