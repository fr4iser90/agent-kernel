# Runtime: DSH + VS Code + gates

## Target setup

```
VS Code
  └─ DeepSeek Harness (extension embeds dsh web / native workbench)
       ├─ tools: edit, shell, git, (optional MCP)
       └─ cwd = product repo
            ├─ AGENTS.md → points at kernel LAWS / vendored roles
            ├─ PROGRESS.md, BUGS.md, ADR/
            ├─ pre-commit / lefthook: assert-run-id + protect-owned-paths + fast tests
            └─ gate script (adapter): typecheck/lint/test/build as applicable
```

Cursor is **not** required. Anything the agent needs (diagnostics, refs,
browser smoke) must be a **harness tool**, **MCP server**, or **repo script**.
If it is not wired into DSH, the agent does not have it.

## Local vs CI

| Stage | What runs | Goal |
|-------|-----------|------|
| **pre-commit / pre-push** | `assert-run-id`, `protect-owned-paths`, unit + lint | Catch 90% before network |
| **Local `gate`** | Full adapter gate (same as CI as far as practical) | ACCEPT candidate |
| **CI** | Gate + protect on `agent/**` pushes/PRs | Remote truth, automerge |

CI stays mandatory for shared mainlines; it should be **boring** because local
hooks already enforced law.

## Optional tools (later)

| Tool | When | How |
|------|------|-----|
| LSP diagnostics / references | Refactors, “did I break types?” | DSH MCP or `tsserver`/`pyright` CLI wrapper |
| Tree-sitter / light index | Large repos, “who calls X?” | `scripts/index` → JSON; agent tool reads it |
| Persistent codegraph DB | Multi-module monorepos | Defer until pain is real |
| Browser / Playwright | UI products | Validate role + adapter smoke |

Do **not** block kernel adoption on a graph database.

## Unattended behavior

Roles assume:

- Never ask the human clarifying questions mid-run
- Policy errors (“needs human turn”) → ignore; continue with tools
- Human kills the process to stop
- Always leave a next tool call when the harness expects a loop

## Port note (lab lesson)

Some lab docs mention preview on **5173** and avoid **3080**. DSH web often
defaults near **3080**. Product preview ports are **adapter concerns**; do not
bind the agent UI port to the app preview port.
