import {
  PROJECT_FORMAT_VERSION,
  SCRIVUS_VERSION,
  normalizeProjectSettings,
  normalizeProjectStyles,
  normalizeWritingStats,
} from './constants'
import type { ProjectSettings, ProjectStyles, WritingStats } from './types'

export type ProjectMigrationResult = {
  data: Record<string, unknown>
  fromFormatVersion: number
  toFormatVersion: number
  changed: boolean
}

export function getProjectFormatVersion(data: Record<string, unknown>) {
  const stored = Number(data.projectFormatVersion)
  return Number.isFinite(stored) ? stored : 0
}

function setIfChanged(
  data: Record<string, unknown>,
  key: string,
  value: unknown,
) {
  if (JSON.stringify(data[key]) === JSON.stringify(value)) return false
  data[key] = value
  return true
}

function migrateFormat0To1(data: Record<string, unknown>) {
  let changed = false

  changed = setIfChanged(data, 'scrivusVersion', SCRIVUS_VERSION) || changed
  changed = setIfChanged(data, 'projectFormatVersion', 1) || changed

  if (typeof data.name !== 'string' || !data.name.trim()) {
    changed = setIfChanged(data, 'name', 'Untitled Project') || changed
  }

  if (!Array.isArray(data.tree)) {
    changed = setIfChanged(data, 'tree', []) || changed
  }

  if (!Number.isFinite(Number(data.nextId))) {
    changed = setIfChanged(data, 'nextId', 10) || changed
  }

  if (data.lastActiveId !== null && typeof data.lastActiveId !== 'number') {
    changed = setIfChanged(data, 'lastActiveId', null) || changed
  }

  changed = setIfChanged(
    data,
    'styles',
    normalizeProjectStyles(data.styles as Partial<ProjectStyles> | undefined),
  ) || changed

  changed = setIfChanged(
    data,
    'settings',
    normalizeProjectSettings(data.settings as Partial<ProjectSettings> | undefined),
  ) || changed

  if (!data.compileSelections || typeof data.compileSelections !== 'object' || Array.isArray(data.compileSelections)) {
    changed = setIfChanged(data, 'compileSelections', {}) || changed
  }

  if (!data.compileIncludes || typeof data.compileIncludes !== 'object' || Array.isArray(data.compileIncludes)) {
    changed = setIfChanged(data, 'compileIncludes', {}) || changed
  }

  changed = setIfChanged(data, 'writingStats', normalizeWritingStats(data.writingStats as Partial<WritingStats> | undefined)) || changed

  return changed
}

export function migrateProjectData(rawData: Record<string, unknown>): ProjectMigrationResult {
  const fromFormatVersion = getProjectFormatVersion(rawData)
  const data = { ...rawData }
  let changed = false
  let currentFormatVersion = fromFormatVersion

  if (currentFormatVersion === 0) {
    changed = migrateFormat0To1(data) || changed
    currentFormatVersion = 1
  }

  if (currentFormatVersion === PROJECT_FORMAT_VERSION) {
    changed = setIfChanged(data, 'scrivusVersion', SCRIVUS_VERSION) || changed
    changed = setIfChanged(data, 'projectFormatVersion', PROJECT_FORMAT_VERSION) || changed
    if (!data.compileIncludes || typeof data.compileIncludes !== 'object' || Array.isArray(data.compileIncludes)) {
      changed = setIfChanged(data, 'compileIncludes', {}) || changed
    }
    changed = setIfChanged(data, 'writingStats', normalizeWritingStats(data.writingStats as Partial<WritingStats> | undefined)) || changed
  }

  return {
    data,
    fromFormatVersion,
    toFormatVersion: currentFormatVersion,
    changed,
  }
}
