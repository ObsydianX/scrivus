import type { RefObject } from 'react'

export function AppMenus({
  projectOpen,
  fileMenuOpen,
  projectMenuOpen,
  reviewMenuOpen,
  worldMenuOpen,
  editMenuOpen,
  helpMenuOpen,
  fileMenuRef,
  projectMenuRef,
  reviewMenuRef,
  worldMenuRef,
  editMenuRef,
  helpMenuRef,
  canUndo,
  canRedo,
  onFileMenuToggle,
  onProjectMenuToggle,
  onReviewMenuToggle,
  onWorldMenuToggle,
  onEditMenuToggle,
  onHelpMenuToggle,
  onNewProject,
  onOpenProject,
  onNewProjectFromWordDoc,
  onOpenReviewPackage,
  onImportReviewComments,
  onExportReviewComments,
  onImportWorldBundle,
  onExportWorldBundle,
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
  reviewMode,
}: {
  projectOpen: boolean
  reviewMode: boolean
  fileMenuOpen: boolean
  projectMenuOpen: boolean
  reviewMenuOpen: boolean
  worldMenuOpen: boolean
  editMenuOpen: boolean
  helpMenuOpen: boolean
  fileMenuRef: RefObject<HTMLDivElement | null>
  projectMenuRef: RefObject<HTMLDivElement | null>
  reviewMenuRef: RefObject<HTMLDivElement | null>
  worldMenuRef: RefObject<HTMLDivElement | null>
  editMenuRef: RefObject<HTMLDivElement | null>
  helpMenuRef: RefObject<HTMLDivElement | null>
  canUndo: boolean
  canRedo: boolean
  onFileMenuToggle: () => void
  onProjectMenuToggle: () => void
  onReviewMenuToggle: () => void
  onWorldMenuToggle: () => void
  onEditMenuToggle: () => void
  onHelpMenuToggle: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onNewProjectFromWordDoc: () => void
  onOpenReviewPackage: () => void
  onImportReviewComments: () => void
  onExportReviewComments: () => void
  onImportWorldBundle: () => void
  onExportWorldBundle: () => void
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
  const MenuLabel = ({ label, shortcut }: { label: string; shortcut?: string }) => (
    <>
      <span>{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
    </>
  )

  return (
    <>
      <div className={`menu-item${fileMenuOpen ? ' open' : ''}`} ref={fileMenuRef}>
        <button onClick={onFileMenuToggle}>File</button>
        {fileMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onNewProject}>
              <MenuLabel label="New Project" shortcut="Ctrl+N" />
            </button>
            <button onClick={onOpenProject}>
              <MenuLabel label="Open Project..." shortcut="Ctrl+O" />
            </button>
            <button onClick={onNewProjectFromWordDoc}>New Project from Word Doc...</button>
            <button onClick={onOpenReviewPackage}>Open Review Package...</button>
            <div className="sep" />
            <button onClick={onCloseProject} disabled={!projectOpen}>
              <MenuLabel label="Close Project" shortcut="Ctrl+W" />
            </button>
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
            <button onClick={onProjectSettings} disabled={!projectOpen || reviewMode}>
              <MenuLabel label="Project Settings..." shortcut="Ctrl+Alt+P" />
            </button>
            <button onClick={onPreferences}>
              <MenuLabel label="Preferences..." shortcut="Ctrl+P" />
            </button>
            <div className="sep" />
            <button onClick={onSearch} disabled={!projectOpen || reviewMode}>
              <MenuLabel label="Search Project..." shortcut="Ctrl+F" />
            </button>
            <button onClick={onFindReplace} disabled={!projectOpen || reviewMode}>
              <MenuLabel label="Find & Replace..." shortcut="Ctrl+H" />
            </button>
          </div>
        )}
      </div>

      <div className={`menu-item${projectMenuOpen ? ' open' : ''}`} ref={projectMenuRef}>
        <button onClick={onProjectMenuToggle}>Project</button>
        {projectMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onCompile} disabled={!projectOpen || reviewMode}>Compile</button>
            <div className="sep" />
            <button onClick={onBackupNow} disabled={!projectOpen || reviewMode}>Back Up Now</button>
            <button onClick={onRestoreBackupPicker} disabled={!projectOpen || reviewMode}>Restore Backup...</button>
            <button onClick={onRestoreBackup} disabled={!projectOpen || reviewMode}>Restore Latest Backup...</button>
          </div>
        )}
      </div>

      <div className={`menu-item${worldMenuOpen ? ' open' : ''}`} ref={worldMenuRef}>
        <button onClick={onWorldMenuToggle}>World</button>
        {worldMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onImportWorldBundle} disabled={!projectOpen || reviewMode}>Import World...</button>
            <button onClick={onExportWorldBundle} disabled={!projectOpen || reviewMode}>Export World...</button>
          </div>
        )}
      </div>

      <div className={`menu-item${reviewMenuOpen ? ' open' : ''}`} ref={reviewMenuRef}>
        <button onClick={onReviewMenuToggle}>Review</button>
        {reviewMenuOpen && (
          <div className="menu-dropdown">
            <button onClick={onImportReviewComments} disabled={!projectOpen || reviewMode}>Import Review Comments...</button>
            <button onClick={onExportReviewComments} disabled={!reviewMode}>Export Review Comments...</button>
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
