import { join } from '@tauri-apps/api/path'
import { readTextFile, stat } from '@tauri-apps/plugin-fs'
import { parseSceneTabs } from './sceneTabs'
import type { SceneTab } from './types'

const cache = new Map<string, { stamp: string; tabs: SceneTab[] }>()
let cachedProject = ''

export function invalidateCompileScene(projectPath: string, fileId: string) {
  if (cachedProject === projectPath) cache.delete(fileId)
}

export async function readCompileTabs(projectPath: string, fileId: string): Promise<SceneTab[]> {
  if (cachedProject !== projectPath) {
    cache.clear()
    cachedProject = projectPath
  }
  const path = await join(projectPath, 'scenes', `${fileId}.md`)
  const info = await stat(path)
  const stamp = `${info.mtime?.getTime()}:${info.size}`
  const cached = cache.get(fileId)
  if (info.mtime && cached?.stamp === stamp) return cached.tabs
  const tabs = parseSceneTabs(await readTextFile(path))
  // Missing timestamps cannot reliably validate reuse. Read failures propagate
  // so an export cannot silently omit a scene.
  if (cachedProject === projectPath && info.mtime) cache.set(fileId, { stamp, tabs })
  return tabs
}
