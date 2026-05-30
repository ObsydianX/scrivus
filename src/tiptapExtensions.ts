import { Extension, Mark, Node as TiptapNode } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Spellchecker } from './spellcheck'

export const FnrHighlight = Mark.create({
  name: 'fnrHighlight',
  parseHTML() {
    return [{ tag: 'mark[data-fnr]' }]
  },
  renderHTML() {
    return ['mark', { 'data-fnr': '', class: 'fnr-highlight' }, 0]
  },
})

export const UnderlineMark = Mark.create({
  name: 'underline',

  parseHTML() {
    return [
      { tag: 'u' },
      { style: 'text-decoration', consuming: false, getAttrs: value => `${value}`.includes('underline') && null },
    ]
  },

  renderHTML() {
    return ['u', 0]
  },
})

export const spellcheckPluginKey = new PluginKey('spellcheck')
export const loreLinkPluginKey = new PluginKey('loreLink')

export type LoreLinkMatch = {
  keyword: string
  entryId: string
  categoryId: string
}

export const SpellcheckExtension = Extension.create<{
  getSpellchecker: () => Spellchecker | null
}>({
  name: 'spellcheck',

  addOptions() {
    return {
      getSpellchecker: () => null,
    }
  },

  addProseMirrorPlugins() {
    const getSpellchecker = this.options.getSpellchecker

    const buildDecorations = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      const spellchecker = getSpellchecker()
      if (!spellchecker) return DecorationSet.empty

      const decorations: Decoration[] = []
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        spellchecker.findMisspellings(node.text, pos).forEach(match => {
          decorations.push(Decoration.inline(match.from, match.to, {
            class: 'spellcheck-misspelled',
            'data-spellcheck-word': match.word,
          }))
        })
      })
      return DecorationSet.create(doc, decorations)
    }

    return [
      new Plugin({
        key: spellcheckPluginKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply: (tr, oldDecorations, _oldState, newState) => {
            if (!tr.docChanged && !tr.getMeta(spellcheckPluginKey)) return oldDecorations
            return buildDecorations(newState.doc)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getLoreLinkVariants(match: LoreLinkMatch): LoreLinkMatch[] {
  const keyword = match.keyword.trim()
  const variants = new Set([keyword, `${keyword}'s`, `${keyword}\u2019s`, `${keyword}s`, `${keyword}s'`, `${keyword}s\u2019`])
  if (/y$/i.test(keyword) && keyword.length > 1) {
    variants.add(`${keyword.slice(0, -1)}ies`)
  }
  return Array.from(variants).map(variant => ({ ...match, keyword: variant }))
}

export const LoreLinkExtension = Extension.create<{
  getMatches: () => LoreLinkMatch[]
  enabled: () => boolean
}>({
  name: 'loreLink',

  addOptions() {
    return {
      getMatches: () => [],
      enabled: () => false,
    }
  },

  addProseMirrorPlugins() {
    const getMatches = this.options.getMatches
    const enabled = this.options.enabled

    const buildDecorations = (doc: Parameters<typeof DecorationSet.create>[0]) => {
      if (!enabled()) return DecorationSet.empty
      const matches = [...getMatches()]
        .filter(match => match.keyword.trim().length >= 2)
        .flatMap(getLoreLinkVariants)
        .sort((a, b) => b.keyword.length - a.keyword.length)
      if (matches.length === 0) return DecorationSet.empty

      const decorations: Decoration[] = []
      doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        const claimed: Array<[number, number]> = []
        for (const match of matches) {
          const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(match.keyword)})(?=$|[^\\p{L}\\p{N}_])`, 'giu')
          let result: RegExpExecArray | null
          while ((result = pattern.exec(node.text)) !== null) {
            const prefixLength = result[1]?.length ?? 0
            const start = result.index + prefixLength
            const end = start + result[2].length
            if (claimed.some(([from, to]) => start < to && end > from)) continue
            claimed.push([start, end])
            decorations.push(Decoration.inline(pos + start, pos + end, {
              class: 'lore-link-highlight',
              'data-lore-entry-id': match.entryId,
              'data-lore-category-id': match.categoryId,
              title: 'Ctrl-click to open lore entry',
            }))
          }
        }
      })
      return DecorationSet.create(doc, decorations)
    }

    return [
      new Plugin({
        key: loreLinkPluginKey,
        state: {
          init: (_, state) => buildDecorations(state.doc),
          apply: (tr, oldDecorations, _oldState, newState) => {
            if (!tr.docChanged && !tr.getMeta(loreLinkPluginKey)) return oldDecorations
            return buildDecorations(newState.doc)
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)
          },
        },
      }),
    ]
  },
})

export const CommentStart = TiptapNode.create({
  name: 'commentStart',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      'data-id': { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'x-comment-start' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['x-comment-start', HTMLAttributes]
  },
})

export const CommentEnd = TiptapNode.create({
  name: 'commentEnd',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      'data-id': { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'x-comment-end' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['x-comment-end', HTMLAttributes]
  },
})
