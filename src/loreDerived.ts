import { getLoreFieldText } from './loreImages'
import type { LoreEntry, LoreTemplateElement } from './types'

export function getDerivedLoreValue(
  template: LoreTemplateElement[],
  field: LoreTemplateElement,
  entry: LoreEntry,
) {
  if (field.type !== 'derived' || !field.derivedSourceFieldId) return ''
  const source = template.find(candidate =>
    !candidate.removed
    && candidate.id === field.derivedSourceFieldId
    && candidate.type === 'selection'
  )
  if (!source) return ''
  const selectedOptionId = getLoreFieldText(entry.fields[source.id])
  return field.derivedValues?.[selectedOptionId] ?? ''
}
