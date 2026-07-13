import knownMaliciousPackages from './known-malicious-packages.json'

export interface KnownMaliciousPackage {
  name: string
  note: string
}

const MALICIOUS_PACKAGE_NAMES: ReadonlySet<string> = new Set(
  (knownMaliciousPackages as KnownMaliciousPackage[]).map((p) => p.name)
)

const INSTALL_INVOCATION_RE = /\b(?:npm|pnpm|yarn|npx)\b\s+(?:install|i|add|dlx)\b([^&|;\n]*)/gi

export interface PackageInstallMatch {
  matched: boolean
  packageName: string | null
}

const PACKAGE_TOKEN_RE = /^@?[\w.-]+(?:\/[\w.-]+)?/

function packageNameFromToken(rawToken: string): string | null {
  if (!rawToken || rawToken.startsWith('-')) return null
  // Drop surrounding quotes/punctuation picked up from shell or JSON-embedded text.
  const match = rawToken.match(PACKAGE_TOKEN_RE)
  if (!match) return null
  const token = match[0]
  const atIndex = token.lastIndexOf('@')
  if (atIndex > 0) return token.slice(0, atIndex)
  return token
}

/** Extracts bare package names (version specifiers stripped) from install-style commands. */
export function extractInstallTargets(command: string): string[] {
  const targets: string[] = []
  const re = new RegExp(INSTALL_INVOCATION_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(command)) !== null) {
    const tokens = match[1].trim().split(/\s+/).filter(Boolean)
    for (const token of tokens) {
      const name = packageNameFromToken(token)
      if (name) targets.push(name)
    }
  }
  return targets
}

/** Checks a shell/MCP command string for installs of known-malicious packages. */
export function detectKnownMaliciousInstall(command: string): PackageInstallMatch {
  if (!command) return { matched: false, packageName: null }
  for (const target of extractInstallTargets(command)) {
    if (MALICIOUS_PACKAGE_NAMES.has(target)) {
      return { matched: true, packageName: target }
    }
  }
  return { matched: false, packageName: null }
}
