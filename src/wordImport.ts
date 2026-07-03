import { readFile } from '@tauri-apps/plugin-fs'
import JSZip from 'jszip'
import { DEFAULT_SCENE_METADATA } from './constants'
import { serializeSceneTabs } from './sceneTabs'
import type { DocNode, FolderNode, TreeNode } from './types'

export type ImportedSceneFile = {
  fileId: string
  content: string
}

export type ImportedManuscriptProject = {
  tree: TreeNode[]
  sceneFiles: ImportedSceneFile[]
  firstSceneId: number
}

type ParsedParagraph = {
  html: string
  text: string
  listType: 'ul' | 'ol' | null
  listLevel: number
}

type ParagraphListInfo = {
  type: 'ul' | 'ol'
  level: number
}

type NumberingInfo = {
  numToAbstract: Map<string, string>
  abstractFormats: Map<string, 'ul' | 'ol'>
}

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function descendantsByName(element: Element | Document, localName: string): Element[] {
  return Array.from(element.getElementsByTagName('*')).filter(child => child.localName === localName)
}

function childByName(element: Element, localName: string): Element | null {
  return Array.from(element.children).find(child => child.localName === localName) ?? null
}

function attrValue(element: Element, name: string): string | null {
  return element.getAttributeNS(WORD_NS, name) ?? element.getAttribute(`w:${name}`) ?? element.getAttribute(name)
}

function hasRunProperty(runProperties: Element | null, property: string) {
  const element = runProperties ? childByName(runProperties, property) : null
  if (!element) return false
  const value = attrValue(element, 'val')
  return value !== 'false' && value !== '0' && value !== 'none'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrapInline(text: string, runProperties: Element | null) {
  const escaped = escapeHtml(text)
  const bold = hasRunProperty(runProperties, 'b')
  const italic = hasRunProperty(runProperties, 'i')
  const underline = hasRunProperty(runProperties, 'u')
  let html = escaped
  if (underline) html = `<u>${html}</u>`
  if (italic) html = `<em>${html}</em>`
  if (bold) html = `<strong>${html}</strong>`
  return html
}

function parseNumberingXml(xml: string | null): NumberingInfo {
  const info: NumberingInfo = {
    numToAbstract: new Map(),
    abstractFormats: new Map(),
  }
  if (!xml) return info

  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  for (const abstractNum of descendantsByName(doc, 'abstractNum')) {
    const abstractId = attrValue(abstractNum, 'abstractNumId')
    if (!abstractId) continue
    for (const level of descendantsByName(abstractNum, 'lvl')) {
      const ilvl = attrValue(level, 'ilvl') ?? '0'
      const numFmt = childByName(level, 'numFmt')
      const format = numFmt ? attrValue(numFmt, 'val') : null
      info.abstractFormats.set(`${abstractId}:${ilvl}`, format === 'bullet' ? 'ul' : 'ol')
    }
  }

  for (const num of descendantsByName(doc, 'num')) {
    const numId = attrValue(num, 'numId')
    const abstractNumId = childByName(num, 'abstractNumId')
    const abstractId = abstractNumId ? attrValue(abstractNumId, 'val') : null
    if (numId && abstractId) info.numToAbstract.set(numId, abstractId)
  }

  return info
}

function getParagraphListInfo(paragraph: Element, numbering: NumberingInfo): ParagraphListInfo | null {
  const numPr = descendantsByName(paragraph, 'numPr')[0]
  if (!numPr) return null
  const numIdElement = childByName(numPr, 'numId')
  const ilvlElement = childByName(numPr, 'ilvl')
  const numId = numIdElement ? attrValue(numIdElement, 'val') : null
  if (!numId) return null
  const abstractId = numbering.numToAbstract.get(numId)
  const ilvl = ilvlElement ? attrValue(ilvlElement, 'val') ?? '0' : '0'
  const level = Math.max(Number.parseInt(ilvl, 10) || 0, 0)
  if (!abstractId) return { type: 'ul', level }
  return {
    type: numbering.abstractFormats.get(`${abstractId}:${ilvl}`) ?? numbering.abstractFormats.get(`${abstractId}:0`) ?? 'ul',
    level,
  }
}

function parseParagraph(paragraph: Element, numbering: NumberingInfo): ParsedParagraph {
  let html = ''
  let text = ''

  for (const run of descendantsByName(paragraph, 'r')) {
    const runProperties = childByName(run, 'rPr')
    for (const child of Array.from(run.children)) {
      if (child.localName === 't') {
        const value = child.textContent ?? ''
        html += wrapInline(value, runProperties)
        text += value
      } else if (child.localName === 'tab') {
        html += ' '
        text += ' '
      } else if (child.localName === 'br') {
        html += '<br>'
        text += '\n'
      }
    }
  }

  const listInfo = getParagraphListInfo(paragraph, numbering)
  return {
    html: html.trim() ? html : '',
    text: text.trim(),
    listType: listInfo?.type ?? null,
    listLevel: listInfo?.level ?? 0,
  }
}

// Words that may follow a heading keyword ("Chapter One", "Act II") without
// making the paragraph read as prose ("Chapter after chapter, she rewrote it.").
const HEADING_NUMBER_WORD = /^(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:-\w+)?|thirty(?:-\w+)?|forty(?:-\w+)?|fifty(?:-\w+)?|sixty(?:-\w+)?|seventy(?:-\w+)?|eighty(?:-\w+)?|ninety(?:-\w+)?|hundred)$/i

