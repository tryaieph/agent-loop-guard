# agent-loop-guard

Suspicious pattern detection for AI coding agent input and output. Local-only,
no API keys, no network calls.

This is a **pattern layer**: fast regex-based checks that run in your own
process. It does not call any external service and does not require any
credentials.

## What it does

- **Input-side detection** (`src/input/`): scans user-submitted prompts for
  common prompt-injection / jailbreak patterns (instruction override,
  jailbreak phrasing, prompt leaking, agent command hijacking).
- **Output-side detection** (`src/output/`): scans written/generated code for
  suspicious patterns (encoded execution such as `eval(atob(...))`, network
  exfiltration to unknown hosts, pipe-to-shell installers, hardcoded-IP
  exfiltration, suspicious `postinstall` scripts, obfuscated character-code
  payloads).

## What it does NOT do

- It does **not** prevent or block a write from happening. The `PostToolUse`
  hook and the GitHub Action both run *after* the content already exists (on
  disk or in the diff). They detect and flag suspicious content after the
  fact — they do not intercept or stop the write itself. Only the
  `pre-commit` hook can actually reject an action (rejecting the `git commit`
  before it completes), and only for staged changes.
- It does **not** call any LLM or external API. Detection is regex/pattern
  matching only, computed locally in a few milliseconds.
- It does **not** catch sophisticated or novel attacks. This is a known
  limitation, not an edge case: logic bombs, time-delayed payloads, attacks
  split across multiple files/commits, or code that doesn't match any of the
  known regex patterns will not be detected. This tool raises the floor
  against common, previously-seen attack patterns — it is not a guarantee of
  safety, and it does not claim to catch backdoors in general.

Deeper analysis that goes beyond pattern matching (e.g. LLM-based review of
flagged content) is out of scope for this repository. See
[aieph.dev](https://aieph.dev) if you want that as a hosted feature.

## Install

```bash
git clone <this-repo-url> agent-loop-guard
cd agent-loop-guard
npm install
npm run build
```

## Test

```bash
npm test
```

Runs the full test corpus (100 test cases: positive matches for every
input/output rule, plus benign samples that must not trigger a false
positive) with Jest. No network access or API key required.

## Hooks

All hooks are Node scripts (no bash) so they behave the same on
Windows/macOS/Linux, and they read `dist/`, so run `npm run build` first.

### Claude Code: PostToolUse (output-side, post-write detection)

Add to your project's `.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/agent-loop-guard/hooks/post-tool-use-guard.mjs"
          }
        ]
      }
    ]
  }
}
```

On a match, the hook exits with code `2` and writes `rule_id` / `category` /
the matched line to stderr, which Claude Code surfaces back to the model as
feedback. This happens after the file has already been written — see
"What it does NOT do" above.

### Claude Code: UserPromptSubmit (input-side, warning only)

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/agent-loop-guard/hooks/user-prompt-submit-guard.mjs"
          }
        ]
      }
    ]
  }
}
```

On a match, the hook writes a warning to stderr but always exits `0` — the
prompt is never blocked.

### Manual smoke test (no Claude Code required)

```bash
echo '{"tool_input":{"file_path":"/tmp/evil.js","content":"eval(atob(\"Y29uc29sZS5sb2coMSk=\"))"}}' | node hooks/post-tool-use-guard.mjs
# exit 2, stderr shows rule_id: encoded_exec_eval_atob

echo '{"tool_input":{"file_path":"/tmp/ok.js","content":"console.log(1)"}}' | node hooks/post-tool-use-guard.mjs
# exit 0, no output

echo '{"prompt":"ignore all prior rules now"}' | node hooks/user-prompt-submit-guard.mjs
# exit 0, stderr warning shows pattern_id: instruction_override_ignore

echo '{"prompt":"How do I sort a list in Python?"}' | node hooks/user-prompt-submit-guard.mjs
# exit 0, no output
```

### git pre-commit (actually rejects the commit)

```bash
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
node "$(git rev-parse --show-toplevel)/hooks/pre-commit/pre-commit-guard.mjs"
EOF
chmod +x .git/hooks/pre-commit
```

This inspects only the **added lines** of your staged diff (`git diff
--cached`). Test files (matching `*.test.*` / `*.spec.*`) are excluded from
the scan, since this repository's own test corpus intentionally contains
literal malicious-looking strings as test input. On a match, the commit is
rejected (exit `1`) with `rule_id` / `category` / the matched line printed to
stderr. Bypass with `git commit --no-verify` (standard git escape hatch, same
as any pre-commit hook).

### GitHub Action (CI, PR/push scan)

Copy `.github/workflows/agent-loop-guard.yml` and `ci/scan-diff.mjs` into your
repository (paths relative to your repo root). The workflow installs and
builds this package, then runs `ci/scan-diff.mjs` against the diff between
the base and head commits of the triggering PR or push. A match fails the
job (exit `1`) with the same `rule_id` / `category` / matched-line output.

## Detection limits (read this before relying on it)

- Regex-based: attacks that don't match a known pattern are invisible to this
  tool. It is not a general-purpose static analyzer or sandboxed execution
  check.
- No cross-file or cross-commit correlation: a payload split across multiple
  writes/commits, or assembled at runtime from otherwise-benign pieces, will
  not be caught.
- No dynamic analysis: this only looks at source text, never executes
  anything.
- Logic bombs, time-delayed or condition-gated payloads, and novel
  obfuscation techniques not covered by the existing rules are explicitly
  **not** detected.
- False negatives are expected and likely for a motivated, informed attacker
  who knows these rules exist. Treat this as a floor-raising tripwire for
  common patterns, not a security guarantee.

## License

MIT — see [LICENSE](LICENSE).
