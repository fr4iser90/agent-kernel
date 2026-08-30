# Architecture

## Context map

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Dashboard  │────►│  agent-kernel    │────►│ Product repos   │
│  (Web UI)   │     │  control plane   │     │ (+ optional     │
│  Login-first│     │  Settings + pins │     │  planted pack)  │
└─────────────┘     └────────┬─────────┘     └────────┬────────┘
                             │                        │
                    policy / nudge / status            │ laws via
                             │                        │ pin delivery
                             ▼                        ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │ Policy Proxy     │────►│ ExecutorPort    │
                    │ (Brief → start)  │     │ (DSH v1, …)     │
                    └────────┬─────────┘     └─────────────────┘
                             │
              chat/embed keys│
                             ▼
                    ┌──────────────────┐     ┌─────────────────┐
                    │ LocalAI-GateWay  │────►│ llama.cpp/etc.  │
                    └──────────────────┘     └─────────────────┘
```

### Law delivery (B-first)

| Mode | When | How |
|------|------|-----|
| **`harness_inject` (default)** | Clean product git; pin in kernel | At session start: Brief + materialize/inline pack for the executor |
| **`repo_plant`** | Offline CI / share laws without kernel | Init writes pinned pack (+ stubs) into the product tree |
| **Live HTTP fetch alone** | Avoid as sole SoT | Not the source of truth |

**Rule:** Control plane DB always stores `lawpack_version` + hash. Product git
contains a planted pack **only** when `injectionMode` is `repo_plant` (or the
operator chose hybrid tracking files under inject). See
[`operating-model.md`](operating-model.md) and
[ADR-0004](../adr/0004-dual-injection-multi-executor.md).

DSH (and later adapters) **read** laws from the configured layout or from the
injected Brief — they do not own the Lawpack source.

Git plant and policy proxy are **both** valid jobs when selected — different
responsibilities, not alternatives that cancel each other.

### Where does policy sit?

**Recommended:** thin **Policy Proxy** in front of the executor:

1. UI / nudge / operator chat → control plane: start on project X  
2. Control plane builds **SessionBrief** (RUN_ID, roles, gate, paths, profile)  
3. Proxy sets workdir; injects brief; denies tools that violate **enabled** Settings  
4. Coding model traffic may still be executor → GateWay; control plane uses
   GateWay for operator LLM / embeddings  

Do **not** fork DeepSeek Harness into this monorepo.

**Deploy:** [`runtime-topology.md`](runtime-topology.md), Compose under `deploy/`.

## DDD bounded contexts

| Context | Responsibility |
|---------|----------------|
| **Catalog** | Projects, git remotes, local paths, stack detection |
| **Provisioning** | Init, lawpack pin, RUN_ID, ADAPTER stub |
| **Profiles** | Agent/role/workflow definitions |
| **Policy** | SessionBrief, optional branch/path guards (Settings-gated) |
| **Orchestration** | Nudge schedules, run history, executor session ids |
| **Observability** | Gate/CI status, BUGS summary, widget layout |
| **Knowledge** | Optional codegraph / embeddings |
| **Identity** | Login gate; v1 stub `local-owner`; M6 ACL |

Shared kernel: IDs, time, Result types — no business rules.

## Layering (per backend app)

```
presentation/     # HTTP, WS; Login + dashboard API
application/      # use cases
domain/           # entities, VOs, ports
infrastructure/   # git, fs, sqlite, executor clients, GateWay
```

**Dependency rule:** `presentation → application → domain ← infrastructure`.

## Frontend

- `apps/web` SPA → `apps/api`  
- **Login-first**; first-boot setup wizard when Settings incomplete  
- Configurable dashboard widgets  
- No IDE mirror in v1  

## Data

| Topology | Engine | Spec |
|----------|--------|------|
| Local (L-native / L-docker) | **SQLite** | ADR-0002 + ADR-0005 |
| Remote / multi-user | **Postgres** | [ADR-0005](../adr/0005-persistence-sqlite-postgres.md) |

**What goes in SQL vs files:** [`../reference/data-model.md`](../reference/data-model.md).  
Coding-agent token streams do **not** write through this DB — only control-plane
metadata (and optional Brief snapshots on Runs).

Secrets: never in git; env / keyring / GateWay refs.

## Testing strategy

| Layer | Examples |
|-------|----------|
| Domain | RUN_ID validation from Settings pattern, policy deny |
| Application | Init use case, SessionBrief builder |
| Arch gate | No domain→infrastructure imports |
| Contract | Executor/GateWay fakes |
| E2E (later) | Register → init → brief dry-run |

## Security

- Traefik + auth on remote; Login gate in product UX always  
- Project ACL at M6  
- Audit log of SessionBrief + who triggered  

## Comparables

See [`comparables.md`](comparables.md).
