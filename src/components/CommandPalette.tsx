import { useEffect, useRef, useState } from 'react'

export type PaletteItem = { id: string; label: string; detail: string; icon: string; run: () => void }

export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  const results = items.filter(item => terms.every(term => `${item.label} ${item.detail}`.toLocaleLowerCase().includes(term))).slice(0, 60)
  const activeIndex = Math.min(index, Math.max(0, results.length - 1))

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'k') return
      if (document.querySelector('.modal-overlay, dialog[open]') && !dialogRef.current?.open) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(value => !value)
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [])

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement as HTMLElement
    setQuery('')
    setIndex(0)
    dialogRef.current?.showModal()
    inputRef.current?.focus()
    return () => { dialogRef.current?.close(); previousFocus.current?.focus() }
  }, [open])

  useEffect(() => {
    dialogRef.current?.querySelector(`#palette-result-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, query])

  const choose = (item: PaletteItem) => {
    dialogRef.current?.close()
    setOpen(false)
    item.run()
  }
  return <>
    <button className="command-palette-trigger" onClick={() => setOpen(true)} title="Jump to scene, lore, or workspace (Ctrl+K)"><i className="ti ti-search" aria-hidden="true" /><span>Jump to…</span><kbd>Ctrl K</kbd></button>
    <dialog ref={dialogRef} className="command-palette" aria-label="Jump to scene, lore, or workspace" onKeyDown={event => event.stopPropagation()} onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false) } }}>
      <div className="command-palette-search"><i className="ti ti-search" aria-hidden="true" /><input ref={inputRef} role="combobox" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={results.length ? `palette-result-${activeIndex}` : undefined} aria-autocomplete="list" aria-label="Search scenes, lore, and workspaces" placeholder="Search scenes, lore, workspaces…" value={query} onChange={event => { setQuery(event.target.value); setIndex(0) }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(1, results.length)) }
        if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); choose(results[activeIndex]) }
      }} /><button aria-label="Close quick jump" onClick={() => setOpen(false)}>Esc</button></div>
      <div id="palette-results" role="listbox" aria-label="Search results">{results.map((item, resultIndex) => <div key={item.id} id={`palette-result-${resultIndex}`} role="option" aria-selected={resultIndex === activeIndex} onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}><i className={`ti ${item.icon}`} aria-hidden="true" /><span><strong>{item.label}</strong><small>{item.detail}</small></span><i className="ti ti-corner-down-left" aria-hidden="true" /></div>)}{!results.length && <p>No matches. Try a scene name, chapter, or Lore keyword.</p>}</div>
      <footer>↑ ↓ to navigate <span>Enter to open · Esc to close</span></footer>
    </dialog>
  </>
}
