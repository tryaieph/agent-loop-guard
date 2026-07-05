import { detectByPattern } from './input/detector'
import { detectMaliciousCode } from './output/maliciousCodeDetector'

export { detectByPattern } from './input/detector'
export type { PatternMatch } from './input/detector'
export { INJECTION_PATTERNS } from './input/patterns'
export type { InjectionPattern } from './input/patterns'
export { detectMaliciousCode } from './output/maliciousCodeDetector'
export type { MaliciousCodeMatch, MaliciousCodeRule } from './output/maliciousCodeDetector'

export interface InspectSummary {
  suspicious: boolean
  category?: string
  matched?: string
}

/** Thin wrapper over detectByPattern for the input-side pattern layer. */
export function inspectInput(text: string): InspectSummary {
  const result = detectByPattern(text)
  if (!result.matched) {
    return { suspicious: false }
  }
  return { suspicious: true, matched: result.patternId ?? undefined }
}

/** Thin wrapper over detectMaliciousCode for the output-side pattern layer. */
export function inspectOutput(code: string): InspectSummary {
  const result = detectMaliciousCode(code)
  if (!result.matched) {
    return { suspicious: false }
  }
  return {
    suspicious: true,
    category: result.category ?? undefined,
    matched: result.ruleId ?? undefined,
  }
}
