import { collectDocs } from '../tree'
import type { ProjectBackup } from '../backups'
import type { LoreCategory, LoreEntry, TreeNode } from '../types'

export type AppMessage = {
  title: string
  body: string
  kind: 'info' | 'warning' | 'error'
  action?: { label: string; onClick: () => void }
}

type ConfirmDeleteTarget = {
  sidecarId: string
  node: TreeNode
}

type ConfirmBinDeleteTarget = {
  id: number
  label: string
}

type TrashItem = {
  sidecarId: string
  label: string
  node: TreeNode
  originalFolderId: number
}

export function ConfirmDeleteModal({
  target,
  onCancel,
  onConfirm,
}: {
  target: ConfirmDeleteTarget | null
  onCancel: () => void
  onConfirm: (sidecarId: string, node: TreeNode) => void
}) {
  if (!target) return null
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-danger" style={{ width: 380 }}>
        <p className="modal-title">Permanently delete?</p>
        <p className="modal-danger-text">
          <strong style={{ color: '#cc8888' }}>{target.node.label}</strong> will be permanently deleted and cannot be recovered.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn modal-btn-danger" onClick={() => onConfirm(target.sidecarId, target.node)}>
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmBinDeleteModal({
  target,
  onCancel,
  onConfirm,
}: {
  target: ConfirmBinDeleteTarget | null
  onCancel: () => void
  onConfirm: (id: number) => void
}) {
  if (!target) return null
  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 380 }}>
        <p className="modal-title">Move to trash?</p>
        <p className="modal-danger-text">
          <strong style={{ color: '#d4d4d4' }}>{target.label}</strong> will be moved to the trash.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn" onClick={() => onConfirm(target.id)}>
            Move to trash
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmEmptyTrashModal({
  open,
  trashItems,
  onCancel,
  onConfirm,
}: {
  open: boolean
  trashItems: TrashItem[]
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  const total = trashItems.reduce((acc, item) => {
    if (item.node.type === 'folder') return acc + 1 + collectDocs(item.node).length
    return acc + 1
  }, 0)
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-danger" style={{ width: 380 }}>
        <p className="modal-title">Empty Trash?</p>
        <p className="modal-danger-text">
          All <strong style={{ color: '#cc8888' }}>{total} {total === 1 ? 'item' : 'items'}</strong> in the trash will be permanently deleted and cannot be recovered.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn modal-btn-danger" onClick={onConfirm}>
            Empty Trash
          </button>
        </div>
      </div>
    </div>
  )
}

export function AppMessageModal({
  message,
  onClose,
}: {
  message: AppMessage | null
  onClose: () => void
}) {
  if (!message) return null
  const colors = {
    info: { border: '#1f6a9a', icon: 'ti-info-circle', iconColor: '#4fc3f7' },
    warning: { border: '#9a7a1f', icon: 'ti-alert-triangle', iconColor: '#ffd54f' },
    error: { border: '#9a1f1f', icon: 'ti-circle-x', iconColor: '#ef9a9a' },
  }
  const c = colors[message.kind]
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ width: 380, borderColor: c.border }}>
        <div className="modal-message-header">
          <i className={`ti ${c.icon}`} style={{ color: c.iconColor }} aria-hidden="true" />
          <p className="modal-title">{message.title}</p>
        </div>
        <p className="modal-danger-text">{message.body}</p>
        <div className="modal-footer">
          {message.action && (
            <button className="welcome-btn" onClick={() => { message.action?.onClick(); onClose() }}>
              {message.action.label}
            </button>
          )}
          <button className="welcome-btn" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  )
}

export function ProjectRecoveryModal({
  target,
  onRestoreLatest,
  onOpenBackupFolder,
  onDismiss,
}: {
  target: { name: string; path: string; details: string } | null
  onRestoreLatest: () => void
  onOpenBackupFolder: () => void
  onDismiss: () => void
}) {
  if (!target) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 210 }}>
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-message-header">
          <i className="ti ti-alert-triangle" style={{ color: '#ffd54f' }} aria-hidden="true" />
          <p className="modal-title">Project Could Not Open</p>
        </div>
        <p className="modal-danger-text">
          Scrivus could not open <strong style={{ color: '#d4d4d4' }}>{target.name}</strong>. You can try restoring the latest backup or inspect the backup folder.
        </p>
        <pre className="modal-error-details">{target.details}</pre>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onDismiss}>Dismiss</button>
          <button className="welcome-btn" onClick={onOpenBackupFolder}>Open Backup Folder</button>
          <button className="welcome-btn" onClick={onRestoreLatest}>Restore Latest Backup</button>
        </div>
      </div>
    </div>
  )
}

