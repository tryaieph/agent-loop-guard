#!/usr/bin/env node
// Writes .cursor/hooks.json for agent-loop-guard (project or user level).
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const guardRoot = path.resolve(__dirname, '..')
const hook = (name) => `node ${path.join(guardRoot, 'hooks/cursor', name)}`

const config = {
  version: 1,
  hooks: {
    postToolUse: [{ command: hook('post-tool-use-guard.mjs'), matcher: 'Write|Edit' }],
    afterFileEdit: [{ command: hook('after-file-edit-guard.mjs') }],
    beforeSubmitPrompt: [{ command: hook('before-submit-prompt-guard.mjs') }],
  },
}

const targetArg = process.argv[2] ?? 'project'
let outPath
if (targetArg === 'user') {
  const dir = path.join(process.env.HOME ?? '', '.cursor')
  mkdirSync(dir, { recursive: true })
  outPath = path.join(dir, 'hooks.json')
} else {
  const dir = path.join(process.cwd(), '.cursor')
  mkdirSync(dir, { recursive: true })
  outPath = path.join(dir, 'hooks.json')
}

if (existsSync(outPath)) {
  console.error(`Refusing to overwrite existing ${outPath}`)
  console.error('Move it aside, then re-run: node scripts/setup-cursor.mjs [project|user]')
  process.exit(1)
}

writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`Wrote ${outPath}`)
console.log('Restart Cursor, then check Customize → Hooks.')
