import * as fs from 'node:fs'
import * as path from 'node:path'

export type GuardSource = 'claude-code' | 'cursor' | 'pre-commit' | 'ci'
export type GuardEventType = 'pre-exec-block' | 'post-write-scan' | 'commit-scan'

export interface GuardFinding {
  rule_id: string
  category?: string
  line?: number
}

export interface GuardEvent {
  source: GuardSource
  event: GuardEventType
  file_path?: string
  findings: GuardFinding[]
  rule_ids: string[]
  session_id?: string
  iteration?: number
  timestamp: string
}

export interface CreateGuardEventInput {
  source: GuardSource
  event: GuardEventType
  file_path?: string
  findings?: GuardFinding[]
  session_id?: string
  iteration?: number
}

export const EVENTS_FILE_NAME = '.agent-loop-guard/events.jsonl'

export function eventsPathFor(cwd: string): string {
  return path.join(cwd, EVENTS_FILE_NAME)
}

/** Builds a GuardEvent from partial input, deriving rule_ids from findings. */
export function normalizeGuardEvent(input: CreateGuardEventInput): GuardEvent {
  const findings = input.findings ?? []
  return {
    source: input.source,
    event: input.event,
    file_path: input.file_path,
    findings,
    rule_ids: findings.map((f) => f.rule_id),
    session_id: input.session_id,
    iteration: input.iteration,
    timestamp: new Date().toISOString(),
  }
}

/** Appends a single GuardEvent as one JSON line to .agent-loop-guard/events.jsonl. */
export function appendGuardEvent(
  event: GuardEvent,
  cwd: string = process.cwd(),
  writeLine: (p: string, line: string) => void = (p, line) => {
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.appendFileSync(p, line)
  }
): void {
  writeLine(eventsPathFor(cwd), `${JSON.stringify(event)}\n`)
}
