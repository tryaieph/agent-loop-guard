#!/usr/bin/env node
// CI diff scanner used by .github/workflows/agent-loop-guard.yml.
// Inspects added lines between two commits with the output-side pattern layer
// (guard-core / agent-loop-guard) and fails the job on a match.
// Node-only implementation (no bash) so it runs the same on any CI runner OS.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectMaliciousCode } = require('../dist/output/maliciousCodeDetector.js')
const { normalizeGuardEvent, appendGuardEvent } = require('../dist/events/schema.js')
const { isFileExcludedFromScan, loadScanAllowlist } = require('../dist/security/scanAllowlist.js')

function getRepoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf-8' }).trim()
}

function getDiff(base, head) {
  const ZERO_SHA = '0000000000000000000000000000000000000000'
  // 初回push（親なし）や未指定時は base がゼロSHA/空になり
  // range 解決に失敗するため、直前コミットとの差分にフォールバックする。
  const validBase = base && base !== ZERO_SHA
  const range = validBase && head ? `${base}...${head}` : 'HEAD~1...HEAD'
  return execFileSync(
    'git',
    ['diff', range, '--unified=0', '--no-color'],
    { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 }
  )
}

// Test fixtures and Markdown docs intentionally embed malicious-looking
// pattern strings as literal example/test input; demo assets registered in
// .agent-loop-guard/scan-allowlist.json do the same. Both are excluded from
// the scan by path, not by weakening detection rules.
function extractAddedLines(diffText, allowlist) {
  const lines = diffText.split('\n')
  const added = []
  let currentFile = '(unknown)'
  let skipFile = false
  for (const line of lines) {
    if (line.startsWith('+++ ')) {
      currentFile = line.slice(4).replace(/^b\//, '')
      skipFile = isFileExcludedFromScan(currentFile, allowlist)
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
  const [base, head] = process.argv.slice(2)

  let diffText
  let repoRoot
  try {
    diffText = getDiff(base, head)
    repoRoot = getRepoRoot()
  } catch (err) {
    process.stderr.write(`[agent-loop-guard] failed to read diff: ${err.message}\n`)
    process.exit(1)
  }

  const allowlist = loadScanAllowlist(repoRoot)
  const addedLines = extractAddedLines(diffText, allowlist)
  const hits = []
  for (const { file, content } of addedLines) {
    const result = detectMaliciousCode(content)
    if (result.matched) {
      hits.push({ file, ruleId: result.ruleId, category: result.category, line: content.trim() })
    }
  }

  if (hits.length === 0) {
    process.stdout.write('[agent-loop-guard] no suspicious patterns found\n')
    process.exit(0)
  }

  const hitsByFile = new Map()
  for (const hit of hits) {
    if (!hitsByFile.has(hit.file)) hitsByFile.set(hit.file, [])
    hitsByFile.get(hit.file).push({ rule_id: hit.ruleId, category: hit.category })
  }
  for (const [file, findings] of hitsByFile) {
    appendGuardEvent(
      normalizeGuardEvent({ source: 'ci', event: 'commit-scan', file_path: file, findings })
    )
  }

  process.stderr.write('[agent-loop-guard] suspicious pattern(s) found in diff\n')
  for (const hit of hits) {
    process.stderr.write(
      `  ${hit.file}\n` +
      `    rule_id:  ${hit.ruleId}\n` +
      `    category: ${hit.category}\n` +
      `    line:     ${hit.line}\n`
    )
  }
  process.exit(1)
}

main()
