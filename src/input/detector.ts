import { INJECTION_PATTERNS } from './patterns'

export interface PatternMatch {
  matched: boolean
  patternId: string | null
  span: { start: number; end: number } | null
}

export function detectByPattern(text: string): PatternMatch {
  // Normalize: collapse full-width to ASCII, lower-case
  const normalized = text
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .replace(/　/g, ' ')

  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.regex.exec(normalized)
    if (match !== null) {
      return {
        matched: true,
        patternId: pattern.id,
        span: { start: match.index, end: match.index + match[0].length },
      }
    }
  }

  return { matched: false, patternId: null, span: null }
}
