import { useRef, useState } from 'react'
import type { ProjectSettings } from '../types'
import { evaluateProjectExpression, isValidProjectVariableName } from '../projectExpressions'
import { VariableAutocompleteInput } from './VariableAutocomplete'

type Props = {
  settings: ProjectSettings
  onChange: (updater: (settings: ProjectSettings) => ProjectSettings) => void
}

export function ProjectVariablesPanel({ settings, onChange }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('all')
  const [search, setSearch] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [categoryNameDrafts, setCategoryNameDrafts] = useState<Record<string, string>>({})
  const [variableName, setVariableName] = useState('')
  const [variableValue, setVariableValue] = useState('')
  const [variableCategoryId, setVariableCategoryId] = useState('')
  const [selectedVariableName, setSelectedVariableName] = useState<string | null>(null)
  const draggedCategoryId = useRef<string | null>(null)
  const draggedVariable = useRef<{ name: string; categoryId: string } | null>(null)
  const cancelledCategoryRename = useRef<string | null>(null)

  const allCount = Object.keys(settings.variables).length
  const localName = (name: string) => name.slice(name.indexOf(':') + 1)
  const withoutWhitespace = (value: string) => value.replace(/\s+/g, '')

  const categoryForVariable = (name: string) =>
    settings.variableCategories.find(category => category.variableNames.includes(name))?.id ?? ''

  const addCategory = () => {
    const name = newCategoryName.trim()
    if (!isValidProjectVariableName(name) || settings.variableCategories.some(category => category.name.toLowerCase() === name.toLowerCase())) return
    const id = `variable-category-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    onChange(current => ({ ...current, variableCategories: [...current.variableCategories, { id, name, variableNames: [] }] }))
    setSelectedCategoryId(id)
    setVariableCategoryId(id)
    setNewCategoryName('')
    setShowNewCategory(false)
  }

  const addVariable = () => {
    const name = variableName.trim()
    const value = variableValue.trim()
    const category = settings.variableCategories.find(item => item.id === variableCategoryId)
    if (!isValidProjectVariableName(name) || !value || !category) return
    const qualifiedName = `${category.name}:${name}`
    if (Object.keys(settings.variables).some(key => key.toLowerCase() === qualifiedName.toLowerCase())) return
    onChange(current => ({
      ...current,
      variables: { ...current.variables, [qualifiedName]: value },
      variableCategories: current.variableCategories.map(category => ({
        ...category,
        variableNames: category.id === variableCategoryId
          ? [...category.variableNames.filter(item => item !== qualifiedName), qualifiedName]
          : category.variableNames.filter(item => item !== qualifiedName),
      })),
    }))
    setVariableName('')
    setVariableValue('')
  }

  const renameCategory = (categoryId: string, nextName: string) => {
    const category = settings.variableCategories.find(item => item.id === categoryId)
    if (!category || category.name === nextName) return
    if (!isValidProjectVariableName(nextName) || settings.variableCategories.some(item => item.id !== categoryId && item.name.toLowerCase() === nextName.toLowerCase())) return
    const renamedVariables = new Map(category.variableNames.map(name => [name, `${nextName}:${localName(name)}`]))
    const replaceReferences = (value: string) => {
      let nextValue = value
      for (const [oldName, newName] of renamedVariables) {
        const escapedName = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        nextValue = nextValue.replace(
          new RegExp(`(^|[^A-Za-z0-9_:])${escapedName}(?=$|[^A-Za-z0-9_:])`, 'gi'),
          `$1${newName}`,
        )
      }
      return nextValue
    }
    onChange(current => ({
      ...current,
      variables: Object.fromEntries(Object.entries(current.variables).map(([name, value]) => [
        renamedVariables.get(name) ?? name,
        typeof value === 'string' ? replaceReferences(value) : value,
      ])),
      variableCategories: current.variableCategories.map(item => item.id === categoryId
        ? {
          ...item,
          name: nextName,
          variableNames: item.variableNames.map(name => renamedVariables.get(name) ?? name),
        }
        : item),
    }))
    if (selectedVariableName && renamedVariables.has(selectedVariableName)) {
      setSelectedVariableName(renamedVariables.get(selectedVariableName) ?? null)
    }
    setVariableValue(value => replaceReferences(value))
  }

  const moveVariable = (name: string, categoryId: string) => {
    const targetCategory = settings.variableCategories.find(category => category.id === categoryId)
    if (!targetCategory) return
    const nextName = `${targetCategory.name}:${localName(name)}`
    if (nextName.toLowerCase() === name.toLowerCase() || Object.keys(settings.variables).some(key => key.toLowerCase() === nextName.toLowerCase())) return
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const referencePattern = new RegExp(`(^|[^A-Za-z0-9_:])${escapedName}(?=$|[^A-Za-z0-9_:])`, 'gi')
    onChange(current => {
      const variables = Object.fromEntries(Object.entries(current.variables).map(([key, value]) => [
        key === name ? nextName : key,
        typeof value === 'string' ? value.replace(referencePattern, `$1${nextName}`) : value,
      ]))
      return {
        ...current,
        variables,
        variableCategories: current.variableCategories.map(category => ({
          ...category,
          variableNames: category.id === categoryId
            ? [...category.variableNames.filter(item => item !== name && item !== nextName), nextName]
            : category.variableNames.filter(item => item !== name),
        })),
      }
    })
    setSelectedVariableName(nextName)
  }

  const removeVariable = (name: string) => onChange(current => {
    const variables = { ...current.variables }
    delete variables[name]
    return {
      ...current,
      variables,
      variableCategories: current.variableCategories.map(category => ({
        ...category,
        variableNames: category.variableNames.filter(item => item !== name),
      })),
    }
  })

  const removeCategory = (categoryId: string) => {
    const category = settings.variableCategories.find(item => item.id === categoryId)
    if (!category || category.variableNames.length > 0) return
    onChange(current => ({
      ...current,
      variableCategories: current.variableCategories.filter(category => category.id !== categoryId),
    }))
    if (selectedCategoryId === categoryId) setSelectedCategoryId('all')
    if (variableCategoryId === categoryId) setVariableCategoryId('')
  }

  const reorderCategory = (targetId?: string) => {
    const sourceId = draggedCategoryId.current
    if (!sourceId || sourceId === targetId) return
    onChange(current => {
      const categories = [...current.variableCategories]
      const sourceIndex = categories.findIndex(category => category.id === sourceId)
      if (sourceIndex < 0) return current
      const [moved] = categories.splice(sourceIndex, 1)
      const targetIndex = targetId ? categories.findIndex(category => category.id === targetId) : categories.length
      categories.splice(targetIndex < 0 ? categories.length : targetIndex, 0, moved)
      return { ...current, variableCategories: categories }
    })
  }

  const reorderVariable = (targetCategoryId: string, targetName?: string) => {
    const source = draggedVariable.current
    if (!source || (source.name === targetName && source.categoryId === targetCategoryId)) return
    onChange(current => {
      const assigned = new Set(current.variableCategories.flatMap(category => category.variableNames))
      const unassigned = Object.keys(current.variables).filter(name => !assigned.has(name) && name !== source.name)
      const categories = current.variableCategories.map(category => ({
        ...category,
        variableNames: category.variableNames.filter(name => name !== source.name),
      }))
      if (targetCategoryId) {
        const category = categories.find(item => item.id === targetCategoryId)
        if (!category) return current
        const targetIndex = targetName ? category.variableNames.indexOf(targetName) : category.variableNames.length
        category.variableNames.splice(targetIndex < 0 ? category.variableNames.length : targetIndex, 0, source.name)
        return { ...current, variableCategories: categories }
      }
      const targetIndex = targetName ? unassigned.indexOf(targetName) : unassigned.length
      unassigned.splice(targetIndex < 0 ? unassigned.length : targetIndex, 0, source.name)
      const ordered = [...unassigned, ...Object.keys(current.variables).filter(name => !unassigned.includes(name))]
      return {
        ...current,
        variables: Object.fromEntries(ordered.map(name => [name, current.variables[name]])),
        variableCategories: categories,
      }
    })
  }

  const groups = settings.variableCategories.map(category => ({ ...category, categoryId: category.id })).filter(group => {
    if (selectedCategoryId === 'all') return true
    return selectedCategoryId === group.categoryId
  }).map(group => ({
    ...group,
    variableNames: group.variableNames.filter(name => {
      const query = search.trim().toLocaleLowerCase()
      if (!query) return true
      return name.toLocaleLowerCase().includes(query) || String(settings.variables[name]).toLocaleLowerCase().includes(query)
    }),
  }))

  return (
    <div className="project-variables-workspace">
      <aside className="project-variables-sidebar">
        <div className="project-variables-sidebar-label">Categories</div>
        <button className={`project-variables-nav-item${selectedCategoryId === 'all' ? ' active' : ''}`} onClick={() => { setSelectedCategoryId('all'); setVariableCategoryId('') }}>
          <span>All variables</span><span>{allCount}</span>
        </button>
        {settings.variableCategories.map(category => (
          <div
            className={`project-variables-nav-row${selectedCategoryId === category.id ? ' active' : ''}`}
            key={category.id}
            onDragOver={event => { if (draggedCategoryId.current) event.preventDefault() }}
            onDrop={event => { event.preventDefault(); reorderCategory(category.id) }}
          >
            <span className="project-variables-nav-grip" draggable onDragStart={() => { draggedCategoryId.current = category.id }} onDragEnd={() => { draggedCategoryId.current = null }}>
              <i className="ti ti-grip-vertical" aria-hidden="true" />
            </span>
            {selectedCategoryId === category.id ? (
              <input
                className="project-variables-nav-name-input"
                value={categoryNameDrafts[category.id] ?? category.name}
                aria-label="Category name"
                onFocus={() => setCategoryNameDrafts(drafts => ({ ...drafts, [category.id]: category.name }))}
                onChange={event => setCategoryNameDrafts(drafts => ({
                  ...drafts,
                  [category.id]: withoutWhitespace(event.target.value),
                }))}
                onBlur={() => {
                  const name = categoryNameDrafts[category.id] ?? category.name
                  if (cancelledCategoryRename.current === category.id) cancelledCategoryRename.current = null
                  else renameCategory(category.id, name)
                  setCategoryNameDrafts(drafts => {
                    const next = { ...drafts }
                    delete next[category.id]
                    return next
                  })
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') {
                    cancelledCategoryRename.current = category.id
                    event.currentTarget.blur()
                  }
                }}
              />
            ) : <button onClick={() => { setSelectedCategoryId(category.id); setVariableCategoryId(category.id) }}>{category.name}</button>}
            <span>{category.variableNames.length}</span>
            {selectedCategoryId === category.id && category.variableNames.length === 0 && <button className="project-variables-nav-delete" title={`Delete ${category.name} category`} onClick={() => removeCategory(category.id)}><i className="ti ti-x" /></button>}
          </div>
        ))}
        <div className="project-variables-category-drop-end" onDragOver={event => { if (draggedCategoryId.current) event.preventDefault() }} onDrop={() => reorderCategory()} />
        {showNewCategory ? (
          <div className="project-variables-sidebar-add">
            <input className="modal-input" autoFocus value={newCategoryName} onChange={event => setNewCategoryName(withoutWhitespace(event.target.value))} onKeyDown={event => { if (event.key === 'Enter') addCategory(); if (event.key === 'Escape') setShowNewCategory(false) }} placeholder="Category name" />
            <button
              className="project-variables-category-add-button"
              title="Add category"
              aria-label="Add category"
              onClick={addCategory}
              disabled={!isValidProjectVariableName(newCategoryName.trim()) || settings.variableCategories.some(category => category.name.toLowerCase() === newCategoryName.trim().toLowerCase())}
            >
              <i className="ti ti-plus" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button className="project-variables-new-category" onClick={() => setShowNewCategory(true)}><i className="ti ti-plus" /> New category</button>
        )}
      </aside>

      <div className="project-variables-main">
        <div className="project-variables-toolbar">
          <label className="project-variables-search"><i className="ti ti-search" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search variables" /></label>
        </div>
        <div className="project-variables-new-form">
          <input className="modal-input" value={variableName} onChange={event => setVariableName(withoutWhitespace(event.target.value))} placeholder="Variable name" />
          <VariableAutocompleteInput
            className="modal-input"
            value={variableValue}
            onChange={setVariableValue}
            categories={settings.variableCategories}
            variables={settings.variables}
            requireBraces={false}
            placeholder="Number or expression"
            ariaLabel="New variable value or expression"
            onEnter={addVariable}
          />
          <select className="modal-select" value={variableCategoryId} onChange={event => setVariableCategoryId(event.target.value)}><option value="" disabled>Select category</option>{settings.variableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
          <button className="welcome-btn" disabled={!isValidProjectVariableName(variableName.trim()) || !variableValue.trim() || !variableCategoryId} onClick={addVariable}>Add</button>
        </div>
        <div className="project-variables-columns"><span>Name</span><span>Value or expression</span><span>Resolves to</span></div>
        <div className="project-variables-table">
          {groups.map(group => (
            <section key={group.id} className="project-variables-group" onDragOver={event => { if (draggedVariable.current) event.preventDefault() }} onDrop={() => reorderVariable(group.categoryId)}>
              {selectedCategoryId === 'all' && <div className="project-variables-group-title">{group.name}</div>}
              {group.variableNames.map(name => {
                const resolved = evaluateProjectExpression(name, settings.variables)
                const selected = selectedVariableName === name
                return (
                  <div
                    className={`project-variables-table-row${selected ? ' selected' : ''}${resolved === null ? ' invalid' : ''}`}
                    key={name}
                    onClick={() => setSelectedVariableName(selected ? null : name)}
                    onDragOver={event => { if (draggedVariable.current) { event.preventDefault(); event.stopPropagation() } }}
                    onDrop={event => { event.preventDefault(); event.stopPropagation(); reorderVariable(group.categoryId, name) }}
                  >
                    <span className="project-variables-row-grip" draggable onDragStart={event => { event.stopPropagation(); draggedVariable.current = { name, categoryId: group.categoryId } }} onDragEnd={() => { draggedVariable.current = null }}><i className="ti ti-grip-vertical" /></span>
                    <code title={name}>{localName(name)}</code>
                    <span onClick={event => event.stopPropagation()}>
                      <VariableAutocompleteInput
                        value={String(settings.variables[name])}
                        onChange={value => onChange(current => ({ ...current, variables: { ...current.variables, [name]: value } }))}
                        categories={settings.variableCategories}
                        variables={settings.variables}
                        requireBraces={false}
                        ariaLabel={`${name} value or expression`}
                      />
                    </span>
                    <span className="project-variables-resolved">{resolved === null ? <><i className="ti ti-alert-triangle" /> invalid</> : resolved}</span>
                    {selected && (
                      <div className="project-variables-row-detail" onClick={event => event.stopPropagation()}>
                        <label className="project-variables-row-category">
                          <span>Category</span>
                          <select className="modal-select" value={categoryForVariable(name)} onChange={event => moveVariable(name, event.target.value)}>{settings.variableCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                        </label>
                        <button onClick={() => { removeVariable(name); setSelectedVariableName(null) }}><i className="ti ti-trash" /> Delete variable</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {group.variableNames.length === 0 && <div className="project-variables-empty">No matching variables.</div>}
            </section>
          ))}
        </div>
        <div className="project-variables-guide">Insert a variable in prose or the Lorebook with <code>{'{{ Category:Variable }}'}</code>. Nested expressions use the same qualified references, such as <code>Basic:Year - JohnDoe:Age</code>.</div>
      </div>
    </div>
  )
}
