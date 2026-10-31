const assert = require('node:assert/strict')
const { build } = require('esbuild')

async function main() {
  // Bundle the actual storage readers and normalizers. Only the Tauri boundary
  // is mocked; no user project files are accessed or changed.
  const bundled = await build({
    stdin: {
      resolveDir: process.cwd(), contents: `
        export { readProjectSnapshot } from './src/projectLoad'
        export * as storage from './src/storage'
      `,
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['@tauri-apps/*'],
  })
  const files = new Map([
    ['book/scenes/scene.md', '<!--TAB:Draft-->\n<p>My manuscript</p>'],
    ['book/notes.json', JSON.stringify({ quickNote: 'Keep this', checklist: [{ id: 'a', text: 'Task', done: false }] })],
    ['book/lorebook.json', JSON.stringify({ categories: [{ id: 'people', name: 'People', entries: [] }] })],
    ['book/revision.json', JSON.stringify([{ id: 'comment', text: 'Keep comment', sceneId: 10 }])],
    ['book/canvas.json', JSON.stringify({ nodes: [], edges: [] })],
    ['book/atlas.json', JSON.stringify({ maps: [] })],
    ['book/dictionary.json', JSON.stringify({ words: ['Scrivus', 'MyCharacter'] })],
  ])
  let fault = null
  const original = new Map(files)
  const fsMock = {
    exists: async path => {
      if (fault?.path === path && fault.phase === 'exists') throw new Error('permission denied')
      return files.has(path)
    },
    readTextFile: async path => {
      await new Promise(resolve => setTimeout(resolve, path.endsWith('scene.md') ? 3 : 1))
      if (fault?.path === path && fault.phase === 'read') throw new Error('read denied')
      assert.ok(files.has(path))
      return files.get(path)
    },
  }
  const testModule = { exports: {} }
  new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(name => {
    if (name === '@tauri-apps/api/path') return { join: async (...parts) => parts.join('/') }
    if (name === '@tauri-apps/plugin-fs') return fsMock
    throw new Error(`Unexpected dependency: ${name}`)
  }, testModule, testModule.exports)
  const { storage, readProjectSnapshot } = testModule.exports
  const sequential = {
    rawScene: await storage.readSceneFile('book', 'scene'),
    notes: await storage.readNotesFile('book'),
    lore: await storage.readLoreBookFile('book'),
    comments: await storage.readRevisionFile('book'),
    canvas: await storage.readCanvasFile('book'),
    atlas: await storage.readAtlasFile('book'),
    dictionary: await storage.readProjectDictionary('book'),
  }
  assert.deepEqual(await readProjectSnapshot('book', 'scene'), sequential, 'concurrent loading preserves all reader results')
  for (const path of original.keys()) {
    for (const phase of ['exists', 'read']) {
      fault = { path, phase }
      await assert.rejects(readProjectSnapshot('book', 'scene'), /denied/)
    }
    fault = null
    if (path.endsWith('.json')) {
      files.set(path, '{broken JSON')
      await assert.rejects(readProjectSnapshot('book', 'scene'), SyntaxError)
      files.set(path, original.get(path))
    }
  }
  for (const path of original.keys()) {
    files.delete(path)
    if (path.endsWith('scene.md')) {
      await assert.rejects(readProjectSnapshot('book', 'scene'), /Scene file is missing/)
      assert.equal(await storage.readSceneFile('book', 'scene'), '', 'legacy callers retain their fallback')
    } else {
      await readProjectSnapshot('book', 'scene') // Optional files may be absent in older projects.
    }
    files.set(path, original.get(path))
  }
  assert.deepEqual(files, original, 'opening never writes project files')
  console.log('Project safety checks passed: real reader parity, permission/read errors for all seven files, malformed JSON, missing optional files, missing scene, and no writes.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