function headingKind(text: string): 'act' | 'chapter' | 'scene' | null {
  // Headings are short: a keyword alone, keyword + separator + title,
  // or keyword + number ("Chapter 3", "Act II", "Scene Twelve: The Fall").
  if (text.length > 80) return null
  const match = text.match(/^(act|chapter|scene)\b\s*(.*)$/i)
  if (!match) return null
  const kind = match[1].toLowerCase() as 'act' | 'chapter' | 'scene'
  const rest = match[2].trim()
  if (!rest) return kind
  if (/^[:.\-–—]/.test(rest)) return kind
  const nextWord = rest.split(/\s+/)[0].replace(/[:.\-–—,]+$/, '')
  return HEADING_NUMBER_WORD.test(nextWord) ? kind : null
}

export async function parseWordDocxProject(
  docxPath: string,
  allocateId: () => number,
  createFileId: () => string,
): Promise<ImportedManuscriptProject> {
  const bytes = await readFile(docxPath)
  const zip = await JSZip.loadAsync(bytes)
  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) throw new Error('The selected Word document is missing document.xml.')
  const numberingXml = await zip.file('word/numbering.xml')?.async('string') ?? null
  const numbering = parseNumberingXml(numberingXml)
  const doc = new DOMParser().parseFromString(documentXml, 'application/xml')

  const manuscript: FolderNode = { id: 1, type: 'folder', label: 'Manuscript', open: true, children: [] }
  const notes: FolderNode = { id: 2, type: 'folder', label: 'Notes', open: false, children: [] }
  const sceneFiles: ImportedSceneFile[] = []

  let currentAct: FolderNode | null = null
  let currentChapter: FolderNode | null = null
  let currentScene: { id: number; label: string; fileId: string; parts: string[] } | null = null
  let firstSceneId = 0
  let chapterCounter = 1
  let sceneCounter = 1
  let listStack: { type: 'ul' | 'ol'; level: number; openItem: boolean }[] = []

  const parentForChapter = () => currentAct?.children ?? manuscript.children

  const flushList = () => {
    if (!currentScene) return
    while (listStack.length > 0) {
      const top = listStack.pop()
      if (!top) break
      if (top.openItem) currentScene.parts.push('</li>')
      currentScene.parts.push(`</${top.type}>`)
    }
  }

  const closeListLevelsAbove = (level: number) => {
    if (!currentScene) return
    while (listStack.length > 0 && listStack[listStack.length - 1].level > level) {
      const top = listStack.pop()
      if (!top) break
      if (top.openItem) currentScene.parts.push('</li>')
      currentScene.parts.push(`</${top.type}>`)
    }
  }

  const addListItem = (paragraph: ParsedParagraph) => {
    if (!currentScene || !paragraph.listType) return
    closeListLevelsAbove(paragraph.listLevel)

    let top = listStack[listStack.length - 1]
    if (!top || top.level < paragraph.listLevel || top.type !== paragraph.listType) {
      if (top && top.level === paragraph.listLevel && top.type !== paragraph.listType) {
        if (top.openItem) currentScene.parts.push('</li>')
        currentScene.parts.push(`</${top.type}>`)
        listStack.pop()
      }
      currentScene.parts.push(`<${paragraph.listType}>`)
      top = { type: paragraph.listType, level: paragraph.listLevel, openItem: false }
      listStack.push(top)
    } else if (top.openItem) {
      currentScene.parts.push('</li>')
      top.openItem = false
    }

    currentScene.parts.push(`<li>${paragraph.html}`)
    top.openItem = true
  }

  const finalizeScene = () => {
    if (!currentScene || !currentChapter) return
    flushList()
    const content = currentScene.parts.join('\n').trim() || '<p></p>'
    const node: DocNode = {
      id: currentScene.id,
      type: 'doc',
      label: currentScene.label,
      title: currentScene.label,
      file: currentScene.fileId,
      metadata: { ...DEFAULT_SCENE_METADATA },
    }
    currentChapter.children.push(node)
    sceneFiles.push({
      fileId: currentScene.fileId,
      content: serializeSceneTabs([{ name: 'First Draft', content }], ''),
    })
    if (!firstSceneId) firstSceneId = currentScene.id
    currentScene = null
    listStack = []
  }

  const startAct = (label: string) => {
    finalizeScene()
    currentAct = { id: allocateId(), type: 'folder', label, open: true, role: 'act', children: [] }
    manuscript.children.push(currentAct)
    currentChapter = null
  }

  const startChapter = (label: string) => {
    finalizeScene()
    currentChapter = { id: allocateId(), type: 'folder', label, open: true, role: 'chapter', children: [] }
    parentForChapter().push(currentChapter)
  }

  const ensureChapter = () => {
    if (!currentChapter) startChapter(`Chapter ${chapterCounter++}`)
  }

  const startScene = (label: string) => {
    finalizeScene()
    ensureChapter()
    currentScene = { id: allocateId(), label, fileId: createFileId(), parts: [] }
  }

  const ensureScene = () => {
    if (!currentScene) startScene(`Scene ${sceneCounter++}`)
  }

  const addParagraph = (paragraph: ParsedParagraph) => {
    ensureScene()
    if (!currentScene) return

    if (paragraph.listType) {
      addListItem(paragraph)
      return
    }

    flushList()
    currentScene.parts.push(`<p>${paragraph.html}</p>`)
  }

  for (const paragraphElement of descendantsByName(doc, 'p')) {
    const paragraph = parseParagraph(paragraphElement, numbering)
    const kind = headingKind(paragraph.text)
    if (kind === 'act') {
      startAct(paragraph.text)
    } else if (kind === 'chapter') {
      startChapter(paragraph.text)
      chapterCounter += 1
    } else if (kind === 'scene') {
      startScene(paragraph.text)
      sceneCounter += 1
    } else {
      addParagraph(paragraph)
    }
  }

  finalizeScene()
  if (sceneFiles.length === 0) {
    startChapter('Chapter 1')
    startScene('Scene 1')
    finalizeScene()
  }

  return {
    tree: [manuscript, notes],
    sceneFiles,
    firstSceneId,
  }
}
