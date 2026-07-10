import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_MAX_EDITS_PER_FILE,
  DEFAULT_MAX_TOOL_CALLS,
  configPathFor,
  evaluateAfterIncrement,
  extractFilePath,
  formatDenyMessage,
  loadConfig,
  loadState,
  processPreToolUse,
  resetState,
  saveState,
  statePathFor,
} from './loopBreaker'

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'alg-loop-'))
}

describe('loopBreaker config', () => {
  test('missing config file uses defaults', () => {
    const cwd = tempDir()
    const config = loadConfig(cwd)
    expect(config.maxToolCallsPerSession).toBe(DEFAULT_MAX_TOOL_CALLS)
    expect(config.maxEditsPerFile).toBe(DEFAULT_MAX_EDITS_PER_FILE)
  })

  test('0 disables that counter', () => {
    const cwd = tempDir()
    fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
    fs.writeFileSync(
      configPathFor(cwd),
      JSON.stringify({ maxToolCallsPerSession: 0, maxEditsPerFile: 5 })
    )
    const config = loadConfig(cwd)
    expect(config.maxToolCallsPerSession).toBeNull()
    expect(config.maxEditsPerFile).toBe(5)
  })

  test('custom limits from config JSON', () => {
    const cwd = tempDir()
    fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
    fs.writeFileSync(
      configPathFor(cwd),
      JSON.stringify({ maxToolCallsPerSession: 3, maxEditsPerFile: 2 })
    )
    const config = loadConfig(cwd)
    expect(config.maxToolCallsPerSession).toBe(3)
    expect(config.maxEditsPerFile).toBe(2)
  })
})

describe('loopBreaker state', () => {
  test('state file path uses session_id', () => {
    const cwd = '/tmp/project'
    expect(statePathFor(cwd, 'abc-123')).toBe(
      path.join(cwd, '.agent-loop-guard/state/abc-123.json')
    )
    expect(statePathFor(cwd, 'abc/123')).toBe(
      path.join(cwd, '.agent-loop-guard/state/abc_123.json')
    )
  })

  test('reset removes state directory', () => {
    const cwd = tempDir()
    const sessionId = 'sess-1'
    saveState(cwd, sessionId, { toolCallCount: 1, editCountsByFile: {} })
    expect(fs.existsSync(statePathFor(cwd, sessionId))).toBe(true)
    resetState(cwd)
    expect(fs.existsSync(path.join(cwd, '.agent-loop-guard/state'))).toBe(false)
  })
})

describe('processPreToolUse', () => {
  const sessionId = '11111111-1111-1111-1111-111111111111'

  function basePayload(overrides: Record<string, unknown> = {}) {
    return {
      session_id: sessionId,
      cwd: overrides.cwd as string,
      tool_name: 'Bash',
      tool_input: { command: 'echo hi' },
      ...overrides,
    }
  }

  test('no session_id passes through', () => {
    const cwd = tempDir()
    const result = processPreToolUse({ tool_name: 'Write' }, cwd)
    expect(result.deny).toBe(false)
    expect(result.exitCode).toBe(0)
  })

  test('session tool call limit trips on exceed', () => {
    const cwd = tempDir()
    fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
    fs.writeFileSync(
      configPathFor(cwd),
      JSON.stringify({ maxToolCallsPerSession: 2, maxEditsPerFile: 0 })
    )

    expect(processPreToolUse(basePayload({ cwd }), cwd).deny).toBe(false)
    expect(processPreToolUse(basePayload({ cwd }), cwd).deny).toBe(false)
    const tripped = processPreToolUse(basePayload({ cwd }), cwd)
    expect(tripped.deny).toBe(true)
    expect(tripped.reason).toMatch(/session tool call limit exceeded/)

    const again = processPreToolUse(basePayload({ cwd }), cwd)
    expect(again.deny).toBe(true)
    expect(loadState(cwd, sessionId).trippedAt).toBeTruthy()
  })

  test('edit limit per file trips on exceed', () => {
    const cwd = tempDir()
    fs.mkdirSync(path.join(cwd, '.agent-loop-guard'), { recursive: true })
    fs.writeFileSync(
      configPathFor(cwd),
      JSON.stringify({ maxToolCallsPerSession: 0, maxEditsPerFile: 2 })
    )
    const file = path.join(cwd, 'loop-target.txt')
    const write = (n: number) =>
      processPreToolUse(
        basePayload({
          cwd,
          tool_name: 'Write',
          tool_input: { file_path: file, content: `v${n}` },
        }),
        cwd
      )

    expect(write(1).deny).toBe(false)
    expect(write(2).deny).toBe(false)
    const tripped = write(3)
    expect(tripped.deny).toBe(true)
    expect(tripped.reason).toMatch(/edit limit for/)
    expect(fs.existsSync(file)).toBe(false)
  })

  test('deny message format', () => {
    const msg = formatDenyMessage('session tool call limit exceeded (3 > 2)')
    expect(msg).toContain('Loop breaker tripped:')
    expect(msg).toContain('agent-loop-guard reset')
  })
})

describe('evaluateAfterIncrement', () => {
  test('extractFilePath reads file_path', () => {
    expect(extractFilePath({ tool_input: { file_path: '/a/b.ts' } })).toBe('/a/b.ts')
    expect(extractFilePath({ tool_input: { path: '/c/d.ts' } })).toBe('/c/d.ts')
  })
})
