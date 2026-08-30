# Lawpack — plantable autonomy laws

Official name: **Lawpack**.

**Contract:** [`../docs/reference/lawpack.md`](../docs/reference/lawpack.md)  
**Manifest:** [`MANIFEST.json`](MANIFEST.json)  
**Delivery:** [`../docs/adr/0004-dual-injection-multi-executor.md`](../docs/adr/0004-dual-injection-multi-executor.md)  
**Git/protect:** Settings-gated — [`../docs/reference/settings.md`](../docs/reference/settings.md)

Planted by Init **and/or** injected at run time (`harness_inject`). Default
preference: harness inject.

## Contents

| Path | Purpose | Generic? |
|------|---------|----------|
| `MANIFEST.json` | Pack id, version, features, entrypoints | **Required** |
| `LAWS.md` | **Generic** constitution | **Yes** |
| `profiles/games.md` | Optional game ACCEPT overlay | Optional |
| `profiles/web-compliance.md` | Docs / legal / security profile hints | Optional |
| `roles/` | Core loop + docs / legal-impressum / security | **Core + cross-cutting** |
| `OWNED_PATHS.md` | Deny-list template | Optional feature |
| `RUNTIME.md` | DSH / VS Code expectations | Notes |
| `MIGRATION.md` | Manual attach without UI | Ops |
| `LESSONS.md` | Failure modes from autonomous-lab | Ops (not laws) |
| `adapters/` | Stack stubs | Optional |
| `examples/prompts/` | Initial / Followup / fix templates | Optional |
| `scripts/` | assert-run-id, protect-owned-paths | Optional — Settings-gated |

## Pack release

From repo root: `./scripts/pack-lawpack.sh [version]` → `dist/lawpack-*.tar.gz`.

Layout presets come from Settings / Init (`vendor/lawpack/` or `.agent/lawpack/`).
