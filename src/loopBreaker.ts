import * as fs from 'node:fs'
import * as path from 'node:path'

export const DEFAULT_MAX_TOOL_CALLS = 150
export const DEFAULT_MAX_EDITS_PER_FILE = 15

export const STATE_DIR_NAME = '.agent-loop-guard/state'
export const CONFIG_FILE_NAME = '.agent-loop-guard/config.json'

export const EDIT_TOOLS = new Set(['Write', 'Edit'])

export const DENY_RESET_HINT =
  'Start a new session, delete .agent-loop-guard/state/, or run `agent-loop-guard reset`.'

export interface LoopBreakerConfig {
  maxToolCallsPerSession: number | null
  maxEditsPerFile: number | null
}

export interface SessionState {
  toolCallCount: number
  editCountsByFile: Record<string, number>
  toolCallCountsByTool: Record<string, number>
  firstCallAt?: string
  trippedAt?: string
  tripReason?: string
}

export interface TripBreakdown {
  totalToolCalls: number
  toolCallCountsByTool: Record<string, number>
  firstCallAt?: string
  trippedAt: string
}

export interface PreToolUsePayload {
  session_id?: string
  cwd?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
}

export interface PreToolUseResult {
  deny: boolean
  reason?: string
  exitCode: 0 | 2
  breakdown?: TripBreakdown
}

function guardRoot(cwd: string): string {
  return path.join(cwd, '.agent-loop-guard')
}

export function stateDirFor(cwd: string): string {
  return path.join(guardRoot(cwd), 'state')
}

export function configPathFor(cwd: string): string {
  return path.join(cwd, CONFIG_FILE_NAME)
}

export function statePathFor(cwd: string, sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_')
  return path.join(stateDirFor(cwd), `${safeId}.json`)
}

function parseLimit(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

export function loadConfig(
  cwd: string,
  readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')
): LoopBreakerConfig {
  const configPath = configPathFor(cwd)
  if (!fs.existsSync(configPath)) {
    return {
      maxToolCallsPerSession: DEFAULT_MAX_TOOL_CALLS,
      maxEditsPerFile: DEFAULT_MAX_EDITS_PER_FILE,
    }
  }
  try {
    const raw = JSON.parse(readFile(configPath)) as Record<string, unknown>
    return {
      maxToolCallsPerSession: parseLimit(raw.maxToolCallsPerSession, DEFAULT_MAX_TOOL_CALLS),
      maxEditsPerFile: parseLimit(raw.maxEditsPerFile, DEFAULT_MAX_EDITS_PER_FILE),
    }
  } catch {
    return {
      maxToolCallsPerSession: DEFAULT_MAX_TOOL_CALLS,
      maxEditsPerFile: DEFAULT_MAX_EDITS_PER_FILE,
    }
  }
}

export function emptyState(): SessionState {
  return { toolCallCount: 0, editCountsByFile: {}, toolCallCountsByTool: {} }
}

export function buildTripBreakdown(state: SessionState): TripBreakdown {
  return {
    totalToolCalls: state.toolCallCount,
    toolCallCountsByTool: state.toolCallCountsByTool,
    firstCallAt: state.firstCallAt,
    trippedAt: state.trippedAt ?? new Date().toISOString(),
  }
}

export function loadState(
  cwd: string,
  sessionId: string,
  readFile: (p: string) => string = (p) => fs.readFileSync(p, 'utf8')
): SessionState {
  const statePath = statePathFor(cwd, sessionId)
  if (!fs.existsSync(statePath)) return emptyState()
  try {
    const parsed = JSON.parse(readFile(statePath)) as SessionState
    return {
      toolCallCount: Number(parsed.toolCallCount) || 0,
      editCountsByFile: parsed.editCountsByFile ?? {},
      toolCallCountsByTool: parsed.toolCallCountsByTool ?? {},
      firstCallAt: parsed.firstCallAt,
      trippedAt: parsed.trippedAt,
      tripReason: parsed.tripReason,
    }
  } catch {
    return emptyState()
  }
}

export function saveState(
  cwd: string,
  sessionId: string,
  state: SessionState,
  writeFile: (p: string, data: string) => void = (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, data)
  }
): void {
  const statePath = statePathFor(cwd, sessionId)
  writeFile(statePath, JSON.stringify(state, null, 2) + '\n')
}

