#!/usr/bin/env node
// Fails CI when the "N tests pass" claim in README.md drifts from the
// actual test count, so the README cannot silently go stale after a test
// is added or removed. Runs the real `npm test` (jest + node --test) and
// sums the reported totals rather than re-implementing a test counter.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '..')

function runTests() {
  // jest writes its summary to stderr, node --test writes to stdout;
  // `npm test` runs both, so both streams must be captured and merged.
  const result = spawnSync('npm', ['test'], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })
  if (result.status !== 0) {
    process.stderr.write('[check-claims] `npm test` failed; cannot verify README claim.\n')
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    process.exit(1)
  }
  return `${result.stdout ?? ''}\n${result.stderr ?? ''}`
}

function countActualTests(testOutput) {
  const jestMatch = testOutput.match(/Tests:\s+(\d+) passed, \d+ total/)
  const nodeTestMatch = testOutput.match(/ℹ pass (\d+)/)
  if (!jestMatch) {
    throw new Error('could not find jest "Tests: N passed" line in `npm test` output')
  }
  if (!nodeTestMatch) {
    throw new Error('could not find node --test "pass N" line in `npm test` output')
  }
  return Number(jestMatch[1]) + Number(nodeTestMatch[1])
}

function claimedTestCount(readme) {
  const match = readme.match(/(\d+) tests pass/)
  if (!match) {
    throw new Error('could not find "N tests pass" claim in README.md')
  }
  return Number(match[1])
}

function main() {
  const testOutput = runTests()
  const actual = countActualTests(testOutput)
  const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8')
  const claimed = claimedTestCount(readme)

  if (actual !== claimed) {
    process.stderr.write(
      `[check-claims] README.md claims "${claimed} tests pass" but actual test run reports ${actual}.\n` +
        'Update the "N tests pass" line in README.md to match.\n'
    )
    process.exit(1)
  }

  process.stdout.write(`[check-claims] README "${claimed} tests pass" matches actual test count\n`)
  process.exit(0)
}

main()
