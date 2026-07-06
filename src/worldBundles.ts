import JSZip from 'jszip'
import { exists, mkdir, readFile, writeFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { SCRIVUS_VERSION, normalizeAtlas, normalizeMindMap } from './constants'
import type { Atlas, LoreBook, LoreFieldValue, MindMap } from './types'

export type WorldBundleComponent = 'loreBook' | 'canvas' | 'atlas' | 'dictionary'

export type WorldBundleSelection = Record<WorldBundleComponent, boolean>

export const DEFAULT_WORLD_BUNDLE_SELECTION: WorldBundleSelection = {
  loreBook: true,
  canvas: true,
  atlas: true,
  dictionary: false,
}

export type WorldBundleData = {
  loreBook?: LoreBook
  canvas?: MindMap
  atlas?: Atlas
  dictionary?: string[]
}

export type LoadedWorldBundle = {
  manifest: WorldBundleManifest
  zip: JSZip
  data: WorldBundleData
  available: WorldBundleSelection
}

type WorldBundleManifest = {
  kind: 'scrivusworld'
  version: 1
  scrivusVersion: string
  createdAt: string
  projectName: string
  components: Partial<Record<WorldBundleComponent, string>>
  assets: string[]
}

const MANIFEST_PATH = 'scrivus-world.json'

const unique = (values: string[]) => Array.from(new Set(values.filter(Boolean)))

function collectLoreImagePaths(loreBook: LoreBook) {
  const paths: string[] = []
  const visitValue = (value: LoreFieldValue | undefined) => {
    if (!value) return
    if (typeof value === 'string') {
      if (value.startsWith('lorebook/images/')) paths.push(value)
      return
    }
    if (value.path?.startsWith('lorebook/images/')) paths.push(value.path)
    if (value.croppedPath?.startsWith('lorebook/images/')) paths.push(value.croppedPath)
  }
  loreBook.categories.forEach(category => {
    category.entries.forEach(entry => {
      Object.values(entry.fields).forEach(visitValue)
    })
  })
  return unique(paths)
}

function collectAtlasImagePaths(atlas: Atlas) {
  return unique(atlas.maps.map(map => map.imagePath).filter(path => path.startsWith('atlas/images/')))
}

async function addAsset(zip: JSZip, projectPath: string, relativePath: string) {
  const absolutePath = await join(projectPath, relativePath)
  if (!(await exists(absolutePath))) return false
  zip.file(`assets/${relativePath}`, await readFile(absolutePath))
  return true
}

export async function createWorldBundle(options: {
  projectPath: string
  projectName: string
  selection: WorldBundleSelection
  data: Required<WorldBundleData>
}) {
  const zip = new JSZip()
  const components: WorldBundleManifest['components'] = {}
  const assets: string[] = []

  if (options.selection.loreBook) {
    components.loreBook = 'data/lorebook.json'
    zip.file(components.loreBook, JSON.stringify(options.data.loreBook, null, 2))
    for (const path of collectLoreImagePaths(options.data.loreBook)) {
      if (await addAsset(zip, options.projectPath, path)) assets.push(path)
    }
  }

  if (options.selection.canvas) {
    components.canvas = 'data/canvas.json'
    zip.file(components.canvas, JSON.stringify(normalizeMindMap(options.data.canvas), null, 2))
  }

  if (options.selection.atlas) {
    components.atlas = 'data/atlas.json'
    zip.file(components.atlas, JSON.stringify(normalizeAtlas(options.data.atlas), null, 2))
    for (const path of collectAtlasImagePaths(options.data.atlas)) {
      if (await addAsset(zip, options.projectPath, path)) assets.push(path)
    }
  }

  if (options.selection.dictionary) {
    components.dictionary = 'data/dictionary.json'
    zip.file(components.dictionary, JSON.stringify(options.data.dictionary, null, 2))
  }

  const manifest: WorldBundleManifest = {
    kind: 'scrivusworld',
    version: 1,
    scrivusVersion: SCRIVUS_VERSION,
    createdAt: new Date().toISOString(),
    projectName: options.projectName,
    components,
    assets: unique(assets),
  }
  zip.file(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

async function readJsonFile<T>(zip: JSZip, path: string | undefined): Promise<T | undefined> {
  if (!path) return undefined
  const file = zip.file(path)
  if (!file) return undefined
  return JSON.parse(await file.async('string')) as T
}

export async function loadWorldBundle(bytes: Uint8Array): Promise<LoadedWorldBundle> {
  const zip = await JSZip.loadAsync(bytes)
  const manifestFile = zip.file(MANIFEST_PATH)
  if (!manifestFile) throw new Error('This is not a Scrivus world bundle.')
  const manifest = JSON.parse(await manifestFile.async('string')) as WorldBundleManifest
  if (manifest.kind !== 'scrivusworld' || manifest.version !== 1) {
    throw new Error('Unsupported Scrivus world bundle format.')
  }

  const data: WorldBundleData = {
    loreBook: await readJsonFile<LoreBook>(zip, manifest.components.loreBook),
    canvas: await readJsonFile<MindMap>(zip, manifest.components.canvas),
    atlas: await readJsonFile<Atlas>(zip, manifest.components.atlas),
    dictionary: await readJsonFile<string[]>(zip, manifest.components.dictionary),
  }
  return {
    manifest,
    zip,
    data,
    available: {
      loreBook: Boolean(data.loreBook),
      canvas: Boolean(data.canvas),
      atlas: Boolean(data.atlas),
      dictionary: Boolean(data.dictionary),
    },
  }
}

async function writeAsset(projectPath: string, relativePath: string, bytes: Uint8Array) {
  const destination = await join(projectPath, relativePath)
  const directory = relativePath.split('/').slice(0, -1).join('/')
  if (directory) await mkdir(await join(projectPath, directory), { recursive: true })
  await writeFile(destination, bytes)
}

export async function writeWorldBundleAssets(projectPath: string, bundle: LoadedWorldBundle, selection: WorldBundleSelection) {
  const selectedPrefixes = [
    selection.loreBook ? 'lorebook/images/' : '',
    selection.atlas ? 'atlas/images/' : '',
  ].filter(Boolean)
  for (const assetPath of bundle.manifest.assets) {
    if (!selectedPrefixes.some(prefix => assetPath.startsWith(prefix))) continue
    const file = bundle.zip.file(`assets/${assetPath}`)
    if (!file) continue
    await writeAsset(projectPath, assetPath, await file.async('uint8array'))
  }
}
