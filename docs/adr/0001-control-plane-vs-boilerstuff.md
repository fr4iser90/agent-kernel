# ADR-0001: Control plane vs boilerstuff

## Status

Accepted (2026-08-29)

## Context

We need (a) portable autonomy laws for any product repo and (b) a project
manager UI/API that steers DeepSeek Harness. Mixing both as one blob repeats
PIDEA complexity and blocks planting laws into non-web repos.

## Decision

Split this repository into:

1. **`boilerstuff/`** — versioned, plantable law pack (LAWS, roles, scripts).  
2. **`apps/` + `services/`** — control plane product (DDD) that *manages*
   projects and *pins* boilerstuff into them.  
3. **DeepSeek Harness** remains an external executor; we integrate via policy
   proxy / session brief, we do not fork DSH here.

Init **vendors a pin** into each product (copy or submodule). Live-only fetch
of laws is not the source of truth.

## Consequences

- Products work offline with DSH reading files from disk.  
- Control plane can evolve UI without rewriting every product’s laws.  
- Two version lines: boilerstuff semver/sha and control plane app semver.  
- Docs and tests must cover both packs.
