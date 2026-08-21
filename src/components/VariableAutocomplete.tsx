import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import type { ProjectVariableCategory } from '../types'
import { evaluateProjectExpression, type ProjectVariables } from '../projectExpressions'

type Suggestion = { label: string; detail: string; insertText: string; resolved?: string }
type Completion = { from: number; to: number; suggestions: Suggestion[] }

function localName(name: string) {
  return name.slice(name.indexOf(':') + 1)
}

export function getVariableCompletion(
  text: string,
  cursor: number,
  categories: ProjectVariableCategory[],
  variables: ProjectVariables,
  requireBraces: boolean,
): Completion | null {
  const before = text.slice(0, cursor)
  let contextStart = 0
  if (requireBraces) {
    const open = before.lastIndexOf('{{')
    const close = before.lastIndexOf('}}')
    if (open < 0 || open < close) return null
    contextStart = open + 2
  }
  const context = before.slice(contextStart)
  const variableMatch = context.match(/([A-Za-z_][A-Za-z0-9_]*):([A-Za-z0-9_]*)$/)
  if (variableMatch) {
    const category = categories.find(item => item.name.toLowerCase() === variableMatch[1].toLowerCase())
    if (!category) return null
    const prefix = variableMatch[2].toLowerCase()
    const suggestions = category.variableNames
      .map(name => localName(name))
      .filter(name => name.toLowerCase().startsWith(prefix))
      .map(name => {
        const qualifiedName = `${category.name}:${name}`
        const resolved = evaluateProjectExpression(qualifiedName, variables)
        return { label: name, detail: category.name, insertText: qualifiedName, resolved: resolved === null ? 'invalid' : String(resolved) }
      })
    if (!suggestions.length) return null
    if (prefix && suggestions.length === 1 && suggestions[0].label.toLowerCase() === prefix) return null
    const existingSuffix = text.slice(cursor).match(/^[A-Za-z0-9_]*/)?.[0] ?? ''
    return { from: cursor - variableMatch[0].length, to: cursor + existingSuffix.length, suggestions }
  }

  const categoryMatch = context.match(/([A-Za-z_][A-Za-z0-9_]*)$/)
  if (!categoryMatch) return null
  const matchStart = context.length - categoryMatch[0].length
  const preceding = context[matchStart - 1]
  if (preceding && !/[\s+\-*/(]/.test(preceding)) return null
  const prefix = categoryMatch[1].toLowerCase()
  const suggestions = categories
    .filter(category => category.name.toLowerCase().startsWith(prefix))
    .map(category => ({ label: category.name, detail: 'Category', insertText: `${category.name}:` }))
  if (!suggestions.length) return null
  const afterCursor = text.slice(cursor)
  const existingSuffix = afterCursor.match(/^[A-Za-z0-9_]*/)?.[0] ?? ''
  const existingColonLength = afterCursor[existingSuffix.length] === ':' ? 1 : 0
  return {
    from: cursor - categoryMatch[0].length,
    to: cursor + existingSuffix.length + existingColonLength,
    suggestions,
  }
}

function SuggestionPopup({ completion, selectedIndex, rect, onSelect }: {
  completion: Completion
  selectedIndex: number
  rect: { left: number; top: number; anchorTop: number; width: number }
  onSelect: (suggestion: Suggestion) => void
}) {
  const estimatedHeight = Math.min(230, completion.suggestions.length * 30 + 10)
  const viewportPadding = 8
  const opensAbove = rect.top + estimatedHeight > window.innerHeight - viewportPadding
  const popupTop = opensAbove
    ? Math.max(viewportPadding, rect.anchorTop - estimatedHeight - 4)
    : rect.top
  const popupLeft = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - Math.max(210, rect.width) - viewportPadding),
  )
  return createPortal(
    <div
      className={`variable-autocomplete-popup${opensAbove ? ' opens-above' : ''}`}
      role="listbox"
      style={{ left: popupLeft, top: popupTop, minWidth: Math.max(210, rect.width) }}
    >
      {completion.suggestions.map((suggestion, index) => (
        <button
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          className={index === selectedIndex ? 'selected' : ''}
          key={`${suggestion.insertText}:${index}`}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(suggestion)}
        >
          <i className="ti ti-variable" aria-hidden="true" />
          <span className="variable-autocomplete-label">{suggestion.label}{suggestion.resolved !== undefined && <strong>= {suggestion.resolved}</strong>}</span>
          <small>{suggestion.detail}</small>
        </button>
      ))}
    </div>,
    document.body,
  )
}

