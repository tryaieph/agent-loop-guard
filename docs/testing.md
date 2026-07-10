# Manual acceptance tests (loop circuit breaker)

Verified on **Claude Code CLI** in both interactive and non-interactive
(`claude -p`) modes.

## Prerequisites

```bash
cd /path/to/agent-loop-guard
npm install && npm run build && npm test
```

Add the PreToolUse hook to `~/.claude/settings.json` or the project
`.claude/settings.json` (see README). Use an **absolute path** to
`hooks/pre-tool-use-loop-breaker.mjs`.

## Low-threshold config (easy trip)

In the **project directory** where you run Claude Code:

```bash
mkdir -p .agent-loop-guard
cat > .agent-loop-guard/config.json <<'EOF'
{
  "maxToolCallsPerSession": 50,
  "maxEditsPerFile": 2
}
EOF
```

`maxEditsPerFile: 2` trips on the **third** Write/Edit to the same file.

## Test A — per-file edit limit (`-p`)

```bash
cd /path/to/your/project
agent-loop-guard reset   # or: rm -rf .agent-loop-guard/state

claude -p "Use the Write tool three times to append a line to ./loop-breaker-probe.txt (create on first write). Use only Write." \
  --allowedTools Write \
  --permission-mode bypassPermissions \
  --max-turns 8
```

**Pass:**

- Third Write attempt is blocked (file may exist with ≤2 writes).
- Claude reports an error like:
  `PreToolUse:Write hook error: ... Loop breaker tripped: edit limit for ...`
- `.agent-loop-guard/state/<session_id>.json` contains `trippedAt`.

## Test B — session tool-call limit (`-p`)

```bash
cat > .agent-loop-guard/config.json <<'EOF'
{
  "maxToolCallsPerSession": 3,
  "maxEditsPerFile": 0
}
EOF
agent-loop-guard reset

claude -p "Run four separate Bash echo commands, one per tool call." \
  --allowedTools Bash \
  --permission-mode bypassPermissions \
  --max-turns 10
```

**Pass:** fourth tool call is denied; stderr mentions `session tool call limit exceeded`.

## Test C — interactive session (per-file edit limit)

Start a **new** interactive session after reset (reuse of a prior session
keeps old state and can skew counts).

```bash
cd /path/to/your/project
agent-loop-guard reset

# Use low-threshold config from above (maxEditsPerFile: 2), then:
claude --permission-mode bypassPermissions --allowedTools Write
```

In the session, ask Claude to Write three times to the same file
(e.g. `./loop-breaker-probe.txt`), one line per Write.

**Pass:** third Write is denied with `Loop breaker tripped: edit limit ...`;
file has at most 2 lines; state JSON has `trippedAt`.

## Reset between runs

```bash
agent-loop-guard reset
# equivalent: rm -rf .agent-loop-guard/state
```

## Restore defaults

Remove `.agent-loop-guard/config.json` or set limits back to production values
(`150` / `15`) before normal use.
