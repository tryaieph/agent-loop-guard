import maliciousCodeRulesJson from './malicious-code-rules.json'

export interface MaliciousCodeRule {
  id: string
  category: string
  pattern: string
  flags: string
}

export interface MaliciousCodeMatch {
  matched: boolean
  ruleId: string | null
  category: string | null
  span: { start: number; end: number } | null
}

const MALICIOUS_CODE_RULES = maliciousCodeRulesJson as MaliciousCodeRule[]

export function detectMaliciousCode(text: string): MaliciousCodeMatch {
  for (const rule of MALICIOUS_CODE_RULES) {
    const regex = new RegExp(rule.pattern, rule.flags)
    const match = regex.exec(text)
    if (match !== null) {
      return {
        matched: true,
        ruleId: rule.id,
        category: rule.category,
        span: { start: match.index, end: match.index + match[0].length },
      }
    }
  }

  return { matched: false, ruleId: null, category: null, span: null }
}
