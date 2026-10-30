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
        import { parseSceneTabs } from './src/sceneTabs'
        import { getActiveComments, RevisionCommentsPane } from './src/components/RevisionView'
        import { OutlineView } from './src/components/OutlineView'

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
        console.log('Facelift checks passed: live counts and nested totals, cached scene switches, empty counts, Lore matching, draft parsing, comment scoping, Outline columns and pacing, comment rendering.')
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
