#!/usr/bin/env node
// PreToolUse loop circuit breaker — halts runaway agent loops by count.
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatDenyMessage, formatStderrLineForTty, processPreToolUse } = require('../dist/loopBreaker.js')

let input = ''
process.stdin.on('data', (chunk) => { input += chunk })
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd()
  const result = processPreToolUse(payload, cwd)

  if (result.deny) {
    const message = formatDenyMessage(result.reason ?? 'threshold exceeded')
    process.stderr.write(`${formatStderrLineForTty(message)}\n`)
    process.exit(2)
  }

  process.exit(0)
})
