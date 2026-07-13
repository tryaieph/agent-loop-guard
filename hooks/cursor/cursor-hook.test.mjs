import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const bin = path.join(__dirname, '..', '..', 'bin', 'agent-loop-guard.mjs')

function runCursorHook(payload, cwd) {
  return spawnSync('node', [bin, 'cursor-hook'], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
  })
}

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-guard-cursor-hook-'))
  try {
    return fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function readEvents(dir) {
  const eventsPath = path.join(dir, '.agent-loop-guard', 'events.jsonl')
  if (!fs.existsSync(eventsPath)) return []
  return fs
    .readFileSync(eventsPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

test('afterFileEdit: records a GuardEvent for a detected finding and always exits 0', () => {
  withTmpDir((dir) => {
    const payload = {
      hook_event_name: 'afterFileEdit',
      conversation_id: 'conv-1',
      file_path: '/tmp/evil.js',
      edits: [{ old_string: 'a', new_string: 'eval(atob("Y29uc29sZS5sb2coMSk="))' }],
    }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 0)

    const events = readEvents(dir)
    assert.equal(events.length, 1)
    assert.equal(events[0].source, 'cursor')
    assert.equal(events[0].event, 'post-write-scan')
    assert.equal(events[0].file_path, '/tmp/evil.js')
    assert.deepEqual(events[0].rule_ids, ['encoded_exec_eval_atob'])
    assert.equal(events[0].session_id, 'conv-1')
  })
})

test('afterFileEdit: clean edit exits 0 and records no event', () => {
  withTmpDir((dir) => {
    const payload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/tmp/ok.js',
      edits: [{ old_string: 'a', new_string: 'console.log(1)' }],
    }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 0)
    assert.deepEqual(readEvents(dir), [])
  })
})

test('beforeShellExecution: known-malicious install exits 2 and denies', () => {
  withTmpDir((dir) => {
    const payload = {
      hook_event_name: 'beforeShellExecution',
      command: 'npm install node-ipc',
      cwd: dir,
      conversation_id: 'conv-2',
    }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 2)
    const stdout = JSON.parse(result.stdout)
    assert.equal(stdout.permission, 'deny')
    assert.match(stdout.user_message, /node-ipc/)
    assert.match(result.stderr, /node-ipc/)

    const events = readEvents(dir)
    assert.equal(events.length, 1)
    assert.equal(events[0].event, 'pre-exec-block')
    assert.deepEqual(events[0].rule_ids, ['known_malicious_package_node-ipc'])
  })
})

test('beforeShellExecution: benign install exits 0 with no output', () => {
  withTmpDir((dir) => {
    const payload = { hook_event_name: 'beforeShellExecution', command: 'npm install express', cwd: dir }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 0)
    assert.equal(result.stdout, '')
    assert.deepEqual(readEvents(dir), [])
  })
})

test('beforeMCPExecution: known-malicious install exits 2 and denies', () => {
  withTmpDir((dir) => {
    const payload = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'run_terminal_command',
      tool_input: JSON.stringify({ command: 'yarn add event-stream' }),
    }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 2)
    const stdout = JSON.parse(result.stdout)
    assert.equal(stdout.permission, 'deny')
    assert.match(stdout.user_message, /event-stream/)
  })
})

test('beforeMCPExecution: benign tool call exits 0', () => {
  withTmpDir((dir) => {
    const payload = {
      hook_event_name: 'beforeMCPExecution',
      tool_name: 'read_file',
      tool_input: JSON.stringify({ path: '/tmp/a.txt' }),
    }
    const result = runCursorHook(payload, dir)
    assert.equal(result.status, 0)
  })
})

test('unknown hook_event_name is a no-op, exits 0', () => {
  withTmpDir((dir) => {
    const result = runCursorHook({ hook_event_name: 'stop', status: 'completed' }, dir)
    assert.equal(result.status, 0)
  })
})

test('invalid JSON on stdin fails open, exits 0', () => {
  withTmpDir((dir) => {
    const result = spawnSync('node', [bin, 'cursor-hook'], { input: 'not json', encoding: 'utf8', cwd: dir })
    assert.equal(result.status, 0)
  })
})
