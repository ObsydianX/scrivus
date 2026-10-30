import { useState } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import type { LoreCategory, LoreEntry } from '../types'
import { getLoreEntryIconPath } from '../loreImages'
import { formatLoreEntryName } from '../loreEntryNames'

export function LoreEntryIcon({ category, entry, projectPath, large = false }: { category: LoreCategory; entry: LoreEntry; projectPath: string | null; large?: boolean }) {
  const path = getLoreEntryIconPath(category, entry)
  const src = path && projectPath ? convertFileSrc(`${projectPath}/${path}`.replace(/\\/g, '/')) : ''
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  return <span className={`lore-entry-icon${large ? ' lore-entry-icon-large' : ''}`} aria-hidden="true">
    {src && failedSrc !== src ? <img src={src} alt="" draggable={false} onError={() => setFailedSrc(src)} /> : formatLoreEntryName(entry).slice(0, 1)}
  </span>
}
