# agent-loop-guard

**Pattern-based guard for AI coding workflows.**

Local regex pattern detection for AI coding agent input and output. Works with
**Claude Code**, **Cursor**, **git pre-commit**, and **GitHub Actions**.

✓ 109 tests pass · ✓ 0 runtime dependencies · ✓ no network calls in detection runtime

## Install

```bash
git clone https://github.com/tryaieph/agent-loop-guard.git agent-loop-guard
cd agent-loop-guard
npm install
npm run build
```

## Quick Start

```bash
git clone https://github.com/tryaieph/agent-loop-guard.git agent-loop-guard
cd agent-loop-guard
npm install && npm run build && npm test
npm run setup:cursor   # writes ./.cursor/hooks.json — restart Cursor
```

Smoke-test the output hook without an editor:

```bash
echo '{"tool_input":{"file_path":"/tmp/evil.js","content":"eval(atob(\"Y29uc29sZS5sb2coMSk=\"))"}}' \
  | node hooks/post-tool-use-guard.mjs
# exit 2 — suspicious pattern detected and flagged after write
```

## Why

AI coding assistants can generate unsafe code, and prompts can be shaped by
injection patterns to steer the agent. A lightweight detection layer that runs
in your own process helps surface known-bad patterns early — as warnings on
input and flags on output — without replacing your editor, CI, or review
workflow.

This tool **detects and flags**; it does not claim to prevent every unsafe
write. Post-write hooks run after the file is already on disk. Treat matches as
signals to review, not as proof of safety.

## How it works

The **pattern layer** is the core of this project:

- **Deterministic regex** — fixed rules compiled to `RegExp`, evaluated in
  order. Same input always yields the same result.
- **No LLM** — detection never calls a language model or external API.
- **No sandbox** — source text is scanned only; nothing is executed.
- **Local-only runtime** — hooks and `src/` contain no `fetch`, HTTP client,
  or outbound network calls (verified by repo grep; rule patterns themselves
  match network-related *strings* in code).

