const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

// Exercise the real compiler with a delayed filesystem, without a Tauri host.
const files = new Map()
let reads = 0, active = 0, peak = 0
const mocks = {
  '@tauri-apps/api/path': { join: async (...parts) => parts.join('/') },
  '@tauri-apps/plugin-fs': {
    stat: async name => {
      const file = files.get(name)
      if (!file) throw new Error('Missing scene')
      return { mtime: new Date(file.version), size: file.raw.length }
    },
    readTextFile: async name => {
      reads++; active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 2))
      active--
      return files.get(name).raw
    },
  },
}
const modules = new Map()
function load(filename) {
  if (modules.has(filename)) return modules.get(filename).exports
  const module = { exports: {} }
  modules.set(filename, module)
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  new Function('require', 'module', 'exports', code)(name => {
    if (mocks[name]) return mocks[name]
    return load(path.resolve(path.dirname(filename), `${name}.ts`))
  }, module, module.exports)
  return module.exports
}

async function main() {
  const { buildCompileChapters, collectCompileNodesFromSelection } = load(path.resolve('src/compile.ts'))
  const { invalidateCompileScene } = load(path.resolve('src/compileCache.ts'))
  const docs = Array.from({ length: 106 }, (_, i) => ({ type: 'doc', id: i + 10, file: `s${i}`, label: `Scene ${i}` }))
  for (const doc of docs) files.set(`project/scenes/${doc.file}.md`, {
    version: 1, raw: `<!--TAB:First Draft-->\n<p>old ${doc.file}</p>\n<!--TAB:Revision-->\n<p>new ${doc.file}</p>`,
  })
  const tree = [{ type: 'folder', id: 1, label: 'Manuscript', children: [
    { type: 'folder', id: 2, label: 'Act', role: 'act', children: [
      { type: 'folder', id: 3, label: 'Chapter', children: docs },
    ] },
  ] }]
  const chapters = await buildCompileChapters(tree, 'project')
  assert.equal(reads, 106)
  assert.ok(peak > 1 && peak <= 8)
  let nodes = await collectCompileNodesFromSelection(chapters, 'project')
  assert.equal(reads, 106, 'export reuses prepared scenes')
  assert.deepEqual(nodes.slice(0, 2).map(n => n.label), ['Act', 'Chapter'])
  assert.deepEqual(nodes.slice(2).map(n => n.html), docs.map(d => `<p>new ${d.file}</p>`))
  const edited = files.get('project/scenes/s46.md')
  edited.raw = '<!--TAB:Revision-->\n<p>edited scene</p>'
  edited.version++
  nodes = await collectCompileNodesFromSelection(chapters, 'project')
  assert.equal(reads, 107, 'only externally changed scene is reread')
  assert.equal(nodes[48].html, '<p>edited scene</p>')
  invalidateCompileScene('project', 's46')
  await collectCompileNodesFromSelection(chapters, 'project')
  assert.equal(reads, 108, 'app saves invalidate even when metadata is unchanged')
  chapters[1].scenes[0].selectedTab = 'First Draft'
  chapters[1].scenes[1].included = false
  nodes = await collectCompileNodesFromSelection(chapters, 'project', { includeActHeadings: false })
  assert.equal(nodes[0].label, 'Chapter')
  assert.equal(nodes[1].html, '<p>old s0</p>')
  assert.equal(nodes[2].label, 'Scene 2')
  files.delete('project/scenes/s0.md')
  await assert.rejects(collectCompileNodesFromSelection(chapters, 'project'), /Missing scene/)
  let copies = 0, copying = 0, peakCopies = 0, manifest = false
  Object.assign(mocks['@tauri-apps/plugin-fs'], {
    mkdir: async () => {},
    readDir: async name => name === 'project' ? [
      { name: 'scenes', isDirectory: true },
      { name: 'linked', isSymlink: true, isDirectory: true },
      { name: 'node_modules', isDirectory: true },
    ] : name === 'project/scenes' ? docs.map(d => ({ name: `${d.file}.md`, isFile: true })) : [],
    copyFile: async () => {
      copying++; peakCopies = Math.max(peakCopies, copying)
      await new Promise(resolve => setTimeout(resolve, 2))
      copying--; copies++
    },
    writeTextFile: async () => { assert.equal(copies, 106); assert.equal(copying, 0); manifest = true },
  })
  const { createProjectBackup } = load(path.resolve('src/backups.ts'))
  await createProjectBackup('project', 'Book', 'compile', 20, undefined, 'backups')
  assert.equal(manifest, true)
  assert.ok(peakCopies > 1 && peakCopies <= 8)
  console.log('Compile checks passed: 106 scenes, bounded concurrency, cache reuse/invalidation, order, revisions, inclusion, and missing-file errors.')
  console.log('Backup checks passed: bounded copying, skipped directories/symlinks, completion before manifest.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
