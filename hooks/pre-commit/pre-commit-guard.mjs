#!/usr/bin/env node
// Git pre-commit guard. Inspects staged additions with the output-side pattern
// layer (guard-core / agent-loop-guard) and rejects the commit on a match.
// Node-only implementation (no bash) so it runs the same on Windows/macOS/Linux.
// Bypass: `git commit --no-verify` (same escape hatch as any pre-commit hook).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectMaliciousCode } = require('../../dist/output/maliciousCodeDetector.js')

function getStagedDiff() {
  return execFileSync(
    'git',
    ['diff', '--cached', '--unified=0', '--no-color'],
    { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 }
  )
}

// Test fixtures intentionally embed malicious-looking pattern strings as
// literal test input, so they are excluded from the scan to avoid the guard
// flagging its own test corpus as a false positive.
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/

function extractAddedLines(diffText) {
  const lines = diffText.split('\n')
  const added = []
  let currentFile = '(unknown)'
  let skipFile = false
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      currentFile = line.slice(4).replace(/^b\//, '')
      skipFile = TEST_FILE_RE.test(currentFile)
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (skipFile) continue
    if (line.startsWith('+')) {
      added.push({ file: currentFile, content: line.slice(1) })
    }
  }
  return added
}

function main() {
  let diffText
  try {
    diffText = getStagedDiff()
  } catch (err) {
    process.stderr.write(`[agent-loop-guard] failed to read staged diff: ${err.message}\n`)
    process.exit(0)
  }

  if (!diffText.trim()) {
    process.exit(0)
  }

  const addedLines = extractAddedLines(diffText)
  const hits = []
  for (const { file, content } of addedLines) {
    const result = detectMaliciousCode(content)
    if (result.matched) {
      hits.push({ file, ruleId: result.ruleId, category: result.category, line: content.trim() })
    }
  }

  if (hits.length === 0) {
    process.exit(0)
  }

  process.stderr.write('[agent-loop-guard] commit rejected: suspicious pattern(s) in staged changes\n')
  for (const hit of hits) {
    process.stderr.write(
      `  ${hit.file}\n` +
      `    rule_id:  ${hit.ruleId}\n` +
      `    category: ${hit.category}\n` +
      `    line:     ${hit.line}\n`
    )
  }
  process.stderr.write('Bypass (not recommended): git commit --no-verify\n')
  process.exit(1)
}

main()
