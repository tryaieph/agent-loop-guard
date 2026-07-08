import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatFlagWarning } from './_shared.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cursorHook = path.join(__dirname, 'post-tool-use-guard.mjs')
const claudeHook = path.join(__dirname, '..', 'post-tool-use-guard.mjs')

const evilPayload = JSON.stringify({
  tool_name: 'Write',
  tool_input: {
    file_path: '/tmp/evil.js',
    content: 'eval(atob("Y29uc29sZS5sb2coMSk="))',
  },
})

const cleanPayload = JSON.stringify({
  tool_name: 'Write',
  tool_input: {
    file_path: '/tmp/ok.js',
    content: 'console.log(1)',
  },
})

const claudeEvilPayload = JSON.stringify({
  tool_input: {
    file_path: '/tmp/evil.js',
    content: 'eval(atob("Y29uc29sZS5sb2coMSk="))',
  },
})

const claudeCleanPayload = JSON.stringify({
  tool_input: {
    file_path: '/tmp/ok.js',
    content: 'console.log(1)',
  },
})

test('formatFlagWarning uses standard message', () => {
  assert.equal(
    formatFlagWarning('encoded_exec_eval_atob'),
    'agent-loop-guard: suspicious pattern detected and flagged after write (rule: encoded_exec_eval_atob) — review before use'
  )
})

test('cursor post-tool-use-guard: match exits 2 with stderr flag', () => {
  const result = spawnSync('node', [cursorHook], { input: evilPayload, encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.equal(result.stdout, '')
  assert.match(result.stderr, /agent-loop-guard: suspicious pattern detected and flagged after write/)
  assert.match(result.stderr, /rule: encoded_exec_eval_atob/)
})

test('cursor post-tool-use-guard: clean content exits 0', () => {
  const result = spawnSync('node', [cursorHook], { input: cleanPayload, encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, '')
})

test('claude post-tool-use-guard: match exits 2 with stderr flag', () => {
  const result = spawnSync('node', [claudeHook], { input: claudeEvilPayload, encoding: 'utf8' })
  assert.equal(result.status, 2)
  assert.match(result.stderr, /rule: encoded_exec_eval_atob/)
})

test('claude post-tool-use-guard: clean content exits 0', () => {
  const result = spawnSync('node', [claudeHook], { input: claudeCleanPayload, encoding: 'utf8' })
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
})
