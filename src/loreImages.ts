import type { LoreCategory, LoreEntry, LoreFieldValue, LoreImageCrop, LoreImageCropRect, LoreImageValue } from './types'

export function getLoreEntryIconPath(category: LoreCategory, entry: LoreEntry) {
  const field = category.template.find(field => field.id === entry.entryIconFieldId && field.type === 'image' && !field.removed)
  return field ? getLoreImageDisplayPath(entry.fields[field.id]) : ''
}

export const DEFAULT_LORE_IMAGE_CROP: LoreImageCrop = {
  zoom: 1,
  x: 0,
  y: 0,
}

export function isLoreImageValue(value: LoreFieldValue | undefined): value is LoreImageValue {
  return Boolean(value && typeof value === 'object' && 'path' in value && typeof value.path === 'string')
}

export function getLoreFieldText(value: LoreFieldValue | undefined) {
  return typeof value === 'string' ? value : ''
}

export function getLoreListItems(value: LoreFieldValue | undefined) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

export function getLoreImagePath(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.path : typeof value === 'string' ? value : ''
}

export function getLoreImageCroppedPath(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.croppedPath ?? '' : ''
}

export function getLoreImageDisplayPath(value: LoreFieldValue | undefined) {
  return getLoreImageCroppedPath(value) || getLoreImagePath(value)
}

export function getLoreImageCrop(value: LoreFieldValue | undefined): LoreImageCrop {
  if (!isLoreImageValue(value)) return DEFAULT_LORE_IMAGE_CROP
  const crop = value.crop
  if (!crop) return DEFAULT_LORE_IMAGE_CROP
  return {
    zoom: Number.isFinite(crop.zoom) ? Math.min(4, Math.max(1, crop.zoom)) : DEFAULT_LORE_IMAGE_CROP.zoom,
    x: Number.isFinite(crop.x) ? crop.x : DEFAULT_LORE_IMAGE_CROP.x,
    y: Number.isFinite(crop.y) ? crop.y : DEFAULT_LORE_IMAGE_CROP.y,
  }
}

export function getLoreImageCropRect(value: LoreFieldValue | undefined): LoreImageCropRect | null {
  if (!isLoreImageValue(value)) return null
  const rect = value.cropRect
  if (!rect) return null
  const x = Number(rect.x)
  const y = Number(rect.y)
  const size = Number(rect.size)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return null
  return { x, y, size }
}

export function getLoreImageFullWidth(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.fullWidth === true : false
}

export function getLoreImageIgnoreEntryCrop(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.ignoreEntryCrop === true : false
}

export function shouldHideLoreImageInEntry(entry: LoreEntry, fieldId: string) {
  const value = entry.fields[fieldId]
  return entry.entryIconFieldId === fieldId && isLoreImageValue(value) && value.hideInEntry === true
}

export function createLoreImageValue(
  path: string,
  crop: LoreImageCrop = DEFAULT_LORE_IMAGE_CROP,
  fullWidth = false,
  ignoreEntryCrop = false,
  croppedPath?: string,
  cropRect?: LoreImageCropRect | null,
  hideInEntry = false,
): LoreImageValue {
  return {
    path,
    croppedPath,
    crop: getLoreImageCrop({ path, crop }),
    cropRect: cropRect ?? undefined,
    fullWidth,
    ignoreEntryCrop,
    hideInEntry,
  }
}

export function getLoreImageCleanupPaths(entries: LoreEntry[], remaining: LoreEntry[], filenames: string[]) {
  const paths = (items: LoreEntry[]) => items.flatMap(entry => Object.values(entry.fields).flatMap(value => [getLoreImagePath(value), getLoreImageCroppedPath(value)]))
  const retained = new Set(paths(remaining))
  const prefix = (entry: LoreEntry) => (entry.id.replace(/[^a-zA-Z0-9_-]/g, '_') || 'entry') + '_'
  const owned = entries.map(prefix)
  const surviving = remaining.map(prefix)
  const candidates = [...paths(entries), ...filenames.filter(name => owned.some(p => name.startsWith(p)) && !surviving.some(p => name.startsWith(p))).map(name => 'lorebook/images/' + name)]
  return [...new Set(candidates)].filter(path => /^lorebook\/images\/[^/\\]+$/.test(path) && !path.endsWith('/..') && !path.endsWith('/.') && !retained.has(path))
}
