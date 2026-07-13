#!/usr/bin/env node
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { resetState } = require('../dist/loopBreaker.js')

const sub = process.argv[2]

if (sub === 'reset') {
  resetState(process.cwd())
  process.exit(0)
}

if (sub === 'cursor-hook') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const { runCursorHook } = await import(path.join(__dirname, '../hooks/cursor/cursor-hook.mjs'))
  await runCursorHook()
} else {
  process.stderr.write('Usage: agent-loop-guard reset|cursor-hook\n')
  process.exit(1)
}
