import { useEffect, useMemo, useState } from 'react'
import type { LoreBacklink } from '../loreBacklinks'
import type { LoreBook, OutlineRow } from '../types'

type PresenceCell = {
  mentions: number
  sceneCount: number
  firstSceneId: number | null
}

type PresenceRow = {
  entryId: string
  name: string
  totalMentions: number
  cells: PresenceCell[]
  firstColumn: number
  lastColumn: number
}

export function LorePresenceModal({
  loreBook,
  backlinks,
  outlineRows,
  onOpenScene,
  onClose,
}: {
  loreBook: LoreBook
  backlinks: Record<string, LoreBacklink[]>
  outlineRows: OutlineRow[]
  onOpenScene: (id: number) => void
  onClose: () => void
}) {
  const categories = loreBook.categories
  const [categoryId, setCategoryId] = useState<string | null>(() => {
    const characters = categories.find(category => /char/i.test(category.name))
    return (characters ?? categories[0])?.id ?? null
  })

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onClose])

  // Columns: consecutive manuscript scenes grouped by their chapter label.
  const chapters = useMemo(() => {
    const groups: { label: string; sceneIds: number[] }[] = []
    for (const row of outlineRows) {
      if (row.type !== 'scene') continue
      const last = groups[groups.length - 1]
      if (last && last.label === row.chapter) last.sceneIds.push(row.id)
      else groups.push({ label: row.chapter, sceneIds: [row.id] })
    }
    return groups
  }, [outlineRows])

  const category = categories.find(item => item.id === categoryId) ?? null

  const rows = useMemo<PresenceRow[]>(() => {
    if (!category) return []
    return category.entries
      .map(entry => {
        const linksByScene = new Map((backlinks[entry.id] ?? []).map(link => [link.sceneId, link]))
        let firstColumn = -1
        let lastColumn = -1
        let totalMentions = 0
        const cells = chapters.map((chapter, columnIndex) => {
          const links = chapter.sceneIds
            .map(sceneId => linksByScene.get(sceneId))
            .filter((link): link is LoreBacklink => Boolean(link))
          const mentions = links.reduce((sum, link) => sum + link.matchCount, 0)
          if (mentions > 0) {
            if (firstColumn === -1) firstColumn = columnIndex
            lastColumn = columnIndex
            totalMentions += mentions
          }
          return {
            mentions,
            sceneCount: links.length,
            firstSceneId: links[0]?.sceneId ?? null,
          }
        })
        return {
          entryId: entry.id,
          name: entry.name || 'Unnamed entry',
          totalMentions,
          cells,
          firstColumn,
          lastColumn,
        }
      })
      .sort((a, b) => b.totalMentions - a.totalMentions || a.name.localeCompare(b.name))
  }, [category, backlinks, chapters])

  const mentionedRows = rows.filter(row => row.totalMentions > 0)
  const unmentionedCount = rows.length - mentionedRows.length

  return (
    <div className="modal-overlay">
      <div className="modal-box lore-presence-modal">
        <p className="modal-title">Presence Chart</p>

        <div className="lore-presence-controls">
          <select
            className="modal-input lore-presence-select"
            value={categoryId ?? ''}
            onChange={e => setCategoryId(e.target.value)}
          >
            {categories.map(item => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          <span className="lore-presence-hint">
            Dot size shows how often an entry is mentioned in each chapter. Click a dot to open the scene.
          </span>
        </div>

        <div className="lore-presence-body">
          {chapters.length === 0 || !category ? (
            <div className="lore-presence-empty">
              {!category ? 'Create a Lore Book category to see its presence chart.' : 'No manuscript scenes yet.'}
            </div>
          ) : mentionedRows.length === 0 ? (
            <div className="lore-presence-empty">
              No entries from “{category.name}” are mentioned in the manuscript yet.
              Mentions are matched by entry name and keywords.
            </div>
          ) : (
            <div className="lore-presence-grid">
              <div className="lore-presence-row lore-presence-header-row">
                <span className="lore-presence-name" />
                <div className="lore-presence-cells">
                  {chapters.map((chapter, index) => (
                    <span key={index} className="lore-presence-column-label" title={chapter.label}>
                      {index + 1}
                    </span>
                  ))}
                </div>
              </div>
              {mentionedRows.map(row => {
                const rowMax = Math.max(...row.cells.map(cell => cell.mentions), 1)
                return (
                  <div key={row.entryId} className="lore-presence-row">
                    <span className="lore-presence-name" title={`${row.name} · ${row.totalMentions.toLocaleString()} mentions`}>
                      {row.name}
                    </span>
                    <div className="lore-presence-cells">
                      {row.firstColumn !== -1 && row.lastColumn > row.firstColumn && (
                        <span
                          className="lore-presence-span"
                          style={{
                            left: `${((row.firstColumn + 0.5) / chapters.length) * 100}%`,
                            width: `${((row.lastColumn - row.firstColumn) / chapters.length) * 100}%`,
                          }}
                          aria-hidden="true"
                        />
                      )}
                      {row.cells.map((cell, columnIndex) => (
                        <span key={columnIndex} className="lore-presence-cell">
                          {cell.mentions > 0 && (
                            <button
                              type="button"
                              className="lore-presence-dot"
                              style={{ width: 5 + Math.round((cell.mentions / rowMax) * 6) * 2, height: 5 + Math.round((cell.mentions / rowMax) * 6) * 2 }}
                              title={`${row.name} — ${chapters[columnIndex].label}\n${cell.mentions.toLocaleString()} ${cell.mentions === 1 ? 'mention' : 'mentions'} in ${cell.sceneCount} ${cell.sceneCount === 1 ? 'scene' : 'scenes'}`}
                              onClick={() => {
                                if (cell.firstSceneId === null) return
                                onClose()
                                onOpenScene(cell.firstSceneId)
                              }}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-footer lore-presence-footer">
          <span className="lore-presence-footnote">
            {unmentionedCount > 0 && category
              ? `${unmentionedCount.toLocaleString()} ${unmentionedCount === 1 ? 'entry' : 'entries'} in “${category.name}” ${unmentionedCount === 1 ? 'has' : 'have'} no manuscript mentions.`
              : ''}
          </span>
          <button className="modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
