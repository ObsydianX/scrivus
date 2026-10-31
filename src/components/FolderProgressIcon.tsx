import { getFolderProgressDisplay, type FolderProgress } from '../folderProgress'

export function FolderProgressIcon({ progress }: { progress: FolderProgress }) {
  const { done, fill, label } = getFolderProgressDisplay(progress)
  return <svg className="binder-folder-progress" viewBox="0 0 24 24" role="img" aria-label={label}>
    <title>{label}</title>
    <circle className="binder-progress-track" cx="12" cy="12" r="8.5" />
    {fill > 0 && <circle className="binder-progress-fill" cx="12" cy="12" r="8.5" pathLength="100" strokeDasharray={`${fill * 100} 100`} transform="rotate(-90 12 12)" />}
    {done && <path className="binder-progress-check" d="m8 12 2.5 2.5L16 9" />}
    {progress.needsWork > 0 && <circle className="binder-progress-warning" cx="20" cy="4" r="3" />}
  </svg>
}
