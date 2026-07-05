#!/usr/bin/env node
// PostToolUse (Write|Edit) exit-side guard. Inspects written content with the
// output-side pattern layer (guard-core / agent-loop-guard).
// This hook fires AFTER the tool has already run — the file has already been
// written to disk by the time this check happens. It cannot prevent the write;
// it can only detect it and flag it back to the model.
// Match: exit 2 + stderr with rule_id/category/matched line. No match: exit 0, no output.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectMaliciousCode } = require('../dist/output/maliciousCodeDetector.js')

function extractContent(toolInput) {
  if (!toolInput) return ''
  if (typeof toolInput.content === 'string') return toolInput.content
  if (typeof toolInput.new_string === 'string') return toolInput.new_string
  return ''
}

function lineAt(text, index) {
  const upTo = text.slice(0, index)
  const lineNumber = upTo.split('\n').length
  const lineStart = upTo.lastIndexOf('\n') + 1
  const lineEnd = text.indexOf('\n', index)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  return { lineNumber, line }
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

  const { lineNumber, line } = lineAt(content, result.span.start)
  const filePath = payload.tool_input?.file_path ?? '(unknown)'
  process.stderr.write(
    `[agent-loop-guard] suspicious pattern detected after write to ${filePath}\n` +
    `  rule_id:  ${result.ruleId}\n` +
    `  category: ${result.category}\n` +
    `  line ${lineNumber}: ${line.trim()}\n`
  )
  process.exit(2)
})
