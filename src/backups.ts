import { appDataDir, join } from '@tauri-apps/api/path'
import { copyFile, exists, mkdir, readDir, remove, writeTextFile } from '@tauri-apps/plugin-fs'

export type BackupReason = 'open' | 'auto' | 'manual' | 'pre-restore' | 'compile' | 'close'

export type ProjectBackup = {
  name: string
  path: string
  createdAt: string
  reason: BackupReason
}

const SKIP_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.scrivus-backup.json',
  '.DS_Store',
])

function safeProjectName(name: string) {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '_') || 'project'
}

function hashPath(path: string) {
  let hash = 5381
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) + hash) ^ path.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function backupRoot(projectPath: string, projectName: string) {
  const appData = await appDataDir()
  const root = await join(appData, 'backups', `${safeProjectName(projectName)}-${hashPath(projectPath)}`)
  await mkdir(root, { recursive: true })
  return root
}

export async function getProjectBackupRoot(projectPath: string, projectName: string) {
  return backupRoot(projectPath, projectName)
}

async function copyDirectoryContents(source: string, target: string) {
  await mkdir(target, { recursive: true })
  const entries = await readDir(source)

  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name)) continue
    const sourcePath = await join(source, entry.name)
    const targetPath = await join(target, entry.name)

    try {
      if (entry.isSymlink) continue
      if (entry.isDirectory) {
        await copyDirectoryContents(sourcePath, targetPath)
      } else if (entry.isFile) {
        await copyFile(sourcePath, targetPath)
      }
    } catch (error) {
      throw new Error(`Could not back up "${sourcePath}": ${String(error)}`)
    }
  }
}

async function pruneBackups(root: string, retentionCount: number, preserveName?: string) {
  const entries = await readDir(root)
  const backups = entries
    .filter(entry => entry.isDirectory)
    .map(entry => entry.name)
    .sort()
    .reverse()

  for (const stale of backups.slice(retentionCount)) {
    if (stale === preserveName) continue
    await remove(await join(root, stale), { recursive: true })
  }
}

export async function listProjectBackups(projectPath: string, projectName: string): Promise<ProjectBackup[]> {
  const root = await backupRoot(projectPath, projectName)
  const entries = await readDir(root)
  const backups: ProjectBackup[] = []

  for (const entry of entries) {
    if (!entry.isDirectory) continue
    const backupPath = await join(root, entry.name)
    const [createdAt = entry.name, reason = 'manual'] = entry.name.split('__')
    backups.push({
      name: entry.name,
      path: backupPath,
      createdAt,
      reason: reason as BackupReason,
    })
  }

  return backups.sort((a, b) => b.name.localeCompare(a.name))
}

export async function createProjectBackup(
  projectPath: string,
  projectName: string,
  reason: BackupReason,
  retentionCount = 20,
  preserveBackupName?: string,
): Promise<ProjectBackup> {
  const root = await backupRoot(projectPath, projectName)
  const name = `${timestampName()}__${reason}`
  const destination = await join(root, name)

  await copyDirectoryContents(projectPath, destination)
  await writeTextFile(await join(destination, '.scrivus-backup.json'), JSON.stringify({
    projectName,
    projectPath,
    createdAt: new Date().toISOString(),
    reason,
  }, null, 2))
  await pruneBackups(root, retentionCount, preserveBackupName)

  return {
    name,
    path: destination,
    createdAt: name.split('__')[0],
    reason,
  }
}

export async function restoreLatestProjectBackup(
  projectPath: string,
  projectName: string,
  retentionCount = 20,
): Promise<ProjectBackup | null> {
  const backups = await listProjectBackups(projectPath, projectName)
  const latest = backups[0]
  if (!latest) return null

  return restoreProjectBackup(projectPath, projectName, latest, retentionCount)
}

export async function restoreProjectBackup(
  projectPath: string,
  projectName: string,
  backup: ProjectBackup,
  retentionCount = 20,
): Promise<ProjectBackup> {
  // Keep the backup being restored out of the retention prune: if it is the
  // oldest one at the limit, pruning would delete it before it can be copied.
  await createProjectBackup(projectPath, projectName, 'pre-restore', retentionCount, backup.name)
  const destinationExists = await exists(projectPath)
  if (!destinationExists) await mkdir(projectPath, { recursive: true })
  await copyDirectoryContents(backup.path, projectPath)
  return backup
}
