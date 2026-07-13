# Cursor setup guide

This guide is written for someone who has never configured a Cursor hook
before. It covers installing agent-loop-guard's Cursor adapter, verifying it
runs, and understanding exactly what it does (and does not) do.

## What you're installing

Three Cursor hooks, all pointed at one command
(`agent-loop-guard cursor-hook`):

| Cursor hook | What it does | Can it block? |
|-------------|---------------|----------------|
| `afterFileEdit` | Scans the text the Agent just wrote and records a note in `.agent-loop-guard/events.jsonl` if it matches a known-bad pattern. | **No.** This hook fires *after* the write; Cursor does not let it block anything. It only detects and records. |
| `beforeShellExecution` | Checks shell commands for installs of a small list of packages with a documented history of malicious npm publishes (e.g. `npm install <package>`). | **Yes.** A match blocks the command. |
| `beforeMCPExecution` | Same known-malicious-package check, applied to MCP tool calls that carry a shell-like command in their input. | **Yes.** A match blocks the tool call. |

## 1. Prerequisites

- Node.js installed (`node -v` should print a version).
- Cursor installed and able to run an Agent session.
- A local clone of this repository, built once:

```bash
git clone https://github.com/tryaieph/agent-loop-guard.git ~/agent-loop-guard
cd ~/agent-loop-guard
npm install
npm run build
```

`npm run build` compiles `src/` into `dist/`. The hook command reads from
`dist/`, so this step is required before the hook will work.

## 2. Create your `.cursor/hooks.json`

Copy the template shipped in this repo:

```bash
mkdir -p .cursor
cp ~/agent-loop-guard/adapters/cursor/hooks.json .cursor/hooks.json
```

Open `.cursor/hooks.json` and replace every `ABSOLUTE_PATH_TO` with the
absolute path to where you cloned this repo. For example, if you cloned it to
`/Users/alice/agent-loop-guard`, each `command` line becomes:

```json
"node /Users/alice/agent-loop-guard/bin/agent-loop-guard.mjs cursor-hook"
```

You can place this file at:

- `<your project>/.cursor/hooks.json` — applies to that project only, and can
  be committed to version control so your team gets it too.
- `~/.cursor/hooks.json` (your home directory) — applies to every project you
  open in Cursor.

## 3. Restart Cursor

Cursor watches `hooks.json` and usually reloads it automatically. If you don't
see it take effect, fully quit and reopen Cursor.

## 4. Verify it's active

1. In Cursor, open **Customize → Hooks**. You should see `afterFileEdit`,
   `beforeShellExecution`, and `beforeMCPExecution` listed, each pointing at
   your `agent-loop-guard cursor-hook` command.
2. There's also a **Hooks** output channel that logs each hook invocation and
   any errors — useful if a hook silently isn't firing.

## 5. Test it without waiting for the Agent

You can invoke the same command Cursor uses directly, from a terminal, to
confirm it behaves correctly before trusting it in a live session.

**Simulate `afterFileEdit` detecting a suspicious edit:**

```bash
echo '{"hook_event_name":"afterFileEdit","file_path":"/tmp/evil.js","edits":[{"old_string":"","new_string":"eval(atob(\"x\"))"}]}' \
  | node /Users/alice/agent-loop-guard/bin/agent-loop-guard.mjs cursor-hook
echo "exit code: $?"
```

Expected: exit code `0` (it never blocks), and a new line appended to
`.agent-loop-guard/events.jsonl` in your current directory recording the
finding.

**Simulate `beforeShellExecution` blocking a known-malicious install:**

```bash
echo '{"hook_event_name":"beforeShellExecution","command":"npm install node-ipc"}' \
  | node /Users/alice/agent-loop-guard/bin/agent-loop-guard.mjs cursor-hook
echo "exit code: $?"
```

Expected: exit code `2`, a JSON `{"permission":"deny", ...}` response on
stdout, and a matching line in `.agent-loop-guard/events.jsonl`.

**Simulate a benign install (should pass through):**

```bash
echo '{"hook_event_name":"beforeShellExecution","command":"npm install express"}' \
  | node /Users/alice/agent-loop-guard/bin/agent-loop-guard.mjs cursor-hook
echo "exit code: $?"
```

Expected: exit code `0`, no output.

## What gets recorded, and where

Every time a hook detects something, it appends one JSON line to
`.agent-loop-guard/events.jsonl` in the current project directory. This file
is local only — nothing is sent over the network. Delete it any time; it will
be recreated on the next detection.

## Limitations

- The known-malicious-package list in this adapter is a small, static,
  offline list of packages with a documented history of malicious npm
  publishes. It is not a live vulnerability database and will not catch
  packages outside that list.
- `afterFileEdit` is informational only — by the time it runs, the file is
  already written. Treat its findings as something to review, not as
  evidence that nothing bad happened.
- This adapter does not watch the filesystem outside of the hooks Cursor
  invokes; it only reacts to the events Cursor sends it.
