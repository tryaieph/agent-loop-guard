import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  isFileExcludedFromScan,
  isPathAllowlisted,
  loadScanAllowlist,
  scanAllowlistPathFor,
} from './scanAllowlist'

describe('scanAllowlistPathFor', () => {
  it('points at .agent-loop-guard/scan-allowlist.json under the given repo root', () => {
    expect(scanAllowlistPathFor('/repo')).toBe(
      path.join('/repo', '.agent-loop-guard', 'scan-allowlist.json')
    )
  })
})

describe('loadScanAllowlist', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-guard-allowlist-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns an empty array when the config file is missing', () => {
    expect(loadScanAllowlist(tmpDir)).toEqual([])
  })

  it('returns the registered paths from a valid config file', () => {
    const configPath = scanAllowlistPathFor(tmpDir)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(['demo-run.sh', 'guard-demo.tape']))
    expect(loadScanAllowlist(tmpDir)).toEqual(['demo-run.sh', 'guard-demo.tape'])
  })

  it('ignores non-string entries', () => {
    const configPath = scanAllowlistPathFor(tmpDir)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify(['ok.sh', 1, null, { x: 1 }]))
    expect(loadScanAllowlist(tmpDir)).toEqual(['ok.sh'])
  })

  it('returns an empty array when the config is not a JSON array', () => {
    const configPath = scanAllowlistPathFor(tmpDir)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, JSON.stringify({ not: 'an array' }))
    expect(loadScanAllowlist(tmpDir)).toEqual([])
  })

  it('returns an empty array when the config is malformed JSON', () => {
    const configPath = scanAllowlistPathFor(tmpDir)
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    fs.writeFileSync(configPath, '{not valid json')
    expect(loadScanAllowlist(tmpDir)).toEqual([])
  })
})

describe('isPathAllowlisted', () => {
  const allowlist = ['demo-run.sh', 'guard-demo.tape']

  it('matches a registered path exactly', () => {
    expect(isPathAllowlisted('demo-run.sh', allowlist)).toBe(true)
  })

  it('normalizes a leading ./ before matching', () => {
    expect(isPathAllowlisted('./demo-run.sh', allowlist)).toBe(true)
  })

  it('normalizes backslashes before matching', () => {
    expect(isPathAllowlisted('guard-demo.tape', ['nested\\guard-demo.tape'])).toBe(false)
    expect(isPathAllowlisted('nested/guard-demo.tape', ['nested\\guard-demo.tape'])).toBe(true)
  })

  it('does not match an unregistered path', () => {
    expect(isPathAllowlisted('src/index.ts', allowlist)).toBe(false)
  })
})

describe('isFileExcludedFromScan', () => {
  const allowlist = ['demo-run.sh', 'guard-demo.tape']

  it('excludes a registered path even though it would otherwise be scanned', () => {
    expect(isFileExcludedFromScan('demo-run.sh', allowlist)).toBe(true)
    expect(isFileExcludedFromScan('guard-demo.tape', allowlist)).toBe(true)
  })

  it('does not exclude an unregistered path', () => {
    expect(isFileExcludedFromScan('src/index.ts', allowlist)).toBe(false)
    expect(isFileExcludedFromScan('other-script.sh', allowlist)).toBe(false)
  })

  it('still excludes test/spec/md files regardless of the allowlist (unchanged rule)', () => {
    expect(isFileExcludedFromScan('src/foo.test.ts', [])).toBe(true)
    expect(isFileExcludedFromScan('README.md', [])).toBe(true)
  })
})
