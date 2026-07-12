#!/usr/bin/env node
// Merges agent-loop-guard hooks into Claude Code settings.json (project or user).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const guardRoot = path.resolve(__dirname, '..')
const cmd = (rel) => `node ${path.join(guardRoot, rel)}`

const ourHooks = {
  PreToolUse: [
    {
      matcher: 'Write|Edit|Bash',
      hooks: [{ type: 'command', command: cmd('hooks/pre-tool-use-loop-breaker.mjs') }],
    },
  ],
  PostToolUse: [
    {
      matcher: 'Write|Edit',
      hooks: [{ type: 'command', command: cmd('hooks/post-tool-use-guard.mjs') }],
    },
  ],
  UserPromptSubmit: [
    {
      hooks: [{ type: 'command', command: cmd('hooks/user-prompt-submit-guard.mjs') }],
    },
  ],
}

const targetArg = process.argv[2] ?? 'user'
let outPath
if (targetArg === 'project') {
  const dir = path.join(process.cwd(), '.claude')
  mkdirSync(dir, { recursive: true })
  outPath = path.join(dir, 'settings.json')
} else if (targetArg === 'user') {
  const dir = path.join(os.homedir(), '.claude')
  mkdirSync(dir, { recursive: true })
  outPath = path.join(dir, 'settings.json')
} else {
  console.error('Usage: node scripts/setup-claude.mjs [user|project]')
  process.exit(1)
}

let settings = {}
if (existsSync(outPath)) {
  try {
    settings = JSON.parse(readFileSync(outPath, 'utf8'))
  } catch (err) {
    console.error(`Failed to parse ${outPath}: ${err.message}`)
    process.exit(1)
  }
}

settings.hooks = { ...(settings.hooks ?? {}), ...ourHooks }
writeFileSync(outPath, `${JSON.stringify(settings, null, 2)}\n`)
console.log(`Wrote ${outPath}`)
console.log('Restart Claude Code (or open a new session) to load hooks.')