export function extractFilePath(payload: PreToolUsePayload): string | null {
  const input = payload.tool_input
  if (!input || typeof input !== 'object') return null
  const filePath = input.file_path ?? input.path
  return typeof filePath === 'string' && filePath.length > 0 ? filePath : null
}

export function formatDenyMessage(reason: string, breakdown?: TripBreakdown): string {
  const lines = [`Loop breaker tripped: ${reason}. Review the session transcript.`]
  if (breakdown) {
    const byTool = Object.entries(breakdown.toolCallCountsByTool)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name}: ${count}`)
      .join(', ')
    const period = breakdown.firstCallAt
      ? `${breakdown.firstCallAt} to ${breakdown.trippedAt}`
      : breakdown.trippedAt
    lines.push(
      `Breakdown: ${breakdown.totalToolCalls} tool call(s) total` +
        (byTool ? ` (${byTool})` : '') +
        ` over ${period}.`
    )
  }
  lines.push(DENY_RESET_HINT)
  return lines.join('\n')
}

export function formatStderrLineForTty(message: string, isTty = process.stderr.isTTY): string {
  if (isTty) return `\x1b[31m${message}\x1b[0m`
  return message
}

export function evaluateAfterIncrement(
  state: SessionState,
  config: LoopBreakerConfig,
  toolName: string,
  filePath: string | null
): { trip: boolean; reason?: string } {
  if (config.maxToolCallsPerSession !== null && state.toolCallCount > config.maxToolCallsPerSession) {
    return {
      trip: true,
      reason: `session tool call limit exceeded (${state.toolCallCount} > ${config.maxToolCallsPerSession})`,
    }
  }

  if (filePath && EDIT_TOOLS.has(toolName) && config.maxEditsPerFile !== null) {
    const edits = state.editCountsByFile[filePath] ?? 0
    if (edits > config.maxEditsPerFile) {
      return {
        trip: true,
        reason: `edit limit for ${filePath} exceeded (${edits} > ${config.maxEditsPerFile})`,
      }
    }
  }

  return { trip: false }
}

export function processPreToolUse(
  payload: PreToolUsePayload,
  cwd: string = payload.cwd || process.cwd()
): PreToolUseResult {
  const sessionId = payload.session_id
  if (!sessionId) return { deny: false, exitCode: 0 }

  const config = loadConfig(cwd)
  let state = loadState(cwd, sessionId)

  if (state.trippedAt) {
    const reason = state.tripReason ?? 'session already tripped'
    return { deny: true, reason, exitCode: 2, breakdown: buildTripBreakdown(state) }
  }

  const now = new Date().toISOString()
  if (state.toolCallCount === 0) {
    state.firstCallAt = now
  }
  state.toolCallCount += 1

  const toolName = payload.tool_name ?? ''
  const filePath = extractFilePath(payload)
  state.toolCallCountsByTool[toolName] = (state.toolCallCountsByTool[toolName] ?? 0) + 1
  if (filePath && EDIT_TOOLS.has(toolName)) {
    state.editCountsByFile[filePath] = (state.editCountsByFile[filePath] ?? 0) + 1
  }

  const verdict = evaluateAfterIncrement(state, config, toolName, filePath)
  if (verdict.trip) {
    state.trippedAt = now
    state.tripReason = verdict.reason
    saveState(cwd, sessionId, state)
    return { deny: true, reason: verdict.reason, exitCode: 2, breakdown: buildTripBreakdown(state) }
  }

  saveState(cwd, sessionId, state)
  return { deny: false, exitCode: 0 }
}

export function resetState(cwd: string = process.cwd()): void {
  const dir = stateDirFor(cwd)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
