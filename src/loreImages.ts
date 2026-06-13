import type { LoreFieldValue, LoreImageCrop, LoreImageValue } from './types'

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

export function getLoreImagePath(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.path : typeof value === 'string' ? value : ''
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

export function getLoreImageFullWidth(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.fullWidth === true : false
}

export function getLoreImageIgnoreEntryCrop(value: LoreFieldValue | undefined) {
  return isLoreImageValue(value) ? value.ignoreEntryCrop === true : false
}

export function createLoreImageValue(
  path: string,
  crop: LoreImageCrop = DEFAULT_LORE_IMAGE_CROP,
  fullWidth = false,
  ignoreEntryCrop = false,
): LoreImageValue {
  return {
    path,
    crop: getLoreImageCrop({ path, crop }),
    fullWidth,
    ignoreEntryCrop,
  }
}
