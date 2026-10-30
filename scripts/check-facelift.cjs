// Bundle TypeScript in memory; no generated test files or browser runtime needed.
const { build } = require('esbuild')

async function main() {
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: String.raw`
        import assert from 'node:assert/strict'
        import React from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { getBinderWordCounts } from './src/binderWordCounts'
        import { countLoreMentions } from './src/loreBacklinks'
        import { getLoreEntryIconPath } from './src/loreImages'
        import { parseSceneTabs } from './src/sceneTabs'
        import { getActiveComments, RevisionCommentsPane } from './src/components/RevisionView'
        import { OutlineView } from './src/components/OutlineView'
        import { LoreBookView } from './src/components/LoreBookView'

        const rows = [
          { id: 1, type: 'chapter', role: 'act', title: 'Act 1', depth: 0, wordCount: 1000, status: 'inProgress' },
          { id: 2, type: 'chapter', title: 'Chapter 1', depth: 1, wordCount: 1000, status: 'inProgress' },
          { id: 3, type: 'scene', title: 'Arrival', chapter: 'Chapter 1', depth: 2, wordCount: 750, status: 'draft', metadata: { synopsis: 'A difficult arrival', pov: 'Adam', tags: [] } },
          { id: 4, type: 'scene', title: 'Departure', chapter: 'Chapter 1', depth: 2, wordCount: 250, status: 'complete' },
          { id: 5, type: 'chapter', title: 'Chapter 2', depth: 1, wordCount: 100, status: 'complete' },
          { id: 6, type: 'scene', title: 'Return', chapter: 'Chapter 2', depth: 2, wordCount: 100, status: 'complete' },
        ]
        assert.deepEqual(getBinderWordCounts(rows, 3, 900), { 1: 1250, 2: 1150, 3: 900, 4: 250, 5: 100, 6: 100 })
        const saved = new Map([[3, 900]])
        assert.equal(getBinderWordCounts(rows, 4, 300, saved)[2], 1200)
        assert.equal(getBinderWordCounts(rows, null, 9999, saved)[1], 1250)
        assert.deepEqual(getBinderWordCounts([], null, 0), {})
        assert.equal(getBinderWordCounts(rows, 3, 0)[2], 250)

        assert.equal(countLoreMentions("Adam met Adam's ally. Madam left.", 'Adam'), 2)
        assert.equal(countLoreMentions('Goreclaw saw a kobold lord.', 'Goreclaw', ['kobold lord']), 2)
        assert.equal(countLoreMentions('Adam', 'Adam'), 1)
        assert.equal(countLoreMentions('Amin', 'Adam'), 0) // equal-length edit
        assert.equal(countLoreMentions('ab ab', 'ab'), 0)

        const category = { template: [{ id: 'portrait', type: 'image' }, { id: 'other', type: 'image' }, { id: 'text', type: 'text' }] }
        const entry = { fields: { portrait: { path: 'portrait.png', croppedPath: 'portrait-crop.png', ignoreEntryCrop: true }, other: { path: 'other.png', croppedPath: 'other-crop.png' }, text: 'not-an-image' } }
        assert.equal(getLoreEntryIconPath(category, entry), '')
        assert.equal(getLoreEntryIconPath(category, { ...entry, entryIconFieldId: 'portrait' }), 'portrait-crop.png')
        assert.equal(getLoreEntryIconPath(category, { ...entry, entryIconFieldId: 'other' }), 'other-crop.png')
        assert.equal(getLoreEntryIconPath(category, { ...entry, entryIconFieldId: 'missing' }), '')
        assert.equal(getLoreEntryIconPath(category, { ...entry, entryIconFieldId: 'text' }), '')
        assert.equal(getLoreEntryIconPath({ template: [{ id: 'portrait', type: 'image', removed: true }] }, { ...entry, entryIconFieldId: 'portrait' }), '')
        assert.equal(getLoreEntryIconPath(category, { fields: {}, entryIconFieldId: 'portrait' }), '')

        const tabs = parseSceneTabs('<!--TAB:First Draft-->\n<p>Original</p>\n<!--TAB:Revision-->\n<p>Rewritten</p>\n<!--DELETED:Removed:123-->\n<p>Old</p>')
        assert.equal(tabs.length, 2)
        assert.equal(tabs[0].content, '<p>Original</p>')
        assert.equal(tabs[1].name, 'Revision')
        assert.equal(tabs[1].content, '<p>Rewritten</p>')
        const comment = { id: 'one', sceneId: 3, tabIndex: 0, quote: 'Original', text: 'Check this', createdAt: 0, resolved: false }
        const comments = [comment, { ...comment, id: 'two', tabIndex: 1 }, { ...comment, id: 'other', sceneId: 4 }]
        assert.deepEqual(getActiveComments(comments, 3, 0, tabs).map(c => c.id), ['one'])
        assert.deepEqual(getActiveComments(comments, 3, 1, tabs).map(c => c.id), ['two'])

        const noop = () => {}
        const loreEntry = { id: 'adam', name: 'Adam', fields: { bio: 'Freeform biography' } }
        const loreCategory = { id: 'characters', name: 'Characters', template: [{ id: 'bio', type: 'textarea', label: 'Biography', removed: false }], entries: [loreEntry] }
        const loreProps = { loreBook: { categories: [loreCategory] }, loreView: 'entry', activeCategoryId: 'characters', expandedEntryId: 'adam', projectPath: null, variables: {}, onLoreViewChange: noop, onActiveCategoryChange: noop, onExpandedEntryChange: noop, backlinks: { adam: [{ sceneId: 1, sceneTitle: 'Arrival', tabName: 'First Draft', excerpt: 'Adam arrives.', matchCount: 5 }, { sceneId: 2, sceneTitle: 'Departure', tabName: 'First Draft', excerpt: 'Adam leaves.', matchCount: 3 }] } }
        let loreHtml = renderToStaticMarkup(<LoreBookView {...loreProps} />)
        assert.ok(loreHtml.includes('lore-entry-fields'))
        assert.ok(loreHtml.includes('Freeform biography'))
        assert.ok(loreHtml.includes('lore-entry-mentions'))
        assert.ok(loreHtml.includes('<strong>8</strong>'))
        assert.ok(loreHtml.includes('2 scene mentions'))
        assert.ok(loreHtml.includes('Adam arrives.'))
        assert.ok(!loreHtml.includes('id="lorebook-category-header"'))
        assert.ok(!loreHtml.includes('Category overview and hierarchy'))
        assert.ok(loreHtml.includes('aria-label="Edit category"'))
        assert.ok(loreHtml.includes('aria-label="Show hierarchy"'))
        assert.ok(loreHtml.includes('aria-label="Entry actions"'))
        assert.ok(loreHtml.includes('aria-label="Previous entry"'))
        assert.ok(loreHtml.includes('aria-label="Delete entry"'))
        assert.ok(loreHtml.includes('aria-label="Export entry"'))
        loreHtml = renderToStaticMarkup(<LoreBookView {...loreProps} backlinks={{}} />)
        assert.ok(loreHtml.includes('<strong>0</strong>'))
        assert.ok(loreHtml.includes('No scene mentions found.'))
        loreHtml = renderToStaticMarkup(<LoreBookView {...loreProps} loreBook={{ categories: [{ ...loreCategory, entries: [] }] }} />)
        assert.ok(loreHtml.includes('Add an entry to begin building this category.'))
        assert.ok(!loreHtml.includes('id="lorebook-category-header"'))
        const props = { rows, manuscriptWordCount: 1100, readingWpm: 250, collapsedFolderIds: new Set([2]), onCollapsedFolderIdsChange: noop, onOpenScene: noop, onOpenCommentsScene: noop, onSceneStatusChange: noop }
        let html = renderToStaticMarkup(<OutlineView {...props} />)
        assert.ok(!html.includes('A difficult arrival'))
        assert.ok(html.includes('pacing-strip-track'))
        assert.ok(html.includes('1 Draft, 0 Revised, 0 Needs work, 1 Complete'))
        html = renderToStaticMarkup(<OutlineView {...props} collapsedFolderIds={new Set()} />)
        assert.ok(html.includes('A difficult arrival'))
        assert.ok(html.includes('<th>POV</th>'))
        assert.ok(!html.includes('<th>Location</th>'))
        html = renderToStaticMarkup(<RevisionCommentsPane activeId={3} comments={comments} activeTabIndex={0} tabs={tabs} activeCommentId={null} pendingComment={null} content='' draftText='' />)
        assert.ok(html.includes('Filter comments'))
        assert.ok(html.includes('Check this'))
        assert.ok(html.includes('tabindex="0"'))
        console.log('Facelift checks passed: live counts, nested totals, Lore matching and icon crops/fallbacks, draft parsing, comment scoping, Outline columns and pacing, comment rendering.')
      `,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    write: false,
  })
  const target = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, target, target.exports)
}
main().catch(error => { console.error(error); process.exitCode = 1 })
