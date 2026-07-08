#!/usr/bin/env node
// Cursor postToolUse — output-side guard (Write|Edit). Detects and flags after write.
import {
  readStdin,
  loadDetectors,
  extractPostToolUseContent,
  emitFlagExit,
  scanContent,
} from './_shared.mjs'

const { detectMaliciousCode } = loadDetectors()

const raw = await readStdin()
let payload
try {
  payload = JSON.parse(raw)
} catch {
  process.exit(0)
}

const { content } = extractPostToolUseContent(payload)
const hit = scanContent(content, detectMaliciousCode)
if (!hit) {
  process.exit(0)
}

emitFlagExit(hit.ruleId)
