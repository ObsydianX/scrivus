import {
  readAtlasFile, readCanvasFile, readLoreBookFile, readNotesFile,
  readProjectDictionary, readRevisionFile, readSceneFile,
} from './storage'

// Start the scene first; read independent companion files concurrently. Callers
// publish the snapshot together, so autosave never sees half-loaded defaults.
export async function readProjectSnapshot(path: string, sceneFile?: string) {
  const options = { strict: true }
  const [rawScene, notes, lore, comments, canvas, atlas, dictionary] = await Promise.all([
    sceneFile ? readSceneFile(path, sceneFile, options) : Promise.resolve(''),
    readNotesFile(path, options),
    readLoreBookFile(path, options),
    readRevisionFile(path, options),
    readCanvasFile(path, options),
    readAtlasFile(path, options),
    readProjectDictionary(path, options),
  ])
  return { rawScene, notes, lore, comments, canvas, atlas, dictionary }
}
