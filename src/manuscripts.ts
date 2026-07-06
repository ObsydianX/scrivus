import { DEFAULT_MANUSCRIPT_ID } from './constants'
import { collectDocs, findNode } from './tree'
import type { DocNode, FolderNode, Manuscript, Project, ProjectSettings, TreeNode } from './types'

export function getActiveManuscript(project: Pick<Project, 'manuscripts' | 'activeManuscriptId'> | null): Manuscript | null {
  if (!project || project.manuscripts.length === 0) return null
  return project.manuscripts.find(manuscript => manuscript.id === project.activeManuscriptId)
    ?? project.manuscripts.find(manuscript => manuscript.id === DEFAULT_MANUSCRIPT_ID)
    ?? project.manuscripts[0]
}

export function getManuscriptFolder(tree: TreeNode[], manuscript: Manuscript | null): FolderNode | null {
  if (!manuscript) return null
  const node = findNode(tree, manuscript.folderId)
  return node?.type === 'folder' ? node : null
}

export function getActiveManuscriptFolder(project: Project | null, tree: TreeNode[]): FolderNode | null {
  return getManuscriptFolder(tree, getActiveManuscript(project))
}

export function getManuscriptDocs(tree: TreeNode[], manuscript: Manuscript | null): DocNode[] {
  const folder = getManuscriptFolder(tree, manuscript)
  return folder ? collectDocs(folder) : []
}

export function getActiveManuscriptDocs(project: Project | null, tree: TreeNode[]): DocNode[] {
  return getManuscriptDocs(tree, getActiveManuscript(project))
}

export function updateManuscript(project: Project, manuscriptId: string, updater: (manuscript: Manuscript) => Manuscript): Project {
  return {
    ...project,
    manuscripts: project.manuscripts.map(manuscript =>
      manuscript.id === manuscriptId ? updater(manuscript) : manuscript
    ),
  }
}

export function updateActiveManuscript(project: Project, updater: (manuscript: Manuscript) => Manuscript): Project {
  const active = getActiveManuscript(project)
  return active ? updateManuscript(project, active.id, updater) : project
}

export function manuscriptBookSettings(project: Project, manuscript: Manuscript | null): ProjectSettings {
  return {
    ...project.settings,
    author: manuscript?.author ?? project.settings.author,
    title: manuscript?.title ?? project.settings.title,
    subtitle: manuscript?.subtitle ?? project.settings.subtitle,
    coverImage: manuscript?.coverImage ?? project.settings.coverImage,
  }
}
