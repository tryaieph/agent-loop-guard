import { detectKnownMaliciousInstall, extractInstallTargets } from './packageInstallDetector'

describe('extractInstallTargets', () => {
  it('extracts a single npm install target', () => {
    expect(extractInstallTargets('npm install left-pad')).toEqual(['left-pad'])
  })

  it('strips version specifiers', () => {
    expect(extractInstallTargets('npm install left-pad@1.3.0')).toEqual(['left-pad'])
  })

  it('preserves scoped package names', () => {
    expect(extractInstallTargets('npm install @scope/left-pad@1.0.0')).toEqual(['@scope/left-pad'])
  })

  it('supports pnpm add, yarn add, and npx dlx', () => {
    expect(extractInstallTargets('pnpm add left-pad')).toEqual(['left-pad'])
    expect(extractInstallTargets('yarn add left-pad')).toEqual(['left-pad'])
    expect(extractInstallTargets('npx dlx left-pad')).toEqual(['left-pad'])
  })

  it('ignores flags and multiple packages in one invocation', () => {
    expect(extractInstallTargets('npm install --save-dev left-pad right-pad')).toEqual([
      'left-pad',
      'right-pad',
    ])
  })

  it('returns empty array for non-install commands', () => {
    expect(extractInstallTargets('git status')).toEqual([])
    expect(extractInstallTargets('npm run build')).toEqual([])
  })
})

describe('detectKnownMaliciousInstall', () => {
  it('flags a known-malicious package by exact name', () => {
    const result = detectKnownMaliciousInstall('npm install node-ipc')
    expect(result.matched).toBe(true)
    expect(result.packageName).toBe('node-ipc')
  })

  it('flags a known-malicious package with a pinned version', () => {
    const result = detectKnownMaliciousInstall('npm install event-stream@3.3.6')
    expect(result.matched).toBe(true)
    expect(result.packageName).toBe('event-stream')
  })

  it('does not flag benign installs', () => {
    const result = detectKnownMaliciousInstall('npm install express')
    expect(result.matched).toBe(false)
    expect(result.packageName).toBeNull()
  })

  it('does not flag non-install commands', () => {
    const result = detectKnownMaliciousInstall('echo node-ipc')
    expect(result.matched).toBe(false)
  })

  it('handles empty input', () => {
    expect(detectKnownMaliciousInstall('')).toEqual({ matched: false, packageName: null })
  })
})
