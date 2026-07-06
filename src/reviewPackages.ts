import JSZip from 'jszip'
import { SCRIVUS_VERSION } from './constants'
import { parseSceneTabs } from './sceneTabs'
import { readSceneFile } from './storage'
import type { CompileChapterEntry, RevisionComment } from './types'
import type { ReviewSnapshot, ReviewSnapshotScene } from './storage'

export type ReviewPackageScene = ReviewSnapshotScene

export type ReviewPackage = {
  manifest: ReviewPackageManifest
  snapshot: ReviewSnapshot
}

export type ReviewCommentsPackage = {
  manifest: ReviewCommentsManifest
  comments: RevisionComment[]
}

type ReviewPackageManifest = {
  kind: 'scrivusreview'
  version: 1
  scrivusVersion: string
  reviewId: string
  createdAt: string
  projectName: string
  manuscriptId: string
  manuscriptTitle: string
  reviewerName: string
  sceneCount: number
}

type ReviewCommentsManifest = {
  kind: 'scrivuscomments'
  version: 1
  scrivusVersion: string
  reviewId: string
  createdAt: string
  projectName: string
  manuscriptId: string
  manuscriptTitle: string
  reviewerName: string
  commentCount: number
}

const REVIEW_MANIFEST_PATH = 'scrivus-review.json'
const COMMENTS_MANIFEST_PATH = 'scrivus-comments.json'
const SNAPSHOT_PATH = 'snapshot.json'
const COMMENTS_PATH = 'comments.json'

export function createReviewId() {
  return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function buildReviewSnapshot(options: {
  reviewId: string
  projectPath: string
  projectName: string
  reviewerName: string
  manuscriptId: string
  manuscriptTitle: string
  chapters: CompileChapterEntry[]
}): Promise<ReviewSnapshot> {
  const scenes: ReviewSnapshotScene[] = []

  for (const chapter of options.chapters) {
    if (!chapter.included) continue
    for (const scene of chapter.scenes) {
      if (!scene.included) continue
      const raw = await readSceneFile(options.projectPath, scene.fileId)
      const tabs = parseSceneTabs(raw)
      const tab = scene.selectedTab === '__last__'
        ? tabs[tabs.length - 1]
        : (tabs.find(candidate => candidate.name === scene.selectedTab) ?? tabs[tabs.length - 1])
      const tabIndex = Math.max(0, tabs.findIndex(candidate => candidate === tab))
      scenes.push({
        sceneId: scene.docId,
        fileId: scene.fileId,
        title: scene.label,
        chapterTitle: chapter.label,
        tabIndex,
        tabName: tab?.name ?? 'Draft',
        content: tab?.content ?? '',
      })
    }
  }

  return {
    reviewId: options.reviewId,
    projectName: options.projectName,
    reviewerName: options.reviewerName.trim(),
    createdAt: new Date().toISOString(),
    manuscriptId: options.manuscriptId,
    manuscriptTitle: options.manuscriptTitle,
    scenes,
  }
}

export async function createReviewPackage(snapshot: ReviewSnapshot) {
  const zip = new JSZip()
  const manifest: ReviewPackageManifest = {
    kind: 'scrivusreview',
    version: 1,
    scrivusVersion: SCRIVUS_VERSION,
    reviewId: snapshot.reviewId,
    createdAt: snapshot.createdAt,
    projectName: snapshot.projectName,
    manuscriptId: snapshot.manuscriptId,
    manuscriptTitle: snapshot.manuscriptTitle,
    reviewerName: snapshot.reviewerName,
    sceneCount: snapshot.scenes.length,
  }
  zip.file(REVIEW_MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  zip.file(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function loadReviewPackage(bytes: Uint8Array): Promise<ReviewPackage> {
  const zip = await JSZip.loadAsync(bytes)
  const manifestFile = zip.file(REVIEW_MANIFEST_PATH)
  const snapshotFile = zip.file(SNAPSHOT_PATH)
  if (!manifestFile || !snapshotFile) throw new Error('This is not a Scrivus review package.')
  const manifest = JSON.parse(await manifestFile.async('string')) as ReviewPackageManifest
  if (manifest.kind !== 'scrivusreview' || manifest.version !== 1) {
    throw new Error('Unsupported Scrivus review package format.')
  }
  const snapshot = JSON.parse(await snapshotFile.async('string')) as ReviewSnapshot
  if (snapshot.reviewId !== manifest.reviewId) {
    throw new Error('Review package metadata does not match its snapshot.')
  }
  return { manifest, snapshot }
}

export async function createReviewCommentsPackage(snapshot: ReviewSnapshot, comments: RevisionComment[]) {
  const reviewComments = comments
    .filter(comment => comment.reviewId === snapshot.reviewId)
    .map(comment => ({
      ...comment,
      tabIndex: comment.reviewSourceTabIndex ?? comment.tabIndex,
    }))
  const zip = new JSZip()
  const manifest: ReviewCommentsManifest = {
    kind: 'scrivuscomments',
    version: 1,
    scrivusVersion: SCRIVUS_VERSION,
    reviewId: snapshot.reviewId,
    createdAt: new Date().toISOString(),
    projectName: snapshot.projectName,
    manuscriptId: snapshot.manuscriptId,
    manuscriptTitle: snapshot.manuscriptTitle,
    reviewerName: snapshot.reviewerName,
    commentCount: reviewComments.length,
  }
  zip.file(COMMENTS_MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  zip.file(COMMENTS_PATH, JSON.stringify(reviewComments, null, 2))
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function loadReviewCommentsPackage(bytes: Uint8Array): Promise<ReviewCommentsPackage> {
  const zip = await JSZip.loadAsync(bytes)
  const manifestFile = zip.file(COMMENTS_MANIFEST_PATH)
  const commentsFile = zip.file(COMMENTS_PATH)
  if (!manifestFile || !commentsFile) throw new Error('This is not a Scrivus comments package.')
  const manifest = JSON.parse(await manifestFile.async('string')) as ReviewCommentsManifest
  if (manifest.kind !== 'scrivuscomments' || manifest.version !== 1) {
    throw new Error('Unsupported Scrivus comments package format.')
  }
  const comments = JSON.parse(await commentsFile.async('string')) as RevisionComment[]
  return { manifest, comments: Array.isArray(comments) ? comments : [] }
}
