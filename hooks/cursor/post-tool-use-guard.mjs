#!/usr/bin/env node
// Cursor postToolUse — output-side guard (Write|Edit). Post-write detection only.
import {
  readStdin,
  loadDetectors,
  extractPostToolUseContent,
  formatOutputDetection,
  emitPostWriteFeedback,
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

const { content, filePath } = extractPostToolUseContent(payload)
const hit = scanContent(content, detectMaliciousCode)
if (!hit) {
  process.exit(0)
}

emitPostWriteFeedback(formatOutputDetection({ filePath, ...hit }))
