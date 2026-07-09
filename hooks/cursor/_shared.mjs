// Shared helpers for Cursor hooks (.cursor/hooks.json).
// Cursor speaks JSON on stdin/stdout; Claude Code hooks use stderr + exit codes.
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const GUARD_ROOT = path.resolve(__dirname, '../..')
const require = createRequire(import.meta.url)

export function loadDetectors() {
  return {
    detectMaliciousCode: require(path.join(GUARD_ROOT, 'dist/output/maliciousCodeDetector.js')).detectMaliciousCode,
    detectByPattern: require(path.join(GUARD_ROOT, 'dist/input/detector.js')).detectByPattern,
  }
}

export function readStdin() {
  return new Promise((resolve) => {
    let input = ''
    process.stdin.on('data', (chunk) => { input += chunk })
    process.stdin.on('end', () => resolve(input))
  })
}

function tryParseJson(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/** Cursor postToolUse (Write / Edit) — extract text to scan. */
export function extractPostToolUseContent(payload) {
  const toolInput = tryParseJson(payload.tool_input) ?? payload.tool_input
  if (toolInput && typeof toolInput === 'object') {
    const filePath = toolInput.file_path ?? toolInput.path ?? '(unknown)'
    if (typeof toolInput.content === 'string') {
      return { content: toolInput.content, filePath }
    }
    if (typeof toolInput.contents === 'string') {
      return { content: toolInput.contents, filePath }
    }
    if (typeof toolInput.new_string === 'string') {
      return { content: toolInput.new_string, filePath }
    }
  }

  const toolOutput = tryParseJson(payload.tool_output)
  if (toolOutput && typeof toolOutput === 'object') {
    const filePath = toolOutput.file_path ?? toolOutput.path ?? '(unknown)'
    if (typeof toolOutput.content === 'string') {
      return { content: toolOutput.content, filePath }
    }
  }

  return { content: '', filePath: '(unknown)' }
}

/** Cursor afterFileEdit — scan new_string from each edit. */
export function extractAfterFileEditContents(payload) {
  const filePath = payload.file_path ?? '(unknown)'
  const edits = Array.isArray(payload.edits) ? payload.edits : []
  return edits
    .map((edit, index) => ({
      content: typeof edit?.new_string === 'string' ? edit.new_string : '',
      filePath,
      editIndex: index,
    }))
    .filter((item) => item.content.length > 0)
}

export function lineAt(text, index) {
  const upTo = text.slice(0, index)
  const lineNumber = upTo.split('\n').length
  const lineStart = upTo.lastIndexOf('\n') + 1
  const lineEnd = text.indexOf('\n', index)
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd)
  return { lineNumber, line }
}

export function formatFlagWarning(ruleId) {
  return (
    `agent-loop-guard: suspicious pattern detected and flagged after write ` +
    `(rule: ${ruleId}) — review before use`
  )
}

export function formatStderrLineForTty(message) {
  if (process.stderr.isTTY) {
    return `\x1b[31m${message}\x1b[0m`
  }
  return message
}

export function emitFlagExit(ruleId) {
  process.stderr.write(`${formatStderrLineForTty(formatFlagWarning(ruleId))}\n`)
  process.exit(2)
}

export function formatOutputDetection({ filePath, ruleId, category, lineNumber, line }) {
  return (
    `[agent-loop-guard] suspicious pattern detected after write to ${filePath}\n` +
    `  rule_id:  ${ruleId}\n` +
    `  category: ${category}\n` +
    `  line ${lineNumber}: ${line.trim()}\n` +
    `Note: detects and flags after write.`
  )
}

export function emitPostWriteFeedback(message) {
  process.stderr.write(message)
  process.stdout.write(JSON.stringify({ additional_context: message }))
  process.exit(0)
}

export function scanContent(content, detectMaliciousCode) {
  if (!content) return null
  const result = detectMaliciousCode(content)
  if (!result.matched) return null
  const { lineNumber, line } = lineAt(content, result.span.start)
  return { ruleId: result.ruleId, category: result.category, lineNumber, line }
}
