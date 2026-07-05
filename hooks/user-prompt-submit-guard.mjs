#!/usr/bin/env node
// UserPromptSubmit entry-side guard. Inspects the submitted prompt with the
// input-side pattern layer (guard-core / agent-loop-guard).
// Match: exit 0 + stderr warning (the prompt is NOT blocked). No match: exit 0, no output.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { detectByPattern } = require('../dist/input/detector.js')

let input = ''
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const prompt = typeof payload.prompt === 'string' ? payload.prompt : ''
  if (!prompt) {
    process.exit(0)
  }

  const result = detectByPattern(prompt)
  if (!result.matched) {
    process.exit(0)
  }

  process.stderr.write(
    `[agent-loop-guard] suspicious prompt pattern detected (warning only, not blocked)\n` +
    `  pattern_id: ${result.patternId}\n`
  )
  process.exit(0)
})
