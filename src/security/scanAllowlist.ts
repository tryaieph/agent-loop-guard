import * as fs from 'node:fs'
import * as path from 'node:path'

export const SCAN_ALLOWLIST_FILE_NAME = '.agent-loop-guard/scan-allowlist.json'

// Test corpus and docs intentionally embed malicious-looking pattern strings
// as literal example/test input. Unchanged from prior inline duplicates in
// hooks/pre-commit/pre-commit-guard.mjs and ci/scan-diff.mjs.
export const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$|\.md$/

export function scanAllowlistPathFor(repoRoot: string): string {
  return path.join(repoRoot, SCAN_ALLOWLIST_FILE_NAME)
}

/** Loads the explicit path allowlist. Missing/malformed config → empty list (fail closed on scanning, not open). */
export function loadScanAllowlist(
  repoRoot: string,
  readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')
): string[] {
  const configPath = scanAllowlistPathFor(repoRoot)
  if (!fs.existsSync(configPath)) return []
  try {
    const raw = JSON.parse(readFile(configPath)) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    return []
  }
}

function normalizeRelativePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/')
}

/** Explicit path-only match — does not alter detection rules or sensitivity. */
export function isPathAllowlisted(filePath: string, allowlist: string[]): boolean {
  const normalized = normalizeRelativePath(filePath)
  return allowlist.some((entry) => normalizeRelativePath(entry) === normalized)
}

/** Combines the existing test/docs exclusion with the explicit path allowlist. */
export function isFileExcludedFromScan(filePath: string, allowlist: string[]): boolean {
  return TEST_FILE_RE.test(filePath) || isPathAllowlisted(filePath, allowlist)
}
