function normalize(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function folderContains(folder: string, path: string) {
  const parent = normalize(folder)
  const child = normalize(path)
  return child === parent || child.startsWith(`${parent}/`)
}

// A backup can fail on either its source or destination. Renewing the source
// grant cannot fix a denied custom destination on a different drive.
export function backupAccessTarget(error: unknown, projectPath: string, customBackupFolder?: string) {
  const denied = String(error).match(/forbidden path:\s*(.*?)(?:, maybe|$)/i)?.[1]?.trim()
  if (!denied) return null
  const backup = customBackupFolder?.trim()
  return backup && folderContains(backup, denied)
    ? { kind: 'backup' as const, path: backup }
    : { kind: 'project' as const, path: projectPath }
}
