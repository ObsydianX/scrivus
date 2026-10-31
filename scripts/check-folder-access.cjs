const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const tested = { exports: {} }
const code = ts.transpileModule(fs.readFileSync('src/folderAccess.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
new Function('module', 'exports', code)(tested, tested.exports)
const { backupAccessTarget, folderContains } = tested.exports
const project = 'E:\\Books\\TCBU.scrivus'
const backup = 'D:\\Dropbox\\Writing\\Scrivus Backups'
const denied = path => `forbidden path: ${path}, maybe it is not allowed on the scope for 'allow-mkdir' permission in your capability file`
assert.deepEqual(backupAccessTarget(denied(backup), project, backup), { kind: 'backup', path: backup })
assert.equal(backupAccessTarget(denied(`${backup}\\snapshot\\scenes`), project, backup).kind, 'backup')
assert.equal(backupAccessTarget(denied('d:/DROPBOX/writing/Scrivus Backups'), project, backup).kind, 'backup')
assert.equal(backupAccessTarget(denied(`${backup} Extra`), project, backup).kind, 'project')
assert.deepEqual(backupAccessTarget(denied(`${project}\\scenes`), project, backup), { kind: 'project', path: project })
assert.equal(backupAccessTarget(new Error('Disk full'), project, backup), null)
assert.ok(folderContains('D:\\Dropbox\\Writing', backup))
assert.ok(folderContains('D:\\', backup))
assert.equal(folderContains('E:\\', backup), false)
assert.equal(folderContains(`${backup} Extra`, backup), false)
console.log('Folder access checks passed: denied backup/source distinction, nested paths, case and slash handling, drive roots, and unrelated errors.')
