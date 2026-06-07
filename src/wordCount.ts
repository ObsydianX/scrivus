import type { SceneTab } from './types'

export function htmlToPlainText(html: string) {
  const div = document.createElement('div')
  div.innerHTML = html
  return (div.textContent ?? '').replace(/\u00a0/g, ' ')
}

export function countTextWords(text: string) {
  const normalized = text.trim()
  return normalized ? normalized.split(/\s+/).length : 0
}

export function countHtmlWords(html: string) {
  return countTextWords(htmlToPlainText(html))
}

export function countLatestRevisionWords(tabs: SceneTab[]) {
  const latestTab = tabs[tabs.length - 1] ?? tabs[0]
  return countHtmlWords(latestTab?.content ?? '')
}
