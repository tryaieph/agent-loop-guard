#!/usr/bin/env node
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resetState } = require('../dist/loopBreaker.js')

const sub = process.argv[2]

if (sub === 'reset') {
  resetState(process.cwd())
  process.exit(0)
}

process.stderr.write('Usage: agent-loop-guard reset\n')
process.exit(1)
