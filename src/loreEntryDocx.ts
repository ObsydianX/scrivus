import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
  convertInchesToTwip,
} from 'docx'
import { getLoreFieldText, getLoreImageDisplayPath, getLoreImageFullWidth, getLoreImageIgnoreEntryCrop, getLoreImagePath, getLoreListItems } from './loreImages'
import { renderProjectExpressions, type ProjectVariables } from './projectExpressions'
import type { LoreCategory, LoreEntry, LoreFieldValue } from './types'
import { getDerivedLoreValue } from './loreDerived'

export type LoreDocxImage = {
  data: Uint8Array
  width: number
  height: number
  type: 'png' | 'jpg' | 'gif' | 'bmp'
}

type LoreEntryDocxOptions = {
  category: LoreCategory
  entry: LoreEntry
  variables: ProjectVariables
  loadImage: (relativePath: string) => Promise<LoreDocxImage>
}

const BODY_FONT = 'Aptos'
const INK = '202124'
const MUTED = '6B7280'
const RULE = 'D1D5DB'

function textRun(text: string, options: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text,
    font: BODY_FONT,
    size: options.size ?? 22,
    bold: options.bold,
    color: options.color ?? INK,
  })
}

function bodyRuns(text: string) {
  return text.split(/\r?\n/).map((line, index) => new TextRun({
    text: line,
    break: index > 0 ? 1 : undefined,
    font: BODY_FONT,
    size: 22,
    color: INK,
  }))
}

function fieldParagraphs(label: string | undefined, value: string) {
  const paragraphs: Paragraph[] = []
  if (label) {
    paragraphs.push(new Paragraph({
      children: [textRun(label.toUpperCase(), { size: 16, color: MUTED })],
      spacing: { before: 120, after: 40 },
      keepNext: true,
    }))
  }
  const blocks = value
    .split(/\r?\n[\t ]*\r?\n+/)
    .filter(block => block.trim().length > 0)
  const paragraphBlocks = blocks.length ? blocks : [value]
  for (const [index, block] of paragraphBlocks.entries()) {
    paragraphs.push(new Paragraph({
      children: bodyRuns(block),
      spacing: { after: index === paragraphBlocks.length - 1 ? 160 : 120, line: 276, lineRule: 'auto' },
    }))
  }
  return paragraphs
}

function imageType(path: string): LoreDocxImage['type'] {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg'
  if (extension === 'gif' || extension === 'bmp') return extension
  return 'png'
}

export function loreDocxImageType(path: string) {
  return imageType(path)
}

function scaledImageSize(image: LoreDocxImage, fullWidth: boolean) {
  const maxWidth = fullWidth ? 624 : 360
  const maxHeight = 560
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  return {
    width: Math.max(1, Math.round(image.width * scale)),
    height: Math.max(1, Math.round(image.height * scale)),
  }
}

async function imageParagraphs(
  label: string | undefined,
  value: LoreFieldValue,
  loadImage: LoreEntryDocxOptions['loadImage'],
) {
  const path = getLoreImagePath(value)
  if (!path) return []
  const displayPath = getLoreImageIgnoreEntryCrop(value) ? path : getLoreImageDisplayPath(value)
  const image = await loadImage(displayPath)
  const dimensions = scaledImageSize(image, getLoreImageFullWidth(value))
  const paragraphs: Paragraph[] = []
  if (label) {
    paragraphs.push(new Paragraph({
      children: [textRun(label.toUpperCase(), { size: 16, color: MUTED })],
      spacing: { before: 120, after: 60 },
      keepNext: true,
    }))
  }
  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data: image.data,
      type: image.type,
      transformation: dimensions,
      altText: {
        title: label || 'Lorebook image',
        description: label || 'Image from Lorebook entry',
        name: label || 'Lorebook image',
      },
    })],
    spacing: { after: 160 },
  }))
  return paragraphs
}

export async function createLoreEntryDocx({ category, entry, variables, loadImage }: LoreEntryDocxOptions) {
  const children: Paragraph[] = [
    new Paragraph({
      children: [textRun(entry.name || 'Unnamed entry', { bold: true, size: 36 })],
      spacing: { after: 220 },
    }),
  ]

  const subcategory = category.subcategories?.find(item => item.id === entry.subcategoryId)
  if (subcategory) children.push(...fieldParagraphs('Subcategory', subcategory.name || 'Uncategorized'))
  if (entry.keywords?.length) children.push(...fieldParagraphs('Keywords', entry.keywords.join(', ')))

  for (const field of category.template.filter(item => !item.removed)) {
    if (field.type === 'divider') {
      children.push(new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE } },
        spacing: { before: 120, after: 160 },
      }))
      continue
    }
    if (field.type === 'header') {
      if (field.label) {
        children.push(new Paragraph({
          children: [textRun(`${field.label} -`, { bold: true, size: 23 })],
          spacing: { before: 180, after: 80 },
          keepNext: true,
        }))
      }
      continue
    }

    if (field.type === 'derived') {
      const derivedValue = getDerivedLoreValue(category.template, field, entry)
      if (derivedValue.trim()) children.push(...fieldParagraphs(field.label, renderProjectExpressions(derivedValue, variables)))
      continue
    }

    const value = entry.fields[field.id]
    if (!value) continue
    if (field.type === 'image') {
      children.push(...await imageParagraphs(field.label, value, loadImage))
      continue
    }
    if (field.type === 'list') {
      const items = getLoreListItems(value).filter(item => item.trim())
      if (items.length) {
        if (field.label) {
          children.push(new Paragraph({
            children: [textRun(field.label.toUpperCase(), { size: 16, color: MUTED })],
            spacing: { before: 120, after: 40 },
            keepNext: true,
          }))
        }
        items.forEach((item, index) => children.push(new Paragraph({
          children: bodyRuns(renderProjectExpressions(item, variables)),
          bullet: { level: 0 },
          spacing: { after: index === items.length - 1 ? 160 : 40, line: 276, lineRule: 'auto' },
        })))
      }
      continue
    }
    if (field.type === 'selection') {
      const selectedId = getLoreFieldText(value)
      const selected = field.options?.find(option => option.id === selectedId)
      if (selected?.label.trim()) children.push(...fieldParagraphs(field.label, selected.label))
      continue
    }
    if (field.type === 'multi-selection') {
      const selectedIds = getLoreListItems(value)
      const labels = (field.options ?? [])
        .filter(option => selectedIds.includes(option.id) && option.label.trim())
        .map(option => option.label)
      if (labels.length) children.push(...fieldParagraphs(field.label, labels.join(', ')))
      continue
    }
    const text = getLoreFieldText(value)
    if (text) children.push(...fieldParagraphs(field.label, renderProjectExpressions(text, variables)))
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: BODY_FONT, size: 22, color: INK },
          paragraph: { spacing: { after: 120, line: 276, lineRule: 'auto' } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1),
          },
        },
      },
      children,
    }],
  })
  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}
