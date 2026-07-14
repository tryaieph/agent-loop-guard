import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, 'setup-claude.mjs')
const guardRoot = path.resolve(__dirname, '..')

function runSetup(target, { home, cwd } = {}) {
  return spawnSync(process.execPath, [script, target], {
    encoding: 'utf8',
    cwd: cwd ?? home,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
}

function readSettings(outPath) {
  return JSON.parse(fs.readFileSync(outPath, 'utf8'))
}

test('setup-claude user: registers commands with absolute node + script paths', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-home-'))
  const result = runSetup('user', { home })
  assert.equal(result.status, 0)

  const outPath = path.join(home, '.claude', 'settings.json')
  const settings = readSettings(outPath)

  const preCmd = settings.hooks.PreToolUse[0].hooks[0].command
  const postCmd = settings.hooks.PostToolUse[0].hooks[0].command
  const promptCmd = settings.hooks.UserPromptSubmit[0].hooks[0].command

  for (const command of [preCmd, postCmd, promptCmd]) {
    const [bin, scriptPath] = command.split(' ')
    assert.equal(bin, process.execPath, 'registered node binary must be an absolute path')
    assert.ok(path.isAbsolute(bin), `expected absolute node path, got: ${bin}`)
    assert.ok(path.isAbsolute(scriptPath), `expected absolute script path, got: ${scriptPath}`)
    assert.ok(scriptPath.startsWith(guardRoot), 'script path must resolve inside guard root')
  }

  assert.ok(preCmd.includes('pre-tool-use-loop-breaker.mjs'))
  assert.ok(postCmd.includes('post-tool-use-guard.mjs'))
  assert.ok(promptCmd.includes('user-prompt-submit-guard.mjs'))
})

test('setup-claude project: registers commands with absolute node + script paths', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-home-'))
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-proj-'))
  const result = runSetup('project', { home, cwd })
  assert.equal(result.status, 0)

  const outPath = path.join(cwd, '.claude', 'settings.json')
  const settings = readSettings(outPath)
  const preCmd = settings.hooks.PreToolUse[0].hooks[0].command
  assert.ok(preCmd.startsWith(`${process.execPath} `))
})

test('setup-claude is idempotent: re-running does not duplicate or alter hook keys', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-home-'))
  const first = runSetup('user', { home })
  assert.equal(first.status, 0)
  const outPath = path.join(home, '.claude', 'settings.json')
  const firstSettings = readSettings(outPath)

  const second = runSetup('user', { home })
  assert.equal(second.status, 0)
  const secondSettings = readSettings(outPath)

  assert.deepEqual(secondSettings, firstSettings, 're-running must produce identical settings')
  assert.equal(Object.keys(secondSettings.hooks).length, 3)
})

test('setup-claude upgrades a pre-existing bare "node" registration to an absolute path', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-home-'))
  const claudeDir = path.join(home, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  const outPath = path.join(claudeDir, 'settings.json')

  const staleHooks = {
    PreToolUse: [
      {
        matcher: 'Write|Edit|Bash',
        hooks: [
          {
            type: 'command',
            command: `node ${path.join(guardRoot, 'hooks/pre-tool-use-loop-breaker.mjs')}`,
          },
        ],
      },
    ],
  }
  fs.writeFileSync(outPath, JSON.stringify({ hooks: staleHooks }, null, 2))

  const result = runSetup('user', { home })
  assert.equal(result.status, 0)

  const settings = readSettings(outPath)
  const command = settings.hooks.PreToolUse[0].hooks[0].command
  assert.notEqual(command, staleHooks.PreToolUse[0].hooks[0].command)
  assert.ok(command.startsWith(`${process.execPath} `), 'stale bare-node command must be upgraded to absolute path')
})

test('setup-claude preserves unrelated top-level settings and hook keys', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'alg-claude-home-'))
  const claudeDir = path.join(home, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })
  const outPath = path.join(claudeDir, 'settings.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        someOtherSetting: true,
        hooks: { SomeOtherHook: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
      },
      null,
      2
    )
  )

  const result = runSetup('user', { home })
  assert.equal(result.status, 0)

  const settings = readSettings(outPath)
  assert.equal(settings.someOtherSetting, true)
  assert.ok(settings.hooks.SomeOtherHook)
  assert.ok(settings.hooks.PreToolUse)
})
