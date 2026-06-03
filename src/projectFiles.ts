import { exists, mkdir, readTextFile, writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { DEFAULT_PROJECT_SETTINGS, DEFAULT_SCENE_METADATA, normalizeAtlas, normalizeMindMap } from './constants'
import defaultAtlas from './defaultProject/atlas.json'
import defaultCanvas from './defaultProject/canvas.json'
import defaultLoreBook from './defaultProject/lorebook.json'
import defaultAtlasImageUrl from './defaultProject/images/sample_map4k.png?url'
import defaultPortraitImageUrl from './defaultProject/images/portrait_silhouette.png?url'
import { saveProjectToDisk, writeSceneFile } from './storage'
import type { Atlas, LoreBook, MindMap, Project, ProjectStyles, TreeNode } from './types'
import type { ImportedSceneFile } from './wordImport'

const DEFAULT_SCENE_CONTENT = `<p>This is the beginning of your story. Somewhere in these pages, a character is waiting to surprise you - someone whose voice you don't yet know, whose choices will lead somewhere you haven't imagined. Let them.</p><p>The world you're building exists nowhere else. Every detail you set down - the quality of light through a particular window, the way two people talk around what they mean, the rules of a place that has never existed - belongs entirely to you. There is no wrong way to begin.</p><p>Write the first true sentence. The rest will follow.</p>`
export const PROJECT_PACKAGE_EXTENSION = '.scrivus'

export function normalizeProjectDisplayName(name: string) {
  const trimmed = name.trim()
  return trimmed.toLowerCase().endsWith(PROJECT_PACKAGE_EXTENSION)
    ? trimmed.slice(0, -PROJECT_PACKAGE_EXTENSION.length).trim() || 'Untitled Project'
    : trimmed || 'Untitled Project'
}

export function projectPackageFolderName(name: string) {
  const displayName = normalizeProjectDisplayName(name)
  return `${displayName}${PROJECT_PACKAGE_EXTENSION}`
}

function cloneDefault<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function writeBundledAsset(url: string, destination: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load bundled project asset: ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await writeFile(destination, bytes)
}

async function writeDefaultProjectCompanions(projectPath: string) {
  const atlas = normalizeAtlas(cloneDefault(defaultAtlas as Atlas))
  const canvas = normalizeMindMap(cloneDefault(defaultCanvas as MindMap))
  const loreBook = cloneDefault(defaultLoreBook as LoreBook)

  await writeTextFile(await join(projectPath, 'atlas.json'), JSON.stringify(atlas, null, 2))
  await writeTextFile(await join(projectPath, 'canvas.json'), JSON.stringify(canvas, null, 2))
  await writeTextFile(await join(projectPath, 'lorebook.json'), JSON.stringify(loreBook, null, 2))

  const atlasImagesDir = await join(projectPath, 'atlas', 'images')
  const loreImagesDir = await join(projectPath, 'lorebook', 'images')
  await mkdir(atlasImagesDir, { recursive: true })
  await mkdir(loreImagesDir, { recursive: true })
  await writeBundledAsset(defaultAtlasImageUrl, await join(atlasImagesDir, 'map_mpsg45yr4t6em.png'))
  await writeBundledAsset(defaultPortraitImageUrl, await join(loreImagesDir, 'lmpsfakzdq9gf_lmpsf83t155qf_mpsfjr6hypwz3.png'))
}

export async function createProjectOnDisk({
  parentPath,
  name,
  chapterId,
  sceneId,
  sceneFileId,
  styles,
}: {
  parentPath: string
  name: string
  chapterId: number
  sceneId: number
  sceneFileId: string
  styles: ProjectStyles
}): Promise<Project> {
  const projectName = normalizeProjectDisplayName(name)
  const packageName = projectPackageFolderName(projectName)
  const projectPath = await join(parentPath, packageName)
  if (await exists(projectPath)) {
    throw new Error(`A project package named "${packageName}" already exists in that location. Choose a different project name or location.`)
  }
  await mkdir(projectPath, { recursive: true })

  const defaultTree: TreeNode[] = [
    {
      id: 1,
      type: 'folder',
      label: 'Manuscript',
      open: true,
      children: [
        {
          id: chapterId,
          type: 'folder',
          label: 'Chapter 1',
          open: true,
          children: [
            { id: sceneId, type: 'doc', label: 'Scene 1', title: 'Scene 1', file: sceneFileId, metadata: DEFAULT_SCENE_METADATA },
          ],
        },
      ],
    },
    { id: 2, type: 'folder', label: 'Notes', open: false, children: [] },
  ]

  await writeSceneFile(projectPath, sceneFileId, DEFAULT_SCENE_CONTENT)
  await writeDefaultProjectCompanions(projectPath)

  const project: Project = {
    name: projectName,
    path: projectPath,
    tree: defaultTree,
    styles,
    settings: DEFAULT_PROJECT_SETTINGS,
    compileSelections: {},
  }

  await saveProjectToDisk(project)
  return project
}

export async function createImportedProjectOnDisk({
  parentPath,
  name,
  tree,
  sceneFiles,
  styles,
}: {
  parentPath: string
  name: string
  tree: TreeNode[]
  sceneFiles: ImportedSceneFile[]
  styles: ProjectStyles
}): Promise<Project> {
  const projectName = normalizeProjectDisplayName(name)
  const packageName = projectPackageFolderName(projectName)
  const projectPath = await join(parentPath, packageName)
  if (await exists(projectPath)) {
    throw new Error(`A project package named "${packageName}" already exists in that location. Choose a different project name or location.`)
  }
  await mkdir(projectPath, { recursive: true })

  for (const sceneFile of sceneFiles) {
    await writeSceneFile(projectPath, sceneFile.fileId, sceneFile.content)
  }
  await writeDefaultProjectCompanions(projectPath)

  const project: Project = {
    name: projectName,
    path: projectPath,
    tree,
    styles,
    settings: DEFAULT_PROJECT_SETTINGS,
    compileSelections: {},
  }

  await saveProjectToDisk(project)
  return project
}

export async function readProjectJson(projectPath: string): Promise<Record<string, unknown> | null> {
  const projectFile = await join(projectPath, 'project.json')
  const fileExists = await exists(projectFile)
  if (!fileExists) return null
  const raw = await readTextFile(projectFile)
  return JSON.parse(raw)
}
