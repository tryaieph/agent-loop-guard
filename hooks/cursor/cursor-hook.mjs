#!/usr/bin/env node
// Unified Cursor hook entry point (run via `agent-loop-guard cursor-hook`).
// Reads one JSON payload from stdin and branches on hook_event_name:
//   afterFileEdit        -> informational scan, records findings, always exit 0 (cannot block)
//   beforeShellExecution -> known-malicious-package install check, exit 2 to block
//   beforeMCPExecution   -> known-malicious-package install check, exit 2 to block
//   anything else        -> no-op, exit 0 (fail open)
import { createRequire } from 'node:module'
import {
  readStdin,
  loadDetectors,
  extractAfterFileEditContents,
  scanContent,
} from './_shared.mjs'

const require = createRequire(import.meta.url)
const { detectKnownMaliciousInstall } = require('../../dist/security/packageInstallDetector.js')
const { normalizeGuardEvent, appendGuardEvent } = require('../../dist/events/schema.js')

function tryParseJson(value) {
  if (typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function commandTextFor(payload) {
  if (typeof payload.command === 'string') return payload.command
  // beforeMCPExecution: tool_name + tool_input (JSON-stringified params)
  const toolInput = typeof payload.tool_input === 'string' ? payload.tool_input : ''
  return [payload.tool_name ?? '', toolInput].filter(Boolean).join(' ')
}

function handleAfterFileEdit(payload) {
  const { detectMaliciousCode } = loadDetectors()
  const findings = []
  for (const { content } of extractAfterFileEditContents(payload)) {
    const hit = scanContent(content, detectMaliciousCode)
    if (hit) findings.push({ rule_id: hit.ruleId, category: hit.category, line: hit.lineNumber })
  }
  if (findings.length > 0) {
    appendGuardEvent(
      normalizeGuardEvent({
        source: 'cursor',
        event: 'post-write-scan',
        file_path: payload.file_path,
        findings,
        session_id: payload.conversation_id,
      })
    )
  }
  // afterFileEdit is fire-and-forget: no output field can block it.
  process.exit(0)
}

function handleBeforeExec(payload, eventLabel) {
  const command = commandTextFor(payload)
  const result = detectKnownMaliciousInstall(command)
  if (!result.matched) {
    process.exit(0)
  }

  appendGuardEvent(
    normalizeGuardEvent({
      source: 'cursor',
      event: 'pre-exec-block',
      findings: [{ rule_id: `known_malicious_package_${result.packageName}` }],
      session_id: payload.conversation_id,
    })
  )

  const message = `agent-loop-guard: blocked install of known-malicious package "${result.packageName}" (${eventLabel})`
  process.stdout.write(JSON.stringify({
    permission: 'deny',
    user_message: message,
    agent_message: message,
  }))
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

export async function runCursorHook() {
  const raw = await readStdin()
  const payload = tryParseJson(raw)
  if (!payload) {
    process.exit(0)
  }

  switch (payload.hook_event_name) {
    case 'afterFileEdit':
      handleAfterFileEdit(payload)
      break
    case 'beforeShellExecution':
    case 'beforeMCPExecution':
      handleBeforeExec(payload, payload.hook_event_name)
      break
    default:
      process.exit(0)
  }
}
