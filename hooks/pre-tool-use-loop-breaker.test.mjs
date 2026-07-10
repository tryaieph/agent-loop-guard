import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const hook = path.join(__dirname, 'pre-tool-use-loop-breaker.mjs')

function runHook(payload, cwd) {
  return spawnSync('node', [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
  })
}

test('PreToolUse hook: under limits exits 0', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-hook-'))
  fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
  fs.writeFileSync(
    path.join(cwd, '.agent-loop-guard/config.json'),
    JSON.stringify({ maxToolCallsPerSession: 5, maxEditsPerFile: 5 })
  )

  const result = runHook(
    {
      session_id: 'hook-session-1',
      cwd,
      tool_name: 'Write',
      tool_input: { file_path: path.join(cwd, 'a.txt'), content: 'x' },
    },
    cwd
  )
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
})

test('PreToolUse hook: over edit limit exits 2 with deny message', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-hook-'))
  fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
  fs.writeFileSync(
    path.join(cwd, '.agent-loop-guard/config.json'),
    JSON.stringify({ maxToolCallsPerSession: 0, maxEditsPerFile: 1 })
  )
  const file = path.join(cwd, 'target.txt')
  const base = {
    session_id: 'hook-session-2',
    cwd,
    tool_name: 'Write',
    tool_input: { file_path: file, content: 'hello' },
  }

  assert.equal(runHook(base, cwd).status, 0)
  const blocked = runHook(base, cwd)
  assert.equal(blocked.status, 2)
  assert.match(blocked.stderr, /Loop breaker tripped:/)
  assert.match(blocked.stderr, /agent-loop-guard reset/)
  assert.equal(fs.existsSync(file), false)
})

test('agent-loop-guard reset clears state directory', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-reset-'))
  const stateDir = path.join(cwd, '.agent-loop-guard/state')
  fs.mkdirSync(stateDir, { recursive: true })
  fs.writeFileSync(path.join(stateDir, 'sess.json'), '{}')

  const bin = path.join(__dirname, '..', 'bin', 'agent-loop-guard.mjs')
  const result = spawnSync('node', [bin, 'reset'], { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(fs.existsSync(stateDir), false)
})