export function VariableAutocompleteInput({
  value,
  onChange,
  categories,
  variables,
  requireBraces,
  multiline = false,
  className,
  placeholder,
  ariaLabel,
  onInput,
  inputRef,
  onEnter,
}: {
  value: string
  onChange: (value: string) => void
  categories: ProjectVariableCategory[]
  variables: ProjectVariables
  requireBraces: boolean
  multiline?: boolean
  className?: string
  placeholder?: string
  ariaLabel?: string
  onInput?: (element: HTMLInputElement | HTMLTextAreaElement) => void
  inputRef?: (element: HTMLInputElement | HTMLTextAreaElement | null) => void
  onEnter?: () => void
}) {
  const elementRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const inputRefCallback = useRef(inputRef)
  inputRefCallback.current = inputRef
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [rect, setRect] = useState({ left: 0, top: 0, anchorTop: 0, width: 0 })

  const refresh = (element: HTMLInputElement | HTMLTextAreaElement) => {
    const cursor = element.selectionStart ?? element.value.length
    const next = getVariableCompletion(element.value, cursor, categories, variables, requireBraces)
    setCompletion(next)
    setSelectedIndex(0)
    const bounds = element.getBoundingClientRect()
    setRect({ left: bounds.left, top: bounds.bottom + 4, anchorTop: bounds.top, width: bounds.width })
  }

  const select = (suggestion: Suggestion) => {
    const element = elementRef.current
    if (!element || !completion) return
    const currentValue = element.value
    const next = currentValue.slice(0, completion.from) + suggestion.insertText + currentValue.slice(completion.to)
    const cursor = completion.from + suggestion.insertText.length
    onChange(next)
    setCompletion(null)
    requestAnimationFrame(() => {
      element.focus()
      element.setSelectionRange(cursor, cursor)
      refresh(element)
    })
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!completion) {
      if (event.key === 'Enter' && onEnter) {
        event.preventDefault()
        onEnter()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setSelectedIndex(index => (index + direction + completion.suggestions.length) % completion.suggestions.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      select(completion.suggestions[selectedIndex])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setCompletion(null)
    }
  }

  const setElementRef = useCallback((element: HTMLInputElement | HTMLTextAreaElement | null) => {
    elementRef.current = element
    inputRefCallback.current?.(element)
  }, [])

  const shared = {
    value,
    className,
    placeholder,
    'aria-label': ariaLabel,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(event.target.value)
      onInput?.(event.currentTarget)
      refresh(event.currentTarget)
    },
    onClick: (event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>) => refresh(event.currentTarget),
    onKeyUp: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) refresh(event.currentTarget)
    },
    onKeyDown: handleKeyDown,
    onBlur: () => setTimeout(() => setCompletion(null), 100),
    ref: setElementRef,
  }

  return <>
    {multiline ? <textarea {...shared} /> : <input {...shared} />}
    {completion && <SuggestionPopup completion={completion} selectedIndex={selectedIndex} rect={rect} onSelect={select} />}
  </>
}

export function EditorVariableAutocomplete({ editor, categories, variables }: { editor: Editor | null; categories: ProjectVariableCategory[]; variables: ProjectVariables }) {
  const [completion, setCompletion] = useState<(Completion & { basePos: number }) | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [rect, setRect] = useState({ left: 0, top: 0, anchorTop: 0, width: 260 })

  useEffect(() => {
    if (!editor) return
    const refresh = () => {
      const { from, empty } = editor.state.selection
      if (!empty) { setCompletion(null); return }
      const blockStart = editor.state.doc.resolve(from).start()
      const text = editor.state.doc.textBetween(blockStart, from, '\n', '\0')
      const next = getVariableCompletion(text, text.length, categories, variables, true)
      if (!next) { setCompletion(null); return }
      setCompletion({ ...next, basePos: blockStart })
      setSelectedIndex(0)
      const coords = editor.view.coordsAtPos(from)
      setRect({ left: coords.left, top: coords.bottom + 4, anchorTop: coords.top, width: 260 })
    }
    const select = (suggestion: Suggestion) => {
      if (!completion) return
      editor.chain().focus().deleteRange({ from: completion.basePos + completion.from, to: completion.basePos + completion.to }).insertContent(suggestion.insertText).run()
      setCompletion(null)
    }
    const keydown = (event: KeyboardEvent) => {
      if (!completion) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); event.stopPropagation()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setSelectedIndex(index => (index + direction + completion.suggestions.length) % completion.suggestions.length)
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault(); event.stopPropagation(); select(completion.suggestions[selectedIndex])
      } else if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setCompletion(null)
      }
    }
    editor.on('update', refresh)
    editor.on('selectionUpdate', refresh)
    editor.view.dom.addEventListener('keydown', keydown, true)
    return () => {
      editor.off('update', refresh)
      editor.off('selectionUpdate', refresh)
      editor.view.dom.removeEventListener('keydown', keydown, true)
    }
  }, [editor, categories, variables, completion, selectedIndex])

  if (!completion) return null
  const select = (suggestion: Suggestion) => {
    if (!editor) return
    editor.chain().focus().deleteRange({ from: completion.basePos + completion.from, to: completion.basePos + completion.to }).insertContent(suggestion.insertText).run()
    setCompletion(null)
  }
  return <SuggestionPopup completion={completion} selectedIndex={selectedIndex} rect={rect} onSelect={select} />
}
