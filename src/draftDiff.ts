export type DiffSegment = {
  type: 'same' | 'added' | 'removed'
  text: string
}

export type DiffBlock =
  | { kind: 'same'; text: string }
  | { kind: 'added'; text: string }
  | { kind: 'removed'; text: string }
  | { kind: 'changed'; segments: DiffSegment[] }

export type DraftDiffResult = {
  blocks: DiffBlock[]
  addedWords: number
  removedWords: number
  identical: boolean
}

type Op = 'same' | 'removed' | 'added'

// LCS tables beyond this size are not worth the memory; the middle section is
// treated as a full rewrite instead (only reachable on pathological inputs).
const MAX_DP_CELLS = 4_000_000

// Emits one op per token: 'same' consumes a token from both sides,
// 'removed' consumes from the left, 'added' from the right.
function diffTokens(left: string[], right: string[]): Op[] {
  // Trim the common prefix and suffix so the LCS table only covers the change.
  let start = 0
  while (start < left.length && start < right.length && left[start] === right[start]) start++
  let endLeft = left.length
  let endRight = right.length
  while (endLeft > start && endRight > start && left[endLeft - 1] === right[endRight - 1]) {
    endLeft--
    endRight--
  }

  const midLeft = left.slice(start, endLeft)
  const midRight = right.slice(start, endRight)
  const ops: Op[] = []
  for (let i = 0; i < start; i++) ops.push('same')

  if (midLeft.length === 0 || midRight.length === 0 || (midLeft.length + 1) * (midRight.length + 1) > MAX_DP_CELLS) {
    for (let i = 0; i < midLeft.length; i++) ops.push('removed')
    for (let i = 0; i < midRight.length; i++) ops.push('added')
  } else {
    const cols = midRight.length + 1
    const dp = new Uint32Array((midLeft.length + 1) * cols)
    for (let i = midLeft.length - 1; i >= 0; i--) {
      for (let j = midRight.length - 1; j >= 0; j--) {
        dp[i * cols + j] = midLeft[i] === midRight[j]
          ? dp[(i + 1) * cols + j + 1] + 1
          : Math.max(dp[(i + 1) * cols + j], dp[i * cols + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < midLeft.length && j < midRight.length) {
      if (midLeft[i] === midRight[j]) {
        ops.push('same')
        i++
        j++
      } else if (dp[(i + 1) * cols + j] >= dp[i * cols + j + 1]) {
        ops.push('removed')
        i++
      } else {
        ops.push('added')
        j++
      }
    }
    while (i < midLeft.length) {
      ops.push('removed')
      i++
    }
    while (j < midRight.length) {
      ops.push('added')
      j++
    }
  }

  for (let i = endLeft; i < left.length; i++) ops.push('same')
  return ops
}

function tokenizeWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

function diffWords(leftText: string, rightText: string): DiffSegment[] {
  const leftWords = tokenizeWords(leftText)
  const rightWords = tokenizeWords(rightText)
  const ops = diffTokens(leftWords, rightWords)
  const segments: DiffSegment[] = []
  let li = 0
  let ri = 0
  for (const op of ops) {
    let word: string
    if (op === 'same') {
      word = leftWords[li]
      li++
      ri++
    } else if (op === 'removed') {
      word = leftWords[li]
      li++
    } else {
      word = rightWords[ri]
      ri++
    }
    const last = segments[segments.length - 1]
    if (last && last.type === op) last.text += ` ${word}`
    else segments.push({ type: op, text: word })
  }
  return segments
}

function countWords(text: string): number {
  return tokenizeWords(text).length
}

// Diffs two drafts given as plain-text paragraphs: unchanged paragraphs pass
// through, inserted/deleted paragraphs are whole blocks, and edited paragraphs
// are paired up in order and refined to word-level segments.
export function diffDraftParagraphs(leftParagraphs: string[], rightParagraphs: string[]): DraftDiffResult {
  const ops = diffTokens(leftParagraphs, rightParagraphs)
  const blocks: DiffBlock[] = []
  let li = 0
  let ri = 0
  let pendingRemoved: string[] = []
  let pendingAdded: string[] = []

  const flushPending = () => {
    const pairCount = Math.min(pendingRemoved.length, pendingAdded.length)
    for (let k = 0; k < pairCount; k++) {
      blocks.push({ kind: 'changed', segments: diffWords(pendingRemoved[k], pendingAdded[k]) })
    }
    for (let k = pairCount; k < pendingRemoved.length; k++) {
      blocks.push({ kind: 'removed', text: pendingRemoved[k] })
    }
    for (let k = pairCount; k < pendingAdded.length; k++) {
      blocks.push({ kind: 'added', text: pendingAdded[k] })
    }
    pendingRemoved = []
    pendingAdded = []
  }

  for (const op of ops) {
    if (op === 'same') {
      flushPending()
      blocks.push({ kind: 'same', text: leftParagraphs[li] })
      li++
      ri++
    } else if (op === 'removed') {
      pendingRemoved.push(leftParagraphs[li])
      li++
    } else {
      pendingAdded.push(rightParagraphs[ri])
      ri++
    }
  }
  flushPending()

  let addedWords = 0
  let removedWords = 0
  let identical = true
  for (const block of blocks) {
    if (block.kind === 'added') {
      addedWords += countWords(block.text)
      identical = false
    } else if (block.kind === 'removed') {
      removedWords += countWords(block.text)
      identical = false
    } else if (block.kind === 'changed') {
      identical = false
      for (const segment of block.segments) {
        if (segment.type === 'added') addedWords += countWords(segment.text)
        else if (segment.type === 'removed') removedWords += countWords(segment.text)
      }
    }
  }

  return { blocks, addedWords, removedWords, identical }
}
