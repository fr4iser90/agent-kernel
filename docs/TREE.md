# Repository tree (target)

Status: scaffold + naming locked — see [`NAMING.md`](NAMING.md).

```
agent-kernel/                    # PRODUCT: project management control plane
├── README.md
├── LICENSE
├── docs/
│   ├── VISION.md
│   ├── ARCHITECTURE.md
│   ├── TREE.md                  # this file
│   ├── NAMING.md                # names, plant paths, keep/sort
│   ├── COMPARABLES.md
│   ├── INTEGRATIONS.md
│   ├── ROADMAP.md
│   └── adr/
│       ├── 0001-control-plane-vs-lawpack.md
│       └── 0002-stack-pin.md
├── lawpack/                     # PLANTABLE pack (official name: Lawpack)
│   ├── README.md
│   ├── LAWS.md
│   ├── OWNED_PATHS.md
│   ├── RUNTIME.md
│   ├── MIGRATION.md
│   ├── LESSONS.md
│   ├── roles/                   # machine roles
│   ├── adapters/                # stack stubs
│   ├── examples/prompts/
│   └── scripts/                 # assert-run-id, protect-owned-paths
├── apps/
│   ├── api/                     # TS control plane (DDD)
│   │   ├── presentation/
│   │   ├── application/
│   │   ├── domain/
│   │   │   ├── catalog/
│   │   │   ├── provisioning/  # Init + LawpackPin
│   │   │   ├── profiles/        # AgentProfile / Workflow (DB/content)
│   │   │   ├── policy/
│   │   │   ├── orchestration/
│   │   │   ├── observability/
│   │   │   ├── knowledge/
│   │   │   └── identity/
│   │   ├── infrastructure/
│   │   └── tests/
│   └── web/                     # React + Vite dashboard
│       ├── src/
│       └── tests/
├── packages/
│   └── session-brief/           # shared SessionBrief schema
├── services/
│   └── policy-proxy/            # in front of DSH
├── scripts/
│   ├── gate.sh
│   └── pack-lawpack.sh
└── tests/
    └── architecture/
```

## Planted into a product (after Init)

```
my-product/
├── vendor/lawpack/              # pinned Lawpack
│   └── LAWPACK_VERSION
├── AGENTS.md                    # thin pointer + RUN_ID
├── ADAPTER.md
├── PROGRESS.md
├── BUGS.md
└── … source …
```

## Stack

TypeScript API + React (Vite) + SQLite — [`adr/0002-stack-pin.md`](adr/0002-stack-pin.md).  
UX = web dashboard.