| Tool | Approach | Typical role |
|------|----------|--------------|
| [Semgrep](https://semgrep.dev/) | Static analysis with rich rule language | Deep, configurable SAST in CI |
| [CodeQL](https://codeql.github.com/) | Deep semantic / data-flow analysis | Comprehensive security queries |
| **agent-loop-guard** | Fast regex tripwire | Lightweight guard in agent hooks, pre-commit, and CI |

Each tool fits a different layer. This project optimizes for speed and zero
credentials inside the agent loop — not for replacing Semgrep or CodeQL.

**Exit code 2** is reserved for flagged-after-write: the write has already
happened; the flag is surfaced to the agent/CI, not used to block the write
itself. Clean scans exit `0`. Git pre-commit and GitHub Actions use exit `1`
to reject a commit or fail a job on staged/PR diffs.

## Hooks

All hooks are Node scripts (no bash) and read compiled output from `dist/` —
run `npm run build` first.

### Claude Code

**PostToolUse** (output, post-write detect & flag) — add to
`.claude/settings.json`:

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

On match: exit **`2`**, stderr flag
(`agent-loop-guard: suspicious pattern detected and flagged after write
(rule: <rule_id>) — review before use`).

**UserPromptSubmit** (input, warning only):

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

On match: warning to stderr, always exit `0` — the prompt is not stopped.

### Cursor

Project-level install:

```bash
npm run setup:cursor
# writes ./.cursor/hooks.json with absolute paths — restart Cursor
```

User-level install: `npm run setup:cursor:user`

| Cursor hook | Role | On match |
|-------------|------|----------|
| `beforeSubmitPrompt` | Input pattern scan | Warning only — `continue: true` |
| `postToolUse` (Write\|Edit) | Output scan | Exit `2` + stderr flag |
| `afterFileEdit` | Output scan of `new_string` | Stderr + `additional_context` (exit `0`) |

Manual template: `.cursor/hooks.json.example` (replace `ABSOLUTE_PATH_TO`).

### git pre-commit

Scans **added lines** in the staged diff (`git diff --cached`). Test files
(`*.test.*`, `*.spec.*`) and `*.md` are excluded. On match: exit `1`, commit
rejected. Bypass: `git commit --no-verify`.

```bash
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
node "$(git rev-parse --show-toplevel)/hooks/pre-commit/pre-commit-guard.mjs"
EOF
chmod +x .git/hooks/pre-commit
```

### GitHub Actions

Copy `.github/workflows/agent-loop-guard.yml` and `ci/scan-diff.mjs` into your
repo. The workflow builds this package and runs `ci/scan-diff.mjs` on the PR or
push diff. On match: job fails (exit `1`).

## Architecture

```
                    ┌─────────────────────────────────────┐
  user prompt ─────►│ beforeSubmitPrompt /                │
                    │ UserPromptSubmit                    │
                    │   input regex scan (warning only)   │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                              AI agent
                                   │
                                   ▼
                         file write (Write/Edit)
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │ postToolUse / afterFileEdit /       │
                    │ PostToolUse                         │
                    │   output regex scan                 │
                    │   → detect & flag (exit 2, stderr)  │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                            git commit
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │ pre-commit hook                     │
                    │   scan staged additions → exit 1    │
                    └──────────────┬──────────────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────────────┐
                    │ GitHub Actions (ci/scan-diff.mjs)   │
                    │   scan PR/push diff → exit 1        │
                    └─────────────────────────────────────┘
```

## Detection rules

Rules are defined in `src/input/patterns.ts` (input) and
`src/output/malicious-code-rules.json` (output).

### Input — prompt injection / jailbreak (`src/input/patterns.ts`)

| Rule ID | Category |
|---------|----------|
| `instruction_override_ignore` | Instruction override |
| `instruction_override_disregard` | Instruction override |
| `instruction_override_forget` | Instruction override |
| `instruction_override_do_not_follow` | Instruction override |
| `jailbreak_new_mode` | Jailbreak |
| `jailbreak_act_as` | Jailbreak |
| `jailbreak_pretend` | Jailbreak |
| `jailbreak_dan` | Jailbreak |
| `prompt_leak_reveal` | Prompt leaking |
| `prompt_leak_show` | Prompt leaking |
| `prompt_leak_print` | Prompt leaking |
| `agent_command_forward` | Agent command hijacking |
| `agent_command_send_to` | Agent command hijacking |
| `agent_command_exfil` | Agent command hijacking |
| `override_response_format` | Response-format override |
| `override_response_format_2` | Response-format override |
| `override_response_format_3` | Response-format override |

### Output — suspicious code patterns (`src/output/malicious-code-rules.json`)

| Rule ID | Category |
|---------|----------|
| `encoded_exec_eval_atob` | `encoded_execution` |
| `encoded_exec_function_atob` | `encoded_execution` |
| `encoded_exec_base64_buffer` | `encoded_execution` |
| `unknown_domain_fetch` | `network_exfiltration` |
| `unknown_domain_xhr` | `network_exfiltration` |
| `curl_pipe_bash` | `pipe_execution` |
| `wget_pipe_sh` | `pipe_execution` |
| `hardcoded_ip_send` | `hardcoded_ip_exfiltration` |
| `hardcoded_ip_socket` | `hardcoded_ip_exfiltration` |
| `suspicious_postinstall_curl` | `suspicious_postinstall` |
| `suspicious_postinstall_download_exec` | `suspicious_postinstall` |
| `obfuscated_hex_charcode` | `obfuscation` |
| `obfuscated_unescape_percent` | `obfuscation` |

## Limitations

- **Regex-only** — attacks that do not match a known pattern are invisible.
  Not a general-purpose static analyzer or execution sandbox.
- **No cross-file / cross-commit correlation** — payloads split across writes
  or assembled at runtime from benign pieces are not caught.
- **No dynamic analysis** — source text only; nothing is run.
- **Novel obfuscation** — logic bombs, time-delayed payloads, and techniques
  outside the rule set are not detected.
- **False negatives** — expected for a motivated attacker who knows the rules.
  This raises the floor for common patterns; it is not a safety guarantee.

### False positives

Literal malicious-looking strings are intentional in security research repos,
CTF challenges, malware-analysis sandboxes, and this project's own test corpus.
You may see flags on benign educational or research content that happens to
match a rule. Review flagged lines in context; adjust hook placement or exclude
paths (e.g. pre-commit already skips `*.test.*` and `*.md`) where appropriate.

**Supported platforms:** macOS and Linux (tested). Windows via
[WSL2](https://learn.microsoft.com/en-us/windows/wsl/) recommended; native
Windows is not verified.

## Hosted (aieph.dev)

Hosted LLM-assisted review is intentionally outside the scope of this
project. This repository stays local, deterministic, and credential-free.

If you want deeper, LLM-assisted review of flagged content as a managed
service, see [aieph.dev](https://aieph.dev).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 AIeph.
