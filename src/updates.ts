export const SCRIVUS_GITHUB_URL = 'https://github.com/ObsydianX/Scrivus'
export const SCRIVUS_LATEST_RELEASE_API = 'https://api.github.com/repos/ObsydianX/Scrivus/releases/latest'

export type UpdateCheckResult =
  | {
    status: 'available'
    latestVersion: string
    currentVersion: string
    releaseUrl: string
  }
  | {
    status: 'current'
    latestVersion: string
    currentVersion: string
  }

type GitHubLatestRelease = {
  tag_name?: unknown
  html_url?: unknown
}

function normalizeVersion(version: string) {
  return version.trim().replace(/^v/i, '').split(/[+-]/)[0]
}

export function compareVersions(a: string, b: string) {
  const aParts = normalizeVersion(a).split('.').map(part => Number.parseInt(part, 10))
  const bParts = normalizeVersion(b).split('.').map(part => Number.parseInt(part, 10))
  const length = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < length; i++) {
    const left = Number.isFinite(aParts[i]) ? aParts[i] : 0
    const right = Number.isFinite(bParts[i]) ? bParts[i] : 0
    if (left > right) return 1
    if (left < right) return -1
  }

  return 0
}

export async function checkForScrivusUpdate(currentVersion: string): Promise<UpdateCheckResult> {
  const response = await fetch(SCRIVUS_LATEST_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status}.`)
  }

  const release = await response.json() as GitHubLatestRelease
  const latestVersion = typeof release.tag_name === 'string' ? release.tag_name : ''
  const releaseUrl = typeof release.html_url === 'string' ? release.html_url : SCRIVUS_GITHUB_URL

  if (!latestVersion) {
    throw new Error('GitHub did not return a release version.')
  }

  if (compareVersions(latestVersion, currentVersion) > 0) {
    return {
      status: 'available',
      latestVersion: normalizeVersion(latestVersion),
      currentVersion,
      releaseUrl,
    }
  }

  return {
    status: 'current',
    latestVersion: normalizeVersion(latestVersion),
    currentVersion,
  }
}
