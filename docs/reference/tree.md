# Repository tree (target)

Status: Diátaxis docs + naming locked — see [`naming.md`](naming.md).

```
agent-kernel/
├── README.md
├── LICENSE
├── docs/
│   ├── index.md                 # Diátaxis hub + VitePress home
│   ├── readme.md                # thin GitHub index
│   ├── .vitepress/              # docs site
│   ├── tutorials/
│   │   └── getting-started.md
│   ├── how-to/
│   │   ├── init.md
│   │   └── run-the-gate.md
│   ├── reference/
│   │   ├── settings.md
│   │   ├── lawpack.md
│   │   ├── naming.md
│   │   ├── tree.md              # this file
│   │   ├── analyzer.md
│   │   └── schemas/             # JSON Schema + OpenAPI
│   ├── explanation/
│   │   ├── vision.md
│   │   ├── architecture.md
│   │   ├── orchestration.md
│   │   ├── operating-model.md
│   │   ├── ui.md
│   │   ├── runtime-topology.md
│   │   ├── integrations.md
│   │   ├── roadmap.md
│   │   ├── doc-freeze.md
│   │   └── comparables.md
│   └── adr/
├── lawpack/
│   ├── MANIFEST.json
│   ├── LAWS.md                  # generic
│   ├── profiles/                # optional overlays (games.md)
│   ├── OWNED_PATHS.md
│   ├── RUNTIME.md
│   ├── roles/
│   ├── adapters/
│   ├── examples/prompts/
│   └── scripts/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   └── session-brief/
├── deploy/                      # Compose + Dockerfiles (L-docker / S)
│   ├── compose.yml
│   ├── compose.server.yml
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── .env.example
├── scripts/
│   ├── gate.sh
│   ├── health.sh
│   ├── check-doc-links.sh
│   └── pack-lawpack.sh
└── tests/
    └── architecture/
```

## After Init (depends on injection mode — ADR-0004)

**`repo_plant`** — files in the product tree:

```
my-product/
├── vendor/lawpack/
│   └── LAWPACK_VERSION
├── AGENTS.md
├── ADAPTER.md
├── PROGRESS.md
├── BUGS.md
└── … source …
```

**`harness_inject`** — Lawpack pin in **agent-kernel** (DB). Laws injected at
session start.

**Strict** — product code only in git.

**Hybrid (tracking-friendly)** — laws not in git; PROGRESS/BUGS/ADAPTER may be:

```
my-product/
├── ADAPTER.md
├── PROGRESS.md
├── BUGS.md
├── AGENTS.md                  # optional
├── .agent/lawpack/            # ephemeral, gitignored
└── … source …
```

See [`../explanation/operating-model.md`](../explanation/operating-model.md).

## Stack

TypeScript API + React (Vite) + SQLite — [`../adr/0002-stack-pin.md`](../adr/0002-stack-pin.md).  
UX = web dashboard (Login-first).
