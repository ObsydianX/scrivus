import type { RefObject } from 'react'
import type { SearchResult } from '../search'

export function SearchPanel({
  open,
  query,
  results,
  loading,
  inputRef,
  onQueryChange,
  onClose,
  onOpenResult,
}: {
  open: boolean
  query: string
  results: SearchResult[]
  loading: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onQueryChange: (query: string) => void
  onClose: () => void
  onOpenResult: (result: SearchResult) => void
}) {
  if (!open) return null

  return (
    <div id="search-panel">
      <div id="search-panel-header">
        Search
        <button onClick={onClose}>
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
      <div id="search-input-wrap">
        <input
          id="search-input"
          ref={inputRef}
          type="text"
          placeholder="Search all scenes..."
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'z' || e.key === 'y') e.stopPropagation()
            if (e.key === 'Escape') onClose()
          }}
        />
      </div>
      <div id="search-results">
        {loading && <div id="search-empty">Searching...</div>}
        {!loading && query.trim() && results.length === 0 && (
          <div id="search-empty">No results found</div>
        )}
        {!loading && !query.trim() && (
          <div id="search-empty">Type to search</div>
        )}
        {!loading && results.map((result, i) => (
          <div key={i} className="search-result" onClick={() => onOpenResult(result)}>
            <div className="search-result-title">
              {result.title}
              {result.tabName && <span className="search-result-tab"> - {result.tabName}</span>}
            </div>
            <div className="search-result-excerpt">
              {(() => {
                const q = query.toLowerCase()
                const idx = result.excerpt.toLowerCase().indexOf(q)
                if (idx === -1) return result.excerpt
                return (
                  <>
                    {result.excerpt.slice(0, idx)}
                    <mark>{result.excerpt.slice(idx, idx + query.length)}</mark>
                    {result.excerpt.slice(idx + query.length)}
                  </>
                )
              })()}
            </div>
            <div className="search-result-source">{result.source}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FindReplacePanel({
  open,
  find,
  replace,
  scope,
  status,
  undoAvailable,
  inputRef,
  onFindChange,
  onReplaceChange,
  onScopeChange,
  onClose,
  onReplaceOne,
  onReplaceAll,
  onUndoReplaceAll,
}: {
  open: boolean
  find: string
  replace: string
  scope: 'scene' | 'manuscript'
  status: string
  undoAvailable: boolean
  inputRef: RefObject<HTMLInputElement | null>
  onFindChange: (value: string) => void
  onReplaceChange: (value: string) => void
  onScopeChange: (scope: 'scene' | 'manuscript') => void
  onClose: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onUndoReplaceAll: () => void
}) {
  if (!open) return null

  return (
    <div id="fnr-panel">
      <div id="fnr-panel-header">
        Find & Replace
        <button onClick={onClose}>
          <i className="ti ti-x" aria-hidden="true" />
        </button>
      </div>
      <div id="fnr-body">
        <input
          ref={inputRef}
          type="text"
          placeholder="Find..."
          value={find}
          onChange={e => onFindChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'z' || e.key === 'y') e.stopPropagation()
            if (e.key === 'Escape') onClose()
          }}
        />
        <input
          type="text"
          placeholder="Replace with..."
          value={replace}
          onChange={e => onReplaceChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'z' || e.key === 'y') e.stopPropagation()
            if (e.key === 'Escape') onClose()
          }}
        />
        <div id="fnr-scope">
          <button
            className={scope === 'scene' ? 'active' : ''}
            onClick={() => onScopeChange('scene')}
          >
            Current scene
          </button>
          <button
            className={scope === 'manuscript' ? 'active' : ''}
            onClick={() => onScopeChange('manuscript')}
          >
            Manuscript
          </button>
        </div>
        <div id="fnr-actions">
          <button disabled={!find.trim()} onClick={onReplaceOne}>
            Replace
          </button>
          <button disabled={!find.trim()} onClick={onReplaceAll}>
            Replace All
          </button>
        </div>
        {undoAvailable && scope === 'manuscript' && (
          <button className="fnr-undo-btn" onClick={onUndoReplaceAll}>
            Undo last Replace All
          </button>
        )}
      </div>
      <div id="fnr-status">{status}</div>
    </div>
  )
}
