# Lawpack — plantable autonomy laws

Official name: **Lawpack** (formerly “boilerstuff”).  
Planted into product repos by the control plane Init (or manually).

Parent docs: [`../docs/NAMING.md`](../docs/NAMING.md), [`../docs/VISION.md`](../docs/VISION.md).

## Contents

| Path | Purpose |
|------|---------|
| `LAWS.md` | Constitution |
| `OWNED_PATHS.md` | Deny-list template |
| `RUNTIME.md` | DSH / VS Code expectations |
| `MIGRATION.md` | Manual attach without UI |
| `LESSONS.md` | Failure modes from autonomous-lab |
| `roles/` | followup, fix, feature, validate, demo, arch |
| `adapters/` | Stack stubs |
| `examples/prompts/` | Initial / Followup / fix templates |
| `scripts/` | `assert-run-id`, `protect-owned-paths` |

## Pack release

From repo root: `./scripts/pack-lawpack.sh [version]` → `dist/lawpack-*.tar.gz`.

Default plant path in products: `vendor/lawpack/` + `LAWPACK_VERSION`.
