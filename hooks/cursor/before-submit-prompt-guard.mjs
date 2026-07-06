#!/usr/bin/env node
// Cursor beforeSubmitPrompt — input-side warning only (never blocks).
import { readStdin, loadDetectors } from './_shared.mjs'

const { detectByPattern } = loadDetectors()

const raw = await readStdin()
let payload
try {
  payload = JSON.parse(raw)
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

const userMessage =
  `[agent-loop-guard] suspicious prompt pattern detected (warning only, not blocked)\n` +
  `  pattern_id: ${result.patternId}`

process.stderr.write(`${userMessage}\n`)
process.stdout.write(JSON.stringify({
  continue: true,
  user_message: userMessage,
}))
process.exit(0)
