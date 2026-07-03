import { parseHtmlFragment } from './html'
import type { SceneTab } from './types'

const TAB_DELIMITER = (name: string) => `<!--TAB:${name}-->`
const DELETED_DELIMITER = (name: string, ts: number) => `<!--DELETED:${name}:${ts}-->`

function formatSceneHtmlForStorage(html: string): string {
  const root = parseHtmlFragment(html)

  root.querySelectorAll('p').forEach(paragraph => {
    const isEmpty = !paragraph.textContent?.trim() && paragraph.children.length === 0
    if (!isEmpty) return
    const previous = paragraph.previousElementSibling
    const next = paragraph.nextElementSibling
    const adjacentStructural = [previous, next].some(element =>
      element instanceof HTMLElement &&
      ['UL', 'OL', 'HR', 'BLOCKQUOTE', 'H1', 'H2'].includes(element.tagName) ||
      (element instanceof HTMLElement && element.hasAttribute('data-page-break'))
    )
    if (adjacentStructural) paragraph.remove()
  })

  return Array.from(root.childNodes)
    .map(node => node instanceof HTMLElement ? node.outerHTML : node.textContent ?? '')
    .map(part => part.trim())
    .filter(Boolean)
    .join('\n\n')
}

export function parseSceneTabs(raw: string): SceneTab[] {
  if (!raw.trim()) return [{ name: 'First Draft', content: '' }]
  const lines = raw.split('\n')
  const tabs: SceneTab[] = []
  let currentName: string | null = null
  let currentLines: string[] = []
  let inDeleted = false

  for (const line of lines) {
    const tabMatch = line.match(/^<!--TAB:(.*?)-->$/)
    const deletedMatch = line.match(/^<!--DELETED:(.*?):(\d+)-->$/)
    if (tabMatch) {
      if (currentName !== null && !inDeleted) {
        tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
      }
      currentName = tabMatch[1]
      currentLines = []
      inDeleted = false
    } else if (deletedMatch) {
      if (currentName !== null && !inDeleted) {
        tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
      }
      currentName = deletedMatch[1]
      currentLines = []
      inDeleted = true
    } else {
      currentLines.push(line)
    }
  }

  if (currentName !== null && !inDeleted) {
    tabs.push({ name: currentName, content: currentLines.join('\n').trim() })
  }

  if (tabs.length === 0 && raw.trim()) {
    return [{ name: 'First Draft', content: raw.trim() }]
  }

  return tabs.length > 0 ? tabs : [{ name: 'First Draft', content: '' }]
}

export function extractDeletedBlocks(raw: string): string {
  const lines = raw.split('\n')
  const blocks: string[] = []
  let inDeleted = false
  let currentLines: string[] = []
  let currentHeader = ''

  for (const line of lines) {
    const deletedMatch = line.match(/^<!--DELETED:(.*?):(\d+)-->$/)
    const tabMatch = line.match(/^<!--TAB:(.*?)-->$/)
    if (deletedMatch) {
      if (inDeleted && currentHeader) {
        blocks.push(currentHeader + '\n' + currentLines.join('\n'))
      }
      currentHeader = line
      currentLines = []
      inDeleted = true
    } else if (tabMatch) {
      if (inDeleted && currentHeader) {
        blocks.push(currentHeader + '\n' + currentLines.join('\n'))
      }
      inDeleted = false
      currentHeader = ''
      currentLines = []
    } else if (inDeleted) {
      currentLines.push(line)
    }
  }
  if (inDeleted && currentHeader) {
    blocks.push(currentHeader + '\n' + currentLines.join('\n'))
  }
  return blocks.length > 0 ? '\n' + blocks.join('\n') : ''
}

export function serializeSceneTabs(tabs: SceneTab[], raw: string): string {
  const activePart = tabs
    .map(t => `${TAB_DELIMITER(t.name)}\n${formatSceneHtmlForStorage(t.content)}`)
    .join('\n')
  const deletedPart = extractDeletedBlocks(raw)
  return activePart + deletedPart
}

export function softDeleteTab(tabs: SceneTab[], tabIndex: number, raw: string): string {
  const tab = tabs[tabIndex]
  const remaining = tabs.filter((_, i) => i !== tabIndex)
  const activePart = remaining
    .map(t => `${TAB_DELIMITER(t.name)}\n${formatSceneHtmlForStorage(t.content)}`)
    .join('\n')
  const existingDeleted = extractDeletedBlocks(raw)
  const newDeleted = `\n${DELETED_DELIMITER(tab.name, Date.now())}\n${formatSceneHtmlForStorage(tab.content)}`
  return activePart + existingDeleted + newDeleted
}
