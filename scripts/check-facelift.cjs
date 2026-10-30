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
        import { getBinderWordCounts, normalizeBinderWordCountDisplay, showBinderWordCount } from './src/binderWordCounts'
        import { countLoreMentions } from './src/loreBacklinks'
        import { getLoreEntryIconPath } from './src/loreImages'
        import { orderLoreSubcategories } from './src/loreSubcategories'
        import { parseSceneTabs } from './src/sceneTabs'
        import { getActiveComments, RevisionCommentsPane } from './src/components/RevisionView'
        import { OutlineView } from './src/components/OutlineView'
        import { LoreBookView } from './src/components/LoreBookView'
        import { MindMapView } from './src/components/MindMapView'
        import { CanvasMinimap, getCanvasBounds, fitCanvasBounds } from './src/components/CanvasMinimap'
        import { AtlasView, fitAtlasMap } from './src/components/AtlasView'
        import atlasFixture from './src/defaultProject/atlas.json'
        import { normalizeMindMap } from './src/constants'

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
        assert.equal(normalizeBinderWordCountDisplay(undefined), 'all')
        assert.equal(normalizeBinderWordCountDisplay('invalid'), 'all')
        for (const [mode, expected] of Object.entries({ off: [false, false, false, false], acts: [true, false, false, false], chapters: [true, true, false, false], selectedScene: [true, true, true, false], all: [true, true, true, true] })) {
          assert.equal(normalizeBinderWordCountDisplay(mode), mode)
          assert.deepEqual([showBinderWordCount(mode, 'act', false), showBinderWordCount(mode, 'chapter', false), showBinderWordCount(mode, 'scene', true), showBinderWordCount(mode, 'scene', false)], expected)
        }
        const subcategories = [
          { id: 'normal', name: 'Normal Creature' },
          { id: 'mini', name: 'Mini-boss Creature' },
          { id: 'boss', name: 'Boss Creature' },
          { id: 'zchild', name: 'Z child', parentId: 'normal' },
          { id: 'achild', name: 'A child', parentId: 'normal' },
        ]
        assert.deepEqual(orderLoreSubcategories(subcategories).map(s => [s.id, s.depth]), [['normal', 0], ['zchild', 1], ['achild', 1], ['mini', 0], ['boss', 0]])
        assert.deepEqual(orderLoreSubcategories([subcategories[2], subcategories[1], subcategories[0]]).map(s => s.id), ['boss', 'mini', 'normal'])
        assert.deepEqual(subcategories.map(s => s.id), ['normal', 'mini', 'boss', 'zchild', 'achild'])
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
        const canvasNode = { id: 'idea', x: 0, y: 0, title: '', text: 'An arrival changes everything.', kind: 'idea', color: 'violet' }
        const canvasProps = { map: { nodes: [canvasNode], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, scenes: [], onChange: noop, onOpenScene: noop, onCreateSceneFromNode: async () => null }
        let canvasHtml = renderToStaticMarkup(<MindMapView {...canvasProps} />)
        assert.ok(canvasHtml.includes('mindmap-node-text-primary'))
        assert.ok(canvasHtml.includes('An arrival changes everything.'))
        assert.ok(canvasHtml.includes('Canvas minimap'))
        assert.ok(canvasHtml.includes('canvas-minimap-viewport'))
        assert.ok(canvasHtml.includes('Fit all nodes'))
        assert.ok(!canvasHtml.includes('class="mindmap-node-title"'))
        canvasHtml = renderToStaticMarkup(<MindMapView {...canvasProps} map={{ ...canvasProps.map, nodes: [{ ...canvasNode, title: 'A long title that wraps over several lines', linkedSceneId: 3, kind: 'scene' }] }} scenes={[{ id: 3, title: 'Scene 3', chapter: 'Chapter 1' }]} />)
        assert.ok(canvasHtml.includes('class="mindmap-node-title"'))
        assert.ok(!canvasHtml.includes('Scene / Scene 3'))
        assert.ok(canvasHtml.includes('Chapter 1 / Scene 3'))
        canvasHtml = renderToStaticMarkup(<MindMapView {...canvasProps} map={{ ...canvasProps.map, nodes: [{ ...canvasNode, text: '' }] }} />)
        assert.ok(canvasHtml.includes('Add title…'))
        const bounds = getCanvasBounds([{ id: 'left', x: -500, y: -200, width: 192, height: 128 }, { id: 'right', x: 900, y: 400, width: 192, height: 256 }])
        assert.deepEqual(bounds, { x: -500, y: -200, width: 1592, height: 856 })
        const fit = fitCanvasBounds(bounds, 1200, 800)
        assert.equal(fit.x, 296)
        assert.equal(fit.y, 228)
        assert.ok(bounds.width * fit.zoom <= 1200 - 128)
        assert.ok(bounds.height * fit.zoom <= 800 - 128)
        assert.ok(Number.isFinite(fitCanvasBounds(getCanvasBounds([]), 1, 1).zoom))
        assert.ok(fitCanvasBounds({ x: 0, y: 0, width: 10, height: 10 }, 1200, 800).zoom <= 3)
        for (const zoom of [.05, .15, .35, 1, 2.5, 3]) {
          assert.equal(normalizeMindMap({ viewport: { x: 100, y: -200, zoom } }).viewport.zoom, zoom)
        }
        assert.equal(normalizeMindMap({ viewport: { x: 0, y: 0, zoom: .001 } }).viewport.zoom, .05)
        const mapFit = fitAtlasMap(4096, 2048, 1200, 800)
        assert.equal(mapFit.x, 2048)
        assert.equal(mapFit.y, 1024)
        assert.ok(4096 * mapFit.zoom <= 1136)
        assert.ok(2048 * mapFit.zoom <= 736)
        assert.ok(Number.isFinite(fitAtlasMap(0, 0, 1, 1).zoom))
        const overview = renderToStaticMarkup(<CanvasMinimap label='Atlas minimap' storageKey='scrivus-atlas-minimap-collapsed' nodes={[]} edges={[]} selectedId={null} viewport={{x: 2048,y: 1024,zoom: .4}} view={{x: 0,y: 0,width: 4096,height: 2048}} mapImage={{src: 'map.png',width: 4096,height: 2048}} onNavigate={noop} />)
        assert.ok(overview.includes('Atlas minimap'))
        assert.ok(overview.includes('href="map.png"'))
        assert.ok(overview.includes('canvas-minimap-viewport'))
        const atlasHtml = renderToStaticMarkup(<AtlasView atlas={atlasFixture} projectPath={null} loreBook={{categories:[]}} onChange={noop} />)
        assert.ok(atlasHtml.includes('Fit map'))
        assert.ok(!atlasHtml.includes('atlas-scale-readout'))
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
        const lockedComments = renderToStaticMarkup(<RevisionCommentsPane panelLockActive activeId={3} comments={comments} activeTabIndex={0} tabs={tabs} activeCommentId={null} pendingComment={null} content='' draftText='' />)
        assert(lockedComments.includes('class="collapsed"'))
        assert(lockedComments.includes('disabled=""'))
        assert(!lockedComments.includes('revision-comment-filters'))
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
