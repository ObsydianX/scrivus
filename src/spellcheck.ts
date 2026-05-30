import Typo from 'typo-js'
import affData from './dictionaries/en_US-large.aff?raw'
import dicData from './dictionaries/en_US-large.dic?raw'

const WORD_RE = /[A-Za-z]+(?:['\u2019-][A-Za-z]+)*/g
const APOSTROPHE_RE = /[\u2018\u2019\u02bc`\u00b4]/g
const HYPHEN_RE = /[-\u2010\u2011\u2012\u2013\u2014\u2015]+/

export type SpellcheckMatch = {
  word: string
  from: number
  to: number
}

export type Spellchecker = {
  check: (word: string) => boolean
  suggest: (word: string, limit?: number) => string[]
  findMisspellings: (text: string, basePos: number) => SpellcheckMatch[]
}

function normalizeWord(word: string) {
  return word.toLowerCase().replace(APOSTROPHE_RE, "'")
}

export function createSpellchecker(projectWords: string[]): Spellchecker {
  const dictionary = new Typo('en_US', affData, dicData)
  const customWords = new Set(projectWords.map(normalizeWord))

  const checkExact = (word: string) => {
    const normalized = normalizeWord(word)
    if (normalized.length <= 1) return true
    if (customWords.has(normalized)) return true
    if (/^\d+$/.test(normalized)) return true
    return dictionary.check(word) || dictionary.check(normalized)
  }

  const checkInflected = (word: string) => {
    const normalized = normalizeWord(word)
    const straightQuoteWord = word.replace(APOSTROPHE_RE, "'")

    if (normalized.endsWith("'s") && normalized.length > 2) {
      return check(straightQuoteWord.slice(0, -2))
    }

    if (normalized.endsWith("s'") && normalized.length > 2) {
      return check(straightQuoteWord.slice(0, -1))
    }

    if (normalized.endsWith('ies') && normalized.length > 4) {
      return check(`${straightQuoteWord.slice(0, -3)}y`)
    }

    if (normalized.endsWith('es') && normalized.length > 3) {
      return check(straightQuoteWord.slice(0, -2))
    }

    if (normalized.endsWith('s') && normalized.length > 3) {
      return check(straightQuoteWord.slice(0, -1))
    }

    return false
  }

  const check = (word: string): boolean => {
    const normalized = normalizeWord(word)
    const straightQuoteWord = word.replace(APOSTROPHE_RE, "'")
    if (checkExact(word) || checkExact(straightQuoteWord) || checkExact(normalized)) return true

    const parts = straightQuoteWord.split(HYPHEN_RE).filter(Boolean)
    if (parts.length > 1) return parts.every(part => check(part))

    return checkInflected(word)
  }

  return {
    check,
    suggest: (word: string, limit = 6) => dictionary.suggest(word).slice(0, limit),
    findMisspellings: (text: string, basePos: number) => {
      const matches: SpellcheckMatch[] = []
      for (const match of text.matchAll(WORD_RE)) {
        const word = match[0]
        const index = match.index ?? 0
        if (!check(word)) {
          matches.push({ word, from: basePos + index, to: basePos + index + word.length })
        }
      }
      return matches
    },
  }
}

export function findWordAt(text: string, offset: number): { word: string; start: number; end: number } | null {
  for (const match of text.matchAll(WORD_RE)) {
    const word = match[0]
    const start = match.index ?? 0
    const end = start + word.length
    if (offset >= start && offset <= end) return { word, start, end }
  }
  return null
}
