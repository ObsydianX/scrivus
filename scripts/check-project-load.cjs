const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const readers = [
  'readSceneFile', 'readNotesFile', 'readLoreBookFile', 'readRevisionFile',
  'readCanvasFile', 'readAtlasFile', 'readProjectDictionary',
]
const pending = new Map()
const started = []
const storage = Object.fromEntries(readers.map(name => [name, (...args) => {
  started.push({ name, args })
  return new Promise((resolve, reject) => pending.set(name, { resolve, reject }))
}]))
const moduleUnderTest = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/projectLoad.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
new Function('require', 'module', 'exports', code)(name => {
  assert.equal(name, './storage')
  return storage
}, moduleUnderTest, moduleUnderTest.exports)
const { readProjectSnapshot } = moduleUnderTest.exports

async function main() {
  let published = false
  const loading = readProjectSnapshot('book', 'last-scene').then(snapshot => {
    published = true
    return snapshot
  })
  assert.deepEqual(started.map(item => item.name), readers, 'scene starts first, all reads start without waiting')
  assert.deepEqual(started[0].args, ['book', 'last-scene', { strict: true }])
  assert.ok(started.every(item => item.args.at(-1).strict), 'all opening reads propagate errors')
  // Complete out of order. No snapshot is exposed until every reader finishes.
  for (const name of readers.slice(1).reverse()) pending.get(name).resolve(name)
  await Promise.resolve()
  assert.equal(published, false)
  pending.get('readSceneFile').resolve('scene contents')
  assert.deepEqual(await loading, {
    rawScene: 'scene contents', notes: 'readNotesFile', lore: 'readLoreBookFile',
    comments: 'readRevisionFile', canvas: 'readCanvasFile', atlas: 'readAtlasFile', dictionary: 'readProjectDictionary',
  })
  started.length = 0
  const withoutScene = readProjectSnapshot('empty-book')
  assert.equal(started.some(item => item.name === 'readSceneFile'), false)
  for (const name of readers.slice(1)) pending.get(name).resolve(null)
  assert.equal((await withoutScene).rawScene, '')
  const failed = readProjectSnapshot('broken-book', 'scene')
  const rejection = assert.rejects(failed, /read failure/)
  pending.get('readSceneFile').reject(new Error('read failure'))
  for (const name of readers.slice(1)) pending.get(name).resolve(null)
  await rejection
  console.log('Project load checks passed: scene-first concurrent reads, atomic snapshot, no active scene, and read failure propagation.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
