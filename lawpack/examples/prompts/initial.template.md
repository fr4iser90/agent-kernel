================================================================
INITIAL — {{PRODUCT_NAME}}
================================================================

Harness: DeepSeek Harness (DSH). Unattended. Obey vendor/agent-kernel LAWS.md
and roles/. Never ask. Human kills to stop.

## Repo / branch

- Workdir: this product clone only.
- **RUN_ID (fixed):** `agent/{{slug}}-{{YYYYMMDD}}`
- Create once: `git fetch && git checkout -B agent/{{slug}}-{{YYYYMMDD}} origin/main`
  (or origin/baseline if product uses it).
- **FORBIDDEN:** second agent branch (`-v2`, `-p*`, `-rebased`, new PR fork).

## Stack (pin now)

- {{stack_pin}}
- Gate: `{{gate_command}}`
- Adapter notes: ADAPTER.md

## Tracking

Create/maintain: PROGRESS.md (NOW), BUGS.md (Open/Fixed), ADR only on pivots.

## Objective

{{1-3 paragraphs: what “done” looks like for this run}}

## Milestones (finite or open)

{{M1…Mn with measurable ACCEPT each}}

## Out of scope

{{list}}

## First actions

1. Read LAWS + OWNED_PATHS + ADAPTER.
2. Write PROGRESS NOW with RUN_ID + stack pin.
3. Implement M1 only → gate → commit → push same RUN_ID.
4. Leave a next tool call.
