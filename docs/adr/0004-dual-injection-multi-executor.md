# ADR-0004: Dual injection + multi-executor

## Status

**Accepted** (2026-08-30) — extends ADR-0001.

## Context

Operators want either:

1. **Repo inject** — plant Lawpack / stubs into the product git tree, or  
2. **Harness inject** — policy/Brief path into the coding agent at run time  

without forking every harness. Primary executor is DeepSeek Harness; others
(Claude Code, Pi coder, …) should plug in later via the same Brief.

## Decision

### Two first-class **law delivery** modes (per project or default in Settings)

| Mode ID | Name | Behavior |
|---------|------|----------|
| `repo_plant` | Repo inject (A-full / thin) | Init writes files into the product workdir; optional full `vendor/lawpack/` or thin stubs only |
| `harness_inject` | Harness inject (B-first) | Pin lives in control plane; at nudge, policy layer injects Brief + ephemeral/gitignored lawpack or prompt pack into the chosen executor |

Both ship. Default UI preference: **`harness_inject`**; **`repo_plant`** remains one click / Settings.

PROGRESS / BUGS / ADAPTER remain recommended product files in both modes
(run-owned truth). Absolute “zero files in repo” is allowed but discouraged.

### Executors

- **v1 target:** DeepSeek Harness (CLI / Host API / Docker).  
- **Later adapters:** same `SessionBrief` → Claude Code / Pi / others.  
- Kernel does **not** embed those products; each adapter maps Brief → that
  tool’s start/workdir/prompt conventions.

### Policy layer

Always used for **authorized start/nudge** when the control plane triggers a
run (even under `repo_plant`). Harness inject additionally supplies laws for
that session without requiring a committed vendor tree.

## Consequences

- Init wizard asks **injection mode**.  
- Orchestration calls `ExecutorPort.start(brief)` — DSH first implementation.  
- ADR-0001 “vendors a pin” means **pin is recorded**; materialization is either
  repo plant or harness inject (see [`operating-model.md`](../explanation/operating-model.md)).
