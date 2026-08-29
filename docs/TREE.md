# Repository tree (target)

Status: **scaffold** — dirs exist with README stubs; implementation TBD.

```
agent-kernel/
├── README.md                 # product entry
├── LICENSE
├── docs/
│   ├── VISION.md
│   ├── ARCHITECTURE.md
│   ├── TREE.md               # this file
│   ├── COMPARABLES.md
│   ├── INTEGRATIONS.md
│   ├── ROADMAP.md
│   └── adr/                  # ADRs for this product
│       └── 0001-control-plane-vs-boilerstuff.md
├── boilerstuff/              # PLANTABLE law pack (versioned)
│   ├── README.md
│   ├── LAWS.md
│   ├── OWNED_PATHS.md
│   ├── RUNTIME.md
│   ├── MIGRATION.md
│   ├── LESSONS.md
│   ├── roles/
│   ├── adapters/
│   ├── examples/prompts/
│   └── scripts/              # assert-run-id, protect-owned-paths
├── apps/
│   ├── api/                  # control plane backend (DDD)
│   │   ├── presentation/
│   │   ├── application/
│   │   ├── domain/
│   │   │   ├── catalog/
│   │   │   ├── provisioning/
│   │   │   ├── profiles/
│   │   │   ├── policy/
│   │   │   ├── orchestration/
│   │   │   ├── observability/
│   │   │   ├── knowledge/
│   │   │   └── identity/
│   │   ├── infrastructure/
│   │   └── tests/
│   └── web/                  # dashboard SPA
│       ├── src/
│       └── tests/
├── packages/                 # optional shared TS/Python libs later
│   └── session-brief/        # SessionBrief schema (shared with proxy)
├── services/
│   └── policy-proxy/         # optional sidecar between clients and DSH
├── scripts/
│   ├── gate.sh               # repo gate for THIS product
│   └── pack-boilerstuff.sh   # emit versioned tarball/npm for init
└── tests/
    └── architecture/         # LOC, layer violation, owned-path meta-tests
```

## Naming

- **`boilerstuff/`** — laws planted into *other* repos (not the control plane’s
  own runtime config).  
- **`apps/api`** — the manager.  
- **`services/policy-proxy`** — deployable next to DSH; may start as a module
  inside api until it needs isolation.

## Stack pin (pending ADR)

Propose (not locked): **TypeScript** API (Fastify/Hono) + **Vite React** web,
SQLite via Drizzle — *or* Python API to align with AgentLayer/GateWay.

Decision belongs in `docs/adr/0002-stack.md` before coding domains.
Until then: tree + docs only; no accidental dual-stack.
