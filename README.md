# agent-kernel

**Autonomy operating law** for agentic coding — stack-agnostic.

This repo is **not** an app, not Vite, not a game scaffold. It is the
**Kernel**: branch rules, roles, ownership, gates, and prompt templates you
plant into real product repos. Proven patterns come from the
[autonomous-lab](https://github.com/fr4iser90/autonomous-lab) experiment
(Ashen Delve); the lab stays a showcase — this kernel is what you reuse.

## Layers (do not mix)

| Layer | Job | Lives in |
|-------|-----|----------|
| **Kernel** | Laws, roles, protect scripts, cycles | **this repo** → copied/submoduled into products |
| **Adapter** | `gate` command, smoke, deploy URL, stack pin | each **product** repo (`adapters/` stubs here) |
| **Harness** | Tool loop, edits, shell, approvals | **DeepSeek Harness (DSH)** (+ VS Code extension) |
| **IDE** | Editor, diffs, language diagnostics | **VS Code** (Cursor optional / leaving) |

MCP / LSP / codegraph are **optional tools** plugged into the harness — they
do not replace this law.

## Quick map

| Doc | Purpose |
|-----|---------|
| [`LAWS.md`](LAWS.md) | Branch model, RUN_ID, cycle, human-only CI, lie detector |
| [`OWNED_PATHS.md`](OWNED_PATHS.md) | What agents must never edit (override per product) |
| [`RUNTIME.md`](RUNTIME.md) | DSH + VS Code + local gate vs remote CI |
| [`MIGRATION.md`](MIGRATION.md) | How to attach kernel to an existing product |
| [`roles/`](roles/) | Machine roles: followup, fix, feature, validate, demo, arch |
| [`adapters/`](adapters/) | Per-stack stubs (web, python, …) — fill `gate` only |
| [`examples/prompts/`](examples/prompts/) | Initial + Followup templates |
| [`scripts/`](scripts/) | `protect-owned-paths`, `assert-run-id` (pre-commit / gate) |

## Design goals

1. **One run = one branch** — no `-v2` / `-p*` / `-rebased` forks.
2. **FIX → VALIDATE cadence → FEATURE** — playability before novelty.
3. **Measurable ACCEPT** — Δposition, screenshots + vision, not vibes.
4. **Protect locally** — owned-path + RUN_ID checks in pre-commit/`gate`; CI is backup.
5. **Stack-agnostic** — product picks adapter; kernel never assumes Vite.

## Status

Spec v0 — documentation + stub scripts. Wire hooks into one non-lab product
before expanding (LSP MCP, codegraph, more roles).

## Related

- Showcase / experiment: `fr4iser90/autonomous-lab` (leave running; do not
  rewrite it into this kernel).
- Harness: [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
  + VS Code DSH extensions (embed `dsh web` / native workbench).
