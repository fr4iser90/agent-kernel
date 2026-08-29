# boilerstuff — plantable autonomy law pack

This directory is the **versioned pack** the control plane plants into product
repos (copy or submodule). It is **not** the control plane UI/API.

Parent product docs: [`../docs/VISION.md`](../docs/VISION.md),
[`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Contents

| Doc / dir | Purpose |
|-----------|---------|
| [`LAWS.md`](LAWS.md) | Branch model, RUN_ID, cycle, human-only CI |
| [`OWNED_PATHS.md`](OWNED_PATHS.md) | What agents must never edit |
| [`RUNTIME.md`](RUNTIME.md) | DSH + VS Code + local gate vs CI |
| [`MIGRATION.md`](MIGRATION.md) | Manual attach without control plane |
| [`LESSONS.md`](LESSONS.md) | Failure modes from autonomous-lab |
| [`roles/`](roles/) | followup, fix, feature, validate, demo, arch |
| [`adapters/`](adapters/) | Per-stack stubs |
| [`examples/prompts/`](examples/prompts/) | Initial / Followup / fix templates |
| [`scripts/`](scripts/) | `assert-run-id`, `protect-owned-paths` |

## Pack release

From repo root: `./scripts/pack-boilerstuff.sh [version]` → `dist/boilerstuff-*.tar.gz`.

Pin that version in each product; do not rely on live HTTP fetch as sole truth.