export function AboutModal({
  open,
  version,
  changelog,
  projectFormatCompatibility,
  privacyNote,
  thirdPartyLicenses,
  onClose,
  onOpenGithub,
}: {
  open: boolean
  version: string
  changelog: string
  projectFormatCompatibility: string
  privacyNote: string
  thirdPartyLicenses: string
  onClose: () => void
  onOpenGithub: () => void
}) {
  if (!open) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box about-modal">
        <div className="modal-message-header">
          <i className="ti ti-feather" aria-hidden="true" />
          <p className="modal-title">About Scrivus</p>
        </div>
        <div className="about-content">
          <p>Scrivus {version}</p>
          <p>Made by ObsydianX.</p>
          <p className="about-muted">Application license: MIT.</p>
          <button className="about-link" onClick={onOpenGithub}>GitHub page</button>
          <details className="about-licenses">
            <summary>Release notes</summary>
            <pre>{changelog}</pre>
          </details>
          <details className="about-licenses">
            <summary>Project compatibility</summary>
            <pre>{projectFormatCompatibility}</pre>
          </details>
          <details className="about-licenses">
            <summary>Privacy</summary>
            <pre>{privacyNote}</pre>
          </details>
          <details className="about-licenses">
            <summary>Third-party licenses</summary>
            <pre>{thirdPartyLicenses}</pre>
          </details>
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function formatBackupDate(value: string) {
  const normalized = value.replace(
    /^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/,
    '$1:$2:$3.$4Z',
  )
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function RestoreBackupModal({
  open,
  backups,
  selectedBackupName,
  onSelectBackup,
  onCancel,
  onRestore,
}: {
  open: boolean
  backups: ProjectBackup[]
  selectedBackupName: string | null
  onSelectBackup: (name: string) => void
  onCancel: () => void
  onRestore: () => void
}) {
  if (!open) return null
  const selected = backups.find(backup => backup.name === selectedBackupName)
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box" style={{ width: 560 }}>
        <p className="modal-title">Restore Backup</p>
        <p className="modal-danger-text">
          Choose a backup to restore. Scrivus will create a pre-restore backup first.
        </p>
        <div className="backup-list">
          {backups.length === 0 ? (
            <div className="backup-empty">No backups found for this project.</div>
          ) : backups.map(backup => (
            <button
              key={backup.name}
              className={`backup-row${selectedBackupName === backup.name ? ' selected' : ''}`}
              onClick={() => onSelectBackup(backup.name)}
            >
              <span className="backup-date">{formatBackupDate(backup.createdAt)}</span>
              <span className={`backup-reason backup-reason-${backup.reason}`}>{backup.reason}</span>
            </button>
          ))}
        </div>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button
            className="welcome-btn"
            disabled={!selected}
            onClick={onRestore}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDeleteTabModal({
  tabName,
  onCancel,
  onConfirm,
}: {
  tabName?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-danger" style={{ width: 380 }}>
        <p className="modal-title">Delete tab?</p>
        <p className="modal-danger-text">
          <strong style={{ color: '#cc8888' }}>{tabName}</strong> will be removed. Its content will be preserved in the scene file and can be manually recovered if needed.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn modal-btn-danger" onClick={onConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDeleteLoreCategoryModal({
  category,
  onCancel,
  onConfirm,
}: {
  category: LoreCategory | null
  onCancel: () => void
  onConfirm: (categoryId: string) => void
}) {
  if (!category) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box modal-danger" style={{ width: 380 }}>
        <p className="modal-title">Delete category?</p>
        <p className="modal-danger-text">
          <strong style={{ color: '#cc8888' }}>{category.name}</strong> and all its entries will be permanently deleted.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn modal-btn-danger" onClick={() => onConfirm(category.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export function ConfirmDeleteLoreEntryModal({
  entry,
  categoryId,
  onCancel,
  onConfirm,
}: {
  entry: LoreEntry | null
  categoryId: string | null
  onCancel: () => void
  onConfirm: (categoryId: string, entryId: string) => void
}) {
  if (!entry) return null
  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal-box modal-danger" style={{ width: 380 }}>
        <p className="modal-title">Delete entry?</p>
        <p className="modal-danger-text">
          <strong style={{ color: '#cc8888' }}>{entry.name}</strong> will be permanently deleted.
        </p>
        <div className="modal-footer">
          <button className="welcome-btn" onClick={onCancel}>Cancel</button>
          <button className="welcome-btn modal-btn-danger" onClick={() => categoryId && onConfirm(categoryId, entry.id)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
