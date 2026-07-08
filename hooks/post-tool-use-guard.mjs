#!/usr/bin/env node
// PostToolUse (Write|Edit) exit-side guard. Detects and flags after write.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectMaliciousCode } = require('../dist/output/maliciousCodeDetector.js')

function extractContent(toolInput) {
  if (!toolInput) return ''
  if (typeof toolInput.content === 'string') return toolInput.content
  if (typeof toolInput.new_string === 'string') return toolInput.new_string
  return ''
}

let input = ''
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const content = extractContent(payload.tool_input)
  if (!content) {
    process.exit(0)
  }

  const result = detectMaliciousCode(content)
  if (!result.matched) {
    process.exit(0)
  }

  process.stderr.write(
    `agent-loop-guard: suspicious pattern detected and flagged after write ` +
    `(rule: ${result.ruleId}) — review before use\n`
  )
  process.exit(2)
})
