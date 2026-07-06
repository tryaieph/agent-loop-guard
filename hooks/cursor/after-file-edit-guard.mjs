#!/usr/bin/env node
// Cursor afterFileEdit — output-side guard for Agent file edits.
import {
  readStdin,
  loadDetectors,
  extractAfterFileEditContents,
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

for (const { content, filePath } of extractAfterFileEditContents(payload)) {
  const hit = scanContent(content, detectMaliciousCode)
  if (hit) {
    emitPostWriteFeedback(formatOutputDetection({ filePath, ...hit }))
  }
}

process.exit(0)
