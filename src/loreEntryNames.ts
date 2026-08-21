import type { LoreEntry } from './types'

export function formatLoreEntryName(entry: Pick<LoreEntry, 'name' | 'prefix' | 'suffix'>): string {
  const name = entry.name.trim() || 'Unnamed entry'
  const prefix = entry.prefix?.trim()
  const suffix = entry.suffix?.trim()
  return `${prefix ? `${prefix} ` : ''}${name}${suffix ? `, ${suffix}` : ''}`
}
