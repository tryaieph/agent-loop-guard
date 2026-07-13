import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { appendGuardEvent, eventsPathFor, normalizeGuardEvent } from './schema'

describe('normalizeGuardEvent', () => {
  it('derives rule_ids from findings in order', () => {
    const event = normalizeGuardEvent({
      source: 'claude-code',
      event: 'post-write-scan',
      file_path: '/tmp/evil.js',
      findings: [
        { rule_id: 'encoded_exec_eval_atob', category: 'encoded_execution', line: 3 },
        { rule_id: 'curl_pipe_bash', category: 'pipe_execution' },
      ],
    })

    expect(event.source).toBe('claude-code')
    expect(event.event).toBe('post-write-scan')
    expect(event.file_path).toBe('/tmp/evil.js')
    expect(event.rule_ids).toEqual(['encoded_exec_eval_atob', 'curl_pipe_bash'])
    expect(event.findings).toHaveLength(2)
    expect(typeof event.timestamp).toBe('string')
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false)
  })

  it('defaults findings/rule_ids to empty arrays when omitted', () => {
    const event = normalizeGuardEvent({ source: 'ci', event: 'commit-scan' })
    expect(event.findings).toEqual([])
    expect(event.rule_ids).toEqual([])
  })

  it('carries through optional session_id and iteration', () => {
    const event = normalizeGuardEvent({
      source: 'cursor',
      event: 'pre-exec-block',
      findings: [{ rule_id: 'known_malicious_package_node-ipc' }],
      session_id: 'abc-123',
      iteration: 4,
    })
    expect(event.session_id).toBe('abc-123')
    expect(event.iteration).toBe(4)
  })
})

describe('eventsPathFor', () => {
  it('points at .agent-loop-guard/events.jsonl under the given cwd', () => {
    expect(eventsPathFor('/repo')).toBe(path.join('/repo', '.agent-loop-guard', 'events.jsonl'))
  })
})

describe('appendGuardEvent', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-guard-events-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends one JSON line per call to events.jsonl', () => {
    const first = normalizeGuardEvent({ source: 'pre-commit', event: 'commit-scan', findings: [{ rule_id: 'a' }] })
    const second = normalizeGuardEvent({ source: 'ci', event: 'commit-scan', findings: [{ rule_id: 'b' }] })

    appendGuardEvent(first, tmpDir)
    appendGuardEvent(second, tmpDir)

    const contents = fs.readFileSync(eventsPathFor(tmpDir), 'utf8')
    const lines = contents.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).rule_ids).toEqual(['a'])
    expect(JSON.parse(lines[1]).rule_ids).toEqual(['b'])
  })

  it('creates the .agent-loop-guard directory if missing', () => {
    const nested = path.join(tmpDir, 'does-not-exist-yet')
    const event = normalizeGuardEvent({ source: 'claude-code', event: 'post-write-scan', findings: [{ rule_id: 'x' }] })
    appendGuardEvent(event, nested)
    expect(fs.existsSync(eventsPathFor(nested))).toBe(true)
  })
})
